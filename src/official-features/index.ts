/**
 * 管理官方功能行：提供功能状态路由，并在运行期开关官方功能对应的宿主行与 preset 子行。
 * 导出 apply、路由注册与服务构造函数；关闭记录存在本包自己的存储域。
 */
import { OFFICIAL_FEATURES_PATH } from '../rows.ts';
import type { Context } from '../types.ts';
import { isRecord, jsonResponse } from '../utils.ts';
import {
  type ApplySnapshot,
  applyFeature,
  applyPresetRows,
  createSnapshot,
  resetPresetBaseline,
  restoreSnapshot,
} from './apply.ts';
import { FEATURES, type FeatureId, featureOf, isFeatureId } from './catalog.ts';
import { findEntry, type LoaderLike, readLoader, settle } from './loader.ts';
import { createSerialQueue } from './queue.ts';
import { type FeatureState, readFeatureStates } from './state.ts';
import { type OffStore, openStore } from './store.ts';

/** 插件名，也是 profile 中该行的 id。 */
export const name = 'official-features';

/** 切换后等待真实状态一致的最长时间。 */
const DEFAULT_WAIT_MS = 2000;

/** 等待期间的重读间隔。 */
const POLL_MS = 150;

/** 启动与重组后重新施加的最多轮数：首轮可能在 loader 条目齐备前跑。 */
const REAPPLY_ATTEMPTS = 8;

/** 重新施加的重试间隔。 */
const REAPPLY_INTERVAL_MS = 250;

/** 一条路由注册所需的最小 connection 结构。 */
export interface ConnectionLike {
  readonly fetch: {
    register(route: {
      path: string;
      methods: string[];
      requestBody: 'buffered';
      fetch: (request: Request) => Response | Promise<Response>;
    }): () => void;
  };
}

/** 捕获到的一条路由注册，测试用。 */
export interface CapturedRoute {
  path: string;
  methods: string[];
  requestBody: 'buffered';
  fetch: (request: Request) => Response | Promise<Response>;
}

/** 切换结果：成功时给出最新状态，失败时给出错误码。 */
export type ToggleResult =
  | { readonly ok: true; readonly busy: boolean }
  | {
      readonly ok: false;
      readonly error: 'invalid-request' | 'store-failed' | 'apply-failed';
      readonly message?: string;
    };

/** 官方功能服务。 */
export interface FeatureService {
  /** 当前状态；loader 不可用时为 `null`。 */
  states(): FeatureState[] | null;
  /** 是否有未完成的施加或撤销。 */
  busy(): boolean;
  /** 打开或关闭一个功能。 */
  toggle(id: string, enabled: unknown): Promise<ToggleResult>;
  /** 按记录重新施加全部关闭；用于配置重组之后。 */
  reapply(): Promise<void>;
  /** 撤销全部施加，本行停用时调用。 */
  dispose(): Promise<void>;
}

/** 服务依赖，全部可注入以便测试。 */
export interface FeatureServiceDeps {
  /** 宿主 loader；缺失时服务只报告 `null`。 */
  readonly loader: LoaderLike | undefined;
  /** 关闭记录。 */
  readonly store: OffStore;
  /** 施加前状态；缺省时新建。 */
  readonly snapshot?: ApplySnapshot;
  /** 等待一致的最长时间，缺省 2000 毫秒。 */
  readonly waitMs?: number;
  /** 重新施加的最多轮数，缺省 8。 */
  readonly reapplyAttempts?: number;
  /** 重新施加的重试间隔，缺省 250 毫秒。 */
  readonly reapplyIntervalMs?: number;
  /** 重读状态的间隔，缺省 150 毫秒。 */
  readonly pollMs?: number;
  /** 延迟函数，测试可注入。 */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** 默认延迟实现。 */
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 构造官方功能服务。
 * @param deps - 依赖注入。
 * @returns 服务对象。
 */
export function createFeatureService(deps: FeatureServiceDeps): FeatureService {
  const { loader, store } = deps;
  const snapshot = deps.snapshot ?? createSnapshot();
  const waitMs = deps.waitMs ?? DEFAULT_WAIT_MS;
  const reapplyAttempts = deps.reapplyAttempts ?? REAPPLY_ATTEMPTS;
  const reapplyIntervalMs = deps.reapplyIntervalMs ?? REAPPLY_INTERVAL_MS;
  const pollMs = deps.pollMs ?? POLL_MS;
  const sleep = deps.sleep ?? defaultSleep;
  const queue = createSerialQueue();
  let running = 0;

  const states = (): FeatureState[] | null =>
    loader === undefined ? null : readFeatureStates(loader);

  const stateOf = (id: FeatureId): boolean => {
    if (loader === undefined) return false;
    return states()?.find((item) => item.id === id)?.on ?? false;
  };

  /** 等到该功能的真实状态与目标一致，或超出等待上限。 */
  const waitFor = async (id: FeatureId, target: boolean): Promise<boolean> => {
    const deadline = Date.now() + waitMs;
    for (;;) {
      if (stateOf(id) === target) return true;
      if (Date.now() >= deadline) return false;
      await sleep(pollMs);
    }
  };

  /**
   * 施加一个功能。
   * preset 子行按记录里的全部关闭功能重算，先写记录再调用，因此传进来的是最新记录。
   * @param id - 功能标识。
   * @param enabled - 目标状态。
   * @param offIds - 施加后的关闭记录。
   */
  const applyOne = async (
    id: FeatureId,
    enabled: boolean,
    offIds: readonly FeatureId[],
  ): Promise<void> => {
    const feature = featureOf(id);
    if (feature === undefined || loader === undefined) return;
    await applyFeature(loader, feature, !enabled, snapshot, offIds);
  };

  const toggle = async (id: string, enabled: unknown): Promise<ToggleResult> => {
    if (!isFeatureId(id) || typeof enabled !== 'boolean') {
      return { ok: false, error: 'invalid-request' };
    }
    if (loader === undefined) {
      return { ok: false, error: 'apply-failed', message: 'loader unavailable' };
    }
    const featureId = id;
    const previous = [...store.read()];
    const next = new Set(previous);
    if (enabled) next.delete(featureId);
    else next.add(featureId);

    try {
      await store.write([...next]);
    } catch (error) {
      return { ok: false, error: 'store-failed', message: messageOf(error) };
    }

    try {
      await applyOne(featureId, enabled, [...next]);
    } catch (error) {
      // 施加失败：把记录改回原样，避免面板与实际不一致。
      await store.write(previous).catch(() => {});
      return { ok: false, error: 'apply-failed', message: messageOf(error) };
    }

    const settled = await waitFor(featureId, enabled);
    return { ok: true, busy: !settled };
  };

  return {
    states,
    busy: () => running > 0,
    toggle(id, enabled) {
      running += 1;
      return queue
        .run(() => toggle(id, enabled))
        .finally(() => {
          running -= 1;
        });
    },
    async reapply() {
      if (loader === undefined) return;
      const off = store.read();
      await queue.run(async () => {
        for (let attempt = 0; attempt < reapplyAttempts; attempt += 1) {
          // 树可能已按文件状态重建，旧基线过期，每轮重新捕获。
          resetPresetBaseline(snapshot);
          for (const feature of FEATURES) {
            const offFeature = off.includes(feature.id);
            if (!offFeature && !hasHostRowsIn(snapshot, feature)) continue;
            await applyOne(feature.id, !offFeature, off).catch(() => undefined);
          }
          await settle(loader);
          if (appliedOff(loader, off)) return;
          await sleep(reapplyIntervalMs);
        }
      });
    },
    async dispose() {
      if (loader === undefined) return;
      await queue.run(async () => {
        await restoreSnapshot(loader, snapshot).catch(() => []);
        // 记录保留，撤销只把 preset 声明还原到基线。
        await applyPresetRows(loader, [], snapshot).catch(() => ({
          pendingRows: [],
          pendingPresets: [],
        }));
      });
      await store.close().catch(() => {});
    },
  };
}

/**
 * 记录里的功能是否都真的关掉了。
 * 宿主行必须已经出现且停用；条目还没列出来的功能算未完成，因此会重试。
 */
function appliedOff(loader: LoaderLike, off: readonly FeatureId[]): boolean {
  for (const id of off) {
    const feature = featureOf(id);
    if (feature === undefined) continue;
    let seen = false;
    for (const rowId of feature.hostRows) {
      const entry = findEntry(loader, rowId);
      if (entry === undefined) continue;
      seen = true;
      if (!entry.disabled) return false;
    }
    if (!seen) return false;
    const state = readFeatureStates(loader).find((item) => item.id === id);
    if (state?.on === true) return false;
  }
  return true;
}

/** 快照里是否还留着该功能的宿主行改动。 */
function hasHostRowsIn(
  snapshot: ApplySnapshot,
  feature: { readonly hostRows: readonly string[] },
): boolean {
  for (const rowId of feature.hostRows) {
    for (const entryId of snapshot.hostRows.keys()) {
      if (entryId === rowId || entryId.endsWith(`:${rowId}`)) return true;
    }
  }
  return false;
}

/** 把未知错误转成一句可显示的话。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 注册官方功能路由，路径与响应形状见契约文档。
 * @param connection - 宿主 connection 服务。
 * @param service - 官方功能服务。
 * @returns 卸载函数，释放两条路由。
 */
export function registerOfficialFeatureRoutes(
  connection: ConnectionLike,
  service: FeatureService,
): () => void {
  const read = (): Response => {
    const features = service.states();
    return jsonResponse({ ok: true, features, busy: service.busy() });
  };

  const write = async (request: Request): Promise<Response> => {
    const payload = await readJson(request);
    if (!isRecord(payload)) {
      return jsonResponse({ ok: false, error: 'invalid-request' }, 400);
    }
    const result = await service.toggle(payload.id as string, payload.enabled as unknown);
    if (!result.ok) {
      const status =
        result.error === 'store-failed' ? 409 : result.error === 'apply-failed' ? 500 : 400;
      return jsonResponse(result, status);
    }
    return jsonResponse({ ok: true, features: service.states(), busy: result.busy });
  };

  // 一条路径只能注册一次，因此两种方法合并在一个处理器里分发。
  const off = connection.fetch.register({
    path: OFFICIAL_FEATURES_PATH,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: (request) => (request.method === 'POST' ? write(request) : read()),
  });
  return () => {
    off();
  };
}

/** 读取 JSON 请求体；解析失败返回 undefined。 */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** 带 `connection` 的宿主上下文。 */
type WebContext = Context & { readonly connection: ConnectionLike };

/**
 * 插件启用时注册路由，并按关闭记录施加。
 * 打不开存储域时只提供面板，切换会被拒绝；本行停用时撤销全部施加。
 */
export function apply(ctx: Context): void {
  // 等存储域与 connection 都就绪再接线：两者缺一都不该半启动。
  ctx.inject(['connection', 'storageDomain'], (injected) => {
    const webCtx = injected as WebContext;
    // 注入后的上下文才带 storageDomain 服务，打开域与读 loader 都用它。
    const scoped = injected as Context;
    scoped.effect(() => {
      let active = true;
      let service: FeatureService | undefined;
      const offs: Array<() => void> = [];

      void (async () => {
        const store = await openStore(scoped);
        const created = createFeatureService({ loader: readLoader(scoped), store });
        if (!active) {
          await created.dispose();
          return;
        }
        service = created;
        offs.push(
          registerOfficialFeatureRoutes(webCtx.connection, created),
          scoped.on('app-boot/config-reload', () => void created.reapply()),
        );
        await created.reapply();
      })().catch((error: unknown) => {
        scoped.logger.warn(
          '[dsh-plugin-practical-tool-bundle] official-features failed to start',
          error,
        );
      });

      return () => {
        active = false;
        for (const off of offs.splice(0)) off();
        void service?.dispose();
      };
    }, 'official-features: routes and restore');
  });
}

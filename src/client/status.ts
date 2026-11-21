/**
 * 行开关：轮询根行的状态路由，按结果装卸三个界面块。
 * 导出 startRowWatch；返回的函数在插件卸载时清掉定时器与已挂载的块。
 */
import type { Context, Fiber } from '@deepseek-ai/cordis';

import { installMobile } from './mobile.ts';
import { installRestart } from './restart.tsx';
import { installSweeper } from './sweeper.tsx';

/** 状态路由，相对页面基路径。 */
const STATUS_API = 'api/dsh-practical-tools/status';

/** 状态轮询间隔：页面可见时每 3 秒一次。 */
const WATCH_INTERVAL = 3000;

/** 状态路由返回的一行。`null` 表示宿主未给出结论。 */
type Availability = boolean | null;

/** 状态路由的回答。 */
interface StatusPayload {
  readonly rows?: Partial<Record<ChunkKey, Availability>>;
}

/** 三个界面块的键，与状态路由一致。 */
type ChunkKey = 'sweeper' | 'restart' | 'mobile';

/** 一个界面块：挂载时把它的槽位注册交给子插件。 */
interface Chunk {
  readonly key: ChunkKey;
  install(ctx: Context): void;
}

/** 界面块清单。 */
const CHUNKS: readonly Chunk[] = [
  { key: 'sweeper', install: installSweeper },
  { key: 'restart', install: installRestart },
  { key: 'mobile', install: installMobile },
];

/** 同源读取状态路由；任何失败都返回 undefined，表示本轮无法判断。 */
async function fetchStatus(signal: AbortSignal): Promise<StatusPayload | undefined> {
  try {
    const response = await fetch(STATUS_API, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
    if (!response.ok) return undefined;
    return (await response.json()) as StatusPayload;
  } catch {
    return undefined;
  }
}

/**
 * 启动状态循环。
 * 已挂载的块只在状态明确为 false 时卸载，取不到结论时保持现状。
 * @param ctx - 前端上下文，子插件挂在它下面。
 * @returns 卸载函数。
 */
export function startRowWatch(ctx: Context): () => void {
  const mounted = new Map<ChunkKey, Fiber>();
  const controller = new AbortController();
  let running = false;
  let again = false;

  /** 挂载一个块；失败时不留半成品。 */
  const mount = (chunk: Chunk): void => {
    if (mounted.has(chunk.key)) return;
    let fiber: Fiber | undefined;
    try {
      fiber = ctx.plugin({
        name: `dsh-plugin-practical-tool-bundle/${chunk.key}`,
        apply: (scope) => {
          chunk.install(scope);
        },
      });
      mounted.set(chunk.key, fiber);
    } catch (error) {
      console.error(`[dsh-plugin-practical-tool-bundle] ${chunk.key} failed to mount`, error);
      if (fiber !== undefined) void fiber.dispose();
      mounted.delete(chunk.key);
    }
  };

  /** 卸载一个块，连同它在槽位与 effect 里的注册。 */
  const unmount = (chunk: Chunk): void => {
    const fiber = mounted.get(chunk.key);
    if (fiber === undefined) return;
    mounted.delete(chunk.key);
    void fiber.dispose();
  };

  /** 用一轮状态回答对齐已挂载的块。 */
  const reconcile = (payload: StatusPayload): void => {
    const rows = payload.rows ?? {};
    for (const chunk of CHUNKS) {
      const state: Availability = rows[chunk.key] ?? null;
      if (state === null) continue;
      if (state) mount(chunk);
      else unmount(chunk);
    }
  };

  /** 一轮探测；上一轮未结束时只记一次重跑，避免请求堆积。 */
  const check = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      const payload = await fetchStatus(controller.signal);
      if (payload !== undefined) reconcile(payload);
    } finally {
      running = false;
      if (again) {
        again = false;
        void check();
      }
    }
  };

  const timer = setInterval(() => {
    if (document.visibilityState !== 'hidden') void check();
  }, WATCH_INTERVAL);

  const eager = (): void => {
    if (document.visibilityState !== 'hidden') void check();
  };
  document.addEventListener('visibilitychange', eager);
  window.addEventListener('focus', eager);

  void check();

  return () => {
    controller.abort();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', eager);
    window.removeEventListener('focus', eager);
    for (const fiber of mounted.values()) void fiber.dispose();
    mounted.clear();
  };
}

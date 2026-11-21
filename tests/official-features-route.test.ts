// 官方功能路由测试：状态读取、切换、错误码与回滚。全部依赖注入，不启动宿主。
import { describe, expect, it } from 'vitest';
import { createSnapshot } from '../src/official-features/apply.ts';
import { FEATURE_IDS } from '../src/official-features/catalog.ts';
import {
  type CapturedRoute,
  createFeatureService,
  registerOfficialFeatureRoutes,
} from '../src/official-features/index.ts';
import type { OffStore } from '../src/official-features/store.ts';
import { OFFICIAL_FEATURES_PATH } from '../src/rows.ts';
import { makeLoader } from './helpers.ts';

/** 内存记录：可注入写入失败。 */
function makeStore(initial: string[] = [], options: { writeError?: unknown } = {}) {
  let off = [...initial];
  const store: OffStore = {
    read: () => [...off],
    write: async (next) => {
      if (options.writeError !== undefined) throw options.writeError;
      off = [...next];
    },
    close: async () => {},
  };
  return { store, peek: () => [...off] };
}

/** 假 connection：收集注册的路由。 */
function makeConnection() {
  const routes: CapturedRoute[] = [];
  return {
    routes,
    connection: {
      fetch: {
        register(route: CapturedRoute) {
          routes.push(route);
          return () => undefined;
        },
      },
    },
  };
}

/** 造一套接线完整、可直接调用路由的装置。 */
function harness(
  options: {
    entries?: ReturnType<typeof makeLoader>;
    off?: string[];
    writeError?: unknown;
    loaderMissing?: boolean;
  } = {},
) {
  const loader =
    options.entries ??
    makeLoader([
      { id: 'include:schedule', disabled: false, fiber: { state: 2 } },
      { id: 'include:ui-schedule', disabled: false, fiber: { state: 2 } },
      { id: 'include:goal', disabled: false, fiber: { state: 2 } },
      { id: 'include:goal-round-driver', disabled: false, fiber: { state: 2 } },
      { id: 'include:ui-goal', disabled: false, fiber: { state: 2 } },
      { id: 'include:tool-todo', disabled: false, fiber: { state: 2 } },
      { id: 'include:plan-mode', disabled: false, fiber: { state: 2 } },
      { id: 'include:ui-plan', disabled: false, fiber: { state: 2 } },
      { id: 'include:deliverable-file-references', disabled: false, fiber: { state: 2 } },
    ]);
  const { store, peek } = makeStore(options.off, { writeError: options.writeError });
  const { connection, routes } = makeConnection();
  const service = createFeatureService({
    loader: options.loaderMissing === true ? undefined : loader,
    store,
    snapshot: createSnapshot(),
    waitMs: 0,
  });
  registerOfficialFeatureRoutes(connection, service);
  const route = routes[0];
  if (route === undefined) throw new Error('routes not registered');
  // 一条路径一条注册：GET 与 POST 由同一个处理器按方法分发。
  const get = {
    fetch: () => route.fetch(new Request(`http://127.0.0.1${OFFICIAL_FEATURES_PATH}`)),
  };
  const post = { fetch: (request: Request) => route.fetch(request) };
  return { loader, routes, get, post, service, peek };
}

/** 把响应读成对象。 */
async function bodyOf(response: Response | Promise<Response>) {
  return (await (await response).json()) as Record<string, unknown>;
}

/** 造一个带请求体的 Request。 */
function requestOf(payload: unknown, method = 'POST'): Request {
  return new Request(`http://127.0.0.1${OFFICIAL_FEATURES_PATH}`, {
    method,
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

describe('官方功能路由注册', () => {
  it('注册到本包命名空间的一个路径，覆盖 GET 与 POST', () => {
    const { routes } = harness();
    expect(routes).toHaveLength(1);
    expect(routes[0]?.path).toBe(OFFICIAL_FEATURES_PATH);
    expect([...(routes[0]?.methods ?? [])].sort()).toEqual(['GET', 'POST']);
    expect(OFFICIAL_FEATURES_PATH.startsWith('/api/dsh-practical-tools/')).toBe(true);
  });
});

describe('GET 官方功能状态', () => {
  it('按固定顺序回答五个功能', async () => {
    const { get } = harness();
    const body = await bodyOf(get.fetch());
    expect(body.ok).toBe(true);
    expect(body.busy).toBe(false);
    const features = body.features as Array<{ id: string; on: boolean }>;
    expect(features.map((item) => item.id)).toEqual([...FEATURE_IDS]);
    expect(features.every((item) => item.on === true)).toBe(true);
  });

  it('宿主行被停用后该功能显示为关', async () => {
    const { get, loader } = harness();
    await loader.update('include:schedule', { disabled: true });
    await loader.update('include:ui-schedule', { disabled: true });
    const body = await bodyOf(get.fetch());
    const schedule = (body.features as Array<{ id: string; on: boolean }>).find(
      (item) => item.id === 'schedule',
    );
    expect(schedule?.on).toBe(false);
  });

  it('loader 不可用时 features 为 null，面板据此保持当前显示', async () => {
    const { get } = harness({ loaderMissing: true });
    const body = await bodyOf(get.fetch());
    expect(body.ok).toBe(true);
    expect(body.features).toBeNull();
    expect(body.busy).toBe(false);
  });
});

describe('POST 切换官方功能', () => {
  it('关闭后在记录里留下该功能，并停用它的受管宿主行', async () => {
    const { post, peek, loader } = harness();
    const response = await post.fetch(requestOf({ id: 'schedule', enabled: false }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      features: Array<{ id: string; on: boolean }>;
    };
    expect(body.ok).toBe(true);
    expect(body.features.find((item) => item.id === 'schedule')?.on).toBe(false);
    expect(peek()).toEqual(['schedule']);
    expect(loader.entry('include:schedule')?.disabled).toBe(true);
    expect(loader.entry('include:ui-schedule')?.disabled).toBe(true);
  });

  it('打开时清除记录并恢复受管行', async () => {
    const { post, peek, loader } = harness({ off: ['schedule'] });
    await post.fetch(requestOf({ id: 'schedule', enabled: false }));
    const response = await post.fetch(requestOf({ id: 'schedule', enabled: true }));
    expect(response.status).toBe(200);
    expect(peek()).toEqual([]);
    expect(loader.entry('include:schedule')?.disabled).toBe(false);
  });

  it('未知功能 id 返回 400 invalid-request', async () => {
    const { post, peek } = harness();
    const response = await post.fetch(requestOf({ id: 'nope', enabled: true }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ ok: false, error: 'invalid-request' });
    expect(peek()).toEqual([]);
  });

  it('enabled 不是布尔返回 400 invalid-request', async () => {
    const { post } = harness();
    const response = await post.fetch(requestOf({ id: 'goal', enabled: 'yes' }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ ok: false, error: 'invalid-request' });
  });

  it('请求体不是 JSON 返回 400 invalid-request', async () => {
    const { post } = harness();
    const response = await post.fetch(
      new Request(`http://127.0.0.1${OFFICIAL_FEATURES_PATH}`, {
        method: 'POST',
        body: 'not json',
      }),
    );
    expect(response.status).toBe(400);
  });

  it('记录写入失败返回 409 store-failed，且不施加任何改动', async () => {
    const { post, loader } = harness({ writeError: new Error('backend down') });
    const response = await post.fetch(requestOf({ id: 'schedule', enabled: false }));
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({ ok: false, error: 'store-failed' });
    expect(loader.calls).toEqual([]);
  });

  it('施加失败返回 500 apply-failed，并回滚记录', async () => {
    const loader = makeLoader([{ id: 'include:schedule', disabled: false, fiber: { state: 2 } }]);
    const applyFailed = Object.assign(loader, {
      update: async () => {
        throw new Error('loader rejected');
      },
    });
    const { post, peek } = harness({ entries: applyFailed });
    const response = await post.fetch(requestOf({ id: 'schedule', enabled: false }));
    expect(response.status).toBe(500);
    const body = await bodyOf(response);
    expect(body).toMatchObject({ ok: false, error: 'apply-failed' });
    expect(String(body.message)).toContain('loader rejected');
    expect(peek()).toEqual([]);
  });

  it('外部把受管行改回启用后，再次读取反映新状态', async () => {
    const { get, loader, post } = harness();
    await post.fetch(requestOf({ id: 'goal', enabled: false }));
    let body = await bodyOf(get.fetch());
    expect(
      (body.features as Array<{ id: string; on: boolean }>).find((i) => i.id === 'goal')?.on,
    ).toBe(false);
    await loader.update('include:goal', { disabled: false });
    body = await bodyOf(get.fetch());
    expect(
      (body.features as Array<{ id: string; on: boolean }>).find((i) => i.id === 'goal')?.on,
    ).toBe(true);
  });

  it('记录损坏时切换返回 409，读取仍回答真实状态', async () => {
    const { post, get } = harness({ writeError: new Error('invalid-record') });
    const response = await post.fetch(requestOf({ id: 'task', enabled: false }));
    expect(response.status).toBe(409);
    const body = await bodyOf(get.fetch());
    expect(body.ok).toBe(true);
    expect(
      (body.features as Array<{ id: string; on: boolean }>).find((i) => i.id === 'task')?.on,
    ).toBe(true);
  });

  it('连续两次切换后最终状态与最后一次请求一致', async () => {
    const { post, peek } = harness();
    await Promise.all([
      post.fetch(requestOf({ id: 'goal', enabled: false })),
      post.fetch(requestOf({ id: 'goal', enabled: true })),
    ]);
    expect(peek()).toEqual([]);
  });
});

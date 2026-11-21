// 重启行测试：端口、计划、运行形态与重复窗口的纯函数，以及路由回答的形状。
// 全部依赖注入，不启动真实进程。
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import {
  apply,
  type ConnectionLike,
  DUPLICATE_WINDOW,
  isDesktopRuntime,
  isDuplicateRequest,
  listeningPort,
  type RestartPlan,
  type RestartState,
  registerRestartRoutes,
  restartPlan,
  type WebServerLike,
} from '../src/restart/index.ts';
import { RESTART_ACTION_PATH, RESTART_INFO_PATH } from '../src/rows.ts';
import type { Context } from '../src/types.ts';

/** 被捕获的一条路由注册。 */
interface CapturedRoute {
  path: string;
  methods: string[];
  requestBody: string;
  fetch: () => Response | Promise<Response>;
}

/** 假 connection：记录注册的路由，卸载函数为幂等空操作。 */
function fakeConnection(): { connection: ConnectionLike; routes: CapturedRoute[] } {
  const routes: CapturedRoute[] = [];
  const connection: ConnectionLike = {
    fetch: {
      register: (route) => {
        routes.push(route);
        return () => undefined;
      },
    },
  };
  return { connection, routes };
}

/** 假 webServer：固定监听地址。 */
function fakeWebServer(origin = 'http://127.0.0.1:4310'): WebServerLike {
  return { getOrigin: () => origin };
}

/** 取出指定路径的路由，缺失时抛错。 */
function routeOf(routes: CapturedRoute[], target: string): CapturedRoute {
  const route = routes.find((item) => item.path === target);
  if (route === undefined) throw new Error(`route ${target} not registered`);
  return route;
}

/** 把路由回答读成对象。 */
async function jsonOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('listeningPort', () => {
  it('读取显式端口', () => {
    expect(listeningPort(fakeWebServer('http://127.0.0.1:4310'))).toBe(4310);
  });

  it('http 无端口时取 80', () => {
    expect(listeningPort(fakeWebServer('http://localhost'))).toBe(80);
  });

  it('https 无端口时取 443', () => {
    expect(listeningPort(fakeWebServer('https://example.test'))).toBe(443);
  });

  it('https 显式端口优先', () => {
    expect(listeningPort(fakeWebServer('https://example.test:8443'))).toBe(8443);
  });
});

describe('restartPlan', () => {
  it('从 argv、cwd、端口与日志路径组装计划', () => {
    const entry = path.join('bin', 'dsh.mjs');
    const plan = restartPlan(fakeWebServer(), {
      argv: ['node', entry, 'serve', '--port', '4310'],
      logPath: path.join('logs', 'restart.log'),
    });
    expect(plan).toEqual({
      binPath: path.resolve(entry),
      args: ['serve', '--port', '4310'],
      cwd: process.cwd(),
      port: 4310,
      logPath: path.join('logs', 'restart.log'),
    });
  });

  it('argv 缺少入口脚本时抛错', () => {
    expect(() => restartPlan(fakeWebServer(), { argv: ['node'] })).toThrow(
      'process.argv has no entry script',
    );
  });
});

describe('isDesktopRuntime', () => {
  it('Electron 版本与 Node 模式开关同时存在时判为桌面', () => {
    expect(isDesktopRuntime({ electron: '41.0.0' }, { ELECTRON_RUN_AS_NODE: '1' })).toBe(true);
  });

  it('缺少 Node 模式开关时判为网页', () => {
    expect(isDesktopRuntime({ electron: '41.0.0' }, {})).toBe(false);
  });

  it('普通 Node 进程判为网页', () => {
    expect(isDesktopRuntime({}, { ELECTRON_RUN_AS_NODE: '1' })).toBe(false);
  });
});

describe('isDuplicateRequest', () => {
  const fresh: RestartState = { requested: false, desktopRequestedAt: 0 };

  it('网页场景受理后一直重复', () => {
    expect(isDuplicateRequest({ ...fresh, requested: true }, false)).toBe(true);
  });

  it('桌面场景在窗口内重复', () => {
    const now = 1000 + DUPLICATE_WINDOW - 1;
    expect(isDuplicateRequest({ ...fresh, desktopRequestedAt: 1000 }, true, now)).toBe(true);
  });

  it('桌面场景窗口结束后放行', () => {
    const now = 1000 + DUPLICATE_WINDOW;
    expect(isDuplicateRequest({ ...fresh, desktopRequestedAt: 1000 }, true, now)).toBe(false);
  });

  it('未受理的桌面请求放行', () => {
    expect(isDuplicateRequest(fresh, true, 1)).toBe(false);
  });
});

describe('重启路由', () => {
  it('apply 声明 connection 与 webServer 依赖并注册两条路由', async () => {
    const { connection, routes } = fakeConnection();
    const groups: string[][] = [];
    const ctx = {
      inject(deps: string[], callback: (scope: unknown) => void) {
        groups.push([...deps]);
        callback({
          connection,
          webServer: fakeWebServer(),
          effect: (fn: () => unknown) => {
            const disposer = fn();
            return typeof disposer === 'function' ? disposer : () => undefined;
          },
        });
        return () => undefined;
      },
    } as unknown as Context;

    apply(ctx);

    expect(groups).toEqual([['connection', 'webServer']]);
    expect(routes.map((route) => route.path)).toEqual([RESTART_INFO_PATH, RESTART_ACTION_PATH]);
    const info = await jsonOf(await routeOf(routes, RESTART_INFO_PATH).fetch());
    expect(info).toEqual({ pid: process.pid, startedAt: expect.any(Number), runtime: 'web' });
  });

  it('首次受理后再次请求返回 409，且只拉起一次', async () => {
    const { connection, routes } = fakeConnection();
    const plan: RestartPlan = {
      binPath: path.join('bin', 'dsh.mjs'),
      args: ['serve'],
      cwd: 'work',
      port: 4310,
      logPath: path.join('logs', 'restart.log'),
    };
    const startLauncher = vi.fn<(next: RestartPlan) => void>();
    const scheduleExit = vi.fn<(delayMs: number, exit: () => void) => void>();
    const dispose = registerRestartRoutes(connection, fakeWebServer(), {
      desktop: false,
      now: () => 0,
      plan: () => plan,
      startLauncher,
      scheduleExit,
    });
    const restart = routeOf(routes, RESTART_ACTION_PATH);

    const accepted = await jsonOf(await restart.fetch());
    expect(accepted).toEqual({
      ok: true,
      pid: process.pid,
      startedAt: expect.any(Number),
      logPath: plan.logPath,
      runtime: 'web',
    });
    expect(startLauncher).toHaveBeenCalledWith(plan);
    expect(scheduleExit).toHaveBeenCalledWith(600, expect.any(Function));

    const duplicate = await restart.fetch();
    expect(duplicate.status).toBe(409);
    expect(await jsonOf(duplicate)).toEqual({
      ok: false,
      error: 'restart-pending',
      message: 'a restart has already been requested',
    });
    expect(startLauncher).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('生成计划失败时返回 500 且不拉起启动器', async () => {
    const { connection, routes } = fakeConnection();
    const startLauncher = vi.fn<(next: RestartPlan) => void>();
    registerRestartRoutes(connection, fakeWebServer(), {
      desktop: false,
      plan: () => {
        throw new Error('no entry script');
      },
      startLauncher,
      scheduleExit: () => undefined,
    });

    const response = await routeOf(routes, RESTART_ACTION_PATH).fetch();
    expect(response.status).toBe(500);
    expect(await jsonOf(response)).toEqual({
      ok: false,
      error: 'restart-failed',
      message: 'no entry script',
    });
    expect(startLauncher).not.toHaveBeenCalled();
  });

  it('拉起失败时返回 500，并允许下一次重试', async () => {
    const { connection, routes } = fakeConnection();
    const plan: RestartPlan = {
      binPath: 'dsh.mjs',
      args: [],
      cwd: 'work',
      port: 4310,
      logPath: 'restart.log',
    };
    const startLauncher = vi
      .fn<(next: RestartPlan) => void>()
      .mockImplementationOnce(() => {
        throw new Error('spawn failed');
      })
      .mockImplementation(() => undefined);
    registerRestartRoutes(connection, fakeWebServer(), {
      desktop: false,
      plan: () => plan,
      startLauncher,
      scheduleExit: () => undefined,
    });
    const restart = routeOf(routes, RESTART_ACTION_PATH);

    const failed = await restart.fetch();
    expect(failed.status).toBe(500);
    expect(await jsonOf(failed)).toEqual({
      ok: false,
      error: 'restart-failed',
      message: 'spawn failed',
    });

    const retried = await restart.fetch();
    expect(retried.status).toBe(200);
    expect(startLauncher).toHaveBeenCalledTimes(2);
  });
});

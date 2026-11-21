// 手机样式行测试：路由注册、宽度替换、响应头、读取失败与单次读盘缓存。
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apply, name } from '../src/mobile/index.ts';
import { MOBILE_CSS_PATH } from '../src/rows.ts';
import type { Context } from '../src/types.ts';

const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }));

vi.mock('node:fs/promises', () => ({ readFile: readFileMock }));

/** 一条注册到假 connection 服务的路由。 */
interface RegisteredRoute {
  path: string;
  methods: string[];
  requestBody: string;
  fetch: () => Promise<Response>;
}

/** 假宿主上下文：记录 inject 依赖、注册的路由与 effect 清理。 */
function makeHostCtx() {
  const groups: string[][] = [];
  const routes: RegisteredRoute[] = [];
  const disposers: Array<() => void> = [];
  const webCtx = {
    connection: {
      fetch: {
        register(route: RegisteredRoute) {
          routes.push(route);
          return () => {
            const index = routes.indexOf(route);
            if (index >= 0) routes.splice(index, 1);
          };
        },
      },
    },
    effect(fn: () => unknown) {
      const disposer = fn();
      if (typeof disposer === 'function') disposers.push(disposer as () => void);
      return () => {};
    },
  };
  const ctx = {
    inject(deps: string[], callback: (ctx: unknown) => void) {
      groups.push([...deps]);
      callback(webCtx);
      return () => {};
    },
  };
  return {
    ctx: ctx as unknown as Context,
    groups,
    routes,
    dispose: () => {
      for (const disposer of disposers.splice(0)) disposer();
    },
  };
}

/** 挂载一次并取出唯一路由。 */
function mountRoute() {
  const host = makeHostCtx();
  apply(host.ctx);
  const route = host.routes[0];
  if (route === undefined) throw new Error('route was not registered');
  return { host, route };
}

describe('手机样式行', () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  it('导出与 cordis.patch.yml 一致的行名', () => {
    expect(name).toBe('mobile-touch-ui');
  });

  it('等待 connection 服务并注册 GET 样式表路由', () => {
    const host = makeHostCtx();
    apply(host.ctx);

    expect(host.groups).toEqual([['connection']]);
    expect(host.routes).toHaveLength(1);
    expect(host.routes[0]).toMatchObject({
      path: MOBILE_CSS_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
    });

    host.dispose();
    expect(host.routes).toHaveLength(0);
  });

  it('把占位符全部替换为 328，并带上 CSS 响应头', async () => {
    readFileMock.mockResolvedValue(
      'a { width: __DRAWER_WIDTH__px }\nb { width: __DRAWER_WIDTH__px }',
    );
    const { route } = mountRoute();

    const response = await route.fetch();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.text();
    expect(body).toContain('328px');
    expect(body).not.toContain('__DRAWER_WIDTH__');
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it('重复请求只读一次文件，宽度替换在缓存结果上完成', async () => {
    readFileMock.mockResolvedValue('width: __DRAWER_WIDTH__px');
    const { route } = mountRoute();

    const first = await route.fetch();
    const second = await route.fetch();

    expect(await first.text()).toBe('width: 328px');
    expect(await second.text()).toBe('width: 328px');
    expect(readFileMock).toHaveBeenCalledTimes(1);
    const source = readFileMock.mock.calls[0]?.[0];
    expect(source).toBeInstanceOf(URL);
    expect((source as URL).pathname.endsWith('/assets/mobile.css')).toBe(true);
    expect(readFileMock.mock.calls[0]?.[1]).toBe('utf8');
  });

  it('读取失败返回 500 与 CSS 注释正文', async () => {
    readFileMock.mockRejectedValue(new Error('boom'));
    const { route } = mountRoute();

    const response = await route.fetch();

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8');
    const body = await response.text();
    expect(body.startsWith('/*')).toBe(true);
    expect(body.endsWith('*/')).toBe(true);
    expect(body).toContain('mobile.css unavailable');
    expect(body).toContain('boom');
  });
});

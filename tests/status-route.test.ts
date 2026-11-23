// 状态路由测试：注册路径、方法、请求体模式与响应形状。
import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.ts';
import { STATUS_PATH } from '../src/rows.ts';

/** 一条注册记录。 */
interface Registration {
  path: string;
  methods: string[];
  requestBody?: string;
  fetch: () => Response | Promise<Response>;
}

/** 造一个只提供 connection 的宿主 ctx。 */
function makeWebCtx(
  options: {
    loaderEntries?: Array<{ id: string; disabled: boolean; fiber?: { state: number } }>;
    withLoader?: boolean;
  } = {},
) {
  const registrations: Registration[] = [];
  const effects: Array<() => void> = [];
  const entries = options.loaderEntries ?? [];
  const loader = { entries: () => entries };
  const ctx = {
    get(name: string) {
      if (name === 'loader') return options.withLoader === false ? undefined : loader;
      return undefined;
    },
    inject(deps: string[], callback: (ctx: unknown) => void) {
      expect(deps).toEqual(['connection']);
      callback(webCtx);
      return () => true;
    },
    effect(fn: () => unknown) {
      const disposer = fn();
      if (typeof disposer === 'function') effects.push(disposer as () => void);
      return () => true;
    },
  };
  const webCtx = {
    connection: {
      fetch: {
        register(registration: Registration) {
          registrations.push(registration);
          return () => undefined;
        },
      },
    },
    effect: ctx.effect,
    get: ctx.get,
  };
  return { ctx, webCtx, registrations, effects };
}

describe('状态路由', () => {
  it('注册 GET /status 并回答六行状态', async () => {
    const { ctx, registrations } = makeWebCtx({
      loaderEntries: [
        { id: 'session-sweeper', disabled: false, fiber: { state: 2 } },
        { id: 'restart-button', disabled: true, fiber: { state: 2 } },
        { id: 'mobile-touch-ui', disabled: false },
      ],
    });
    apply(ctx as never);
    expect(registrations).toHaveLength(1);
    const registration = registrations[0];
    expect(registration?.path).toBe(STATUS_PATH);
    expect(registration?.methods).toEqual(['GET']);

    const response = await registration?.fetch();
    expect(response?.status).toBe(200);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    const body = (await response?.json()) as { ok: boolean; rows: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.rows).toEqual({
      sweeper: true,
      reasoningReset: false,
      claudeSkills: false,
      restart: false,
      mobile: false,
      officialFeatures: false,
    });
  });

  it('loader 缺失时回答 null，前端据此保留当前界面', async () => {
    const { ctx, registrations } = makeWebCtx({ withLoader: false });
    apply(ctx as never);
    const response = await registrations[0]?.fetch();
    const body = (await response?.json()) as { rows: Record<string, unknown> };
    expect(body.rows).toEqual({
      sweeper: null,
      reasoningReset: null,
      claudeSkills: null,
      restart: null,
      mobile: null,
      officialFeatures: null,
    });
  });
});

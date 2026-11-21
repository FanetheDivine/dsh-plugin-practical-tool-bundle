// 调度全局行测试：共享服务归属当前 fiber，状态路由随连接服务注册。
import { describe, expect, it } from 'vitest';

import { apply } from '../src/lark-super-agent/index.ts';
import { SuperAgentService } from '../src/lark-super-agent/service.ts';
import { SUPER_AGENT_STATUS_PATH } from '../src/rows.ts';
import type { Context } from '../src/types.ts';

describe('lark-super-agent 全局行', () => {
  it('提供 larkSuperAgent 并注册 GET 状态路由', () => {
    const provided: Array<[string, unknown]> = [];
    const routes: Array<{ path: string; methods: string[] }> = [];
    const ctx = {
      effect(fn: () => unknown) {
        fn();
      },
      provide(name: string, value: unknown) {
        provided.push([name, value]);
        return () => undefined;
      },
      inject(deps: string[], callback: (ctx: unknown) => void) {
        expect(deps).toEqual(['connection']);
        callback({
          effect: (fn: () => unknown) => fn(),
          connection: {
            fetch: {
              register(route: { path: string; methods: string[] }) {
                routes.push(route);
              },
            },
          },
        });
      },
    } as unknown as Context;
    apply(ctx);
    expect(provided).toHaveLength(1);
    expect(provided[0]?.[0]).toBe('larkSuperAgent');
    expect(provided[0]?.[1]).toBeInstanceOf(SuperAgentService);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ path: SUPER_AGENT_STATUS_PATH, methods: ['GET'] });
  });
});

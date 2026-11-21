/**
 * lark-super-agent 全局行：提供笔记与上报服务，并暴露桥接和 git 状态路由。
 * 两个预设子行通过 `larkSuperAgent` 服务复用同一套实现。
 */

import { SUPER_AGENT_STATUS_PATH } from '../rows.ts';
import type { Context } from '../types.ts';
import { jsonResponse } from '../utils.ts';
import { SuperAgentService } from './service.ts';
import { readSuperAgentStatus } from './status.ts';

/** 行标识，与 cordis.patch.yml 一致。 */
export const name = 'lark-super-agent';

/** 路由注册所需的最小 connection 接口。 */
interface ConnectionLike {
  readonly fetch: {
    register(route: {
      path: string;
      methods: string[];
      requestBody: 'buffered';
      fetch: () => Response | Promise<Response>;
    }): () => void;
  };
}

/** 插件启用时提供共享服务；连接服务不可用时仍保留预设工具能力。 */
export function apply(ctx: Context): void {
  const service = new SuperAgentService(ctx);
  ctx.effect(() => ctx.provide('larkSuperAgent', service), 'lark-super-agent: service');
  ctx.inject(['connection'], (injected) => {
    const webCtx = injected as Context & { connection: ConnectionLike };
    webCtx.effect(
      () =>
        webCtx.connection.fetch.register({
          path: SUPER_AGENT_STATUS_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: async () => jsonResponse(await readSuperAgentStatus(ctx)),
        }),
      'lark-super-agent: status route',
    );
  });
}

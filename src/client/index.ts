/**
 * 前端入口：注册字典，然后按根行状态路由装卸三个界面块。
 * 导出 apply；前端服务按功能可选。
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-locale/client';
// Type-only：拉取 ctx.slots 服务。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
// Type-only：拉取 sidebar.footer.action 槽位声明。
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
// Type-only：拉取 ctx.workspaces 服务。
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import { en, NS, zh } from './locales.ts';
import { startRowWatch } from './status.ts';

/**
 * 插件在前端启用时调用。
 * 字典与状态循环各自等待用到的服务；服务缺失时对应功能不加载。
 */
export function apply(ctx: Context): void {
  ctx.inject(['locale'], (ctx) => {
    ctx.effect(
      () => ctx.locale.register(NS, { zh, en }),
      'dsh-plugin-practical-tool-bundle: dictionaries',
    );
  });

  ctx.inject(['slots', 'locale', 'workspaces'], (ctx) => {
    ctx.effect(() => startRowWatch(ctx), 'dsh-plugin-practical-tool-bundle: row watch');
  });
}

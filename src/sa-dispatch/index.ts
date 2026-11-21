/** SA-调度会话预设子行：注册调度提示词与五个笔记、候选工具。 */
import type { Context } from '../types.ts';
import { SA_DISPATCH_PROMPT } from './prompt.ts';
import { type DispatchContext, registerDispatchTools } from './tools.ts';

/** 子行标识，与预设补丁一致。 */
export const name = 'sa-dispatch';

/** 全局服务、提示词与工具注册表；全局行停用时本子行随依赖下线。 */
export const inject = ['larkSuperAgent', 'systemPrompt', 'tools'];

/** 等待全局共享服务，并在该预设作用域注册能力。 */
export function apply(ctx: Context): void {
  ctx.inject(inject, (injected) => {
    const dispatchCtx = injected as DispatchContext;
    dispatchCtx.systemPrompt.section({
      name: 'sa-dispatch:instructions',
      order: 700,
      text: SA_DISPATCH_PROMPT,
    });
    registerDispatchTools(dispatchCtx);
  });
}

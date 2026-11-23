/** SA-调度会话预设子行：注册调度提示词、五个笔记与候选工具、用户状态提醒。 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';

import type { Context } from '../types.ts';
import { presenceReminder, type UserPresence } from './presence.ts';
import { SA_DISPATCH_PROMPT } from './prompt.ts';
import { type DispatchContext, registerDispatchTools } from './tools.ts';

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'sa-dispatch-presence': {
      kind: 'sa-dispatch-presence';
      form: 'notice';
    };
  }
}

/** 子行标识，与预设补丁一致。 */
export const name = 'sa-dispatch';

/** 全局服务、提示词与工具注册表；全局行停用时本子行随依赖下线。 */
export const inject = ['larkSuperAgent', 'systemPrompt', 'tools'];

/** 各会话最近一次已提醒的用户状态；无记录时下一次可判定消息会插入提醒。 */
const presenceBySession = new WeakMap<object, UserPresence>();

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
    dispatchCtx.on('agent/pre-step', async ({ agent }, next) => {
      const decision = await next();
      if (decision.kind === 'reject') return decision;
      const reminder = presenceReminder(decision.messages, presenceBySession.get(agent.session));
      if (reminder === undefined) return decision;
      presenceBySession.set(agent.session, reminder.presence);
      const notice = createUserMessage({
        content: [{ type: 'text', text: reminder.text }],
        source: { kind: 'sa-dispatch-presence', form: 'notice' },
      });
      return { ...decision, messages: [notice, ...decision.messages] };
    });
  });
}

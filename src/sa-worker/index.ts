/** SA-任务会话预设子行：注册上报工具、提示词、调度消息来源标记与轮次失败监听。 */
import type {} from '@deepseek-ai/dsh-session';

import type { Context } from '../types.ts';
import { wrapDispatchMessages } from './dispatch-message.ts';
import { SA_WORKER_PROMPT } from './prompt.ts';
import { registerWorkerTools, type WorkerContext } from './tools.ts';

/** 子行标识，与预设补丁一致。 */
export const name = 'sa-worker';

/** 全局服务、提示词与工具注册表；全局行停用时本子行随依赖下线。 */
export const inject = ['larkSuperAgent', 'systemPrompt', 'tools'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 同时识别标准 SessionEvent 与 data 直接携带 type/reason 的兼容结构。 */
function turnFailure(event: unknown): { error: unknown } | undefined {
  if (!isRecord(event)) return undefined;
  const data = isRecord(event.data) ? event.data : undefined;
  const type = event.type ?? data?.type;
  if (type !== 'turn/end') return undefined;
  const reason = data?.reason ?? event.reason;
  if (!isRecord(reason) || reason.kind !== 'error') return undefined;
  return { error: reason.error };
}

/** 等待全局共享服务，并在该预设作用域注册能力。 */
export function apply(ctx: Context): void {
  ctx.inject(inject, (injected) => {
    const workerCtx = injected as WorkerContext;
    workerCtx.systemPrompt.section({
      name: 'sa-worker:instructions',
      order: 700,
      text: SA_WORKER_PROMPT,
    });
    registerWorkerTools(workerCtx);
    workerCtx.on('agent/pre-step', async (_payload, next) => {
      const decision = await next();
      if (decision.kind === 'reject') return decision;
      const messages = wrapDispatchMessages(decision.messages);
      if (messages === decision.messages) return decision;
      return { ...decision, messages };
    });
    workerCtx.on('session/event', (session, event) => {
      const failure = turnFailure(event);
      if (failure === undefined) return;
      void workerCtx.larkSuperAgent
        .notifyFailure(session.id, failure.error)
        .catch((error: unknown) => {
          workerCtx.logger.warn('sa-worker failed to notify dispatch session', error);
        });
    });
  });
}

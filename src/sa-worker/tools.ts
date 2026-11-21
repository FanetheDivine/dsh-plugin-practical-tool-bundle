/** SA-任务会话的上报工具。 */
import { defineTool } from '@deepseek-ai/dsh-tools';

import type { LarkSuperAgentService } from '../lark-super-agent/api.ts';
import type { Context } from '../types.ts';

export type WorkerContext = Context & { readonly larkSuperAgent: LarkSuperAgentService };

/** 注册 send_report；参数校验、存档与投递由共享服务执行。 */
export function registerWorkerTools(ctx: WorkerContext): void {
  ctx.tools.register(
    defineTool({
      name: 'send_report',
      description:
        'Send progress, a question, or a result to the dispatch session for delivery to the user.',
      parameters: {
        text: {
          type: 'string',
          description: 'Text or a question for the user. Required when files is empty or omitted.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Paths to completed Markdown files to deliver. Absolute paths or paths relative to the caller working directory.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reportId: { type: 'string', required: true },
            taskId: {
              oneOf: [{ type: 'string' }, { type: 'null' }],
              required: true,
            },
            delivered: { type: 'boolean', required: true, const: true },
            warning: {
              type: 'string',
              description: 'Non-fatal post-delivery warning, such as a commit failure.',
            },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) ?? 'null' }],
      },
      execute: (args, exec) => {
        const callerSessionId = exec.agent?.session?.id;
        if (callerSessionId === undefined || callerSessionId === '') {
          throw new Error('send_report requires an agent session');
        }
        return ctx.larkSuperAgent.sendReport(
          {
            ...(args.text === undefined ? {} : { text: args.text }),
            ...(args.files === undefined ? {} : { files: args.files }),
          },
          callerSessionId,
        );
      },
    }),
  );
}

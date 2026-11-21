/** SA-调度会话的五个模型工具，仅负责参数与结果的契约转换。 */
import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools';

import type { LarkSuperAgentService } from '../lark-super-agent/api.ts';
import type { Context } from '../types.ts';

export type DispatchContext = Context & { readonly larkSuperAgent: LarkSuperAgentService };

function renderJson(value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value) ?? 'null' }];
}

/** 注册任务笔记、工作区笔记与候选会话工具。 */
export function registerDispatchTools(ctx: DispatchContext): void {
  const service = ctx.larkSuperAgent;

  ctx.tools.register(
    defineTool({
      name: 'task_create',
      description:
        'Create a task in a registered workspace and record its initiating user message.',
      parameters: {
        title: { type: 'string', required: true, description: 'Short, single-line task title.' },
        workspace_id: {
          type: 'string',
          required: true,
          description: 'Workspace id already registered in the workspace notes.',
        },
        message: {
          type: 'object',
          required: true,
          additionalProperties: false,
          description: 'The user message that initiates this task.',
          properties: {
            text: { type: 'string', required: true, description: 'Original message text.' },
            message_id: {
              type: 'string',
              description: 'Optional remote message id; omit for Web GUI input.',
            },
          },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { taskId: { type: 'string', required: true } },
        },
        render: (_args, value) => renderJson(value),
      },
      execute: (args) =>
        service.createTask({
          title: args.title,
          workspaceId: args.workspace_id,
          message: {
            text: args.message.text,
            ...(args.message.message_id === undefined
              ? {}
              : { messageId: args.message.message_id }),
          },
        }),
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'task_update',
      description:
        'Update a task status, title, worker sessions, or messages. Completed tasks are archived automatically.',
      parameters: {
        task_id: { type: 'string', required: true, description: 'Existing task id.' },
        status: {
          type: 'string',
          enum: ['in_progress', 'waiting_user', 'failed', 'completed'],
          description: 'New task status. Setting completed also archives the task.',
        },
        add_session_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Worker session ids to add to the task, preserving existing ids.',
        },
        add_message: {
          type: 'object',
          additionalProperties: false,
          description: 'A follow-up, supplement, or answer to append to the task.',
          properties: {
            text: { type: 'string', required: true, description: 'Message text.' },
            message_id: { type: 'string', description: 'Optional remote message id.' },
          },
        },
        title: { type: 'string', description: 'Replacement task title.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            taskId: { type: 'string', required: true },
            status: {
              type: 'string',
              required: true,
              enum: ['in_progress', 'waiting_user', 'failed', 'completed'],
            },
            archived: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => renderJson(value),
      },
      execute: (args) => {
        if (
          args.status === undefined &&
          args.add_session_ids === undefined &&
          args.add_message === undefined &&
          args.title === undefined
        ) {
          throw new ToolArgsError([
            'task_update needs at least one of status, add_session_ids, add_message, or title',
          ]);
        }
        return service.updateTask({
          taskId: args.task_id,
          ...(args.status === undefined ? {} : { status: args.status }),
          ...(args.add_session_ids === undefined ? {} : { addSessionIds: args.add_session_ids }),
          ...(args.add_message === undefined
            ? {}
            : {
                addMessage: {
                  text: args.add_message.text,
                  ...(args.add_message.message_id === undefined
                    ? {}
                    : { messageId: args.add_message.message_id }),
                },
              }),
          ...(args.title === undefined ? {} : { title: args.title }),
        });
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'workspace_note_set',
      description:
        'Create or replace a dispatch workspace note. Registered notes also authorize dispatch to that workspace.',
      parameters: {
        workspace_id: {
          type: 'string',
          required: true,
          description: 'Existing workspace id from the host workspace registry.',
        },
        summary: {
          type: 'string',
          required: true,
          description: 'Concise description of the project in this workspace.',
        },
        keywords: {
          type: 'array',
          required: true,
          items: { type: 'string' },
          description: 'Keywords used to match user tasks to this workspace.',
        },
        notes: {
          type: 'string',
          description: 'Optional additional guidance for workspace selection.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            workspaceId: { type: 'string', required: true },
            created: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => renderJson(value),
      },
      execute: (args) =>
        service.setWorkspaceNote({
          workspaceId: args.workspace_id,
          summary: args.summary,
          keywords: args.keywords,
          ...(args.notes === undefined ? {} : { notes: args.notes }),
        }),
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'workspace_note_remove',
      description: 'Remove a workspace note and revoke dispatch authorization for that workspace.',
      parameters: {
        workspace_id: {
          type: 'string',
          required: true,
          description: 'Workspace id whose note should be removed.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            workspaceId: { type: 'string', required: true },
            removed: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => renderJson(value),
      },
      execute: (args) => service.removeWorkspaceNote(args.workspace_id),
    }),
  );

  ctx.tools.register(
    defineTool({
      name: 'task_candidates',
      description:
        'List reusable worker sessions previously dispatched to a workspace. Read-only; does not modify notes.',
      parameters: {
        workspace_id: {
          type: 'string',
          required: true,
          description: 'Registered workspace id to search.',
        },
        task_id: {
          type: 'string',
          description: 'Optional current task id; its existing sessions are prioritized.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            candidates: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  sessionId: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  running: { type: 'boolean', required: true },
                  tasks: {
                    type: 'array',
                    required: true,
                    items: { type: 'string' },
                  },
                  lastActiveAt: { type: 'string', required: true },
                },
              },
            },
          },
        },
        render: (_args, value) => renderJson(value),
      },
      execute: async (args) => {
        const result = await service.listCandidates(args.workspace_id, args.task_id);
        return {
          candidates: result.candidates.map(({ taskIds, ...candidate }) => ({
            ...candidate,
            tasks: taskIds,
          })),
        };
      },
    }),
  );
}

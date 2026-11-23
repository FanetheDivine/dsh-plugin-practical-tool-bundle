// SA-调度会话子行测试：依赖注入、提示词、五个工具的参数转换与结果、用户状态提醒。
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import { ToolArgsError, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';

import type { LarkSuperAgentService } from '../src/lark-super-agent/api.ts';
import { apply, name } from '../src/sa-dispatch/index.ts';
import { presenceReminder } from '../src/sa-dispatch/presence.ts';
import { SA_DISPATCH_PROMPT } from '../src/sa-dispatch/prompt.ts';
import type { Context } from '../src/types.ts';
import { makeCtx } from './helpers.ts';

interface PromptSectionLike {
  name: string;
  order: number;
  text: string;
}

function makeService() {
  return {
    createTask: vi.fn(),
    updateTask: vi.fn(),
    setWorkspaceNote: vi.fn(),
    removeWorkspaceNote: vi.fn(),
    listCandidates: vi.fn(),
    sendReport: vi.fn(),
    notifyFailure: vi.fn(),
  } satisfies LarkSuperAgentService;
}

function mount() {
  const base = makeCtx();
  const service = makeService();
  const sections: PromptSectionLike[] = [];
  const groups: string[][] = [];
  const injected = Object.assign(base, {
    larkSuperAgent: service,
    systemPrompt: {
      section(section: PromptSectionLike) {
        sections.push(section);
        return () => true;
      },
    },
  });
  const ctx = Object.assign(injected, {
    inject(deps: string[], callback: (context: unknown) => void) {
      groups.push([...deps]);
      callback(injected);
      return () => true;
    },
  });
  apply(ctx as unknown as Context);
  return {
    base,
    service,
    sections,
    groups,
    tools: base._registeredTools as unknown as ToolDefinition[],
  };
}

function tool(tools: ToolDefinition[], toolName: string): ToolDefinition {
  const definition = tools.find((entry) => entry.name === toolName);
  if (definition === undefined) throw new Error(`missing tool ${toolName}`);
  return definition;
}

/** 构造一条带来源的用户消息。 */
function sourcedMessage(kind: string, extra: Record<string, unknown> = {}): UserMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    content: [{ type: 'text', text: 'hello' }],
    source: { kind, ...extra },
  } as unknown as UserMessage;
}

/** 调用子行注册的 agent/pre-step 监听。 */
async function runPreStep(
  host: ReturnType<typeof mount>,
  session: object,
  messages: UserMessage[],
  decision?: { kind: string; messages?: UserMessage[] },
) {
  const listener = host.base._onCallbacks.get('agent/pre-step')?.[0];
  if (listener === undefined) throw new Error('missing agent/pre-step listener');
  const next = vi.fn(async () => decision ?? { kind: 'enter', messages });
  const result = (await listener({ agent: { session } }, next)) as {
    kind: string;
    messages?: UserMessage[];
  };
  return { result, next };
}

describe('SA-调度会话子行', () => {
  it('注入共享服务并注册提示词段与五个工具', () => {
    const host = mount();

    expect(name).toBe('sa-dispatch');
    expect(host.groups).toEqual([['larkSuperAgent', 'systemPrompt', 'tools']]);
    expect(host.sections).toEqual([
      { name: 'sa-dispatch:instructions', order: 700, text: SA_DISPATCH_PROMPT },
    ]);
    expect(host.tools.map((entry) => entry.name)).toEqual([
      'task_create',
      'task_update',
      'workspace_note_set',
      'workspace_note_remove',
      'task_candidates',
    ]);
    for (const definition of host.tools) {
      expect(definition.description).toMatch(/^[A-Za-z]/);
      expect(definition.parameters.type).toBe('object');
    }
  });

  it('task_create 转换消息字段并返回任务标识', async () => {
    const host = mount();
    host.service.createTask.mockResolvedValue({ taskId: 'task-1' });

    const result = await tool(host.tools, 'task_create').execute(
      {
        title: 'Investigate failure',
        workspace_id: 'workspace-1',
        message: { text: '查一下 xxx', message_id: 'message-1' },
      },
      {} as never,
    );

    expect(host.service.createTask).toHaveBeenCalledWith({
      title: 'Investigate failure',
      workspaceId: 'workspace-1',
      message: { text: '查一下 xxx', messageId: 'message-1' },
    });
    expect(result).toEqual({ taskId: 'task-1' });
  });

  it('task_update 转换全部字段并传递 completed 的自动归档结果', async () => {
    const host = mount();
    host.service.updateTask.mockResolvedValue({
      taskId: 'task-1',
      status: 'completed',
      archived: true,
    });

    const result = await tool(host.tools, 'task_update').execute(
      {
        task_id: 'task-1',
        status: 'completed',
        add_session_ids: ['session-1'],
        add_message: { text: '补充要求', message_id: 'message-2' },
        title: 'Updated title',
      },
      {} as never,
    );

    expect(host.service.updateTask).toHaveBeenCalledWith({
      taskId: 'task-1',
      status: 'completed',
      addSessionIds: ['session-1'],
      addMessage: { text: '补充要求', messageId: 'message-2' },
      title: 'Updated title',
    });
    expect(result).toEqual({ taskId: 'task-1', status: 'completed', archived: true });
  });

  it('task_update 拒绝没有更新字段的调用', async () => {
    const host = mount();

    await expect(
      tool(host.tools, 'task_update').execute({ task_id: 'task-1' }, {} as never),
    ).rejects.toBeInstanceOf(ToolArgsError);
    expect(host.service.updateTask).not.toHaveBeenCalled();
  });

  it('工作区笔记工具转换可选字段并返回服务结果', async () => {
    const host = mount();
    host.service.setWorkspaceNote.mockResolvedValue({ workspaceId: 'workspace-1', created: true });
    host.service.removeWorkspaceNote.mockResolvedValue({
      workspaceId: 'workspace-1',
      removed: false,
    });

    const setResult = await tool(host.tools, 'workspace_note_set').execute(
      { workspace_id: 'workspace-1', summary: 'Project A', keywords: ['a', 'project'] },
      {} as never,
    );
    const removeResult = await tool(host.tools, 'workspace_note_remove').execute(
      { workspace_id: 'workspace-1' },
      {} as never,
    );

    expect(host.service.setWorkspaceNote).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      summary: 'Project A',
      keywords: ['a', 'project'],
    });
    expect(host.service.removeWorkspaceNote).toHaveBeenCalledWith('workspace-1');
    expect(setResult).toEqual({ workspaceId: 'workspace-1', created: true });
    expect(removeResult).toEqual({ workspaceId: 'workspace-1', removed: false });
  });

  it('task_candidates 传递可选任务并按工具契约返回 tasks', async () => {
    const host = mount();
    host.service.listCandidates.mockResolvedValue({
      candidates: [
        {
          sessionId: 'session-1',
          title: 'Existing work',
          running: false,
          taskIds: ['task-1'],
          lastActiveAt: '2026-11-21T00:00:00+08:00',
        },
      ],
    });

    const result = await tool(host.tools, 'task_candidates').execute(
      { workspace_id: 'workspace-1', task_id: 'task-1' },
      {} as never,
    );

    expect(host.service.listCandidates).toHaveBeenCalledWith('workspace-1', 'task-1');
    expect(result).toEqual({
      candidates: [
        {
          sessionId: 'session-1',
          title: 'Existing work',
          running: false,
          tasks: ['task-1'],
          lastActiveAt: '2026-11-21T00:00:00+08:00',
        },
      ],
    });
  });

  it('提示词保留中文分类例句并覆盖派发、上报、记忆与卡住处理', () => {
    expect(SA_DISPATCH_PROMPT).toContain('查一下 xxx');
    expect(SA_DISPATCH_PROMPT).toContain('之前那个 xxx 做完了吗');
    expect(SA_DISPATCH_PROMPT).toContain('现在有哪些任务');
    expect(SA_DISPATCH_PROMPT).toContain('<引用消息>要注意 xxx');
    expect(SA_DISPATCH_PROMPT).toContain('task_candidates');
    expect(SA_DISPATCH_PROMPT).toContain('AGENTS.md');
    expect(SA_DISPATCH_PROMPT).toContain('<work_session_message');
    expect(SA_DISPATCH_PROMPT).toContain('<work_session_failure');
    expect(SA_DISPATCH_PROMPT).toContain("status: 'completed'");
    expect(SA_DISPATCH_PROMPT).toMatch(/read.*copied.*file/is);
    expect(SA_DISPATCH_PROMPT).toMatch(/stuck|no progress/i);
  });

  it('提示词要求始终派发、先匹配工作区并守住调度边界', () => {
    expect(SA_DISPATCH_PROMPT).toContain('## Always dispatch');
    expect(SA_DISPATCH_PROMPT).toContain('## Pick a workspace first');
    expect(SA_DISPATCH_PROMPT).toContain('## Stay in bounds');
    expect(SA_DISPATCH_PROMPT).toContain('must be assigned to a worker session');
    expect(SA_DISPATCH_PROMPT).toContain(
      'Do not suggest that the dispatch session do the work itself',
    );
    expect(SA_DISPATCH_PROMPT).toContain('ask the user to register');
    expect(SA_DISPATCH_PROMPT).toContain('Do not guess');
    expect(SA_DISPATCH_PROMPT).toContain(
      'Dispatch only into a workspace registered in workspaces.json',
    );
    expect(SA_DISPATCH_PROMPT).toMatch(/Assign project inspections.*worker session/is);
  });

  it('提示词要求新建工作会话先置顶', () => {
    expect(SA_DISPATCH_PROMPT).toContain('## Maintain the session list');
    expect(SA_DISPATCH_PROMPT).toContain('session_pin');
    expect(SA_DISPATCH_PROMPT).toMatch(/session_pin.*session_id.*before.*task requirements/is);
    expect(SA_DISPATCH_PROMPT).toMatch(/pinning fails.*continue dispatching/is);
  });

  it('提示词要求任务完成后归档工作会话', () => {
    expect(SA_DISPATCH_PROMPT).toContain('session_archive');
    expect(SA_DISPATCH_PROMPT).toContain('stop_activity');
    expect(SA_DISPATCH_PROMPT).toMatch(
      /message-task-status\.json.*status: 'completed'.*session_archive/is,
    );
    expect(SA_DISPATCH_PROMPT).toMatch(/archiving removes the session's pin/i);
    expect(SA_DISPATCH_PROMPT).toMatch(/archiving a session fails.*keep the task completed/is);
    expect(SA_DISPATCH_PROMPT).toMatch(/Do not archive the dispatch session/i);
  });

  it('提示词要求复用与共用会话保持原状态', () => {
    expect(SA_DISPATCH_PROMPT).toMatch(/task_candidates keeps its current pin state/i);
    expect(SA_DISPATCH_PROMPT).toMatch(/Do not pin or unpin it/i);
    expect(SA_DISPATCH_PROMPT).toMatch(
      /check message-task-status\.json again.*any unfinished task lists it/is,
    );
  });

  it('注册 agent/pre-step 用户状态提醒监听', () => {
    const host = mount();
    expect(host.base._onCallbacks.get('agent/pre-step')).toHaveLength(1);
  });

  it('首次本机消息插入 local 提醒，之后连续本机消息不重复', async () => {
    const host = mount();
    const session = {};
    const local = sourcedMessage('user', { rpcId: 'rpc-1' });

    const first = await runPreStep(host, session, [local]);

    expect(first.result.kind).toBe('enter');
    expect(first.result.messages).toHaveLength(2);
    const [notice, original] = first.result.messages ?? [];
    expect(notice?.source).toEqual({ kind: 'sa-dispatch-presence', form: 'notice' });
    expect(JSON.stringify(notice?.content)).toContain('at the computer');
    expect(JSON.stringify(notice?.content)).toContain('Do not call lark_notify');
    expect(original).toBe(local);

    const second = await runPreStep(host, session, [sourcedMessage('user')]);
    expect(second.result.messages).toHaveLength(1);
  });

  it('飞书消息切回 remote 提醒，之后不重复', async () => {
    const host = mount();
    const session = {};
    await runPreStep(host, session, [sourcedMessage('user')]);

    const remote = await runPreStep(host, session, [sourcedMessage('lark-bridge')]);
    expect(remote.result.messages).toHaveLength(2);
    expect(JSON.stringify(remote.result.messages?.[0]?.content)).toContain('remote');
    expect(JSON.stringify(remote.result.messages?.[0]?.content)).toContain('lark_notify');

    const again = await runPreStep(host, session, [sourcedMessage('lark-bridge')]);
    expect(again.result.messages).toHaveLength(1);
  });

  it('同批多条可判定消息以最后一条为准', () => {
    expect(
      presenceReminder([sourcedMessage('user'), sourcedMessage('lark-bridge')], undefined)
        ?.presence,
    ).toBe('remote');
    expect(
      presenceReminder([sourcedMessage('lark-bridge'), sourcedMessage('user')], undefined)
        ?.presence,
    ).toBe('local');
    expect(presenceReminder([sourcedMessage('user')], 'local')).toBeUndefined();
  });

  it('桥接提醒、工作会话上报与其他注入不触发提醒', async () => {
    const host = mount();
    const session = {};
    const messages = [
      sourcedMessage('lark-bridge', { reminder: true }),
      sourcedMessage('lark-super-agent'),
      sourcedMessage('time-context'),
      sourcedMessage('runtime-context'),
    ];

    const { result } = await runPreStep(host, session, messages);

    expect(result.messages).toEqual(messages);
    expect(presenceReminder(messages, undefined)).toBeUndefined();
  });

  it('reject 决策原样返回且不更新状态', async () => {
    const host = mount();
    const session = {};
    const decision = { kind: 'reject' };

    const rejected = await runPreStep(host, session, [sourcedMessage('user')], decision);
    expect(rejected.result).toBe(decision);

    const next = await runPreStep(host, session, [sourcedMessage('user')]);
    expect(next.result.messages).toHaveLength(2);
  });

  it('提示词按状态提醒选择回复与转达渠道', () => {
    expect(SA_DISPATCH_PROMPT).toContain('## Track where the user is');
    expect(SA_DISPATCH_PROMPT).toMatch(/system reminder reports each presence change/i);
    expect(SA_DISPATCH_PROMPT).toMatch(/treat the user as remote/i);
    expect(SA_DISPATCH_PROMPT).toMatch(/at the computer.*response body/is);
    expect(SA_DISPATCH_PROMPT).toMatch(/do not call lark_notify/i);
    expect(SA_DISPATCH_PROMPT).toMatch(/Worker reports and failures never change/i);
    expect(SA_DISPATCH_PROMPT).toMatch(/Dispatch every task in both states/i);
    expect(SA_DISPATCH_PROMPT).toMatch(/channel for the current presence/i);
  });
});

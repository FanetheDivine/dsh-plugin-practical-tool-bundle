// SA-任务会话子行测试：send_report 调用方寻址、提示词与失败事件过滤。
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';

import type { LarkSuperAgentService } from '../src/lark-super-agent/api.ts';
import { apply, name } from '../src/sa-worker/index.ts';
import { SA_WORKER_PROMPT } from '../src/sa-worker/prompt.ts';
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
    notifyFailure: vi.fn().mockResolvedValue(undefined),
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
  return { base, service, sections, groups };
}

function reportTool(base: ReturnType<typeof makeCtx>): ToolDefinition {
  const definition = (base._registeredTools as unknown as ToolDefinition[]).find(
    (entry) => entry.name === 'send_report',
  );
  if (definition === undefined) throw new Error('missing send_report');
  return definition;
}

function exec(sessionId?: string) {
  return {
    agent: sessionId === undefined ? undefined : { session: { id: sessionId } },
  } as never;
}

describe('SA-任务会话子行', () => {
  it('注入共享服务并注册 send_report、提示词和失败监听', () => {
    const host = mount();

    expect(name).toBe('sa-worker');
    expect(host.groups).toEqual([['larkSuperAgent', 'systemPrompt', 'tools']]);
    expect(host.sections).toEqual([
      { name: 'sa-worker:instructions', order: 700, text: SA_WORKER_PROMPT },
    ]);
    expect(host.base._registeredTools.map((entry) => entry.name)).toEqual(['send_report']);
    expect(host.base._onCallbacks.get('session/event')).toHaveLength(1);
  });

  it('send_report 使用 exec.agent.session.id 并保留服务结果', async () => {
    const host = mount();
    host.service.sendReport.mockResolvedValue({
      reportId: 'report-1',
      taskId: 'task-1',
      delivered: true,
      warning: 'commit failed',
    });

    const result = await reportTool(host.base).execute(
      { text: 'Need a decision', files: ['result.md'] },
      exec('session-1'),
    );

    expect(host.service.sendReport).toHaveBeenCalledWith(
      { text: 'Need a decision', files: ['result.md'] },
      'session-1',
    );
    expect(result).toEqual({
      reportId: 'report-1',
      taskId: 'task-1',
      delivered: true,
      warning: 'commit failed',
    });
  });

  it('send_report 保留缺省 text 字段', async () => {
    const host = mount();
    host.service.sendReport.mockResolvedValue({
      reportId: 'report-2',
      taskId: null,
      delivered: true,
    });

    await reportTool(host.base).execute({ files: ['result.md'] }, exec('session-1'));

    expect(host.service.sendReport).toHaveBeenCalledWith({ files: ['result.md'] }, 'session-1');
  });

  it('send_report 缺少调用会话时抛错且不调用服务', async () => {
    const host = mount();

    await expect(reportTool(host.base).execute({ text: 'status' }, exec())).rejects.toThrow(
      'send_report requires an agent session',
    );
    await expect(
      reportTool(host.base).execute({ text: 'status' }, { agent: {} } as never),
    ).rejects.toThrow('send_report requires an agent session');
    expect(host.service.sendReport).not.toHaveBeenCalled();
  });

  it('空参数错误由共享服务作为工具执行错误返回', async () => {
    const host = mount();
    host.service.sendReport.mockRejectedValue(new Error('send_report needs text or files'));

    await expect(reportTool(host.base).execute({}, exec('session-1'))).rejects.toThrow(
      'send_report needs text or files',
    );
    expect(host.service.sendReport).toHaveBeenCalledWith({}, 'session-1');
  });

  it('标准 turn/end error 事件上报失败原因', () => {
    const host = mount();
    const error = { message: 'model failed', code: 'UNKNOWN' };

    host.base._emit(
      'session/event',
      { id: 'session-1' },
      { type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error } } },
    );

    expect(host.service.notifyFailure).toHaveBeenCalledWith('session-1', error);
  });

  it('兼容 event.data 直接携带 type/reason 的事件结构', () => {
    const host = mount();
    const error = { message: 'adapter failed' };

    host.base._emit(
      'session/event',
      { id: 'session-2' },
      { data: { type: 'turn/end', reason: { kind: 'error', error } } },
    );

    expect(host.service.notifyFailure).toHaveBeenCalledWith('session-2', error);
  });

  it('aborted、其他结束原因和其他事件不触发失败上报', () => {
    const host = mount();

    for (const event of [
      {
        type: 'turn/end',
        data: { reason: { kind: 'aborted', reason: { kind: 'user' } } },
      },
      { type: 'turn/end', data: { reason: { kind: 'completed' } } },
      { type: 'step/end', data: { reason: { kind: 'error', error: new Error('ignored') } } },
      { data: { type: 'turn/end', reason: { kind: 'aborted' } } },
    ]) {
      host.base._emit('session/event', { id: 'session-1' }, event);
    }

    expect(host.service.notifyFailure).not.toHaveBeenCalled();
  });

  it('提示词要求正文精简、send_report 交互、Markdown 交付与卡住上报', () => {
    expect(SA_WORKER_PROMPT).toMatch(/response body.*not visible/i);
    expect(SA_WORKER_PROMPT).toMatch(/keep.*body.*brief/i);
    expect(SA_WORKER_PROMPT).toMatch(/all user interaction.*send_report/is);
    expect(SA_WORKER_PROMPT).toMatch(/questions.*send_report/is);
    expect(SA_WORKER_PROMPT).toMatch(/Markdown.*files/is);
    expect(SA_WORKER_PROMPT).toMatch(/stuck|no meaningful progress/i);
  });
});

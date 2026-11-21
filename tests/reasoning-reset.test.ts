// 清理推理块行测试：失败分类、去块副本、投影、节点列举与 apply 接线。
import type { Message } from '@deepseek-ai/dsh-llm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  apply,
  classifyReasoningFailure,
  inject,
  type MessageProjection,
  name,
  type ProjectionContext,
  type ProjectionEvent,
  RESET_RECORD,
  type ReasoningSession,
  reasoningNodes,
  reasoningResetProjection,
  withoutReasoning,
} from '../src/reasoning-reset/index.ts';
import type { Context } from '../src/types.ts';

/** 可替换的宿主侧副作用：冻结消息与写插件记录。 */
const host = vi.hoisted(() => ({
  freezeMessage: vi.fn((message: unknown) => Object.freeze(message as object)),
  appendPluginRecord: vi.fn((_session: unknown, _type: string, _data: unknown) => 1),
}));

vi.mock('../src/reasoning-reset/host.ts', () => host);

/** 把测试里的普通对象当作宿主消息使用。 */
function asMessage(value: unknown): Message {
  return value as unknown as Message;
}

/** 一条带推理块、文本与工具调用的助手消息。 */
function assistantWithReasoning(text = 'answer') {
  return {
    id: 'msg-assistant',
    role: 'assistant',
    content: [
      { type: 'reasoning', text: 'thinking' },
      { type: 'text', text },
    ],
    source: {
      kind: 'model',
      provider: 'anthropic',
      model: 'claude',
      replayState: { signature: 'sig' },
    },
  };
}

/** 假会话：表面节点、单事件读取与派生消息。 */
function makeSession({
  nodes,
  events,
  derived = new Map(),
}: {
  nodes: number[];
  events: Map<number, ProjectionEvent>;
  derived?: Map<number, Message | null>;
}): ReasoningSession {
  return {
    surface: { nodes },
    eventAt: (seq) => events.get(seq),
    deriveEventMessage: (event) => derived.get(event.seq) ?? null,
  };
}

/** 假会话：节点 7 是一条带推理块的助手消息。 */
function sessionWithReasoning(): ReasoningSession {
  const message = assistantWithReasoning();
  return makeSession({
    nodes: [7],
    events: new Map([[7, { seq: 7, type: 'assistant/message', data: { message } }]]),
    derived: new Map([[7, asMessage(message)]]),
  });
}

/** 一次 emit 的结果与 `next` 调用记录。 */
interface EmitResult {
  result: unknown;
  next: ReturnType<typeof vi.fn>;
}

/** 假宿主上下文：记录投影注册、effect 清理、事件监听与日志。 */
interface FakeHost {
  ctx: Context;
  projections: MessageProjection[];
  registered: MessageProjection[];
  logs: Array<{ level: 'warn' | 'error'; message: string }>;
  emit(type: string, payload: unknown): Promise<EmitResult>;
  dispose(): void;
}

/** 构造一个假宿主上下文。 */
function makeHost(initial: MessageProjection[] = []): FakeHost {
  const projections = [...initial];
  const registered: MessageProjection[] = [];
  const logs: Array<{ level: 'warn' | 'error'; message: string }> = [];
  const effects: Array<() => void> = [];
  const listeners = new Map<string, ((...args: unknown[]) => unknown)[]>();
  const sessions = {
    get messageProjections() {
      return projections;
    },
    registerMessageProjection(projection: MessageProjection) {
      registered.push(projection);
      projections.push(projection);
      return async () => {
        const index = projections.indexOf(projection);
        if (index >= 0) projections.splice(index, 1);
      };
    },
  };
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: (message: string) => logs.push({ level: 'warn', message }),
    error: (message: string) => logs.push({ level: 'error', message }),
  };
  const ctx = {
    sessions,
    logger,
    effect(execute: () => () => void) {
      const release = execute();
      effects.push(release);
      return release;
    },
    on(type: string, listener: (...args: unknown[]) => unknown) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
      return () => true;
    },
  };
  return {
    ctx: ctx as unknown as Context,
    projections,
    registered,
    logs,
    async emit(type, payload) {
      const next = vi.fn(() => 'next');
      let result: unknown;
      for (const listener of listeners.get(type) ?? []) {
        result = await listener(payload, next);
      }
      return { result, next };
    },
    dispose() {
      for (const release of effects.splice(0)) release();
    },
  };
}

beforeEach(() => {
  host.freezeMessage.mockReset();
  host.freezeMessage.mockImplementation((message: unknown) => Object.freeze(message as object));
  host.appendPluginRecord.mockReset();
  host.appendPluginRecord.mockImplementation(() => 1);
});

describe('classifyReasoningFailure', () => {
  it('识别 Bedrock 的签名类 400', () => {
    expect(
      classifyReasoningFailure({
        status: 400,
        code: 'INVALID_REQUEST',
        message: 'Invalid `signature` in `thinking` block',
      }),
    ).toBe('thinking-signature');
  });

  it('识别 thinking 块绑定到其他会话的 400', () => {
    expect(
      classifyReasoningFailure({
        code: 'INVALID_REQUEST',
        message: 'thinking block bound to a different conversation',
      }),
    ).toBe('thinking-signature');
  });

  it('识别 OpenAI 的 invalid_encrypted_content 类 400', () => {
    expect(
      classifyReasoningFailure({
        code: 'invalid_encrypted_content',
        message: 'The encrypted content for item rs_1 could not be verified.',
      }),
    ).toBe('encrypted-content');
  });

  it('识别 encrypted content 的纯文案形式', () => {
    expect(
      classifyReasoningFailure({
        message: 'Encrypted content could not be decrypted or parsed.',
      }),
    ).toBe('encrypted-content');
  });

  it('普通 400 不匹配', () => {
    expect(
      classifyReasoningFailure({
        status: 400,
        code: 'INVALID_REQUEST',
        message: 'bad request',
      }),
    ).toBeUndefined();
  });

  it('空 message 与空 code 不匹配', () => {
    expect(classifyReasoningFailure({})).toBeUndefined();
    expect(classifyReasoningFailure({ message: '', code: '' })).toBeUndefined();
    expect(classifyReasoningFailure(undefined)).toBeUndefined();
  });
});

describe('withoutReasoning', () => {
  it('去掉推理块并保留 text 与 tool_call 块', () => {
    const stripped = withoutReasoning({
      id: 'msg-1',
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'thinking' },
        { type: 'text', text: 'answer' },
        { type: 'tool-call', id: 'call-1', name: 'read', arguments: '{}' },
      ],
      source: { kind: 'model', provider: 'openai', model: 'gpt' },
    });
    expect(stripped?.content).toEqual([
      { type: 'text', text: 'answer' },
      { type: 'tool-call', id: 'call-1', name: 'read', arguments: '{}' },
    ]);
    expect(stripped?.id).toBe('msg-1');
  });

  it('只有推理块时留一个空格文本块', () => {
    const stripped = withoutReasoning({ content: [{ type: 'reasoning', text: 'thinking' }] });
    expect(stripped?.content).toEqual([{ type: 'text', text: ' ' }]);
  });

  it('丢弃 source.replayState 并保留其余来源字段', () => {
    const stripped = withoutReasoning({
      content: [
        { type: 'reasoning', text: 'thinking' },
        { type: 'text', text: 'answer' },
      ],
      source: {
        kind: 'model',
        provider: 'anthropic',
        model: 'claude',
        replayState: { signature: 'sig' },
      },
    });
    expect(stripped?.source).toEqual({ kind: 'model', provider: 'anthropic', model: 'claude' });
  });

  it('无推理块时返回 undefined', () => {
    expect(withoutReasoning({ content: [{ type: 'text', text: 'answer' }] })).toBeUndefined();
    expect(withoutReasoning({})).toBeUndefined();
  });
});

describe('reasoningResetProjection.project', () => {
  /** 一条已提交的助手事件。 */
  function assistantEvent(seq: number, message: unknown): ProjectionEvent {
    return { seq, type: 'assistant/message', data: { message } };
  }

  /** 历史：从 baseSeq 起的一段事件窗口。 */
  function contextOf(events: ProjectionEvent[], baseSeq: number): ProjectionContext {
    return { events, baseSeq, messages: new Map() };
  }

  it('seqs 不是非空数组时抛错', () => {
    const context = contextOf([], 1);
    expect(() =>
      reasoningResetProjection.project({ seq: 9, type: RESET_RECORD, data: {} }, context),
    ).toThrow(/"seqs" must be a nonempty array/);
    expect(() =>
      reasoningResetProjection.project({ seq: 9, type: RESET_RECORD, data: { seqs: [] } }, context),
    ).toThrow(/"seqs" must be a nonempty array/);
    expect(() => reasoningResetProjection.project({ seq: 9, type: RESET_RECORD }, context)).toThrow(
      /"seqs" must be a nonempty array/,
    );
  });

  it('seq 指向非 assistant/message 事件时抛错', () => {
    const context = contextOf([{ seq: 3, type: 'user/message', data: {} }], 3);
    expect(() =>
      reasoningResetProjection.project(
        { seq: 4, type: RESET_RECORD, data: { seqs: [3] } },
        context,
      ),
    ).toThrow(/seq 3 is not a committed assistant\/message event/);
  });

  it('seq 超出窗口时抛错', () => {
    const context = contextOf([assistantEvent(3, assistantWithReasoning())], 3);
    expect(() =>
      reasoningResetProjection.project(
        { seq: 4, type: RESET_RECORD, data: { seqs: [5] } },
        context,
      ),
    ).toThrow(/seq 5 is not a committed assistant\/message event/);
  });

  it('正常返回按 seq 索引的 Map，值为冻结消息', () => {
    const context = contextOf([assistantEvent(3, assistantWithReasoning())], 3);
    const changed = reasoningResetProjection.project(
      { seq: 4, type: RESET_RECORD, data: { seqs: [3] } },
      context,
    );
    expect([...changed.keys()]).toEqual([3]);
    const value = changed.get(3);
    expect(value).toBeDefined();
    expect(Object.isFrozen(value)).toBe(true);
    expect(host.freezeMessage).toHaveBeenCalledTimes(1);
    expect(host.freezeMessage.mock.calls[0]?.[0]).toMatchObject({
      content: [{ type: 'text', text: 'answer' }],
      source: { kind: 'model', provider: 'anthropic', model: 'claude' },
    });
  });

  it('已投影消息没有推理块时跳过该节点', () => {
    const messages = new Map<number, Message>([
      [3, asMessage({ content: [{ type: 'text', text: 'clean' }] })],
    ]);
    const context: ProjectionContext = {
      events: [assistantEvent(3, assistantWithReasoning())],
      baseSeq: 3,
      messages,
    };
    const changed = reasoningResetProjection.project(
      { seq: 4, type: RESET_RECORD, data: { seqs: [3] } },
      context,
    );
    expect(changed.size).toBe(0);
    expect(host.freezeMessage).not.toHaveBeenCalled();
  });
});

describe('reasoningNodes', () => {
  it('只列出带推理块的助手消息', () => {
    const withReasoning = assistantWithReasoning();
    const withoutReasoningBlocks = { content: [{ type: 'text', text: 'done' }] };
    const events = new Map<number, ProjectionEvent>([
      [1, { seq: 1, type: 'assistant/message', data: { message: withReasoning } }],
      [2, { seq: 2, type: 'assistant/message', data: { message: withoutReasoningBlocks } }],
      [3, { seq: 3, type: 'user/message', data: { message: { content: [] } } }],
      [4, { seq: 4, type: 'assistant/message', data: { message: assistantWithReasoning('four') } }],
    ]);
    const derived = new Map<number, Message | null>([
      [1, asMessage(withReasoning)],
      [2, asMessage(withoutReasoningBlocks)],
      [4, null],
    ]);
    const session = makeSession({ nodes: [1, 2, 3, 4], events, derived });
    // 节点 4 的派生消息为空时退回事件自带的消息。
    expect(reasoningNodes(session)).toEqual([1, 4]);
  });

  it('没有带推理块的助手消息时返回空数组', () => {
    const session = makeSession({
      nodes: [1],
      events: new Map([[1, { seq: 1, type: 'user/message', data: {} }]]),
    });
    expect(reasoningNodes(session)).toEqual([]);
  });
});

describe('apply', () => {
  it('导出 name 与 inject', () => {
    expect(name).toBe('reasoning-reset');
    expect(inject).toEqual(['sessions']);
  });

  it('注册投影并在 effect 释放时注销', () => {
    const fake = makeHost();
    apply(fake.ctx);
    expect(fake.registered.map((item) => item.type)).toEqual([RESET_RECORD]);
    expect(fake.projections.map((item) => item.type)).toEqual([RESET_RECORD]);
    fake.dispose();
    expect(fake.projections).toEqual([]);
  });

  it('已有同类型投影时不再注册', () => {
    const existing: MessageProjection = { type: RESET_RECORD, project: () => new Map() };
    const fake = makeHost([existing]);
    apply(fake.ctx);
    expect(fake.registered).toEqual([]);
    expect(fake.projections).toEqual([existing]);
  });

  it('第一次失败写入记录并返回重试', async () => {
    const fake = makeHost();
    apply(fake.ctx);
    const session = sessionWithReasoning();
    const emitted = await fake.emit('agent/request-error', {
      agent: { session },
      turn: 2,
      step: 3,
      failure: { code: 'INVALID_REQUEST', message: 'Invalid `signature` in `thinking` block' },
      signal: { aborted: false },
    });
    expect(emitted.result).toEqual({ kind: 'retry' });
    expect(host.appendPluginRecord).toHaveBeenCalledTimes(1);
    const [target, type, data] = host.appendPluginRecord.mock.calls[0] ?? [];
    expect(target).toBe(session);
    expect(type).toBe(RESET_RECORD);
    expect(data).toEqual({ seqs: [7], reason: 'thinking-signature', code: 'INVALID_REQUEST' });
    expect(fake.logs.filter((entry) => entry.level === 'warn')).toHaveLength(1);
  });

  it('同一 step 第二次失败不再重试', async () => {
    const fake = makeHost();
    apply(fake.ctx);
    const payload = {
      agent: { session: sessionWithReasoning() },
      turn: 2,
      step: 3,
      failure: { code: 'invalid_encrypted_content', message: 'could not be decrypted' },
    };
    await fake.emit('agent/request-error', payload);
    host.appendPluginRecord.mockClear();
    const second = await fake.emit('agent/request-error', payload);
    expect(second.result).toBe('next');
    expect(second.next).toHaveBeenCalledTimes(1);
    expect(host.appendPluginRecord).not.toHaveBeenCalled();
  });

  it('非目标错误直接 next', async () => {
    const fake = makeHost();
    apply(fake.ctx);
    const emitted = await fake.emit('agent/request-error', {
      agent: { session: sessionWithReasoning() },
      turn: 1,
      step: 1,
      failure: { code: 'INVALID_REQUEST', message: 'bad request' },
    });
    expect(emitted.result).toBe('next');
    expect(emitted.next).toHaveBeenCalledTimes(1);
    expect(host.appendPluginRecord).not.toHaveBeenCalled();
  });

  it('没有带推理块的助手消息时直接 next', async () => {
    const fake = makeHost();
    apply(fake.ctx);
    const emitted = await fake.emit('agent/request-error', {
      agent: {
        session: makeSession({
          nodes: [1],
          events: new Map([[1, { seq: 1, type: 'assistant/message', data: { message: {} } }]]),
        }),
      },
      turn: 1,
      step: 1,
      failure: { code: 'INVALID_REQUEST', message: 'Invalid `signature` in `thinking` block' },
    });
    expect(emitted.result).toBe('next');
    expect(host.appendPluginRecord).not.toHaveBeenCalled();
  });

  it('agent 回到 idle 后清空记账，可再次重试', async () => {
    const fake = makeHost();
    apply(fake.ctx);
    const agent = { session: sessionWithReasoning() };
    const payload = {
      agent,
      turn: 5,
      step: 6,
      failure: { code: 'INVALID_REQUEST', message: 'Invalid `signature` in `thinking` block' },
    };
    const first = await fake.emit('agent/request-error', payload);
    expect(first.result).toEqual({ kind: 'retry' });
    await fake.emit('agent/status', { agent, status: 'idle' });
    const second = await fake.emit('agent/request-error', payload);
    expect(second.result).toEqual({ kind: 'retry' });
    expect(host.appendPluginRecord).toHaveBeenCalledTimes(2);
  });
});

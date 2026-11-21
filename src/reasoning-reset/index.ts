/**
 * 清理推理块行：识别因历史推理状态被拒的两类 400，写入插件记录并返回重试。
 * 记录由消息投影解释，只改模型可见历史，日志与用户看到的对话保持原样。
 */
import type { Message } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';

import type { Context } from '../types.ts';
import { isRecord } from '../utils.ts';
import { appendPluginRecord, freezeMessage } from './host.ts';

/** 记录去推理块消息的插件记录名。 */
export const RESET_RECORD = 'plugin:dsh-plugin-practical-tool-bundle/reasoning-reset';

/** 每步最多去一次推理块。 */
const MAX_STRIPS_PER_STEP = 1;

/** 本行可恢复的失败分类，同时是记录里写下的 reason。 */
export type ReasoningFailureReason = 'encrypted-content' | 'thinking-signature';

/** 重置记录的载荷。 */
export interface ReasoningResetData {
  readonly seqs: readonly number[];
  readonly reason: ReasoningFailureReason;
  readonly code?: string | undefined;
}

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:dsh-plugin-practical-tool-bundle/reasoning-reset': ReasoningResetData;
  }
}

/**
 * 两类可恢复失败与各自的匹配式；两者都表示历史重放了当前请求无法证明的
 * 提供方绑定推理状态，只有去掉该状态才能恢复。
 */
const RECOVERABLE_FAILURES: readonly {
  readonly reason: ReasoningFailureReason;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    reason: 'encrypted-content',
    patterns: [
      // OpenAI Responses 无法解密不透明 blob 时给出的平台错误码。
      /invalid_encrypted_content/i,
      // 同一失败的文字形式。
      /encrypted[\s_]+content[\s\S]{0,160}?(?:could not|cannot|can't|unable|failed|invalid)/i,
    ],
  },
  {
    reason: 'thinking-signature',
    patterns: [
      /invalid\s+`?signature`?\s+in\s+`?thinking`?\s+block/i,
      /bound to a different conversation/i,
      /thinking\.block_binding/i,
      // 400 同时提到两个词，顺序不限，都属于这一分类。
      /thinking[\s\S]*signature|signature[\s\S]*thinking/i,
    ],
  },
];

/** 去掉推理块后的消息副本：content 之外的字段原样保留。 */
export interface ReasoningFreeMessage extends Record<string, unknown> {
  readonly content: readonly unknown[];
}

/** 判断内容块是否是推理块。 */
function isReasoningBlock(block: unknown): boolean {
  return isRecord(block) && block.type === 'reasoning';
}

/** 去掉消息来源里的 replayState，其余来源字段保留。 */
function withoutReplayState(source: unknown): unknown {
  if (!isRecord(source) || source.replayState === undefined) return source;
  const { replayState: _discarded, ...rest } = source;
  return rest;
}

/**
 * 复制一条助手消息，去掉其中的推理块。
 * @param message - 会话表面上的当前助手消息。
 * @returns 去掉推理块的副本；消息没有推理块时返回 undefined。
 */
export function withoutReasoning(message: unknown): ReasoningFreeMessage | undefined {
  const record: Record<string, unknown> = isRecord(message) ? message : {};
  const content = Array.isArray(record.content) ? record.content : [];
  const kept = content.filter((block) => !isReasoningBlock(block));
  if (kept.length === content.length) return undefined;
  const { source, ...rest } = record;
  // 只有推理块的消息留一个空格：Anthropic 拒绝空文本块，投影又无法删除节点本身。
  const next: Record<string, unknown> = {
    ...rest,
    content: kept.length === 0 ? [{ type: 'text', text: ' ' }] : kept,
  };
  if (source !== undefined) next.source = withoutReplayState(source);
  return next as ReasoningFreeMessage;
}

/**
 * 判断失败是否属于本行能修复的推理状态拒绝。
 * @param failure - 宿主给出的失败事实，只读 message 与 code。
 * @returns 匹配的失败分类；无关失败返回 undefined。
 */
export function classifyReasoningFailure(failure: unknown): ReasoningFailureReason | undefined {
  const message = isRecord(failure) && typeof failure.message === 'string' ? failure.message : '';
  const code = isRecord(failure) && typeof failure.code === 'string' ? failure.code : '';
  if (message.length === 0 && code.length === 0) return undefined;
  // code 也参与匹配：适配器保留提供方错误码时，平台文案可能不出现在 message 里。
  const detail = `${code}\n${message}`;
  for (const { reason, patterns } of RECOVERABLE_FAILURES) {
    if (patterns.some((pattern) => pattern.test(detail))) return reason;
  }
  return undefined;
}

/** 投影读取的事件：只关心 seq、type 与本行写入的 data。 */
export interface ProjectionEvent {
  readonly seq: number;
  readonly type: string;
  readonly data?: unknown;
}

/** 投影读取的历史：事件窗口、窗口基准 seq 与已投影消息。 */
export interface ProjectionContext {
  readonly events: readonly ProjectionEvent[];
  readonly baseSeq: number;
  readonly messages: ReadonlyMap<number, Message>;
}

/** 插件记录投影；宿主只为已声明的事件类型提供类型，本行用最小形状描述。 */
export interface MessageProjection {
  readonly type: string;
  project(event: ProjectionEvent, context: ProjectionContext): ReadonlyMap<number, Message>;
}

/** 事件自带的当前消息。 */
function messageOf(event: ProjectionEvent): unknown {
  return isRecord(event.data) ? event.data.message : undefined;
}

/** {@link RESET_RECORD} 的纯解释器：去掉指定节点上的推理块。 */
export const reasoningResetProjection: MessageProjection = {
  type: RESET_RECORD,
  project(event, context) {
    const data = isRecord(event.data) ? event.data : {};
    const seqs = data.seqs;
    if (!Array.isArray(seqs) || seqs.length === 0) {
      throw new Error(`${RESET_RECORD}: "seqs" must be a nonempty array`);
    }
    const changed = new Map<number, Message>();
    for (const seq of seqs as number[]) {
      const target = context.events[seq - context.baseSeq];
      if (target === undefined || target.seq !== seq || target.type !== 'assistant/message') {
        throw new Error(`${RESET_RECORD}: seq ${seq} is not a committed assistant/message event`);
      }
      const current = context.messages.get(seq) ?? messageOf(target);
      const stripped = withoutReasoning(current);
      if (stripped === undefined) continue;
      // 副本逐字段来自原消息，只删了推理块与 replayState，身份与角色保持不变。
      changed.set(seq, freezeMessage(stripped as unknown as Message));
    }
    return changed;
  },
};

/** 会话表面：本行只读节点列表与单事件派生。 */
export interface ReasoningSession {
  readonly surface: { readonly nodes: readonly number[] };
  eventAt(seq: number): ProjectionEvent | undefined;
  deriveEventMessage(event: ProjectionEvent): Message | null;
}

/**
 * 列出表面上仍带推理块的助手消息。
 * @param session - 请求失败的会话。
 * @returns 需要重写的助手消息 seq，升序。
 */
export function reasoningNodes(session: ReasoningSession): number[] {
  const seqs: number[] = [];
  for (const seq of session.surface.nodes) {
    const event = session.eventAt(seq);
    if (event?.type !== 'assistant/message') continue;
    const current = session.deriveEventMessage(event) ?? messageOf(event);
    if (withoutReasoning(current) !== undefined) seqs.push(seq);
  }
  return seqs;
}

export const name = 'reasoning-reset';

export const inject = ['sessions'];

/** 宿主 sessions 服务里本行用到的部分。 */
interface SessionsService {
  readonly messageProjections: readonly { readonly type: string }[];
  registerMessageProjection(projection: MessageProjection): () => Promise<void>;
}

/** `agent/request-error` 恢复点的载荷，只取本行用到的字段。 */
interface RequestErrorPayload {
  readonly agent: { readonly session: Session };
  readonly turn: number;
  readonly step: number;
  readonly failure: { readonly message?: string | undefined; readonly code?: string | undefined };
  readonly signal?: { readonly aborted?: boolean | undefined } | undefined;
}

/** `agent/status` 的载荷。 */
interface AgentStatusPayload {
  readonly agent: object;
  readonly status: string;
}

/** 宿主 Events 未声明这两个事件，用本地最小签名订阅。 */
interface AgentEvents {
  (
    name: 'agent/request-error',
    listener: (payload: RequestErrorPayload, next: () => unknown) => unknown,
  ): unknown;
  (name: 'agent/status', listener: (payload: AgentStatusPayload) => void): unknown;
}

/** 每个 agent 每步的去块记账。 */
interface AttemptEntry {
  turn: number;
  step: number;
  strips: number;
}

/**
 * 每个失败步骤去掉一次历史推理块，然后重试该步。
 * @param ctx - 本行所在的 Cordis 上下文。
 */
export function apply(ctx: Context): void {
  /** 取本行用到的 sessions 服务。 */
  const sessions = (): SessionsService => ctx.sessions as unknown as SessionsService;
  /** 当前是否已登记本行的投影。 */
  const registered = (): boolean =>
    sessions().messageProjections.some((item) => item.type === RESET_RECORD);

  /**
   * 安装解释器；已有解释器时跳过。
   *
   * 热重载时新实例先挂载、旧实例后卸载，因此已存在的投影可能归旧实例所有：
   * 本实例不接管它的释放，等到重试时再检查。
   */
  const installProjection = (): boolean => {
    if (registered()) return true;
    try {
      const disposeProjection = sessions().registerMessageProjection(reasoningResetProjection);
      let released = false;
      ctx.effect(
        () => () => {
          if (released) return;
          released = true;
          void disposeProjection();
        },
        'dsh-plugin-practical-tool-bundle: reasoning reset projection',
      );
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      ctx.logger?.error(
        `reasoning-reset: could not register its message projection, the row stays inert: ${reason}`,
      );
      return registered();
    }
  };
  if (!installProjection()) return;

  /** 每个 agent 每步的去块记账。 */
  const attempts = new WeakMap<object, AttemptEntry>();

  const on = ctx.on as unknown as AgentEvents;

  on('agent/request-error', async ({ agent, turn, step, failure, signal }, next) => {
    if (signal?.aborted === true) return next();
    const reason = classifyReasoningFailure(failure);
    if (reason === undefined) return next();
    const entry = attempts.get(agent) ?? { turn, step, strips: 0 };
    if (entry.turn !== turn || entry.step !== step) {
      entry.turn = turn;
      entry.step = step;
      entry.strips = 0;
    }
    if (entry.strips >= MAX_STRIPS_PER_STEP) return next();
    try {
      // 记录缺少解释器会让用过它的会话拒绝后续派生，所以写入前重新安装，
      // 不依赖本行早期实例登记过的那一个。
      if (!installProjection()) return next();
      const seqs = reasoningNodes(agent.session);
      if (seqs.length === 0) return next();
      appendPluginRecord(agent.session, RESET_RECORD, { seqs, reason, code: failure.code });
      entry.strips += 1;
      attempts.set(agent, entry);
      ctx.logger?.warn(
        `reasoning-reset: dropped reasoning blocks from ${seqs.length} earlier assistant message(s) after "${failure.code}" (${reason}); retrying turn ${turn} step ${step}`,
      );
      return { kind: 'retry' };
    } catch (error) {
      // 提供方自己的 400 必须保持为循环报告的失败：恢复过程出错时不能再顶替成一个无关错误。
      // 常见原因是 appendPluginRecord 收到的 Session 来自另一份 dsh-session，被其品牌检查拒绝。
      const detail = error instanceof Error ? error.message : String(error);
      ctx.logger?.error(
        `reasoning-reset: could not record its reset, leaving the provider failure to the loop: ${detail}`,
      );
      return next();
    }
  });

  on('agent/status', ({ agent, status }) => {
    if (status === 'idle') attempts.delete(agent);
  });
}

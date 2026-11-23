/** 调度会话的用户状态判定：按消息来源判断用户在电脑前还是远程。 */
import type { UserMessage } from '@deepseek-ai/dsh-llm';

/** 用户状态：local 表示在电脑前，remote 表示经飞书远程对话。 */
export type UserPresence = 'local' | 'remote';

/** 状态判定结果与需要插入的提醒文本。 */
export interface PresenceReminder {
  presence: UserPresence;
  text: string;
}

/** 本机消息提醒：正文回复与转达，直到状态回到远程。 */
const LOCAL_REMINDER = `<system-reminder>
User presence: the user is at the computer and is talking to you directly in the Web GUI. Reply in your response body and relay worker reports there. Do not call lark_notify until the presence changes back to remote.
</system-reminder>`;

/** 远程消息提醒：经 lark_notify 回复与转达，直到状态回到本机。 */
const REMOTE_REMINDER = `<system-reminder>
User presence: the user is remote and is talking to you through Lark. Reply and relay worker reports with lark_notify until the presence changes to local.
</system-reminder>`;

/** 读取一条消息判定的目标状态；不可判定的消息返回 undefined。 */
function presenceOf(message: UserMessage): UserPresence | undefined {
  const source = message.source as { kind?: string; reminder?: boolean } | undefined;
  if (source?.kind === 'user') return 'local';
  if (source?.kind === 'lark-bridge' && source.reminder !== true) return 'remote';
  return undefined;
}

/**
 * 计算本批消息是否引起状态切换。
 * 同批多条可判定消息以最后一条为准；状态未变或无可判定消息时返回 undefined。
 */
export function presenceReminder(
  messages: readonly UserMessage[],
  previous: UserPresence | undefined,
): PresenceReminder | undefined {
  let target: UserPresence | undefined;
  for (const message of messages) {
    const presence = presenceOf(message);
    if (presence !== undefined) target = presence;
  }
  if (target === undefined || target === previous) return undefined;
  return { presence: target, text: target === 'local' ? LOCAL_REMINDER : REMOTE_REMINDER };
}

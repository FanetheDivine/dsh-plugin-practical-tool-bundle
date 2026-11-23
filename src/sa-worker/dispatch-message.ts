/** 把调度会话经 meta-tools 投递的消息包装为带来源标记的块。 */
import type { ContentBlock, UserMessage } from '@deepseek-ai/dsh-llm';

import { freezeMessage } from './host.ts';

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsh-plugin-meta-tools': {
      kind: 'dsh-plugin-meta-tools';
    };
  }
}

/** meta-tools 投递消息的来源标识。 */
const DISPATCH_SOURCE = 'dsh-plugin-meta-tools';

/** 调度消息块的开标签与闭标签。 */
const OPEN_TAG = '<dispatch_session_message>';
const CLOSE_TAG = '</dispatch_session_message>';

/** 首个文本块已带开标签时视为已包装。 */
function isWrapped(message: UserMessage): boolean {
  const first = message.content[0];
  return first?.type === 'text' && first.text.startsWith(OPEN_TAG);
}

/** 文本块中的闭标签加反斜杠，保持外层块结构完整。 */
function wrapContent(content: readonly ContentBlock[]): ContentBlock[] {
  const escaped = content.map((block) =>
    block.type === 'text'
      ? { ...block, text: block.text.replaceAll(CLOSE_TAG, '<\\/dispatch_session_message>') }
      : block,
  );
  return [
    { type: 'text', text: `${OPEN_TAG}\n` },
    ...escaped,
    { type: 'text', text: `\n${CLOSE_TAG}` },
  ];
}

/**
 * 包装 meta-tools 来源的消息，其他消息原样保留。
 * 保留原消息 id 与 source；无需包装时返回入参数组本身。
 */
export function wrapDispatchMessages(messages: readonly UserMessage[]): UserMessage[] {
  let changed = false;
  const wrapped = messages.map((message) => {
    if (message.source.kind !== DISPATCH_SOURCE || isWrapped(message)) return message;
    changed = true;
    return freezeMessage({ ...message, content: wrapContent(message.content) });
  });
  return changed ? wrapped : (messages as UserMessage[]);
}

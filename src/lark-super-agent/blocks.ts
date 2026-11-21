/** 上报消息块的输入。 */
export interface WorkSessionMessageInput {
  sessionId: string;
  reportId: string;
  taskId?: string | null;
  text?: string;
  files?: readonly string[];
}

/** 失败通知块的输入。 */
export interface WorkSessionFailureInput {
  sessionId: string;
  taskId?: string | null;
  error: unknown;
}

/** XML 属性值使用实体转义。 */
export function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** 内容中的闭合标签加反斜杠，保持外层块结构完整。 */
function escapeClosingTags(text: string, names: readonly string[]): string {
  let escaped = text;
  for (const name of names) escaped = escaped.replaceAll(`</${name}>`, `<\\/${name}>`);
  return escaped;
}

/** 生成 send_report 注入调度会话的消息块。 */
export function workSessionMessage(input: WorkSessionMessageInput): string {
  const taskId = input.taskId ?? '';
  const text = escapeClosingTags(input.text ?? '', ['text', 'files', 'work_session_message']);
  const files = escapeClosingTags((input.files ?? []).join('\n'), [
    'text',
    'files',
    'work_session_message',
  ]);
  return [
    `<work_session_message sessionid="${escapeXmlAttribute(input.sessionId)}" reportid="${escapeXmlAttribute(input.reportId)}" taskid="${escapeXmlAttribute(taskId)}">`,
    '<text>',
    text,
    '</text>',
    '<files>',
    files,
    '</files>',
    '</work_session_message>',
  ].join('\n');
}

/** 生成任务会话失败通知；失败原因最多保留 2000 个 UTF-16 字符。 */
export function workSessionFailure(input: WorkSessionFailureInput): string {
  const reason = input.error instanceof Error ? input.error.message : String(input.error);
  const error = escapeClosingTags(reason.slice(0, 2000), ['error', 'work_session_failure']);
  return [
    `<work_session_failure sessionid="${escapeXmlAttribute(input.sessionId)}" taskid="${escapeXmlAttribute(input.taskId ?? '')}">`,
    '<error>',
    error,
    '</error>',
    '</work_session_failure>',
  ].join('\n');
}

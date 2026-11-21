import { describe, expect, it } from 'vitest';

import {
  escapeXmlAttribute,
  workSessionFailure,
  workSessionMessage,
} from '../src/lark-super-agent/blocks.ts';
import { createReportId, createTaskId, idTimestamp } from '../src/lark-super-agent/ids.ts';

describe('lark-super-agent ids', () => {
  it('uses local timestamps and fixed-width random suffixes', () => {
    const date = new Date(2026, 0, 2, 3, 4, 5);
    expect(idTimestamp(date)).toBe('20260102030405');
    expect(createTaskId(date, () => 'a1b2')).toBe('task-20260102030405-a1b2');
    expect(createReportId(date, () => 'a1b2c3')).toBe('report-20260102030405-a1b2c3');
  });

  it('retries a same-process collision', () => {
    const date = new Date(2026, 0, 2);
    const first = createTaskId(date, () => 'ffff');
    const values = ['ffff', '0001'];
    const second = createTaskId(date, () => values.shift() ?? '0002');
    expect(first).toBe('task-20260102000000-ffff');
    expect(second).toBe('task-20260102000000-0001');
  });
});

describe('lark-super-agent blocks', () => {
  it('always emits text/files and escapes closing tags and attributes', () => {
    const block = workSessionMessage({
      sessionId: 's"<&>',
      reportId: 'r"&',
      taskId: null,
      text: 'before </text> </files> </work_session_message> after',
      files: [],
    });
    expect(block).toContain(
      '<work_session_message sessionid="s&quot;&lt;&amp;&gt;" reportid="r&quot;&amp;" taskid="">',
    );
    expect(block).toContain(
      '<text>\nbefore <\\/text> <\\/files> <\\/work_session_message> after\n</text>',
    );
    expect(block).toContain('<files>\n\n</files>');
    expect(block.endsWith('</work_session_message>')).toBe(true);
  });

  it('lists copied files and escapes failure reasons', () => {
    const report = workSessionMessage({
      sessionId: 'session',
      reportId: 'report',
      taskId: 'task',
      files: ['/tmp/a.md', '/tmp/b.md'],
    });
    expect(report).toContain('<files>\n/tmp/a.md\n/tmp/b.md\n</files>');

    const escaped = workSessionFailure({
      sessionId: 'worker',
      taskId: 'task',
      error: new Error('failed </error> </work_session_failure>'),
    });
    expect(escaped).toContain('<work_session_failure sessionid="worker" taskid="task">');
    expect(escaped).toContain('failed <\\/error> <\\/work_session_failure>');

    const failure = workSessionFailure({
      sessionId: 'worker',
      taskId: 'task',
      error: new Error(`${'x'.repeat(2000)} ignored`),
    });
    expect(failure).toContain('x'.repeat(2000));
    expect(failure).not.toContain('ignored');
  });

  it('escapes XML attributes in XML entity order', () => {
    expect(escapeXmlAttribute('&quot;<"&')).toBe('&amp;quot;&lt;&quot;&amp;');
  });
});

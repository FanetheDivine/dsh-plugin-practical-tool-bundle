import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runGit } from '../src/lark-super-agent/git.ts';
import { NotesStore, readTaskState } from '../src/lark-super-agent/notes.ts';
import { ReportStore, validateReportInput } from '../src/lark-super-agent/reports.ts';

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'lark-super-agent-reports-'));
  directories.push(directory);
  return directory;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function taskWithSession(root: string, title: string, sessionId: string): Promise<string> {
  const store = new NotesStore(root);
  if ((await store.listWorkspaces()).length === 0) {
    await store.setWorkspaceNote({
      workspaceId: 'workspace-a',
      path: '/project',
      summary: 'Project A',
      keywords: ['a'],
    });
  }
  const { taskId } = await store.createTask({
    title,
    workspaceId: 'workspace-a',
    message: { text: title },
  });
  await store.updateTask({ taskId, addSessionIds: [sessionId] });
  return taskId;
}

beforeAll(async () => {
  await runGit(['--version']);
  process.env.GIT_CONFIG_COUNT = '2';
  process.env.GIT_CONFIG_KEY_0 = 'user.name';
  process.env.GIT_CONFIG_VALUE_0 = 'Lark Super Agent Test';
  process.env.GIT_CONFIG_KEY_1 = 'user.email';
  process.env.GIT_CONFIG_VALUE_1 = 'lark-super-agent@example.invalid';
});

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('lark-super-agent reports', { timeout: 30000 }, () => {
  it('copies Markdown attachments and records verbatim text plus frontmatter', async () => {
    const root = await temporaryDirectory();
    const caller = await temporaryDirectory();
    const attachment = join(caller, 'answer.md');
    await writeFile(attachment, '# Copied\n', 'utf8');
    const taskId = await taskWithSession(root, 'Task', 'worker');
    const reportId = 'report-20260102030405-aabbcc';
    const result = await new ReportStore(root, {
      reportId: () => reportId,
    }).archiveReport({ text: '  exact text\nsecond line  ', files: [attachment] }, 'worker');

    expect(result).toMatchObject({ reportId, taskId });
    expect(result.warning).toBeUndefined();
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toContain(`${reportId}-1-answer.md`);
    expect(await readFile(result.files[0] ?? '', 'utf8')).toBe('# Copied\n');
    const markdown = await readFile(result.reportPath, 'utf8');
    expect(markdown).toContain(`reportId: "${reportId}"`);
    expect(markdown).toContain('sessionId: "worker"');
    expect(markdown).toContain(`taskId: "${taskId}"`);
    expect(markdown).toContain('time: "');
    expect(markdown).toContain(`files:\n  - "${reportId}-1-answer.md"`);
    expect(markdown.endsWith('\n  exact text\nsecond line  \n')).toBe(true);
    expect((await readTaskState(root)).tasks[0]?.reportIds).toEqual([reportId]);
    expect((await runGit(['status', '--porcelain'], root)).stdout.trim()).toBe('');
  });

  it('assigns a caller shared by tasks to the most recently updated task', async () => {
    const root = await temporaryDirectory();
    await taskWithSession(root, 'Older', 'worker');
    const latest = await taskWithSession(root, 'Latest', 'worker');
    const ids = ['report-20260102030405-000001', 'report-20260102030405-000002'];
    const reports = new ReportStore(root, {
      reportId: () => ids.shift() ?? 'report-20260102030405-000003',
    });

    const first = await reports.archiveReport({ text: 'one' }, 'worker');
    const second = await reports.archiveReport({ text: 'two' }, 'worker');
    expect(first.taskId).toBe(latest);
    expect(second.taskId).toBe(latest);
    expect(second.reportId).not.toBe(first.reportId);
    const task = (await readTaskState(root)).tasks.find((item) => item.id === latest);
    expect(task?.reportIds).toEqual([first.reportId, second.reportId]);
  });

  it('stores reports without a matching active task under _unassigned', async () => {
    const root = await temporaryDirectory();
    const result = await new ReportStore(root).archiveReport({ text: 'standalone' }, 'unknown');
    expect(result.taskId).toBeNull();
    expect(result.reportPath).toBe(join(root, 'reports', '_unassigned', `${result.reportId}.md`));
    expect(await readFile(result.reportPath, 'utf8')).toContain('taskId: null');
  });

  it('rejects empty or invalid reports before creating any storage', async () => {
    const root = await temporaryDirectory();
    const caller = await temporaryDirectory();
    const text = join(caller, 'not-markdown.txt');
    await writeFile(text, 'text', 'utf8');
    await expect(validateReportInput({})).rejects.toThrow('send_report needs text or files');
    await expect(validateReportInput({ text: '   ', files: [] })).rejects.toThrow(
      'send_report needs text or files',
    );
    await expect(
      new ReportStore(root, { cwd: caller }).archiveReport(
        { files: ['not-markdown.txt', 'missing.md'] },
        'worker',
      ),
    ).rejects.toThrow(/not-markdown\.txt, missing\.md/);
    expect(await exists(join(root, 'reports'))).toBe(false);
    expect(await exists(join(root, '.git'))).toBe(false);
  });
});

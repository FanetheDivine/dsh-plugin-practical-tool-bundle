import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runGit } from '../src/lark-super-agent/git.ts';
import { NotesStore, readTaskState, readWorkspaceState } from '../src/lark-super-agent/notes.ts';
import { ReportStore } from '../src/lark-super-agent/reports.ts';

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'lark-super-agent-notes-'));
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

describe('lark-super-agent notes', { timeout: 30000 }, () => {
  it('creates a task, appends multiple messages, and de-duplicates sessions', async () => {
    const root = await temporaryDirectory();
    const store = new NotesStore(root);
    await store.setWorkspaceNote({
      workspaceId: 'workspace-a',
      path: 'D:\\project',
      summary: 'Project A',
      keywords: ['a', 'project', 'a'],
      notes: 'release notes',
    });
    const { taskId } = await store.createTask({
      title: '  Investigate A  ',
      workspaceId: 'workspace-a',
      message: { text: '查一下 A', messageId: 'message-1' },
    });
    await store.updateTask({
      taskId,
      status: 'waiting_user',
      addSessionIds: ['session-1', 'session-1', 'session-2'],
      addMessage: { text: '之前那个 A 要注意 B' },
    });
    await store.updateTask({ taskId, status: 'in_progress' });
    await expect(store.updateTask({ taskId, status: 'completed' })).resolves.toMatchObject({
      archived: true,
    });
    await expect(store.updateTask({ taskId, status: 'failed' })).rejects.toThrow(/not found/);

    const tasks = await readTaskState(root);
    expect(tasks.tasks).toEqual([]);
    const [archived] = await store.listArchivedTasks();
    expect(archived).toBeDefined();
    expect(archived?.title).toBe('Investigate A');
    expect(archived?.messages.map((message) => message.text)).toEqual([
      '查一下 A',
      '之前那个 A 要注意 B',
    ]);
    expect(archived?.sessionIds).toEqual(['session-1', 'session-2']);
    expect(archived?.archivedAt).toEqual(expect.any(String));

    const workspaces = await readWorkspaceState(root);
    expect(workspaces.workspaces[0]).toMatchObject({
      workspaceId: 'workspace-a',
      path: 'D:/project',
      keywords: ['a', 'project'],
      notes: 'release notes',
    });
  });

  it('rejects invalid status transitions and unregistered workspace notes', async () => {
    const root = await temporaryDirectory();
    const store = new NotesStore(root);
    await store.setWorkspaceNote({
      workspaceId: 'workspace-a',
      path: '/project',
      summary: 'Project A',
      keywords: ['a'],
    });
    const { taskId } = await store.createTask({
      title: 'Task',
      workspaceId: 'workspace-a',
      message: { text: 'start' },
    });
    await store.updateTask({ taskId, status: 'waiting_user' });
    await expect(store.updateTask({ taskId, status: 'failed' })).rejects.toThrow(/transition/);
    await store.createTask({
      title: 'Other',
      workspaceId: 'workspace-a',
      message: { text: 'other' },
    });
    await expect(
      store.createTask({
        title: 'Unknown',
        workspaceId: 'unknown',
        message: { text: 'unknown' },
      }),
    ).rejects.toThrow(/not registered/);
  });

  it('archives reports with the completed task and preserves report/session snapshots', async () => {
    const root = await temporaryDirectory();
    const attachments = await temporaryDirectory();
    const attachment = join(attachments, 'result.md');
    await writeFile(attachment, '# Result\n', 'utf8');
    const store = new NotesStore(root);
    await store.setWorkspaceNote({
      workspaceId: 'workspace-a',
      path: '/project',
      summary: 'Project A',
      keywords: ['a'],
    });
    const { taskId } = await store.createTask({
      title: 'Task',
      workspaceId: 'workspace-a',
      message: { text: 'start' },
    });
    await store.updateTask({ taskId, addSessionIds: ['worker'] });
    const report = await new ReportStore(root).archiveReport(
      { text: 'done', files: [attachment] },
      'worker',
    );
    expect(report.taskId).toBe(taskId);

    await store.updateTask({ taskId, status: 'completed' });
    expect((await readTaskState(root)).tasks).toEqual([]);
    expect(await exists(join(root, 'reports', taskId))).toBe(false);
    expect(await exists(join(root, 'archive', taskId, 'reports', `${report.reportId}.md`))).toBe(
      true,
    );
    const snapshot = JSON.parse(
      await readFile(join(root, 'archive', taskId, 'task.json'), 'utf8'),
    ) as { reportIds: string[]; sessionIds: string[]; messages: unknown[]; archivedAt: string };
    expect(snapshot.reportIds).toEqual([report.reportId]);
    expect(snapshot.sessionIds).toEqual(['worker']);
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.archivedAt).toEqual(expect.any(String));
    expect((await runGit(['status', '--porcelain'], root)).stdout.trim()).toBe('');
    expect((await runGit(['log', '-1', '--pretty=%s'], root)).stdout.trim()).toBe(
      `lark-super-agent: archive ${taskId}`,
    );
  });

  it('never overwrites malformed JSON and leaves the previous commit unchanged', async () => {
    const root = await temporaryDirectory();
    const store = new NotesStore(root);
    await store.setWorkspaceNote({
      workspaceId: 'workspace-a',
      path: '/project',
      summary: 'Project A',
      keywords: ['a'],
    });
    const path = join(root, 'message-task-status.json');
    await writeFile(path, '{ definitely broken\n', 'utf8');
    const head = await runGit(['rev-parse', 'HEAD'], root);

    await expect(
      store.createTask({
        title: 'Task',
        workspaceId: 'workspace-a',
        message: { text: 'start' },
      }),
    ).rejects.toThrow(/invalid JSON/);
    expect(await readFile(path, 'utf8')).toBe('{ definitely broken\n');
    expect((await runGit(['rev-parse', 'HEAD'], root)).stdout).toBe(head.stdout);
  });

  it('replaces and removes workspace notes with one commit per actual change', async () => {
    const root = await temporaryDirectory();
    const store = new NotesStore(root);
    expect(
      await store.setWorkspaceNote({
        workspaceId: 'workspace-a',
        path: '/old',
        summary: 'Old',
        keywords: ['old'],
      }),
    ).toEqual({ workspaceId: 'workspace-a', created: true });
    expect(
      await store.setWorkspaceNote({
        workspaceId: 'workspace-a',
        path: '/new',
        summary: 'New',
        keywords: ['new'],
      }),
    ).toEqual({ workspaceId: 'workspace-a', created: false });
    expect(await store.removeWorkspaceNote('missing')).toEqual({
      workspaceId: 'missing',
      removed: false,
    });
    expect(await store.removeWorkspaceNote('workspace-a')).toEqual({
      workspaceId: 'workspace-a',
      removed: true,
    });
    expect((await readWorkspaceState(root)).workspaces).toEqual([]);
    expect((await runGit(['rev-list', '--count', 'HEAD'], root)).stdout.trim()).toBe('3');
  });

  it('keeps report files when the late report commit is blocked', async () => {
    const root = await temporaryDirectory();
    const store = new NotesStore(root);
    await store.setWorkspaceNote({
      workspaceId: 'workspace-a',
      path: '/project',
      summary: 'Project A',
      keywords: ['a'],
    });
    const hook = join(root, '.git', 'hooks', 'pre-commit');
    await writeFile(hook, '#!/bin/sh\necho no-report-commit >&2\nexit 1\n', 'utf8');
    await chmod(hook, 0o755);
    const report = await new ReportStore(root).archiveReport({ text: 'retained' }, 'worker');
    expect(report.warning).toMatch(/no-report-commit/);
    expect(await exists(report.reportPath)).toBe(true);
  });
});

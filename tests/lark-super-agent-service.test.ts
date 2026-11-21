import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Task } from '../src/lark-super-agent/api.ts';
import { readBridgeState } from '../src/lark-super-agent/bridge.ts';
import { runGit } from '../src/lark-super-agent/git.ts';
import { readTaskState, readWorkspaceState } from '../src/lark-super-agent/notes.ts';
import {
  type AgentLike,
  type ContextLike,
  SuperAgentService,
} from '../src/lark-super-agent/service.ts';

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'lark-super-agent-service-'));
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

async function bridgeHome(workspaceRoot: string | null, sessionId: string | null = 'dispatch') {
  const home = await temporaryDirectory();
  await mkdir(join(home, 'lark-bridge'), { recursive: true });
  await writeFile(
    join(home, 'lark-bridge', 'state.json'),
    JSON.stringify({ workspaceRoot, sessionId }),
    'utf8',
  );
  return home;
}

function makeContext(services: Record<string, unknown>, warnings: unknown[][] = []): ContextLike {
  return {
    get: ((name: string) => services[name]) as ContextLike['get'],
    logger: { warn: (...args: unknown[]) => warnings.push(args) },
  };
}

function messageText(message: unknown): string {
  const content = (message as { content: { type: string; text: string }[] }).content;
  return content[0]?.text ?? '';
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

describe('lark-super-agent service', { timeout: 30000 }, () => {
  it('reads bridge state from an explicit DSH home and tolerates invalid state', async () => {
    const home = await bridgeHome('/dispatch', 'session');
    await expect(readBridgeState(home)).resolves.toEqual({
      workspaceRoot: '/dispatch',
      sessionId: 'session',
    });
    await writeFile(join(home, 'lark-bridge', 'state.json'), '{broken', 'utf8');
    await expect(readBridgeState(home)).resolves.toEqual({ workspaceRoot: null, sessionId: null });
  });

  it('validates registered workspaces and stores the registry path', async () => {
    const root = await temporaryDirectory();
    const home = await bridgeHome(root);
    const ctx = makeContext({
      workspaceRegistry: { list: () => [{ id: 'workspace-a', path: 'D:\\project' }] },
    });
    const service = new SuperAgentService(ctx, { home });
    await expect(
      service.setWorkspaceNote({ workspaceId: 'missing', summary: 'Missing', keywords: ['x'] }),
    ).rejects.toThrow(/not registered in DSH/);
    await service.setWorkspaceNote({
      workspaceId: 'workspace-a',
      summary: 'Project A',
      keywords: ['a'],
    });
    expect((await readWorkspaceState(root)).workspaces[0]?.path).toBe('D:/project');
  });

  it('archives before steering a structured report to the dispatch agent', async () => {
    const root = await temporaryDirectory();
    const callerDirectory = await temporaryDirectory();
    await writeFile(join(callerDirectory, 'answer.md'), '# Answer\n', 'utf8');
    const home = await bridgeHome(root);
    const steer = vi.fn();
    const dispatch: AgentLike = { steer };
    const caller: AgentLike = { session: { id: 'worker', cwd: callerDirectory } };
    const agents = new Map([
      ['worker', caller],
      ['dispatch', dispatch],
    ]);
    const ctx = makeContext({
      agents: { get: (id: string) => agents.get(id) },
      sessionController: { resolveAgent: async () => ({ agent: dispatch }) },
      workspaceRegistry: { list: () => [{ id: 'workspace-a', path: '/project' }] },
    });
    const service = new SuperAgentService(ctx, {
      home,
      reportId: () => 'report-20260102030405-abc123',
    });
    await service.setWorkspaceNote({
      workspaceId: 'workspace-a',
      summary: 'Project A',
      keywords: ['a'],
    });
    const { taskId } = await service.createTask({
      title: 'Task',
      workspaceId: 'workspace-a',
      message: { text: 'start' },
    });
    await service.updateTask({ taskId, addSessionIds: ['worker'] });

    const result = await service.sendReport(
      { text: 'question </text>', files: ['answer.md'] },
      'worker',
    );
    expect(result).toEqual({
      reportId: 'report-20260102030405-abc123',
      taskId,
      delivered: true,
    });
    expect(steer).toHaveBeenCalledOnce();
    const message = steer.mock.calls[0]?.[0] as { source: unknown; role: string };
    expect(message.role).toBe('user');
    expect(message.source).toEqual({ kind: 'lark-super-agent' });
    const block = messageText(message);
    expect(block).toContain(`taskid="${taskId}"`);
    expect(block).toContain('question <\\/text>');
    expect(block).toContain(`report-20260102030405-abc123-1-answer.md`);
    const reportPath = join(root, 'reports', taskId, 'report-20260102030405-abc123.md');
    expect(await exists(reportPath)).toBe(true);
    expect((await readTaskState(root)).tasks[0]?.reportIds).toEqual([result.reportId]);
  });

  it('fails empty reports and unavailable dispatch before writing report files', async () => {
    const root = await temporaryDirectory();
    const home = await bridgeHome(root);
    const service = new SuperAgentService(
      makeContext({
        sessionController: { resolveAgent: async () => ({ error: new Error('offline') }) },
      }),
      { home },
    );
    await expect(service.sendReport({}, 'worker')).rejects.toThrow(
      'send_report needs text or files',
    );
    await expect(service.sendReport({ text: 'hello' }, 'worker')).rejects.toThrow('offline');
    expect(await exists(join(root, 'reports'))).toBe(false);
  });

  it('delivers failure blocks and logs when notification is unavailable', async () => {
    const root = await temporaryDirectory();
    const home = await bridgeHome(root);
    const steer = vi.fn();
    const warnings: unknown[][] = [];
    const service = new SuperAgentService(
      makeContext(
        { sessionController: { resolveAgent: async () => ({ agent: { steer } }) } },
        warnings,
      ),
      { home },
    );
    await service.notifyFailure('worker', { message: 'provider failed' });
    expect(messageText(steer.mock.calls[0]?.[0])).toContain('<error>\nprovider failed\n</error>');

    const unavailable = new SuperAgentService(makeContext({}, warnings), { home });
    await expect(unavailable.notifyFailure('worker', new Error('failed'))).resolves.toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0]?.[0])).toContain('sessionController');
  });
});

function makeTask(
  id: string,
  sessionId: string,
  updatedAt: string,
  status: Task['status'] = 'in_progress',
): Task {
  return {
    id,
    title: id,
    status,
    workspaceId: 'workspace-a',
    sessionIds: [sessionId],
    reportIds: [],
    messages: [{ text: 'message', time: updatedAt }],
    createdAt: updatedAt,
    updatedAt,
  };
}

async function writeCandidateNotes(
  root: string,
  active: Task[],
  archived: Array<Task & { archivedAt: string }>,
): Promise<void> {
  await writeFile(
    join(root, 'message-task-status.json'),
    JSON.stringify({ version: 1, tasks: active }),
    'utf8',
  );
  for (const task of archived) {
    await mkdir(join(root, 'archive', task.id), { recursive: true });
    await writeFile(join(root, 'archive', task.id, 'task.json'), JSON.stringify(task), 'utf8');
  }
}

describe('lark-super-agent candidates', () => {
  it('prioritizes the requested task, then idle sessions and recent activity', async () => {
    const root = await temporaryDirectory();
    const home = await bridgeHome(root, null);
    const active = [
      makeTask('task-20260101000000-0001', 'preferred', '2026-01-01T00:00:00Z'),
      makeTask('task-20260101000000-0002', 'idle-old', '2026-01-01T00:00:00Z'),
      makeTask('task-20260101000000-0003', 'idle-new', '2026-01-03T00:00:00Z'),
      makeTask('task-20260101000000-0004', 'running', '2026-01-06T00:00:00Z'),
      makeTask('task-20260101000000-0005', 'archived-session', '2026-01-07T00:00:00Z'),
      makeTask('task-20260101000000-0006', 'missing', '2026-01-08T00:00:00Z'),
    ];
    const archived = [
      {
        ...makeTask('task-20260101000000-0007', 'archived', '2026-01-01T00:00:00Z', 'completed'),
        archivedAt: '2026-01-04T00:00:00Z',
      },
    ];
    await writeCandidateNotes(root, active, archived);
    const agents = new Map<string, AgentLike>([
      ['preferred', { running: true }],
      ['idle-old', { session: { title: 'Live old' } }],
      ['idle-new', { running: false }],
      ['running', { session: { running: true } }],
      ['archived', { running: false }],
    ]);
    const ids = ['preferred', 'idle-old', 'idle-new', 'running', 'archived-session', 'archived'];
    const ctx = makeContext({
      agents: { get: (id: string) => agents.get(id) },
      workspaceRegistry: { archivedSessionIds: ['archived-session'] },
      sessionQuery: {
        listSessions: async () => ids.map((id) => ({ header: { id }, persisted: true })),
        readTitleSnapshots: async (requested: readonly string[]) =>
          requested.map((sessionId) => ({
            sessionId,
            status: 'fulfilled',
            value: sessionId === 'idle-new' ? { title: { title: 'Stored new title' } } : undefined,
          })),
      },
    });
    const service = new SuperAgentService(ctx, { home });
    const { candidates } = await service.listCandidates('workspace-a', 'task-20260101000000-0001');
    expect(candidates.map((candidate) => candidate.sessionId)).toEqual([
      'preferred',
      'archived',
      'idle-new',
      'idle-old',
      'running',
    ]);
    expect(candidates.find((candidate) => candidate.sessionId === 'idle-new')?.title).toBe(
      'Stored new title',
    );
    expect(candidates.find((candidate) => candidate.sessionId === 'idle-old')?.title).toBe(
      'Live old',
    );
    expect(candidates.find((candidate) => candidate.sessionId === 'archived')?.taskIds).toEqual([
      'task-20260101000000-0007',
    ]);
    expect(await runGit(['status', '--porcelain'], root).catch(() => null)).toBeNull();
  });

  it('returns at most five candidates', async () => {
    const root = await temporaryDirectory();
    const home = await bridgeHome(root, null);
    const active = Array.from({ length: 7 }, (_, index) =>
      makeTask(
        `task-20260101000000-000${index}`,
        `session-${index}`,
        `2026-01-0${index + 1}T00:00:00Z`,
      ),
    );
    await writeCandidateNotes(root, active, []);
    const service = new SuperAgentService(makeContext({}), { home });
    const { candidates } = await service.listCandidates('workspace-a');
    expect(candidates).toHaveLength(5);
    expect(candidates.map((candidate) => candidate.sessionId)).toEqual([
      'session-6',
      'session-5',
      'session-4',
      'session-3',
      'session-2',
    ]);
  });
});

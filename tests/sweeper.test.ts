// 清理会话宿主逻辑测试：两阶段归档与删除、keepIds、非法 id、registry 缺失与延后删除。
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSweepHandler } from '../src/sweeper/index.ts';
import type { Context } from '../src/types.ts';

/** 可编程的 Workspace registry 假实现。 */
class FakeRegistry {
  readonly archived = new Set<string>();
  readonly active = new Set<string>();
  /** 归档成功后调用，用来模拟前端收到通知后释放会话。 */
  onArchive?: (id: string) => void;

  async archiveSession(id: string): Promise<void> {
    if (this.active.has(id)) {
      const error = new Error('running');
      error.name = 'WorkspaceActiveSessionError';
      throw error;
    }
    this.archived.add(id);
    this.onArchive?.(id);
  }

  get archivedSessionIds(): Iterable<string> {
    return this.archived;
  }
}

/** 构造只实现 get 的宿主上下文。 */
function hostCtx(options: {
  registry?: FakeRegistry;
  sessions?: { get?(id: string): unknown };
}): Context {
  return {
    get(name: string) {
      if (name === 'workspaceRegistry') return options.registry;
      if (name === 'sessions') return options.sessions;
      return undefined;
    },
  } as unknown as Context;
}

/** 一次清理请求的回答。 */
interface SweepAnswer {
  status: number;
  body: Record<string, unknown>;
}

/** 发送一次清理请求。 */
async function sweep(
  handler: (request: Request) => Promise<Response>,
  body: unknown,
): Promise<SweepAnswer> {
  const response = await handler(
    new Request('http://localhost/api/dsh-practical-tools/sweep', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** 建立一个会话日志目录，返回目录路径。 */
async function makeLog(sessionsRoot: string, bucket: string, id: string): Promise<string> {
  const dir = join(sessionsRoot, bucket, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'log.jsonl'), '{}\n');
  return dir;
}

/** 目录是否存在。 */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('清理会话路由', () => {
  let sessionsRoot: string;

  beforeEach(async () => {
    sessionsRoot = await mkdtemp(join(tmpdir(), 'dsh-sweeper-'));
  });

  afterEach(async () => {
    await rm(sessionsRoot, { recursive: true, force: true });
  });

  it('归档未置顶会话后删除它的日志目录', async () => {
    const registry = new FakeRegistry();
    const target = await makeLog(sessionsRoot, 'cwd-a', 'session-1');
    const other = await makeLog(sessionsRoot, 'cwd-a', 'session-2');
    const handler = createSweepHandler(hostCtx({ registry }), sessionsRoot);

    const { status, body } = await sweep(handler, { ids: ['session-1'] });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      archived: 1,
      deleted: 1,
      skipped: 0,
      deferred: 0,
      failed: 0,
    });
    expect(body.archivedIds).toEqual(['session-1']);
    expect(body.deletedIds).toEqual(['session-1']);
    expect(registry.archived.has('session-1')).toBe(true);
    expect(await exists(target)).toBe(false);
    expect(await exists(other)).toBe(true);
  });

  it('keepIds 中的会话跳过归档，日志目录保留', async () => {
    const registry = new FakeRegistry();
    const kept = await makeLog(sessionsRoot, 'cwd-a', 'session-1');
    const handler = createSweepHandler(hostCtx({ registry }), sessionsRoot);

    const { status, body } = await sweep(handler, {
      ids: ['session-1'],
      keepIds: ['session-1'],
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ archived: 0, deleted: 0, skipped: 1, failed: 0 });
    expect(body.skippedIds).toEqual(['session-1']);
    expect(registry.archived.size).toBe(0);
    expect(await exists(kept)).toBe(true);
  });

  it('非法 id 计入 failed，非字符串按字符串记录', async () => {
    const registry = new FakeRegistry();
    const handler = createSweepHandler(hostCtx({ registry }), sessionsRoot);

    const { body } = await sweep(handler, {
      ids: ['../escape', 'bad id', '', 42],
    });

    expect(body).toMatchObject({ archived: 0, deleted: 0, failed: 4 });
    expect(body.failedIds).toEqual(['../escape', 'bad id', '', '42']);
    expect(body.archivedIds).toEqual([]);
  });

  it('registry 未就绪时返回 503', async () => {
    const handler = createSweepHandler(hostCtx({}), sessionsRoot);

    const { status, body } = await sweep(handler, { ids: ['session-1'] });

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('registry');
  });

  it('Session store 仍持有已归档会话时计入 deferred，日志保留', async () => {
    const registry = new FakeRegistry();
    registry.archived.add('session-1');
    const log = await makeLog(sessionsRoot, 'cwd-a', 'session-1');
    const handler = createSweepHandler(
      hostCtx({
        registry,
        sessions: { get: (id) => (id === 'session-1' ? {} : undefined) },
      }),
      sessionsRoot,
    );

    const { body } = await sweep(handler, { ids: [] });

    expect(body).toMatchObject({ archived: 0, deleted: 0, skipped: 0, deferred: 1, failed: 0 });
    expect(await exists(log)).toBe(true);
  });

  it('空 ids 返回全零计数与空数组', async () => {
    const registry = new FakeRegistry();
    const handler = createSweepHandler(hostCtx({ registry }), sessionsRoot);

    const { status, body } = await sweep(handler, { ids: [] });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      archived: 0,
      deleted: 0,
      skipped: 0,
      deferred: 0,
      failed: 0,
      reasons: {},
    });
    expect(body.archivedIds).toEqual([]);
    expect(body.deletedIds).toEqual([]);
    expect(body.skippedIds).toEqual([]);
    expect(body.failedIds).toEqual([]);
  });

  it('归档后会话从内存消失时，同一次请求仍计入延后并保留日志', async () => {
    // 归档通知前端释放会话，删除阶段再查内存已经查不到；请求发起时的状态必须生效。
    const registry = new FakeRegistry();
    const live = new Set(['session-1']);
    const log = await makeLog(sessionsRoot, 'cwd-a', 'session-1');
    registry.onArchive = (id) => live.delete(id);
    const handler = createSweepHandler(
      hostCtx({ registry, sessions: { get: (id: string) => (live.has(id) ? { id } : undefined) } }),
      sessionsRoot,
    );

    const { body } = await sweep(handler, { ids: ['session-1'] });

    expect(body).toMatchObject({ archived: 1, deleted: 0, deferred: 1, failed: 0 });
    expect(await exists(log)).toBe(true);
  });

  it('ids 为空也会删除之前已归档会话的日志', async () => {
    const registry = new FakeRegistry();
    registry.archived.add('session-1');
    const log = await makeLog(sessionsRoot, 'cwd-a', 'session-1');
    const handler = createSweepHandler(hostCtx({ registry }), sessionsRoot);

    const { body } = await sweep(handler, { ids: [] });

    expect(body).toMatchObject({ archived: 0, deleted: 1, deferred: 0, failed: 0 });
    expect(body.deletedIds).toEqual(['session-1']);
    expect(await exists(log)).toBe(false);
  });

  it('活跃会话由 registry 拒绝时计入 skipped', async () => {
    const registry = new FakeRegistry();
    registry.active.add('session-1');
    const handler = createSweepHandler(hostCtx({ registry }), sessionsRoot);

    const { body } = await sweep(handler, { ids: ['session-1'] });

    expect(body).toMatchObject({ archived: 0, deleted: 0, skipped: 1, failed: 0 });
    expect(body.skippedIds).toEqual(['session-1']);
    const reasons = body.reasons as Record<string, string>;
    expect(reasons['session-1']).toMatch(/^active: /);
  });
});

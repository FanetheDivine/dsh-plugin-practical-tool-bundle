/**
 * 清理会话行：先归档请求中的未置顶会话，再删除全部已归档会话的日志目录。
 * 导出 name、apply 与 createSweepHandler；后者接受日志根目录以便测试。
 */
import type { Dirent } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';

import { SWEEP_PATH } from '../rows.ts';
import type { Context } from '../types.ts';
import { isRecord, jsonResponse } from '../utils.ts';

/** 插件名，也是 profile 中该行的 id。 */
export const name = 'session-sweeper';

/** 会话 id 必须能安全用作目录名。 */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** 一次请求最多接受的 id 数。 */
const MAX_IDS = 5000;

/** Workspace registry 的最小结构：归档一个会话并列出全部已归档 id。 */
interface WorkspaceRegistryLike {
  archiveSession(id: string): Promise<unknown>;
  readonly archivedSessionIds: Iterable<string>;
}

/** Session store 的最小结构：只判断它是否仍持有某个会话。 */
interface SessionStoreLike {
  get?(id: string): unknown;
}

/** 路由注册所需的 connection 服务最小结构。 */
interface SweepConnection {
  fetch: {
    register(options: {
      path: string;
      methods: readonly string[];
      requestBody: 'buffered';
      fetch(request: Request): Promise<Response>;
    }): () => void;
  };
}

/** 带 connection 服务的宿主上下文。 */
type ConnectionContext = Context & { connection: SweepConnection };

/** 读取 Workspace registry；服务缺失时返回 undefined。 */
function registryOf(ctx: Context): WorkspaceRegistryLike | undefined {
  return ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined;
}

/** 判断 Session store 是否仍持有某个会话。 */
function isLive(ctx: Context, id: string): boolean {
  const sessions = ctx.get('sessions') as SessionStoreLike | undefined;
  return sessions?.get?.(id) !== undefined;
}

/** 读取错误对象上的一个字段。 */
function errorField(error: unknown, key: string): unknown {
  return isRecord(error) ? error[key] : undefined;
}

/**
 * 按会话 id 索引磁盘上的全部日志目录。
 * @param sessionsRoot - 日志根目录，生产环境为 `<DSH home>/sessions`。
 * @returns 会话 id 到持有该日志的目录列表。
 */
async function sessionLogIndex(sessionsRoot: string): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>();
  let roots: string[];
  try {
    const entries = await readdir(sessionsRoot, { withFileTypes: true });
    roots = entries
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => join(sessionsRoot, entry.name));
  } catch {
    return index;
  }
  for (const root of roots) {
    let entries: Dirent[];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const path = join(root, entry.name);
      const paths = index.get(entry.name);
      if (paths === undefined) index.set(entry.name, [path]);
      else paths.push(path);
    }
  }
  return index;
}

/**
 * 删除一个会话的全部日志目录。
 * @param index - {@link sessionLogIndex} 建立的索引。
 * @param id - 已校验的会话 id。
 * @returns 实际删除的目录数。
 */
async function removeSessionDirs(index: Map<string, string[]>, id: string): Promise<number> {
  const paths = index.get(id) ?? [];
  for (const path of paths) await rm(path, { recursive: true, force: true });
  return paths.length;
}

/**
 * 创建一个处理清理请求的函数。
 * @param ctx - 宿主上下文，按需读取 Workspace registry 与 Session store。
 * @param sessionsRoot - 日志根目录，默认 `<DSH home>/sessions`；测试传入临时目录。
 * @returns 处理 buffered POST 请求的函数。
 */
export function createSweepHandler(
  ctx: Context,
  sessionsRoot: string = dshHomePath('sessions'),
): (request: Request) => Promise<Response> {
  return async (request) => {
    const payload: unknown = await request.json().catch(() => null);
    const body = isRecord(payload) ? payload : null;
    const rawIds = body?.ids;
    if (!Array.isArray(rawIds)) {
      return jsonResponse({ ok: false, error: 'body must be {"ids": ["<session id>", ...]}' }, 400);
    }
    const registry = registryOf(ctx);
    if (registry === undefined) {
      return jsonResponse(
        { ok: false, error: 'the Workspace registry is not up; nothing was swept' },
        503,
      );
    }

    const ids = rawIds as unknown[];
    const rawKeep = body?.keepIds;
    const keep = new Set<string>(
      Array.isArray(rawKeep)
        ? (rawKeep as unknown[]).filter((id): id is string => typeof id === 'string')
        : [],
    );
    const reasons: Record<string, string> = {};
    const skipped = new Set<string>();
    const deferred = new Set<string>();
    const failed = new Set<string>();
    const requested: string[] = [];
    for (const raw of ids.slice(0, MAX_IDS)) {
      const id = typeof raw === 'string' ? raw : '';
      if (!SESSION_ID.test(id) || id.includes('..')) {
        failed.add(typeof raw === 'string' ? raw : String(raw));
      } else {
        requested.push(id);
      }
    }

    // 归档会通知前端释放会话；删除阶段再查内存可能已经查不到，先按请求发起时的状态建档。
    const liveAtStart = new Set<string>();
    for (const id of new Set(requested)) {
      if (isLive(ctx, id)) liveAtStart.add(id);
    }

    const archived: string[] = [];
    for (const id of new Set(requested)) {
      // 页面仍在显示的会话先跳过；其余空闲会话交给 registry 判断是否活跃。
      if (keep.has(id)) {
        skipped.add(id);
        reasons[id] = 'kept: shown in the main view';
        continue;
      }
      try {
        await registry.archiveSession(id);
        archived.push(id);
      } catch (error) {
        const errorName = errorField(error, 'name');
        const errorCode = errorField(error, 'code');
        if (
          errorName === 'WorkspaceActiveSessionError' ||
          errorCode === 'workspace/session-active'
        ) {
          skipped.add(id);
          const activity =
            errorField(error, 'activity') ?? errorField(error, 'message') ?? 'running';
          reasons[id] = `active: ${JSON.stringify(activity)}`;
          continue;
        }
        if (errorName === 'WorkspaceUnknownSessionError') continue;
        failed.add(id);
        reasons[id] = `failed: ${String(errorName)}: ${String(errorField(error, 'message'))}`;
      }
    }

    const deleted: string[] = [];
    const index = await sessionLogIndex(sessionsRoot);
    for (const rawId of registry.archivedSessionIds) {
      const id = String(rawId);
      if (!SESSION_ID.test(id) || id.includes('..')) continue;
      if (keep.has(id)) {
        skipped.add(id);
        continue;
      }
      // Session store 仍持有这个空闲会话，或清理开始时就持有它：日志留到宿主释放后再删。
      if (isLive(ctx, id) || liveAtStart.has(id)) {
        deferred.add(id);
        continue;
      }
      try {
        if ((await removeSessionDirs(index, id)) > 0) deleted.push(id);
      } catch {
        failed.add(id);
      }
    }

    return jsonResponse({
      ok: true,
      archived: archived.length,
      deleted: deleted.length,
      skipped: skipped.size,
      deferred: deferred.size,
      failed: failed.size,
      reasons,
      archivedIds: archived,
      deletedIds: deleted,
      skippedIds: [...skipped],
      failedIds: [...failed],
    });
  };
}

/** 用默认日志根目录处理清理请求。 */
function sweep(ctx: Context, request: Request): Promise<Response> {
  return createSweepHandler(ctx)(request);
}

/**
 * 插件启用时注册清理路由。
 * 路由每次请求时读取 registry 与日志目录，行开关无需重启。
 */
export function apply(ctx: Context): void {
  ctx.inject(['connection'], (webCtx) => {
    const connectionCtx = webCtx as ConnectionContext;
    webCtx.effect(
      () =>
        connectionCtx.connection.fetch.register({
          path: SWEEP_PATH,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: (request) => sweep(webCtx, request),
        }),
      'dsh-plugin-practical-tool-bundle: sweep route',
    );
  });
}

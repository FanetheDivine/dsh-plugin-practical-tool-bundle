/**
 * 调度行状态路由：汇总 lark-bridge 行、桥接会话预设与调度工作区的 git 状态。
 */

import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import type { Context } from '../types.ts';
import { readBridgeState } from './bridge.ts';

const execFileAsync = promisify(execFile);

/** 一条 loader 条目的最小结构。 */
interface LoaderEntry {
  readonly id: string;
  readonly disabled: boolean;
  readonly fiber?: { state?: number };
}

/** 状态路由的响应结构。 */
export interface SuperAgentStatus {
  ok: true;
  bridge: {
    row: 'active' | 'disabled' | 'missing' | 'unknown';
    sessionId: string | null;
    workspaceRoot: string | null;
    preset: string | null;
    presetMatches: boolean | null;
  };
  git: { available: boolean; repo: boolean };
  issues: string[];
}

/** 查找宿主中的 lark-bridge 行并判断运行状态。 */
function bridgeRow(ctx: Context): SuperAgentStatus['bridge']['row'] {
  const loader = ctx.get('loader') as { entries?(): Iterable<LoaderEntry> } | undefined;
  if (typeof loader?.entries !== 'function') return 'unknown';
  for (const entry of loader.entries()) {
    if (entry.id !== 'dsh-plugin-lark-bridge' && !entry.id.endsWith(':dsh-plugin-lark-bridge')) {
      continue;
    }
    if (entry.disabled) return 'disabled';
    return entry.fiber?.state === 2 ? 'active' : 'disabled';
  }
  return 'missing';
}

/** 读取 git 可用性；仓库根必须正好是调度工作区。 */
async function gitStatus(root: string | null): Promise<{ available: boolean; repo: boolean }> {
  try {
    await execFileAsync('git', ['--version'], { timeout: 5000, windowsHide: true });
  } catch {
    return { available: false, repo: false };
  }
  if (root === null || root === '') return { available: true, repo: false };
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
      timeout: 5000,
      windowsHide: true,
    });
    return { available: true, repo: resolve(stdout.trim()) === resolve(root) };
  } catch {
    return { available: true, repo: false };
  }
}

/** 读取桥接会话当前预设；会话未加载时不推断。 */
function bridgePreset(ctx: Context, sessionId: string | null): string | null {
  if (sessionId === null) return null;
  const presets = ctx.get('agentPresets') as
    | { presetForSession?(session: { id: string }): string | null }
    | undefined;
  if (typeof presets?.presetForSession !== 'function') return null;
  const agents = ctx.get('agents') as
    | { get?(id: string): { session?: { id: string } } | undefined }
    | undefined;
  const session = agents?.get?.(sessionId)?.session;
  if (session === undefined) return null;
  try {
    return presets.presetForSession(session);
  } catch {
    return null;
  }
}

/** 生成调度行状态与面向用户的问题列表。 */
export async function readSuperAgentStatus(ctx: Context): Promise<SuperAgentStatus> {
  const row = bridgeRow(ctx);
  const bridge = await readBridgeState();
  const preset = bridgePreset(ctx, bridge.sessionId);
  const git = await gitStatus(bridge.workspaceRoot);
  const issues: string[] = [];
  if (row === 'missing') issues.push('未安装 dsh-plugin-lark-bridge，无法接收或回复飞书消息。');
  if (row === 'disabled') issues.push('dsh-plugin-lark-bridge 已停用，无法接收或回复飞书消息。');
  if (row === 'unknown')
    issues.push('宿主 loader 不可用，暂时无法判断 dsh-plugin-lark-bridge 状态。');
  if (bridge.workspaceRoot === null || bridge.workspaceRoot === '') {
    issues.push('尚未配置桥接工作区，调度笔记不可用。');
  }
  if (bridge.sessionId !== null && preset !== null && preset !== 'sa-dispatch') {
    issues.push(`桥接会话当前预设为 ${preset}，请改为 SA-调度会话（sa-dispatch）。`);
  }
  if (!git.available) issues.push('本机 git 不可用，笔记无法提交。');
  return {
    ok: true,
    bridge: {
      row,
      sessionId: bridge.sessionId,
      workspaceRoot: bridge.workspaceRoot,
      preset,
      presetMatches: preset === null ? null : preset === 'sa-dispatch',
    },
    git,
    issues,
  };
}

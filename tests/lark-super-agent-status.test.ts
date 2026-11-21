// 调度状态测试：lark-bridge 行、桥接预设与工作区配置的诊断。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { readSuperAgentStatus } from '../src/lark-super-agent/status.ts';
import type { Context } from '../src/types.ts';

const homes: string[] = [];
const oldHome = process.env['DSH_HOME'];

afterEach(() => {
  if (oldHome === undefined) delete process.env['DSH_HOME'];
  else process.env['DSH_HOME'] = oldHome;
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

/** 准备带桥接状态的隔离 DSH_HOME。 */
function makeHome(state: { sessionId?: string | null; workspaceRoot?: string | null }): string {
  const home = mkdtempSync(path.join(tmpdir(), 'dsh-sa-status-'));
  homes.push(home);
  mkdirSync(path.join(home, 'lark-bridge'), { recursive: true });
  writeFileSync(
    path.join(home, 'lark-bridge', 'state.json'),
    JSON.stringify({
      sessionId: state.sessionId ?? null,
      workspaceRoot: state.workspaceRoot ?? null,
      title: null,
      seen: {},
      updatedAt: new Date().toISOString(),
    }),
  );
  process.env['DSH_HOME'] = home;
  return home;
}

/** 构造只含 loader 与预设注册表的上下文。 */
function makeCtx(options: { bridgeRow?: boolean; preset?: string } = {}): Context {
  const entries =
    options.bridgeRow === false
      ? []
      : [{ id: 'include:dsh-plugin-lark-bridge', disabled: false, fiber: { state: 2 } }];
  return {
    get(name: string) {
      if (name === 'loader') return { entries: () => entries };
      if (name === 'agentPresets') {
        return { presetForSession: () => options.preset ?? 'sa-dispatch' };
      }
      if (name === 'agents') return { get: () => ({ session: { id: 'session-1' } }) };
      return undefined;
    },
  } as unknown as Context;
}

describe('lark-super-agent 状态', () => {
  it('桥接行与预设就绪时不报告问题', async () => {
    makeHome({ sessionId: 'session-1', workspaceRoot: null });
    const status = await readSuperAgentStatus(makeCtx());
    expect(status.bridge.row).toBe('active');
    expect(status.bridge.sessionId).toBe('session-1');
    expect(status.bridge.presetMatches).toBe(true);
    expect(status.issues).toEqual(['尚未配置桥接工作区，调度笔记不可用。']);
  });

  it('缺少 lark-bridge 时给出安装提示', async () => {
    makeHome({});
    const status = await readSuperAgentStatus(makeCtx({ bridgeRow: false }));
    expect(status.bridge.row).toBe('missing');
    expect(status.issues.join('\n')).toContain('未安装 dsh-plugin-lark-bridge');
  });

  it('桥接会话选了其他预设时要求改用调度预设', async () => {
    makeHome({ sessionId: 'session-1' });
    const status = await readSuperAgentStatus(makeCtx({ preset: 'standard' }));
    expect(status.bridge.presetMatches).toBe(false);
    expect(status.issues.join('\n')).toContain('SA-调度会话');
  });
});

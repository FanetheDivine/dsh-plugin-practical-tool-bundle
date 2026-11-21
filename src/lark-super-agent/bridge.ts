import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { BridgeState } from './api.ts';

/** 返回 lark-bridge 状态文件的绝对路径。 */
export function bridgeStatePath(home: string = process.env.DSH_HOME ?? join(homedir(), '.dsh')) {
  return join(home, 'lark-bridge', 'state.json');
}

/** 读取桥接状态；文件缺失、损坏或字段不合格时返回空状态。 */
export async function readBridgeState(home?: string): Promise<BridgeState> {
  try {
    const value: unknown = JSON.parse(await readFile(bridgeStatePath(home), 'utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { sessionId: null, workspaceRoot: null };
    }
    const record = value as Record<string, unknown>;
    return {
      sessionId:
        typeof record.sessionId === 'string' && record.sessionId.trim() !== ''
          ? record.sessionId
          : null,
      workspaceRoot:
        typeof record.workspaceRoot === 'string' && record.workspaceRoot.trim() !== ''
          ? record.workspaceRoot
          : null,
    };
  } catch {
    return { sessionId: null, workspaceRoot: null };
  }
}

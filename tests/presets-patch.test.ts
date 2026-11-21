// 预设补丁结构测试：新增行、调度工具清单、任务预设与标准快照的差异。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Entry = {
  id: string;
  name: string;
  config?: unknown;
  [key: string]: unknown;
};

type PresetConfig = {
  id: string;
  name: string;
  description: string;
  plugins: Entry[];
  [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('期望对象');
  }
  return value as Record<string, unknown>;
}

function readYaml(file: string): unknown {
  return parse(readFileSync(path.join(ROOT, file), 'utf8'), {
    customTags: [
      {
        tag: 'tag:yaml.org,2002:js',
        resolve: (value: string) => value,
      },
    ],
  });
}

function insertedRows(patch: unknown): Entry[] {
  const operations = patch as unknown[];
  expect(Array.isArray(operations)).toBe(true);
  expect(operations).toHaveLength(1);
  const operation = asRecord(operations[0]);
  expect(Object.keys(operation)).toEqual(['insert']);
  return operation.insert as Entry[];
}

function preset(rows: Entry[], rowId: string): PresetConfig {
  const row = rows.find((entry) => entry.id === rowId);
  expect(row).toBeDefined();
  return asRecord(row?.config) as PresetConfig;
}

const rows = insertedRows(readYaml('cordis.patch.yml'));
const standardRows = insertedRows(readYaml('tests/support/standard-preset.yml'));
const standard = preset(standardRows, 'preset-standard');
const dispatch = preset(rows, 'preset-sa-dispatch');
const worker = preset(rows, 'preset-sa-worker');

describe('SA 预设补丁', () => {
  it('声明七个功能行、调度服务与两个预设，入口名正确', () => {
    expect(rows.map((row) => row.id)).toEqual([
      'dsh-plugin-practical-tool-bundle',
      'session-sweeper',
      'reasoning-reset',
      'claude-skills',
      'restart-button',
      'mobile-touch-ui',
      'official-features',
      'lark-super-agent',
      'preset-sa-dispatch',
      'preset-sa-worker',
    ]);
    expect(rows.slice(6).map((row) => row.name)).toEqual([
      'dsh-plugin-practical-tool-bundle/official-features',
      'dsh-plugin-practical-tool-bundle/lark-super-agent',
      '@deepseek-ai/dsh-agent-preset',
      '@deepseek-ai/dsh-agent-preset',
    ]);
    expect(dispatch).toMatchObject({
      id: 'sa-dispatch',
      name: 'SA-调度会话',
      description: expect.any(String),
    });
    expect(worker).toMatchObject({
      id: 'sa-worker',
      name: 'SA-任务会话',
      description: expect.any(String),
    });
    expect(dispatch.description.trim()).not.toBe('');
    expect(worker.description.trim()).not.toBe('');
  });

  it('调度预设只含契约子行与平台条件', () => {
    expect(dispatch.plugins.map((entry) => [entry.id, entry.name])).toEqual([
      ['persona', '@deepseek-ai/dsh-persona'],
      ['agent-instructions', '@deepseek-ai/dsh-agent-instructions'],
      ['time-context', '@deepseek-ai/dsh-time-context'],
      ['tool-bash', '@deepseek-ai/dsh-tool-bash'],
      ['tool-pwsh', '@deepseek-ai/dsh-tool-pwsh'],
      ['tool-fs', '@deepseek-ai/dsh-tool-fs'],
      ['tool-fs-search', '@deepseek-ai/dsh-tool-fs-search'],
      ['tool-web', '@deepseek-ai/dsh-tool-web'],
      ['skill-filesystem', '@deepseek-ai/dsh-skill-filesystem'],
      ['tool-skill', '@deepseek-ai/dsh-tool-skill'],
      ['compaction', 'cordis:group'],
      ['meta-tools', 'dsh-plugin-meta-tools'],
      ['sa-dispatch', 'dsh-plugin-practical-tool-bundle/sa-dispatch'],
    ]);
    expect(dispatch.plugins.find((entry) => entry.id === 'tool-bash')?.disabled).toBe(
      "process.platform === 'win32'",
    );
    expect(dispatch.plugins.find((entry) => entry.id === 'tool-pwsh')?.disabled).toBe(
      "process.platform !== 'win32'",
    );
    expect(dispatch.plugins.find((entry) => entry.id === 'compaction')).toEqual(
      standard.plugins.find((entry) => entry.id === 'compaction'),
    );
  });

  it('meta-tools 十一项全开并固定任务预设', () => {
    const metaTools = dispatch.plugins.find((entry) => entry.id === 'meta-tools');
    expect(metaTools?.config).toEqual({
      workspace_list: true,
      workspace_create: true,
      workspace_remove: true,
      workspace_rename: true,
      session_list: true,
      session_get: true,
      session_create: true,
      session_stop: true,
      session_send: true,
      session_pin: true,
      session_archive: true,
      session_preset: 'sa-worker',
    });
  });

  it('两个预设均无 ask-user，skill-filesystem 不含 customSkillDirs', () => {
    for (const config of [dispatch, worker]) {
      expect(config.plugins.some((entry) => entry.id === 'tool-ask-user')).toBe(false);
      expect(config.plugins.some((entry) => entry.name === '@deepseek-ai/dsh-tool-ask-user')).toBe(
        false,
      );
      const skill = config.plugins.find((entry) => entry.id === 'skill-filesystem');
      expect(skill?.name).toBe('@deepseek-ai/dsh-skill-filesystem');
      expect(asRecord(skill ?? {}).config).toBeUndefined();
    }
  });

  it('任务预设与标准快照只差删除 ask-user、增加 sa-worker、删除 customSkillDirs', () => {
    const expected = standard.plugins
      .filter((entry) => entry.id !== 'tool-ask-user')
      .map((entry) => {
        if (entry.id !== 'skill-filesystem') return entry;
        const { config: _config, ...withoutConfig } = entry;
        return withoutConfig;
      });
    expected.push({
      id: 'sa-worker',
      name: 'dsh-plugin-practical-tool-bundle/sa-worker',
    });
    expect(worker.plugins).toEqual(expected);
  });

  it('不设默认预设，不修改标准预设或预设注册服务', () => {
    expect(Object.keys(dispatch).sort()).toEqual(['description', 'id', 'name', 'plugins']);
    expect(Object.keys(worker).sort()).toEqual(['description', 'id', 'name', 'plugins']);
    expect(rows.some((row) => row.id === 'preset-standard')).toBe(false);
    expect(rows.some((row) => row.id === 'agent-preset-registry')).toBe(false);
    expect(rows.some((row) => row.name === '@deepseek-ai/dsh-agent-preset-registry')).toBe(false);
  });
});

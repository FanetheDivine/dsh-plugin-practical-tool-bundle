// 叠加功能的声明面测试：补丁行、包导出、构建入口与提示词不含插值。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { PROGRESS_UPDATES, RESPONSIVENESS, STOP_LOSS } from '../src/codex-behavior/prompts.ts';
import { BEHAVIOR_ID, BEHAVIOR_NAME } from '../src/standard-codex/index.ts';

/** 仓库根目录。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 一行 Loader 条目。 */
interface Entry {
  id?: string;
  name?: string;
}

/** 读取补丁文件的插入行。 */
function insertRows(): Entry[] {
  const text = readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8').replace(/!!js /g, '');
  return (parse(text) as Array<{ insert?: Entry[] }>).flatMap((item) => item.insert ?? []);
}

describe('标准模式叠加的声明面', () => {
  it('补丁声明 standard-codex 行，排在 official-features 之后', () => {
    const rows = insertRows();
    const ids = rows.map((row) => row.id);
    expect(ids).toContain('standard-codex');
    expect(ids.indexOf('standard-codex')).toBeGreaterThan(ids.indexOf('official-features'));
    const row = rows.find((item) => item.id === 'standard-codex');
    expect(row?.name).toBe('dsh-plugin-practical-tool-bundle/standard-codex');
  });

  it('行为子行只在运行期追加，不出现在补丁里', () => {
    expect(insertRows().some((row) => row.name === BEHAVIOR_NAME)).toBe(false);
    expect(insertRows().some((row) => row.id === BEHAVIOR_ID)).toBe(false);
  });

  it('包导出两个新入口', () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, { import?: string }>;
    };
    expect(manifest.exports['./codex-behavior']?.import).toBe('./dist/codex-behavior.mjs');
    expect(manifest.exports['./standard-codex']?.import).toBe('./dist/standard-codex.mjs');
  });

  it('构建入口包含两个新模块', () => {
    const config = readFileSync(path.join(ROOT, 'tsdown.config.ts'), 'utf8');
    expect(config).toContain("'codex-behavior': 'src/codex-behavior/index.ts'");
    expect(config).toContain("'standard-codex': 'src/standard-codex/index.ts'");
  });

  it('三段提示词都不含模板插值', () => {
    for (const text of [RESPONSIVENESS, PROGRESS_UPDATES, STOP_LOSS]) {
      expect(text).not.toContain('{{');
      expect(text).not.toContain('}}');
    }
  });
});

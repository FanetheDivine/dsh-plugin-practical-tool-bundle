// 插件元数据测试：断言 locale/<语言 id>.json 的结构、键集与打包声明。
// 宿主在插件未激活时读取这些文件，因此校验放在测试里，不进入运行时。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** 仓库根目录（tests/ 的上一级）。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 元数据目录。 */
const LOCALE_DIR = path.join(ROOT, 'locale');

/** 基线语言：前端字典与元数据都提供这两份。 */
const BASELINE_LOCALES = ['en', 'zh'];

/** 资源文件中禁止出现的字符：零宽空格与 BOM。 */
const FORBIDDEN_CHARS = ['\u200b', '\ufeff'];

/** 读取一份元数据文件，返回解析结果与原文。 */
function readLocale(name: string): { text: string; data: unknown } {
  const text = readFileSync(path.join(LOCALE_DIR, `${name}.json`), 'utf8');
  return { text, data: JSON.parse(text) };
}

/** 把值收窄为字符串键对象。 */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('期望对象');
  }
  return value as Record<string, unknown>;
}

describe('插件元数据资源', () => {
  it('目录里只有基线语言的资源文件，文件名即语言 id', () => {
    const files = readdirSync(LOCALE_DIR).filter((name) => name.endsWith('.json'));
    expect(files.sort()).toEqual(BASELINE_LOCALES.map((id) => `${id}.json`));
  });

  it.each(BASELINE_LOCALES)('%s 的 meta 含非空的 title 与 description', (id) => {
    const meta = asRecord(asRecord(readLocale(id).data)['meta']);
    expect(Object.keys(meta).sort()).toEqual(['description', 'title']);
    for (const key of ['title', 'description']) {
      const value = meta[key];
      expect(typeof value).toBe('string');
      expect(String(value).trim()).not.toBe('');
    }
    // 标题单行，避免在插件行被截断
    expect(String(meta['title'])).not.toMatch(/[\r\n]/);
  });

  it('各语言的 meta 键集一致', () => {
    const keysOf = (id: string) =>
      Object.keys(asRecord(asRecord(readLocale(id).data)['meta'])).sort();
    const [first, ...rest] = BASELINE_LOCALES.map(keysOf);
    for (const keys of rest) {
      expect(keys).toEqual(first);
    }
  });

  it('资源不含零宽空格与 BOM', () => {
    for (const id of BASELINE_LOCALES) {
      const { text } = readLocale(id);
      for (const char of FORBIDDEN_CHARS) {
        expect(text.includes(char)).toBe(false);
      }
    }
  });

  it('声明 meta.detail 时指向包内 Markdown 文件', () => {
    for (const id of BASELINE_LOCALES) {
      const meta = asRecord(asRecord(readLocale(id).data)['meta']);
      const detail = meta['detail'];
      if (detail === undefined) continue;
      expect(typeof detail).toBe('string');
      expect(String(detail)).toMatch(/^docs\/.+\.md$/);
      expect(() => readFileSync(path.join(ROOT, String(detail)), 'utf8')).not.toThrow();
    }
  });

  it('package.json 导出并打包全部元数据资源', () => {
    const manifest = asRecord(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')));
    expect(asRecord(manifest['exports'])['./locale/*.json']).toBe('./locale/*.json');
    expect(manifest['files']).toContain('locale/*.json');
  });
});

/** 功能行的子路径，与 cordis.patch.yml 中 name 的后缀一致。 */
const ROW_SUBPATHS = [
  'sweeper',
  'reasoning-reset',
  'claude-skills',
  'restart',
  'mobile',
  'official-features',
];

/** 只有宿主行为、没有 rows/ 元数据的行子路径。 */
const NON_UI_SUBPATHS = ['standard-codex'];

/** 宿主接受的图标大小上限。 */
const ICON_MAX_BYTES = 256 * 1024;

/** 读取一个功能行的元数据文件。 */
function readRowLocale(
  subpath: string,
  id: string,
): { text: string; meta: Record<string, unknown> } {
  const text = readFileSync(path.join(ROOT, 'rows', subpath, 'locale', `${id}.json`), 'utf8');
  return { text, meta: asRecord(asRecord(JSON.parse(text))['meta']) };
}

describe('功能行元数据资源', () => {
  it('子路径与 cordis.patch.yml 的行一一对应', () => {
    const patch = readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8');
    const names = [...patch.matchAll(/name: dsh-plugin-practical-tool-bundle\/(\S+)/g)].map(
      (match) => match[1],
    );
    expect(names.sort()).toEqual([...ROW_SUBPATHS, ...NON_UI_SUBPATHS].sort());
  });

  it.each(ROW_SUBPATHS)('%s 的每种基线语言含单行标题与非空描述', (subpath) => {
    const keySets = BASELINE_LOCALES.map((id) => {
      const { text, meta } = readRowLocale(subpath, id);
      expect(Object.keys(meta).sort()).toEqual(['description', 'title']);
      expect(String(meta['title']).trim()).not.toBe('');
      expect(String(meta['title'])).not.toMatch(/[\r\n]/);
      expect(String(meta['description']).trim()).not.toBe('');
      for (const char of FORBIDDEN_CHARS) expect(text.includes(char)).toBe(false);
      return Object.keys(meta).sort();
    });
    for (const keys of keySets) expect(keys).toEqual(keySets[0]);
  });

  it.each(ROW_SUBPATHS)('%s 的图标是不超过上限的 SVG', (subpath) => {
    const file = path.join(ROOT, 'rows', subpath, 'icon.svg');
    const text = readFileSync(file, 'utf8');
    expect(text.trimStart().startsWith('<svg')).toBe(true);
    expect(text).toContain('viewBox=');
    expect(statSync(file).size).toBeLessThanOrEqual(ICON_MAX_BYTES);
  });

  it('package.json 为每行导出元数据与图标并打包 rows', () => {
    const manifest = asRecord(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')));
    const exportsMap = asRecord(manifest['exports']);
    for (const subpath of ROW_SUBPATHS) {
      expect(exportsMap[`./${subpath}/locale/*.json`]).toBe(`./rows/${subpath}/locale/*.json`);
      expect(exportsMap[`./${subpath}/icon`]).toBe(`./rows/${subpath}/icon.svg`);
    }
    expect(manifest['files']).toContain('rows');
  });
});

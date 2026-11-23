// 包内容回归测试：npm pack --dry-run 断言 tarball 只含发布所需文件。
// 七个宿主入口、前端产物、assets、图标、locale 与 rows 行资源必须进包；src / tests / scripts 不得进包。
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { assertFreshDist } from './support/dist-freshness.ts';
import { packedFilePaths } from './support/pack-report.ts';

/** 仓库根目录（tests/ 的上一级）。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 必须进包的固定文件。 */
const REQUIRED = [
  'dist/index.mjs',
  'dist/sweeper.mjs',
  'dist/reasoning-reset.mjs',
  'dist/claude-skills.mjs',
  'dist/restart.mjs',
  'dist/mobile.mjs',
  'dist/official-features.mjs',
  'dist/client.js',
  'assets/launcher.cjs',
  'assets/mobile.css',
  'icon.svg',
  'cordis.patch.yml',
  'README.md',
  'locale/en.json',
  'locale/zh.json',
  ...[
    'sweeper',
    'reasoning-reset',
    'claude-skills',
    'restart',
    'mobile',
    'official-features',
  ].flatMap((subpath) => [
    `rows/${subpath}/locale/en.json`,
    `rows/${subpath}/locale/zh.json`,
    `rows/${subpath}/icon.svg`,
  ]),
];

/** 打包结果的缓存：同一进程内只执行一次 npm pack。 */
let cachedPaths: Set<string> | undefined;

/** 执行 npm pack --dry-run --json，返回 tarball 内文件路径集合。 */
function packedPaths(): Set<string> {
  if (cachedPaths !== undefined) return cachedPaths;
  assertFreshDist();
  const res = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    // Windows 下 npm 是 npm.cmd，需经 shell 启动
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    throw new Error(`npm pack --dry-run 失败：${String(res.stderr ?? res.stdout ?? '未知错误')}`);
  }
  // npm pack --json 的两种形状（数组、以包名为键的对象）都由 packedFilePaths 归一
  const report: unknown = JSON.parse(String(res.stdout ?? '[]'));
  cachedPaths = new Set(packedFilePaths(report));
  return cachedPaths;
}

describe('npm 包内容（npm pack --dry-run）', () => {
  it('tarball 含全部入口、assets、图标与元数据，不含 src/tests/scripts', () => {
    const packed = packedPaths();
    for (const file of REQUIRED) expect(packed.has(file)).toBe(true);
    expect([...packed].some((p) => p.startsWith('src/'))).toBe(false);
    expect([...packed].some((p) => p.startsWith('tests/'))).toBe(false);
    expect([...packed].some((p) => p.startsWith('scripts/'))).toBe(false);
  }, 30_000);

  it('前端产物以包名注册闭包工厂', () => {
    // 读取的产物与包内容一致
    packedPaths();
    const client = readFileSync(path.join(ROOT, 'dist', 'client.js'), 'utf8');
    expect(client).toContain('window.__ModuleLoader__.load(');
    expect(client).toContain('id: "dsh-plugin-practical-tool-bundle"');
    expect(client).not.toContain('exports.inject');
    expect(client).toContain('exports.apply');
  });
});

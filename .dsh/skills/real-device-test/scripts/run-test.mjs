// 实机测试后端驱动：启动 profile，校验插件五行在 loader 中启用。
// 用法：在 profile 目录运行 node run-test.mjs；RDT_KEEPALIVE=1 时结束后保留运行时。
// env：RDT_REPO 必填；RDT_PROFILE_DIR 默认脚本所在目录；RDT_PROFILE 默认目录名；RDT_DSH_PKG 默认全局宿主。
// 结果写入 results.json，全部通过时退出码为 0。
// HTTP 状态路由与各功能路由由 browser-test.mjs 在已登录页面内校验。
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.env.RDT_PROFILE_DIR ?? dirname(fileURLToPath(import.meta.url));
const REPO = process.env.RDT_REPO;
if (!REPO) throw new Error('RDT_REPO 必填：插件仓库绝对路径，例如 <drive>:/path/to/<repo>');
const PLUGIN = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).name;
const dshPkg =
  process.env.RDT_DSH_PKG ??
  join(execSync('npm root -g', { encoding: 'utf8' }).trim(), '@deepseek-ai', 'dsh', 'package.json');

// 清理上一轮的结果，避免失败时读取旧文件
for (const f of ['results.json', 'fatal.txt'])
  rmSync(join(root, f), { recursive: true, force: true });

const require = createRequire(dshPkg);
const { createLaunchEnvironmentSnapshot } = await import(
  pathToFileURL(require.resolve('@deepseek-ai/dsh-launch-environment'))
);
const { runProfile } = await loadRunProfile(join(dirname(dshPkg), 'lib'));

/** 加载宿主的 runProfile。新版宿主提供 lib/profile-boot.js，旧版只有带 hash 的 profile-boot-*.js。 */
async function loadRunProfile(libDir) {
  const files = readdirSync(libDir)
    .filter((f) => /^profile-boot.*\.js$/.test(f))
    .sort((a, b) => a.length - b.length);
  for (const f of files) {
    const mod = await import(pathToFileURL(join(libDir, f)));
    if (typeof mod.runProfile === 'function') return mod;
  }
  throw new Error(`${libDir} 中找不到 runProfile`);
}

process.env.DSH_PROFILE = process.env.RDT_PROFILE ?? basename(root);
process.env.DSH_PROFILE_DIR = root;
process.env.DSH_TELEMETRY_DISABLED = '1';
const runtime = await runProfile({
  profile: process.env.DSH_PROFILE,
  environment: createLaunchEnvironmentSnapshot([{ source: 'process', values: process.env }]),
  patchFiles: [],
  args: ['--no-open', '--port', '0'],
});
const app = runtime.ctx;
const results = [];

/** cordis fiber 状态：2 为已激活，3 为 apply 抛错。 */
const FIBER_ACTIVE = 2;

/** 根行与五行：loader 行 id 与入口模块名。 */
const ROWS = [
  { key: 'root', id: PLUGIN, name: PLUGIN },
  { key: 'sweeper', id: 'session-sweeper', name: `${PLUGIN}/sweeper` },
  { key: 'reasoningReset', id: 'reasoning-reset', name: `${PLUGIN}/reasoning-reset` },
  { key: 'claudeSkills', id: 'claude-skills', name: `${PLUGIN}/claude-skills` },
  { key: 'restart', id: 'restart-button', name: `${PLUGIN}/restart` },
  { key: 'mobile', id: 'mobile-touch-ui', name: `${PLUGIN}/mobile` },
];

/** 运行一条用例并记录结果。 */
async function check(label, fn) {
  try {
    const detail = await fn();
    results.push({ label, status: 'PASS', detail });
    console.log('PASS', label, JSON.stringify(detail ?? {}));
  } catch (e) {
    results.push({ label, status: 'FAIL', error: e?.stack ?? String(e) });
    console.error('FAIL', label, e?.stack ?? e);
  }
}

try {
  /** 条目 id 带组路径前缀，例如 bundle 行落在 include:<行 id>；先按完整 id 查，再按最后一段匹配。 */
  const findEntry = (id) => {
    const entries = [...app.loader.entries()];
    return entries.find((e) => e.id === id) ?? entries.find((e) => e.id.endsWith(`:${id}`));
  };

  await check('A1 根行与五行在 loader 中启用', async () => {
    const active = {};
    for (const row of ROWS) {
      const entry = findEntry(row.id);
      assert(entry, `loader 中找不到行 ${row.id}`);
      assert.equal(entry.options.name, row.name, `${row.id} 的入口模块名不符`);
      assert.equal(entry.disabled, false, `${row.id} 处于停用状态`);
      assert.equal(
        entry.fiber?.state,
        FIBER_ACTIVE,
        `${row.id} 未激活（fiber.state=${entry.fiber?.state}）`,
      );
      active[row.key] = entry.id;
    }
    return active;
  });
  if (results.at(-1)?.status !== 'PASS') throw new Error('装载失败，中止后续用例');

  await check('A2 已安装产物与仓库 dist 一致', async () => {
    const installed = join(root, 'node_modules', PLUGIN);
    const version = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
    assert.equal(version(installed), version(REPO), '加载的版本与仓库不一致');
    const hash = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12);
    const sha = hash(join(installed, 'dist', 'index.mjs'));
    assert.equal(sha, hash(join(REPO, 'dist', 'index.mjs')), '加载产物与仓库 dist 不一致');
    return { version: version(installed), sha };
  });

  /** 状态路由的验证命令；在已启动的 GUI 中由 browser-test.mjs 执行。 */
  const scripts = join(REPO, '.dsh', 'skills', 'real-device-test', 'scripts');
  const profile = process.env.DSH_PROFILE;
  const verification = [
    `eval $(bash "${join(scripts, 'gui-up.sh')}" ${profile})`,
    `cd "${REPO}" && node "${join(scripts, 'browser-test.mjs')}"`,
  ];
  results.push({ label: '验证路径', status: 'INFO', commands: verification });
  console.log('验证路径（HTTP 状态路由与前端）:');
  for (const line of verification) console.log(`  ${line}`);

  writeFileSync(join(root, 'results.json'), JSON.stringify(results, null, 2));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log('RDT_DONE', JSON.stringify({ pass, fail }));
  if (process.env.RDT_KEEPALIVE === '1') {
    console.log('RDT_KEEPALIVE');
  } else {
    await runtime.shutdown.shutdown(fail ? 1 : 0);
  }
} catch (e) {
  console.error(e);
  writeFileSync(join(root, 'fatal.txt'), e?.stack ?? String(e));
  writeFileSync(join(root, 'results.json'), JSON.stringify(results, null, 2));
  await runtime.shutdown.shutdown(1);
}

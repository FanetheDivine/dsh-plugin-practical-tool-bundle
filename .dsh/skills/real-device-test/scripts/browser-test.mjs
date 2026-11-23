// 实机测试浏览器驱动：用 Playwright 打开 GUI，校验状态路由、功能路由与侧栏界面。
// 用法：在仓库内运行 node browser-test.mjs；RDT_GUI_URL 由 gui-up.sh 导出。
// env：RDT_HEADLESS=0 显示浏览器；RDT_SHOTS 截图目录，默认 profile 目录下的 shots。
// 结果写入 browser-results.json，全部通过时退出码为 0。

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = process.env.RDT_PROFILE_DIR ?? dirname(fileURLToPath(import.meta.url));
const url = process.env.RDT_GUI_URL;
if (!url) throw new Error('RDT_GUI_URL 必填：先 eval $(bash gui-up.sh <profile名>)');
const shots = process.env.RDT_SHOTS ?? join(root, 'shots');
mkdirSync(shots, { recursive: true });

/** GUI 的中英文标签，按顺序尝试，取第一个存在的。 */
const LABELS = {
  welcome: ['继续', 'Continue'],
};

const results = [];

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

/** 关闭可能出现的欢迎弹窗。 */
async function dismissWelcome(page) {
  for (const name of LABELS.welcome) {
    const btn = page.getByRole('button', { name, exact: true });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(1200);
      return true;
    }
  }
  return false;
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: process.env.RDT_HEADLESS !== '0',
});
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);

/** 页面内的同源请求；返回状态码、内容类型、原文与 JSON。 */
const api = (path, init) =>
  page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(path, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...init,
      });
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        // 非 JSON 回答保留原文
      }
      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        text,
        body,
      };
    },
    { path, init },
  );

/** 计算颜色里的 alpha；兼容 rgba()、rgb() 与 color(srgb …) 三种写法。 */
function alphaOf(color) {
  const rgb = /rgba?\(([^)]+)\)/.exec(color);
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean);
    if (parts.length < 4) return 1;
    return parts[3].endsWith('%') ? Number.parseFloat(parts[3]) / 100 : Number(parts[3]);
  }
  const slash = /\/\s*([0-9.]+)(%?)\s*\)/.exec(color);
  return slash ? Number(slash[1]) / (slash[2] === '%' ? 100 : 1) : 1;
}

// 截图与用例都会读取这两个按钮；文案来自插件中文字典
const sweepButton = page.locator('button[aria-label="清理会话"]');
const restartButton = page.locator('button[aria-label="重启 DSH"]');

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

try {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (resp?.status() !== 200) throw new Error(`打开 GUI 失败：HTTP ${resp?.status()}`);
  await page.waitForTimeout(5000);
  const dismissed = await dismissWelcome(page);
  console.log('GUI 已加载', JSON.stringify({ welcome: dismissed }));

  await check('A3 状态路由报告六行可用', async () => {
    const answer = await api('/api/dsh-practical-tools/status');
    assert.equal(answer.status, 200, `状态路由返回 HTTP ${answer.status}`);
    const rows = answer.body?.rows ?? {};
    assert.equal(rows.sweeper, true, `rows.sweeper 为 ${JSON.stringify(rows.sweeper)}`);
    const KEYS = [
      'sweeper',
      'reasoningReset',
      'claudeSkills',
      'restart',
      'mobile',
      'officialFeatures',
    ];
    for (const key of KEYS) assert.equal(typeof rows[key], 'boolean', `rows.${key} 应为布尔值`);
    assert.deepEqual(
      Object.keys(rows).sort(),
      [...KEYS].sort(),
      `状态路由键集不符：${JSON.stringify(Object.keys(rows))}`,
    );
    return { rows };
  });

  await check('C1 侧栏出现清理会话与重启按钮', async () => {
    await sweepButton.waitFor({ state: 'visible', timeout: 30000 });
    await restartButton.waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await sweepButton.count(), 1, '清理会话按钮数量不为 1');
    assert.equal(await restartButton.count(), 1, '重启按钮数量不为 1');
    await page.screenshot({ path: join(shots, 'c1-sidebar.png'), fullPage: true });
    return { sweeper: true, restart: true };
  });

  await check('C2 两个按钮的悬停样式一致', async () => {
    const idle = await sweepButton.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert(alphaOf(idle) < 0.02, `清理会话按钮静止时背景不透明：${idle}`);

    const hovered = async (locator) => {
      await locator.hover();
      await page.waitForTimeout(200);
      return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
    };
    const sweep = await hovered(sweepButton);
    const restart = await hovered(restartButton);
    const sweepAlpha = alphaOf(sweep);
    const restartAlpha = alphaOf(restart);
    assert(Math.abs(sweepAlpha - 0.12) < 0.03, `清理会话悬停底色 alpha=${sweepAlpha}：${sweep}`);
    assert(Math.abs(restartAlpha - 0.12) < 0.03, `重启悬停底色 alpha=${restartAlpha}：${restart}`);
    assert(
      Math.abs(sweepAlpha - restartAlpha) < 0.01,
      `两个按钮悬停 alpha 不一致：${sweepAlpha} / ${restartAlpha}`,
    );
    await page.screenshot({ path: join(shots, 'c2-hover.png'), fullPage: true });
    return { sweep, restart, alpha: sweepAlpha };
  });

  await check('C3 手机断点加载样式并放大触控控件', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    const mobile = await page.evaluate(() => {
      const html = document.documentElement.getAttribute('data-dsh-mobile-css');
      const rules = [...document.styleSheets]
        .flatMap((sheet) => {
          try {
            return [...sheet.cssRules];
          } catch {
            return [];
          }
        })
        .map((rule) => rule.cssText)
        .join('\n');
      const sizeOf = (label) => {
        const button = document.querySelector(`button[aria-label="${label}"]`);
        if (button === null) return null;
        const style = getComputedStyle(button);
        return {
          minWidth: Number.parseFloat(style.minWidth) || 0,
          minHeight: Number.parseFloat(style.minHeight) || 0,
        };
      };
      return {
        html,
        media: matchMedia('(max-width: 767px)').matches,
        hasTouchRule: /min-height:\s*44px/.test(rules),
        hasDrawerWidth: /328px/.test(rules),
        sweep: sizeOf('清理会话'),
        restart: sizeOf('重启 DSH'),
      };
    });
    assert.equal(
      mobile.html === 'link' || mobile.html === 'style',
      true,
      `html 标记为 ${mobile.html}`,
    );
    assert.equal(mobile.media, true, '390px 宽度未命中手机断点');
    assert.equal(mobile.hasTouchRule, true, '样式表缺少 44px 触控尺寸规则');
    assert.equal(mobile.hasDrawerWidth, true, '样式表缺少 328px 抽屉宽度');
    for (const [label, size] of [
      ['清理会话', mobile.sweep],
      ['重启 DSH', mobile.restart],
    ]) {
      assert(size, `手机断点下找不到${label}按钮`);
      assert(size.minWidth >= 44, `${label} 的最小宽度为 ${size.minWidth}px`);
      assert(size.minHeight >= 44, `${label} 的最小高度为 ${size.minHeight}px`);
    }
    await page.screenshot({ path: join(shots, 'c3-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    return { flag: mobile.html, drawer: 328, touch: 44 };
  });

  await check('C4 控制台无 error', async () => {
    assert.deepEqual(
      consoleErrors,
      [],
      `控制台有 ${consoleErrors.length} 条 error：${consoleErrors[0] ?? ''}`,
    );
    return { errors: 0 };
  });

  await check('B1 清理会话路由拒绝空请求体', async () => {
    const answer = await api('/api/dsh-practical-tools/sweep', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(answer.status, 400, `空请求体应返回 400，实际 ${answer.status}`);
    assert.equal(answer.body?.ok, false, '空请求体应回答 ok:false');
    return { status: answer.status };
  });

  await check('B2 清理会话路由返回计数', async () => {
    const answer = await api('/api/dsh-practical-tools/sweep', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [], keepIds: [] }),
    });
    assert.equal(answer.status, 200, `清理路由返回 HTTP ${answer.status}`);
    assert.equal(answer.body?.ok, true, '清理路由应回答 ok:true');
    for (const key of ['archived', 'deleted', 'skipped', 'deferred', 'failed'])
      assert.equal(typeof answer.body?.[key], 'number', `清理结果缺少 ${key}`);
    return {
      archived: answer.body.archived,
      deleted: answer.body.deleted,
      skipped: answer.body.skipped,
    };
  });

  await check('B3 重启 info 路由返回进程信息', async () => {
    const answer = await api('/api/dsh-practical-tools/restart/info');
    assert.equal(answer.status, 200, `重启 info 返回 HTTP ${answer.status}`);
    assert.equal(typeof answer.body?.pid, 'number', '重启 info 缺少 pid');
    assert.equal(typeof answer.body?.startedAt, 'number', '重启 info 缺少 startedAt');
    assert.match(String(answer.body?.runtime), /^(web|desktop)$/, '重启 info 的 runtime 不合法');
    return { pid: answer.body.pid, runtime: answer.body.runtime };
  });

  await check('B4 手机样式表路由返回 328 宽度', async () => {
    const answer = await api('/api/dsh-practical-tools/mobile.css');
    assert.equal(answer.status, 200, `手机样式表返回 HTTP ${answer.status}`);
    assert.match(answer.contentType, /text\/css/, `内容类型为 ${answer.contentType}`);
    assert(!answer.text.includes('__DRAWER_WIDTH__'), '样式表仍含未替换的宽度占位符');
    assert(answer.text.includes('328px'), '样式表缺少 328px 抽屉宽度');
    assert(answer.text.includes('max-width: 767px'), '样式表缺少手机断点');
    return { bytes: answer.text.length };
  });

  await check('B5 已删除的调度状态路由返回 404', async () => {
    const answer = await api('/api/dsh-practical-tools/lark-super-agent/status');
    assert.equal(answer.status, 404, `调度状态路由返回 HTTP ${answer.status}`);
    return { status: answer.status };
  });
} catch (e) {
  console.error(e);
  results.push({ label: 'FATAL', status: 'FAIL', error: e?.stack ?? String(e) });
} finally {
  writeFileSync(join(root, 'browser-results.json'), JSON.stringify(results, null, 2));
  await context.close();
  await browser.close();
}

const fail = results.filter((r) => r.status === 'FAIL').length;
console.log('RDT_BROWSER_DONE', JSON.stringify({ pass: results.length - fail, fail }));
process.exit(fail ? 1 : 0);

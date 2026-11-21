// 重启按钮测试：槽位注册、rail 样式 effect、按钮渲染与阶段迁移。
// 状态机是纯函数，取消路径不触碰网络；组件用 react-dom/server 渲染。
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NS } from '../src/client/locales.ts';
import {
  dialogChoiceAction,
  dialogTitleKey,
  dialogVisible,
  installRestart,
  overlayTextKey,
  overlayTitleKey,
  RestartButton,
  type RestartButtonProps,
  type RestartPhase,
  requestRestart,
  transitionPhase,
  triggerStyle,
} from '../src/client/restart.tsx';
import { makeClientCtx } from './helpers.ts';

/** 以真实中文回答按钮名称，其余键原样返回。 */
function translate(key: string): string {
  if (key === 'restart.label') return '重启 DSH';
  if (key === 'restart.desktopLabel') return '重启应用';
  return key;
}

/** 渲染用的翻译座。 */
const t = translate as RestartButtonProps['t'];

/** 安装 document 桩，返回被追加的样式元素与 head。 */
function stubDocument() {
  const style = { setAttribute: vi.fn(), textContent: '', remove: vi.fn() };
  const head = { appendChild: vi.fn() };
  vi.stubGlobal('document', { createElement: () => style, head });
  return { style, head };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('installRestart', () => {
  it('把按钮注册到 sidebar.footer.action 的固定 id、顺序与字典', () => {
    stubDocument();
    const ctx = makeClientCtx();
    installRestart(ctx);

    expect(ctx._slotInjections).toEqual(['sidebar.footer.action']);
    expect(ctx._slotRegistrations).toHaveLength(1);
    const registration = ctx._slotRegistrations[0];
    expect(registration?.options).toEqual({
      name: 'sidebar.footer.action',
      id: 'restart-button',
      order: 51,
      locale: NS,
    });
    expect(registration?.component).toBe(RestartButton);
  });

  it('注册折叠栏 rail 样式 effect 并在卸载时移除', () => {
    const { style, head } = stubDocument();
    const ctx = makeClientCtx();
    installRestart(ctx);

    expect(ctx._effects).toContain('dsh-plugin-practical-tool-bundle: restart rail');
    expect(head.appendChild).toHaveBeenCalledWith(style);
    expect(style.setAttribute).toHaveBeenCalledWith(
      'data-plugin-css',
      'dsh-plugin-practical-tool-bundle: restart rail',
    );
    expect(style.textContent).toContain('[data-sidebar-collapsed] [class*="footerActions"]');
    expect(style.textContent).toContain('[data-rail="rail"]');

    ctx._dispose();
    expect(style.remove).toHaveBeenCalled();
  });
});

describe('RestartButton', () => {
  it('折叠栏渲染入口、rail 标记与无障碍名称', () => {
    const html = renderToStaticMarkup(createElement(RestartButton, { wide: false, t }));

    expect(html).toContain('class="dsrr-entry"');
    expect(html).toContain('data-dsh-part="entry"');
    expect(html).toContain('data-rail="rail"');
    expect(html).toContain('aria-label="重启 DSH"');
  });

  it('宽栏时不带 rail 标记', () => {
    const html = renderToStaticMarkup(createElement(RestartButton, { wide: true, t }));

    expect(html).toContain('data-dsh-part="entry"');
    expect(html).not.toContain('data-rail');
  });
});

describe('triggerStyle', () => {
  it('悬停时用错误色淡底，尺寸 36、圆角 50%', () => {
    const normal = triggerStyle(false);
    expect(normal.background).toBe('transparent');
    expect(normal.color).toBe('var(--dsw-alias-state-error-primary)');
    expect(normal.width).toBe(36);
    expect(normal.height).toBe(36);
    expect(normal.borderRadius).toBe('50%');

    const hover = triggerStyle(true);
    expect(hover.background).toBe(
      'color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)',
    );
    expect(hover.color).toBe('var(--dsw-alias-state-error-primary)');
  });
});

describe('阶段迁移', () => {
  it('点击按钮打开确认对话框', () => {
    const phase = transitionPhase('idle', { type: 'open' });

    expect(phase).toBe('confirm');
    expect(dialogVisible(phase)).toBe(true);
    expect(dialogTitleKey(phase, false)).toBe('restart.confirmTitle');
  });

  it('取消关闭对话框且不发起重启请求', async () => {
    const request = vi.fn(async () => ({ ok: true }));
    let phase: RestartPhase = 'idle';

    phase = transitionPhase(phase, { type: 'open' });
    expect(dialogVisible(phase)).toBe(true);

    // 取消只迁移状态，不经过重启入口。
    phase = transitionPhase(phase, dialogChoiceAction('cancel'));
    expect(phase).toBe('idle');
    expect(dialogVisible(phase)).toBe(false);
    expect(request).not.toHaveBeenCalled();

    // 对照：确认才会调用同一个重启入口。
    await requestRestart(request);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('确认发起一次 POST 并进入重启中', async () => {
    const request = vi.fn(async () => ({ ok: true }));

    await requestRestart(request);
    expect(request).toHaveBeenCalledWith('api/dsh-practical-tools/restart', 'POST');
    expect(transitionPhase('confirm', dialogChoiceAction('confirm'))).toBe('restarting');
  });

  it('桌面场景使用桌面文案', () => {
    expect(dialogTitleKey('confirm', true)).toBe('restart.desktopConfirmTitle');
    expect(overlayTitleKey('restarting', true)).toBe('restart.desktopRestarting');
    expect(overlayTextKey('slow', true)).toBe('restart.desktopSlowText');
  });
});

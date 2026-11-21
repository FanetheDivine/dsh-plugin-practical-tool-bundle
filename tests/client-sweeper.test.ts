// 清理会话前端测试：槽位注册参数、按钮渲染、悬停样式与面板未就绪文案。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NS } from '../src/client/locales.ts';
import {
  createSweepApi,
  installSweeper,
  type SweepApi,
  SweepButton,
  SweepPanel,
  triggerStyle,
} from '../src/client/sweeper.tsx';
import type { Context } from '../src/types.ts';
import { makeClientCtx } from './helpers.ts';

/** 用字典与 `{name}` 模板参数构造翻译函数，行为与宿主 locale 座一致。 */
function translate(dict: Record<string, string> = {}): TranslateNS<typeof NS> {
  return (key, params) =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) =>
      String(params?.[name] ?? ''),
    );
}

/** 构造清理 API 的假实现。 */
function makeApi(overrides: Partial<SweepApi> = {}): SweepApi {
  return {
    overview: () => ({ unpinned: 1, archived: 2, ready: true }),
    subscribe: () => () => undefined,
    sweep: async () => ({ archived: 0, deleted: 0, skipped: 0, deferred: 0, failed: 0 }),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('清理会话按钮', () => {
  it('注册到侧栏底部动作槽位，并使用规定的 id、顺序与命名空间', () => {
    const ctx = makeClientCtx();
    installSweeper(ctx);

    expect(ctx._slotInjections).toEqual(['sidebar.footer.action']);
    const registration = ctx._slotRegistrations[0];
    expect(registration?.options).toMatchObject({
      name: 'sidebar.footer.action',
      id: 'session-sweeper',
      order: 50,
      locale: NS,
    });
    expect(registration?.component).toBe(SweepButton);

    const inject = registration?.options.inject as () => { api: SweepApi };
    const { api } = inject();
    expect(typeof api.overview).toBe('function');
    expect(typeof api.subscribe).toBe('function');
    expect(typeof api.sweep).toBe('function');
  });

  it('渲染扫帚图标按钮，标题取自注入的翻译座', () => {
    const html = renderToStaticMarkup(
      createElement(SweepButton, { t: translate(), api: makeApi() }),
    );

    expect(html).toContain('data-dsh-part="entry"');
    expect(html).toContain('aria-label="action.label"');
    expect(html).toContain('title="action.label"');
    expect(html).toContain('<svg');
    expect(html).not.toContain('role="menu"');
  });

  it('悬停背景从 transparent 变为 12% 强调色混合，尺寸与重启按钮一致', () => {
    const base = triggerStyle(false);
    const hover = triggerStyle(true);

    expect(base).toMatchObject({
      width: 36,
      height: 36,
      borderRadius: '50%',
      border: 'none',
      background: 'transparent',
      color: 'var(--dsw-alias-label-secondary)',
    });
    expect(hover.background).toBe(
      'color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent)',
    );
    expect(hover.color).toBe('var(--dsw-alias-label-secondary)');
  });
});

describe('清理会话面板', () => {
  it('Workspace 分组未就绪时显示 count.waiting 并禁用清理按钮', () => {
    const t = vi.fn(translate());
    const html = renderToStaticMarkup(
      createElement(SweepPanel, {
        t,
        api: makeApi({ overview: () => ({ unpinned: 3, archived: 2, ready: false }) }),
        anchor: { left: 12, bottom: 48 },
        onClose: () => undefined,
      }),
    );

    expect(html).toContain('count.waiting');
    expect(t).toHaveBeenCalledWith('count.waiting');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>run<\/button>/);
  });

  it('就绪时显示未置顶与已归档计数', () => {
    const html = renderToStaticMarkup(
      createElement(SweepPanel, {
        t: translate({ count: '{unpinned} unpinned · {archived} archived' }),
        api: makeApi({ overview: () => ({ unpinned: 3, archived: 2, ready: true }) }),
        anchor: { left: 12, bottom: 48 },
        onClose: () => undefined,
      }),
    );

    expect(html).toContain('3 unpinned · 2 archived');
    expect(html).toContain('hint');
    expect(html).not.toContain('count.waiting');
  });
});

describe('清理 API', () => {
  /** 建立一个 Workspace 与 Session 快照都就绪的客户端 ctx。 */
  function readyCtx(phase = 'ready'): Context {
    const snapshot = {
      phase,
      pinnedSessionIds: ['pinned'],
      archivedSessionIds: ['old'],
      items: [{ sessionIds: ['s1', 's2'] }],
    };
    const sessions = {
      getSnapshot: () => ({
        ids: ['s1', 's2', 'pinned', 'old', 'sub'],
        byId: {
          s1: { retainedBy: { mainView: 1 } },
          s2: {},
          pinned: {},
          old: {},
          sub: { origin: 'subagent' },
        },
      }),
    };
    return {
      get: (name: string) => (name === 'sessions' ? sessions : undefined),
      workspaces: {
        list: {
          getSnapshot: () => snapshot,
          subscribe: () => () => undefined,
        },
      },
    } as unknown as Context;
  }

  it('只提交未置顶且未被主视图持有的普通会话，并记录已删除 id', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            archived: 1,
            deleted: 1,
            skipped: 0,
            deferred: 0,
            failed: 0,
            deletedIds: ['s2'],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = createSweepApi(readyCtx());

    const result = await api.sweep();

    expect(result).toEqual({ archived: 1, deleted: 1, skipped: 0, deferred: 0, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe('api/dsh-practical-tools/sweep');
    expect(call?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const init = call?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ ids: ['s2'], keepIds: ['s1'] });
    // s2 已删除，overview 不再把它算作待清理；old 仍归档，pinned 与 subagent 不计数。
    expect(api.overview()).toEqual({ unpinned: 1, archived: 1, ready: true });
  });

  it('Workspace 快照未就绪时拒绝清理且不发请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const api = createSweepApi(readyCtx('loading'));

    expect(await api.sweep()).toEqual({ blocked: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

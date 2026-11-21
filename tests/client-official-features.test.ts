// 官方功能开关面板测试：槽位注册、文案键集、切换后等待状态、面板状态、错误码与渲染。
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { en, NS, type PracticalToolKey, zh } from '../src/client/locales.ts';
import {
  defaultFeaturesApi,
  errorKey,
  type FeatureRow,
  type FeaturesApi,
  FeaturesBody,
  FeaturesError,
  FeaturesView,
  type FeaturesViewProps,
  installOfficialFeatures,
  OfficialFeaturesPanel,
  type OfficialFeaturesPanelProps,
  panelState,
  ROW_CONFIG_KEY,
  toggleAndSettle,
} from '../src/client/official-features.tsx';
import { PLUGIN_NAME, ROW_IDS } from '../src/rows.ts';
import { makeClientCtx } from './helpers.ts';

/** 固定六行状态。 */
const ROWS: FeatureRow[] = [
  { id: 'schedule', on: true },
  { id: 'goal', on: true },
  { id: 'task', on: false },
  { id: 'plan', on: true },
  { id: 'present', on: true },
];

/** 用真实中文字典回答键。 */
function translate(key: string, params?: Record<string, unknown>): string {
  const template = (zh as Record<string, string>)[key] ?? key;
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}

/** 渲染用的翻译座。 */
const t = translate as OfficialFeaturesPanelProps['t'];

/** 造一个可控接口。 */
function makeApi(
  options: {
    rows?: FeatureRow[];
    toggleError?: unknown;
    neverSettles?: boolean;
    postRows?: FeatureRow[];
  } = {},
) {
  let rows = options.rows ?? ROWS;
  const reads: number[] = [];
  let toggles = 0;
  const api: FeaturesApi = {
    read: async () => {
      reads.push(1);
      return { ok: true, features: rows, busy: false };
    },
    toggle: async (id, enabled) => {
      toggles += 1;
      if (options.toggleError !== undefined) throw options.toggleError;
      if (options.neverSettles !== true) {
        rows = rows.map((row) => (row.id === id ? { ...row, on: enabled } : row));
      }
      if (options.postRows !== undefined) rows = options.postRows;
      return { ok: true, features: rows, busy: false };
    },
  };
  return { api, reads, toggles: () => toggles };
}

describe('字典', () => {
  it('中英文键集一致，且覆盖五个功能的名称与说明', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    for (const id of ['schedule', 'goal', 'task', 'plan', 'present']) {
      for (const prefix of ['officialFeatures.feature', 'officialFeatures.detail']) {
        expect(zh[`${prefix}.${id}` as PracticalToolKey]).toBeTruthy();
        expect(en[`${prefix}.${id}` as PracticalToolKey]).toBeTruthy();
      }
    }
  });
});

describe('installOfficialFeatures', () => {
  it('注册到 plugins.row.config，键由包名与行 id 组成', () => {
    const ctx = makeClientCtx({ services: ['slots', 'locale'] });
    installOfficialFeatures(ctx as never);
    expect(ctx._slotInjections).toContain('plugins.row.config');
    const registration = ctx._slotRegistrations.at(-1);
    expect(registration?.options).toMatchObject({
      name: 'plugins.row.config',
      key: ROW_CONFIG_KEY,
      locale: NS,
    });
    expect(ROW_CONFIG_KEY).toBe(`${PLUGIN_NAME}#${ROW_IDS.officialFeatures}`);
    expect(registration?.component).toBe(OfficialFeaturesPanel);
  });

  it('注册随 fiber 释放', () => {
    const ctx = makeClientCtx({ services: ['slots', 'locale'] });
    installOfficialFeatures(ctx as never);
    expect(ctx._activeSlots.size).toBe(1);
    ctx._dispose();
    expect(ctx._activeSlots.size).toBe(0);
  });
});

describe('面板渲染', () => {
  /** 渲染展示组件，未给出的属性取默认值。 */
  function view(props: Partial<FeaturesViewProps> = {}): string {
    return renderToStaticMarkup(
      createElement(FeaturesView, {
        t,
        rows: null,
        loadFailed: false,
        busy: false,
        error: null,
        onToggle: () => undefined,
        onRetry: () => undefined,
        ...props,
      }),
    );
  }

  it('摘要视图只渲染一行说明', () => {
    const markup = renderToStaticMarkup(
      createElement(OfficialFeaturesPanel, { t, view: 'summary' }),
    );
    expect(markup).toContain(zh['officialFeatures.summary']);
    expect(markup).not.toContain(zh['officialFeatures.hint']);
  });

  it('页面视图首次读取前显示加载中，不重复行标题', () => {
    const markup = renderToStaticMarkup(createElement(FeaturesBody, { t, api: makeApi().api }));
    expect(markup).toContain(zh['officialFeatures.loading']);
    expect(markup).not.toContain(zh['officialFeatures.title']);
  });

  it('读取失败且没有已知状态时显示失败与重试', () => {
    const markup = view({ loadFailed: true });
    expect(markup).toContain(zh['officialFeatures.loadFailed']);
    expect(markup).toContain(zh['officialFeatures.retry']);
    expect(markup).not.toContain(zh['officialFeatures.loading']);
  });

  it('已有状态时每行显示功能名、关闭说明与开关', () => {
    const markup = view({ rows: ROWS, loadFailed: true });
    for (const row of ROWS) {
      expect(markup).toContain(zh[`officialFeatures.feature.${row.id}` as PracticalToolKey]);
      expect(markup).toContain(zh[`officialFeatures.detail.${row.id}` as PracticalToolKey]);
    }
    expect(markup.match(/role="switch"/g)).toHaveLength(ROWS.length);
    expect(markup).not.toContain(zh['officialFeatures.loadFailed']);
  });

  it('切换失败时显示错误码对应的文案与重试', () => {
    const markup = view({ rows: ROWS, error: 'officialFeatures.error.apply' });
    expect(markup).toContain(zh['officialFeatures.error.apply']);
    expect(markup).toContain(zh['officialFeatures.retry']);
  });
});

describe('面板状态与错误码', () => {
  it('panelState 区分加载中、读取失败与已就绪', () => {
    expect(panelState(null, false)).toBe('loading');
    expect(panelState(null, true)).toBe('failed');
    expect(panelState(ROWS, true)).toBe('ready');
  });

  it('errorKey 按错误码选择文案，未知值与网络失败用通用文案', () => {
    expect(errorKey('store-failed')).toBe('officialFeatures.error.store');
    expect(errorKey('apply-failed')).toBe('officialFeatures.error.apply');
    expect(errorKey('invalid-request')).toBe('officialFeatures.error.unknown');
    expect(errorKey(undefined)).toBe('officialFeatures.error.unknown');
  });

  it('路由失败时抛出带错误码的 FeaturesError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { ok: false, error: 'apply-failed', message: 'loader unavailable' },
          { status: 500 },
        ),
      ),
    );
    try {
      const failure = await defaultFeaturesApi
        .toggle('goal', false)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(FeaturesError);
      expect((failure as FeaturesError).code).toBe('apply-failed');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('toggleAndSettle', () => {
  it('切换后等到真实状态一致', async () => {
    const { api } = makeApi();
    const outcome = await toggleAndSettle(api, 'task', true, { timeoutMs: 50 });
    expect(outcome.settled).toBe(true);
    expect(outcome.rows?.find((row) => row.id === 'task')?.on).toBe(true);
  });

  it('状态没有变化时按时限返回未一致，并带上最近一次状态', async () => {
    const { api } = makeApi({ neverSettles: true });
    const sleeps: number[] = [];
    const outcome = await toggleAndSettle(api, 'task', true, {
      timeoutMs: 30,
      intervalMs: 10,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      now: () => sleeps.length * 10,
    });
    expect(outcome.settled).toBe(false);
    expect(outcome.rows?.find((row) => row.id === 'task')?.on).toBe(false);
    expect(sleeps.length).toBeGreaterThan(0);
  });

  it('接口报错时抛出，交给调用者显示', async () => {
    const { api } = makeApi({ toggleError: new Error('store-failed') });
    await expect(toggleAndSettle(api, 'goal', false)).rejects.toThrow('store-failed');
  });

  it('使用接口返回的行作为首次结果，避免多余重读', async () => {
    const { api, reads } = makeApi();
    await toggleAndSettle(api, 'goal', false, { timeoutMs: 50 });
    expect(reads).toHaveLength(0);
  });

  it('接口没有返回行时重读一次拿状态', async () => {
    const { api, reads } = makeApi();
    const wrapped: FeaturesApi = {
      read: api.read,
      toggle: async () => {
        await api.toggle('goal', false);
        return { ok: true, features: undefined };
      },
    };
    const outcome = await toggleAndSettle(wrapped, 'goal', false, { timeoutMs: 50 });
    expect(reads.length).toBeGreaterThan(0);
    expect(outcome.rows?.find((row) => row.id === 'goal')?.on).toBe(false);
  });
});

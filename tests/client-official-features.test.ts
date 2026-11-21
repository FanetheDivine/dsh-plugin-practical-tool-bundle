// 管理官方功能面板测试：槽位注册、文案键集、切换后等待状态、失败回退与渲染。
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { en, NS, type PracticalToolKey, zh } from '../src/client/locales.ts';
import {
  type FeatureRow,
  type FeaturesApi,
  FeaturesBody,
  installOfficialFeatures,
  OfficialFeaturesPanel,
  type OfficialFeaturesPanelProps,
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
  it('中英文键集一致，且覆盖五个功能名', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    const keys = Object.keys(zh) as PracticalToolKey[];
    expect(keys).toEqual(expect.arrayContaining(['officialFeatures.title']));
    for (const id of ['schedule', 'goal', 'task', 'plan', 'present']) {
      expect(zh[`officialFeatures.feature.${id}` as PracticalToolKey]).toBeTruthy();
      expect(en[`officialFeatures.feature.${id}` as PracticalToolKey]).toBeTruthy();
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
  it('摘要视图只渲染一行说明', () => {
    const markup = renderToStaticMarkup(
      createElement(OfficialFeaturesPanel, { t, view: 'summary' }),
    );
    expect(markup).toContain(zh['officialFeatures.summary']);
    expect(markup).not.toContain(zh['officialFeatures.title']);
  });

  it('页面视图在没有状态时说明宿主没有提供', () => {
    const markup = renderToStaticMarkup(createElement(FeaturesBody, { t, api: makeApi().api }));
    expect(markup).toContain(zh['officialFeatures.title']);
    expect(markup).toContain(zh['officialFeatures.unavailable']);
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

describe('FeaturesBody 的失败路径', () => {
  it('切换失败时把错误信息放进面板', async () => {
    const { api } = makeApi({ toggleError: new Error('apply-failed: loader rejected') });
    expect(api).toBeDefined();
    await expect(toggleAndSettle(api, 'present', false)).rejects.toThrow('loader rejected');
  });
});

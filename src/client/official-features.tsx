/**
 * 官方功能开关面板：五个功能各一行，含说明与开关，状态取自宿主路由。
 * 导出 installOfficialFeatures、OfficialFeaturesPanel 与纯展示组件 FeaturesView；文案由槽位注入的 t 提供。
 */
import type { Context } from '@deepseek-ai/cordis';
// Type-only：拉取 plugins.row.config 槽位声明与其 owner props。
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
// Type-only：拉取 ctx.slots 服务。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { OFFICIAL_FEATURES_PATH, PLUGIN_NAME, ROW_IDS } from '../rows.ts';
import { NS, type PracticalToolKey } from './locales.ts';

/** 路由相对页面基路径的写法。 */
const FEATURES_API = OFFICIAL_FEATURES_PATH.replace(/^\//, '');

/** 面板轮询状态路由的间隔。 */
const WATCH_INTERVAL = 3000;

/** 切换后等待状态一致的上限。 */
const SETTLE_TIMEOUT = 2000;

/** 等待期间的重读间隔。 */
const SETTLE_POLL = 300;

/** 面板里的一行。 */
export interface FeatureRow {
  readonly id: string;
  readonly on: boolean;
}

/** 路由回答。 */
interface FeaturesPayload {
  readonly ok?: boolean;
  readonly features?: FeatureRow[] | null;
  readonly busy?: boolean;
  readonly error?: string;
  readonly message?: string;
}

/** 面板对外的读写接口，测试可替换。 */
export interface FeaturesApi {
  read(): Promise<FeaturesPayload>;
  toggle(id: string, enabled: boolean): Promise<FeaturesPayload>;
}

/** 功能名的字典键。 */
const LABEL_KEY: Readonly<Record<string, PracticalToolKey>> = {
  schedule: 'officialFeatures.feature.schedule',
  goal: 'officialFeatures.feature.goal',
  task: 'officialFeatures.feature.task',
  plan: 'officialFeatures.feature.plan',
  present: 'officialFeatures.feature.present',
};

/** 功能关闭后果说明的字典键。 */
const DETAIL_KEY: Readonly<Record<string, PracticalToolKey>> = {
  schedule: 'officialFeatures.detail.schedule',
  goal: 'officialFeatures.detail.goal',
  task: 'officialFeatures.detail.task',
  plan: 'officialFeatures.detail.plan',
  present: 'officialFeatures.detail.present',
};

/** 路由错误码到文案键；未列出的值用通用文案。 */
const ERROR_KEY: Readonly<Record<string, PracticalToolKey>> = {
  'store-failed': 'officialFeatures.error.store',
  'apply-failed': 'officialFeatures.error.apply',
};

/**
 * 切换失败时显示的文案键。
 * @param code - 路由返回的错误码；网络失败时为 undefined。
 */
export function errorKey(code: string | undefined): PracticalToolKey {
  return (code === undefined ? undefined : ERROR_KEY[code]) ?? 'officialFeatures.error.unknown';
}

/** 面板的三种显示状态。 */
export type PanelState = 'loading' | 'failed' | 'ready';

/**
 * 按已知状态与读取结果决定面板显示。
 * 已有状态时单次读取失败保持当前显示。
 * @param rows - 已知的功能状态。
 * @param loadFailed - 最近一次读取是否失败。
 */
export function panelState(rows: FeatureRow[] | null, loadFailed: boolean): PanelState {
  if (rows !== null) return 'ready';
  return loadFailed ? 'failed' : 'loading';
}

/** 路由失败时抛出的错误，携带错误码。 */
export class FeaturesError extends Error {
  /** 路由返回的错误码；网络或解析失败时为 undefined。 */
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'FeaturesError';
    this.code = code;
  }
}

/** 面板属性：页面视图与文案座。 */
export interface OfficialFeaturesPanelProps extends PluginConfigViewProps {
  readonly t: TranslateNS<typeof NS>;
}

/** 同源请求：读状态或切换。 */
async function request(url: string, init?: RequestInit): Promise<FeaturesPayload> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
  });
  const payload = (await response.json().catch(() => null)) as FeaturesPayload | null;
  if (payload === null) throw new FeaturesError(`HTTP ${response.status}`);
  if (!response.ok || payload.ok === false) {
    throw new FeaturesError(payload.message ?? `HTTP ${response.status}`, payload.error);
  }
  return payload;
}

/** 默认接口实现。 */
export const defaultFeaturesApi: FeaturesApi = {
  read: () => request(FEATURES_API),
  toggle: (id, enabled) =>
    request(FEATURES_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, enabled }),
    }),
};

/** 延迟。 */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 一次切换的结果。 */
export interface ToggleOutcome {
  /** 最近一次读到的行；接口没有给出行时为 `null`。 */
  readonly rows: FeatureRow[] | null;
  /** 时限内真实状态是否已与目标一致。 */
  readonly settled: boolean;
}

/** 切换并等待的选项，测试可缩短时限。 */
export interface ToggleOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/**
 * 切换一个功能，并轮询到真实状态与目标一致或超出时限。
 * 切换请求失败时抛出，由调用者显示错误。
 * @param api - 面板接口。
 * @param id - 功能标识。
 * @param enabled - 目标状态。
 * @param options - 时限与延迟，测试可注入。
 * @returns 最近一次行状态与是否已一致。
 */
export async function toggleAndSettle(
  api: FeaturesApi,
  id: string,
  enabled: boolean,
  options: ToggleOptions = {},
): Promise<ToggleOutcome> {
  const timeoutMs = options.timeoutMs ?? SETTLE_TIMEOUT;
  const intervalMs = options.intervalMs ?? SETTLE_POLL;
  const wait = options.sleep ?? sleep;
  const now = options.now ?? Date.now;

  const payload = await api.toggle(id, enabled);
  let rows = Array.isArray(payload.features) ? payload.features : null;
  const matches = (list: FeatureRow[] | null) =>
    list?.find((item) => item.id === id)?.on === enabled;
  if (matches(rows)) return { rows, settled: true };

  const deadline = now() + timeoutMs;
  for (;;) {
    if (now() >= deadline) return { rows, settled: false };
    await wait(intervalMs);
    const current = await api.read();
    if (Array.isArray(current.features)) rows = current.features;
    if (matches(rows)) return { rows, settled: true };
  }
}

/** 一行：功能名、关闭后果说明与开关。 */
function FeatureSwitch({
  row,
  t,
  busy,
  onToggle,
}: {
  row: FeatureRow;
  t: TranslateNS<typeof NS>;
  busy: boolean;
  onToggle(id: string, enabled: boolean): void;
}) {
  const label = t(LABEL_KEY[row.id] ?? 'officialFeatures.title');
  const detailKey = DETAIL_KEY[row.id];
  return (
    <div style={styles.row}>
      <div style={styles.text}>
        <span style={styles.label}>{label}</span>
        {detailKey === undefined ? null : <span style={styles.detail}>{t(detailKey)}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={row.on}
        aria-label={label}
        disabled={busy}
        onClick={() => onToggle(row.id, !row.on)}
        style={{ ...styles.switch, ...(row.on ? styles.switchOn : styles.switchOff) }}
      >
        <span style={{ ...styles.knob, ...(row.on ? styles.knobOn : {}) }} />
      </button>
    </div>
  );
}

/** 面板：列出五个功能，切换后等待真实状态。 */
export function OfficialFeaturesPanel({
  t,
  view,
  api = defaultFeaturesApi,
}: OfficialFeaturesPanelProps & { readonly api?: FeaturesApi }) {
  if (view === 'summary') return <span>{t('officialFeatures.summary')}</span>;
  return <FeaturesBody t={t} api={api} />;
}

/** 面板主体：读取与切换状态，交给 {@link FeaturesView} 渲染。 */
export function FeaturesBody({
  t,
  api = defaultFeaturesApi,
}: {
  t: TranslateNS<typeof NS>;
  api?: FeaturesApi;
}) {
  const [rows, setRows] = useState<FeatureRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PracticalToolKey | null>(null);
  const live = useRef(true);

  /** 读一次状态；已有状态时单次失败保持当前显示。 */
  const refresh = useCallback(async () => {
    try {
      const payload = await api.read();
      if (!live.current) return;
      if (Array.isArray(payload.features)) {
        setRows(payload.features);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    } catch {
      if (live.current) setLoadFailed(true);
    }
  }, [api]);

  useEffect(() => {
    live.current = true;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, WATCH_INTERVAL);
    const eager = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    document.addEventListener('visibilitychange', eager);
    window.addEventListener('focus', eager);
    return () => {
      live.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', eager);
      window.removeEventListener('focus', eager);
    };
  }, [refresh]);

  /** 切换一个功能，并在时限内等到真实状态。 */
  const onToggle = useCallback(
    async (id: string, enabled: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const outcome = await toggleAndSettle(api, id, enabled);
        if (!live.current) return;
        if (outcome.rows !== null) setRows(outcome.rows);
      } catch (failure) {
        if (!live.current) return;
        setError(errorKey(failure instanceof FeaturesError ? failure.code : undefined));
        await refresh();
      } finally {
        if (live.current) setBusy(false);
      }
    },
    [api, refresh],
  );

  /** 重试只重读真实状态。 */
  const onRetry = useCallback(async () => {
    setError(null);
    await refresh();
  }, [refresh]);

  return (
    <FeaturesView
      t={t}
      rows={rows}
      loadFailed={loadFailed}
      busy={busy}
      error={error}
      onToggle={(id, enabled) => void onToggle(id, enabled)}
      onRetry={() => void onRetry()}
    />
  );
}

/** 展示组件的属性。 */
export interface FeaturesViewProps {
  readonly t: TranslateNS<typeof NS>;
  readonly rows: FeatureRow[] | null;
  readonly loadFailed: boolean;
  readonly busy: boolean;
  /** 切换失败的文案键；没有失败时为 null。 */
  readonly error: PracticalToolKey | null;
  onToggle(id: string, enabled: boolean): void;
  onRetry(): void;
}

/** 纯展示：提示、加载中或读取失败、五行开关、切换中与切换失败。 */
export function FeaturesView({
  t,
  rows,
  loadFailed,
  busy,
  error,
  onToggle,
  onRetry,
}: FeaturesViewProps) {
  const state = panelState(rows, loadFailed);
  const retry = (
    <button type="button" style={styles.retry} onClick={onRetry}>
      {t('officialFeatures.retry')}
    </button>
  );
  return (
    <div style={styles.panel}>
      <div style={styles.hint}>{t('officialFeatures.hint')}</div>
      {state === 'loading' ? <div style={styles.hint}>{t('officialFeatures.loading')}</div> : null}
      {state === 'failed' ? (
        <div style={styles.error}>
          {t('officialFeatures.loadFailed')}
          {retry}
        </div>
      ) : null}
      {rows === null
        ? null
        : rows.map((row) => (
            <FeatureSwitch key={row.id} row={row} t={t} busy={busy} onToggle={onToggle} />
          ))}
      {busy ? <div style={styles.hint}>{t('officialFeatures.busy')}</div> : null}
      {error === null ? null : (
        <div style={styles.error}>
          {t(error)}
          {retry}
        </div>
      )}
    </div>
  );
}

/** 面板样式。 */
const styles = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '4px 0 8px',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 13,
  } as CSSProperties,
  hint: {
    color: 'var(--dsw-alias-label-secondary)',
    lineHeight: 1.6,
  } as CSSProperties,
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '6px 0',
    borderTop: '1px solid var(--dsw-alias-border-l1)',
  } as CSSProperties,
  text: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  } as CSSProperties,
  label: {
    lineHeight: 1.5,
  } as CSSProperties,
  detail: {
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: 12,
    lineHeight: 1.5,
  } as CSSProperties,
  switch: {
    position: 'relative',
    flex: 'none',
    width: 36,
    height: 20,
    border: 'none',
    borderRadius: 999,
    padding: 0,
    cursor: 'pointer',
    transition: 'background-color 120ms ease',
  } as CSSProperties,
  switchOn: {
    background: 'var(--dsw-alias-state-success-primary, var(--dsw-alias-label-primary))',
  } as CSSProperties,
  switchOff: {
    background: 'var(--dsw-alias-border-l1)',
  } as CSSProperties,
  knob: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: 'var(--dsw-alias-bg-layer-1)',
    transition: 'transform 120ms ease',
  } as CSSProperties,
  knobOn: {
    transform: 'translateX(16px)',
  } as CSSProperties,
  error: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--dsw-alias-state-error-primary)',
    lineHeight: 1.55,
    wordBreak: 'break-word',
  } as CSSProperties,
  retry: {
    flex: 'none',
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    borderRadius: 8,
    padding: '2px 8px',
    font: 'inherit',
    cursor: 'pointer',
  } as CSSProperties,
};

/** 槽位键：本包 `official-features` 行的配置页。 */
export const ROW_CONFIG_KEY = `${PLUGIN_NAME}#${ROW_IDS.officialFeatures}`;

/**
 * 把面板注册到 Plugins 页的行配置槽位。
 * 行停用时注册随 fiber 释放，入口随之消失。
 * @param ctx - 前端上下文。
 */
export function installOfficialFeatures(ctx: Context): void {
  ctx.effect(
    () =>
      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register(
          { name: 'plugins.row.config', key: ROW_CONFIG_KEY, locale: NS },
          OfficialFeaturesPanel,
        ),
      ),
    'official-features: row config',
  );
}

/**
 * 管理官方功能面板：五个功能各一行加一个开关，状态取自宿主路由。
 * 导出 installOfficialFeatures 与 OfficialFeaturesPanel；文案由槽位注入的 t 提供。
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
  if (payload === null) throw new Error(`HTTP ${response.status}`);
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message ?? payload.error ?? `HTTP ${response.status}`);
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

/** 一行：功能名与开关。 */
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
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
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

/** 面板主体；单独导出以便测试直接渲染。 */
export function FeaturesBody({
  t,
  api = defaultFeaturesApi,
}: {
  t: TranslateNS<typeof NS>;
  api?: FeaturesApi;
}) {
  const [rows, setRows] = useState<FeatureRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);

  /** 读一次状态；取不到结论时保持当前显示。 */
  const refresh = useCallback(async () => {
    try {
      const payload = await api.read();
      if (!live.current) return;
      if (Array.isArray(payload.features)) setRows(payload.features);
    } catch {
      // 单次失败保持现状，等下一次轮询。
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
        setError(failure instanceof Error ? failure.message : String(failure));
        await refresh();
      } finally {
        if (live.current) setBusy(false);
      }
    },
    [api, refresh],
  );

  return (
    <div style={styles.panel}>
      <div style={styles.title}>{t('officialFeatures.title')}</div>
      <div style={styles.hint}>{t('officialFeatures.hint')}</div>
      {rows === null ? <div style={styles.hint}>{t('officialFeatures.unavailable')}</div> : null}
      {rows === null
        ? null
        : rows.map((row) => (
            <FeatureSwitch key={row.id} row={row} t={t} busy={busy} onToggle={onToggle} />
          ))}
      {busy ? <div style={styles.hint}>{t('officialFeatures.busy')}</div> : null}
      {error === null ? null : (
        <div style={styles.error}>
          {t('officialFeatures.failed', { message: error })}
          <button type="button" style={styles.retry} onClick={() => void onToggleRetry()}>
            {t('officialFeatures.retry')}
          </button>
        </div>
      )}
    </div>
  );

  /** 重试只重读真实状态。 */
  async function onToggleRetry() {
    setError(null);
    await refresh();
  }
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
  title: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.4,
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
  label: {
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

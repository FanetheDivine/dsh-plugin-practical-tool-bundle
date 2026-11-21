/**
 * 重启按钮：侧栏页脚触发器、确认对话框与重启进度遮罩。
 * 导出 installRestart、按钮组件与可测的阶段迁移、文案键与请求函数。
 */
import type { Context } from '@deepseek-ai/cordis';
// Type-only：拉取 ctx.slots 服务。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
// Type-only：拉取 sidebar.footer.action 槽位声明与其 owner props。
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import {
  type CSSProperties,
  Fragment,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';

import { NS, type PracticalToolKey } from './locales.ts';

/** 重启信息路由，相对页面基路径。 */
const INFO_API = 'api/dsh-practical-tools/restart/info';

/** 重启动作路由，相对页面基路径。 */
const RESTART_API = 'api/dsh-practical-tools/restart';

/** 网页场景等待多久切到慢速提示。 */
const SLOW_AFTER_WEB = 45_000;

/** 桌面场景等待多久切到慢速提示。 */
const SLOW_AFTER_DESKTOP = 20_000;

/** 按钮与遮罩的阶段。 */
export type RestartPhase = 'idle' | 'confirm' | 'restarting' | 'slow' | 'failed';

/** 阶段迁移动作。 */
export type RestartAction =
  | { readonly type: 'open' }
  | { readonly type: 'cancel' }
  | { readonly type: 'accept' }
  | { readonly type: 'slow' }
  | { readonly type: 'fail' }
  | { readonly type: 'reset' };

/** 对话框出口：确认发起重启，取消只关闭。 */
export type DialogChoice = 'cancel' | 'confirm';

/** 页面所在运行形态；桌面外壳用 dsh-app: 协议提供页面。 */
export type RestartRuntime = 'desktop' | 'web';

/** 重启接口的回答。 */
export interface RestartPayload {
  readonly ok?: boolean;
  readonly error?: string;
  readonly pid?: number | null;
  readonly startedAt?: number | null;
  readonly logPath?: string | null;
  readonly runtime?: string;
}

/** 重启请求的可替换实现。 */
export type RestartRequest = (url: string, method: 'GET' | 'POST') => Promise<RestartPayload>;

/** 按钮组件 props：槽位注入的栏宽状态与框架绑定的翻译座。 */
export interface RestartButtonProps extends SidebarFooterActionOwnerProps {
  /** 本命名空间的翻译函数。 */
  readonly t: TranslateNS<typeof NS>;
}

/** 对话框按钮对应的动作；组件与测试共用这一份映射。 */
export function dialogChoiceAction(choice: DialogChoice): RestartAction {
  return choice === 'confirm' ? { type: 'accept' } : { type: 'cancel' };
}

/** 纯阶段迁移：重启中忽略取消，其余动作按阶段收敛。 */
export function transitionPhase(phase: RestartPhase, action: RestartAction): RestartPhase {
  switch (action.type) {
    case 'open':
      return phase === 'idle' ? 'confirm' : phase;
    case 'cancel':
      return phase === 'restarting' ? phase : 'idle';
    case 'accept':
      return 'restarting';
    case 'slow':
      return 'slow';
    case 'fail':
      return 'failed';
    case 'reset':
      return 'idle';
  }
}

/** 对话框是否可见。 */
export function dialogVisible(phase: RestartPhase): boolean {
  return phase === 'confirm' || phase === 'failed';
}

/** 对话框标题键：失败、桌面确认与网页确认三种。 */
export function dialogTitleKey(phase: RestartPhase, desktop: boolean): PracticalToolKey {
  if (phase === 'failed') return 'restart.failedTitle';
  return desktop ? 'restart.desktopConfirmTitle' : 'restart.confirmTitle';
}

/** 遮罩标题键：桌面与网页、重启中与超时各一套。 */
export function overlayTitleKey(phase: RestartPhase, desktop: boolean): PracticalToolKey {
  if (phase === 'slow') return desktop ? 'restart.desktopSlowTitle' : 'restart.slowTitle';
  return desktop ? 'restart.desktopRestarting' : 'restart.restarting';
}

/** 遮罩正文键。 */
export function overlayTextKey(phase: RestartPhase, desktop: boolean): PracticalToolKey {
  if (phase === 'slow') return desktop ? 'restart.desktopSlowText' : 'restart.slowText';
  return desktop ? 'restart.desktopRestartingHint' : 'restart.restartingHint';
}

/** 触发器样式：悬停时淡红底，其余保持透明。 */
export function triggerStyle(hover: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: hover
      ? 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)'
      : 'transparent',
    color: 'var(--dsw-alias-state-error-primary)',
    font: 'inherit',
    fontSize: 12,
    padding: 0,
    width: 36,
    height: 36,
    borderRadius: '50%',
    cursor: 'pointer',
    lineHeight: 1,
  };
}

/** 入口、对话框与遮罩的行内样式。 */
const styles = {
  entry: {
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
  } as CSSProperties,
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'color-mix(in srgb, var(--dsw-alias-bg-base) 58%, transparent)',
  } as CSSProperties,
  layer: {
    position: 'fixed',
    inset: 0,
    zIndex: 1001,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  } as CSSProperties,
  dialog: {
    width: 380,
    maxWidth: '90vw',
    boxSizing: 'border-box',
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 12,
    boxShadow: '0 16px 48px rgba(0,0,0,.35)',
    padding: '18px 20px',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 13,
    outline: 'none',
  } as CSSProperties,
  overlayCard: {
    width: 340,
    maxWidth: '90vw',
    boxSizing: 'border-box',
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 12,
    boxShadow: '0 16px 48px rgba(0,0,0,.35)',
    padding: '22px 20px',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: 13,
    textAlign: 'center',
    outline: 'none',
  } as CSSProperties,
  overlayIcon: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 10,
    color: 'var(--dsw-alias-state-error-primary)',
  } as CSSProperties,
  title: {
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.4,
    marginBottom: 6,
  } as CSSProperties,
  text: {
    color: 'var(--dsw-alias-label-secondary)',
    lineHeight: 1.6,
    marginBottom: 14,
  } as CSSProperties,
  error: {
    color: 'var(--dsw-alias-state-error-primary)',
    background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent)',
    borderRadius: 8,
    padding: '8px 10px',
    lineHeight: 1.55,
    marginBottom: 12,
    wordBreak: 'break-word',
  } as CSSProperties,
  mono: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 11,
    color: 'var(--dsw-alias-label-secondary)',
    lineHeight: 1.5,
    wordBreak: 'break-all',
    marginTop: 8,
  } as CSSProperties,
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  } as CSSProperties,
  button: {
    border: '1px solid var(--dsw-alias-border-l1)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    font: 'inherit',
    cursor: 'pointer',
  } as CSSProperties,
  danger: {
    border: '1px solid var(--dsw-alias-state-error-primary)',
    background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)',
    color: 'var(--dsw-alias-state-error-primary)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 600,
    font: 'inherit',
    cursor: 'pointer',
  } as CSSProperties,
};

/** 折叠栏把页脚动作排成纵向一列，手机断点把整块排到紧凑条目之前。 */
const RAIL_CSS = [
  '[data-sidebar-collapsed] [class*="footerActions"]:has(.dsrr-entry[data-rail="rail"]) {',
  '  flex-direction: column;',
  '  align-items: center;',
  '  gap: 4px;',
  '}',
  '@media (max-width: 767px) {',
  '  :root:not(:has([data-dsh-frame])) [class*="footerActions"] > [data-slot="sidebar.footer.action"] > :not([data-dsh-part="entry"]):not([class*="entryRow"]) {',
  '    order: 1;',
  '  }',
  '  :root:not(:has([data-dsh-frame])) [class*="footerActions"] > [data-slot="sidebar.footer.action"] > [data-dsh-part="entry"],',
  '  :root:not(:has([data-dsh-frame])) [class*="footerActions"] > [data-slot="sidebar.footer.action"] > [class*="entryRow"] {',
  '    order: 2;',
  '  }',
  '}',
].join('\n');

/** 取 JSON 的重启请求；传输失败与非 2xx 都抛出。 */
export async function restartRequest(url: string, method: 'GET' | 'POST'): Promise<RestartPayload> {
  const response = await fetch(url, { method, cache: 'no-store', credentials: 'same-origin' });
  const payload = (await response.json().catch(() => null)) as RestartPayload | null;
  if (!response.ok || payload === null || payload.ok === false) {
    throw new Error(
      payload !== null && typeof payload.error === 'string'
        ? payload.error
        : `HTTP ${response.status}`,
    );
  }
  return payload;
}

/** 读取本进程代次；页面据此判断是否已换成新进程。 */
export async function requestRestartInfo(
  request: RestartRequest = restartRequest,
): Promise<RestartPayload> {
  return request(INFO_API, 'GET');
}

/** 发起重启请求；组件与测试共用同一入口。 */
export async function requestRestart(
  request: RestartRequest = restartRequest,
): Promise<RestartPayload> {
  return request(RESTART_API, 'POST');
}

/** 圆形箭头图标；描边继承 currentColor。 */
function RestartIcon({ size = 16, spinning = false }: { size?: number; spinning?: boolean }) {
  const arrow = [
    <path key="arc" d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />,
    <path key="head" d="M20.5 4.5v5h-5" />,
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Restart</title>
      {spinning ? (
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="1.1s"
            repeatCount="indefinite"
          />
          {arrow}
        </g>
      ) : (
        arrow
      )}
    </svg>
  );
}

/** 页脚重启按钮：打开确认对话框，受理后显示进度并轮询新代次。 */
export function RestartButton({ wide, t }: RestartButtonProps) {
  // 桌面外壳用 dsh-app: 提供页面；这里的探测只覆盖首次请求回答之前。
  const [runtime, setRuntime] = useState<RestartRuntime>(() => {
    try {
      return window.location.protocol === 'dsh-app:' ? 'desktop' : 'web';
    } catch {
      return 'web';
    }
  });
  const desktop = runtime === 'desktop';
  const [phase, dispatch] = useReducer(transitionPhase, 'idle');
  const [error, setError] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  // 早于本功能的 Host 回答 /info 时没有 runtime：它只能重启自己，页面会失去窗口。
  const [stale, setStale] = useState(false);
  const [waited, setWaited] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const reloadRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const mounted = useRef(true);
  const previousPhase = useRef<RestartPhase>('idle');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (phase === 'confirm' || phase === 'failed') cancelRef.current?.focus();
    else if (phase === 'slow') reloadRef.current?.focus();
    else if (phase === 'restarting') overlayRef.current?.focus();
    else if (phase === 'idle' && previous !== 'idle') triggerRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (!desktop || phase !== 'confirm') return undefined;
    let cancelled = false;
    requestRestartInfo()
      .then((info) => {
        if (!cancelled && info.runtime !== 'desktop') setStale(true);
      })
      .catch(() => {
        // 取不到回答时按普通重启尝试。
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, phase]);

  const closeDialog = useCallback(() => {
    if (phase === 'restarting') return;
    dispatch(dialogChoiceAction('cancel'));
    setError(null);
  }, [phase]);

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
      return;
    }
    if (event.key !== 'Tab' || dialogRef.current === null) return;
    const nodes = [...dialogRef.current.querySelectorAll('button')].filter(
      (node) => !node.disabled,
    );
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const restart = async () => {
    dispatch(dialogChoiceAction('confirm'));
    setError(null);
    setWaited(0);
    let accepted: RestartPayload = { pid: null, startedAt: null };
    try {
      accepted = await requestRestart();
    } catch (failure) {
      if (!mounted.current) return;
      const message = failure instanceof Error ? failure.message : String(failure);
      if (!(failure instanceof TypeError)) {
        setError(message);
        dispatch({ type: 'fail' });
        return;
      }
      // 连接被断开不等于拒绝：旧进程可能在回答前退出（慢隧道或快速退出）。
      // 退出等待期后本源站仍有回答才报失败，否则继续等待新代次。
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (!mounted.current) return;
      let stillThere = false;
      try {
        await requestRestartInfo();
        stillThere = true;
      } catch {
        // 源站已消失，重启在进行中。
      }
      if (stillThere) {
        setError(message);
        dispatch({ type: 'fail' });
        return;
      }
    }
    if (typeof accepted.logPath === 'string') setLogPath(accepted.logPath);
    // Host 对运行形态有最终发言权；协议探测只覆盖首次请求回答之前。
    const mode: RestartRuntime =
      accepted.runtime === 'desktop' || accepted.runtime === 'web' ? accepted.runtime : runtime;
    if (mode !== runtime) setRuntime(mode);
    const desktopRun = mode === 'desktop';
    // 一直轮询到新代次回答：慢启动不能让页面停在死状态。
    const startedAt = Date.now();
    const slowAfter = desktopRun ? SLOW_AFTER_DESKTOP : SLOW_AFTER_WEB;
    let slow = false;
    while (mounted.current) {
      await new Promise((resolve) => setTimeout(resolve, slow ? 2000 : 500));
      if (!mounted.current) return;
      setWaited(Math.round((Date.now() - startedAt) / 1000));
      try {
        const info = await requestRestartInfo();
        if (
          accepted.pid === null ||
          info.startedAt !== accepted.startedAt ||
          info.pid !== accepted.pid
        ) {
          window.location.reload();
          return;
        }
      } catch {
        // 旧进程已退出，或新进程还没开始监听。
      }
      if (!slow && Date.now() - startedAt > slowAfter) {
        slow = true;
        dispatch({ type: 'slow' });
      }
    }
  };

  const label = t(desktop ? 'restart.desktopLabel' : 'restart.label');
  const showDialog = dialogVisible(phase);
  const showOverlay = phase === 'restarting' || phase === 'slow';
  const titleKey = dialogTitleKey(phase, desktop);

  return (
    <Fragment>
      <div
        className="dsrr-entry"
        style={styles.entry}
        data-dsh-part="entry"
        data-rail={wide ? undefined : 'rail'}
      >
        <button
          ref={triggerRef}
          type="button"
          style={triggerStyle(hover)}
          disabled={phase === 'restarting' || phase === 'slow'}
          onClick={() => dispatch({ type: 'open' })}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          title={label}
          aria-label={label}
          aria-haspopup="dialog"
        >
          <RestartIcon size={18} />
        </button>
      </div>

      {showDialog ? (
        <Fragment>
          <div style={styles.backdrop} onClick={closeDialog} aria-hidden />
          <div style={styles.layer}>
            <div
              ref={dialogRef}
              style={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-label={t(titleKey)}
              tabIndex={-1}
              onKeyDown={onDialogKeyDown}
            >
              <div style={styles.title}>{t(titleKey)}</div>
              {phase === 'failed' ? (
                <div style={styles.error}>{error ?? ''}</div>
              ) : (
                <div style={styles.text}>
                  {t(desktop ? 'restart.desktopConfirmText' : 'restart.confirmText')}
                </div>
              )}
              {stale && phase === 'confirm' ? (
                <div style={styles.error}>{t('restart.desktopStale')}</div>
              ) : null}
              {logPath === null ? null : (
                <div style={styles.mono}>{t('restart.log', { path: logPath })}</div>
              )}
              <div style={styles.actions}>
                <button ref={cancelRef} type="button" style={styles.button} onClick={closeDialog}>
                  {t(phase === 'failed' ? 'restart.close' : 'restart.cancel')}
                </button>
                <button
                  type="button"
                  style={
                    stale && phase === 'confirm'
                      ? { ...styles.danger, opacity: 0.5, cursor: 'not-allowed' }
                      : styles.danger
                  }
                  disabled={stale && phase === 'confirm'}
                  onClick={() => void restart()}
                >
                  {t(phase === 'failed' ? 'restart.retry' : 'restart.ok')}
                </button>
              </div>
            </div>
          </div>
        </Fragment>
      ) : null}

      {showOverlay ? (
        <Fragment>
          <div style={styles.backdrop} aria-hidden />
          <div
            ref={overlayRef}
            style={styles.layer}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-label={t(overlayTitleKey(phase, desktop))}
            onKeyDown={(event) => {
              if (event.key === 'Escape') event.preventDefault();
            }}
          >
            <div style={styles.overlayCard}>
              <div style={styles.overlayIcon}>
                <RestartIcon size={22} spinning={phase === 'restarting'} />
              </div>
              <div style={styles.title}>{t(overlayTitleKey(phase, desktop))}</div>
              <div style={styles.text}>
                {t(overlayTextKey(phase, desktop), { seconds: waited })}
              </div>
              {phase === 'slow' ? (
                <div style={styles.actions}>
                  <button
                    ref={reloadRef}
                    type="button"
                    style={styles.danger}
                    onClick={() => window.location.reload()}
                  >
                    {t('restart.reload')}
                  </button>
                </div>
              ) : null}
              {waited > 0 ? (
                <div style={styles.mono}>{t('restart.elapsed', { seconds: waited })}</div>
              ) : null}
              {logPath === null ? null : (
                <div style={styles.mono}>{t('restart.log', { path: logPath })}</div>
              )}
            </div>
          </div>
        </Fragment>
      ) : null}
    </Fragment>
  );
}

/** 挂载按钮与它依赖的 rail 样式。 */
export function installRestart(ctx: Context): void {
  ctx.effect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-plugin-css', 'dsh-plugin-practical-tool-bundle: restart rail');
    style.textContent = RAIL_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, 'dsh-plugin-practical-tool-bundle: restart rail');

  // 重启按钮紧挨清理会话，排在页脚动作的 51 位。
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      { name: 'sidebar.footer.action', id: 'restart-button', order: 51, locale: NS },
      RestartButton,
    ),
  );
}

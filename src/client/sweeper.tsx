/**
 * 侧栏清理会话界面：扫帚按钮、会话计数面板与两次点击确认。
 * 打开中的会话与它的祖先作为 keepIds 保护；文案由槽位注入的 t 提供。
 * 导出 installSweeper 与 SweepButton、SweepPanel、createSweepApi。
 */
import type { Context } from '@deepseek-ai/cordis';
// Type-only：拉取 ctx.slots 服务。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
// Type-only：拉取 sidebar.footer.action 槽位声明。
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { SWEEP_PATH } from '../rows.ts';
import { NS } from './locales.ts';

/** 清理路由相对页面基路径的写法。 */
const SWEEP_API = SWEEP_PATH.replace(/^\//, '');

/** 悬停背景：与重启按钮一致的 12% 强调色混合。 */
const HOVER_BACKGROUND = 'color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent)';

/** 视为「打开」的持有来源：主对话区、子代理聊天、右侧会话视图。 */
const PROTECTED_SOURCES = ['mainView', 'sidebarChat', 'sidebarView'] as const;

/** 面板锚点：视口坐标。 */
interface SweepAnchor {
  left: number;
  bottom: number;
}

/** 面板展示的清理前计数。 */
export interface SweepOverview {
  unpinned: number;
  archived: number;
  ready: boolean;
}

/** 清理结果：被阻塞、请求失败，或宿主给出的计数。 */
export type SweepOutcome =
  | { blocked: true }
  | { failed: -1 }
  | {
      archived: number;
      deleted: number;
      skipped: number;
      deferred: number;
      failed: number;
    };

/** 清理行对界面暴露的 API。 */
export interface SweepApi {
  overview(): SweepOverview;
  subscribe(listener: () => void): () => void;
  sweep(): Promise<SweepOutcome>;
}

/** 扫帚按钮的属性；文案座由槽位绑定。 */
export interface SweepButtonProps {
  t: TranslateNS<typeof NS>;
  api: SweepApi;
}

/** 面板的属性。 */
export interface SweepPanelProps {
  t: TranslateNS<typeof NS>;
  api: SweepApi;
  anchor: SweepAnchor;
  onClose(): void;
}

/** 宿主清理路由的回答。 */
interface SweepPayload {
  ok?: boolean;
  archived?: number;
  deleted?: number;
  skipped?: number;
  deferred?: number;
  failed?: number;
  deletedIds?: readonly string[];
}

/** 一条会话摘要的最小结构。 */
interface SessionSummaryLike {
  origin?: string;
  parentId?: string;
  retainedBy?: Partial<Record<string, number>>;
}

/** Session 列表快照的最小结构。 */
interface SessionListSnapshotLike {
  ids: readonly string[];
  byId: Readonly<Record<string, SessionSummaryLike | undefined>>;
}

/** 会话列表 store 的最小结构。 */
interface SessionListStoreLike {
  getSnapshot(): SessionListSnapshotLike;
  subscribe?(listener: () => void): () => void;
}

/** 会话服务的最小结构：列表挂在 `list` 上。 */
interface SessionsServiceLike {
  readonly list: SessionListStoreLike;
}

/** 一个 Workspace 的会话成员。 */
interface WorkspaceViewLike {
  sessionIds: readonly string[];
}

/** Workspace 列表快照的最小结构。 */
interface WorkspaceSnapshotLike {
  phase?: string;
  state?: string;
  pinnedSessionIds: readonly string[];
  archivedSessionIds: readonly string[];
  items: readonly WorkspaceViewLike[];
}

/** Workspace 列表 store 的最小结构。 */
interface WorkspaceListStoreLike {
  getSnapshot(): WorkspaceSnapshotLike;
  subscribe(listener: () => void): () => void;
}

/** Workspace 服务的最小结构。 */
interface WorkspacesServiceLike {
  list: WorkspaceListStoreLike;
}

/** 读取会话列表 store；服务缺失时返回 undefined。 */
function sessionListOf(ctx: Context): SessionListStoreLike | undefined {
  return (ctx.get('sessions') as SessionsServiceLike | undefined)?.list;
}

/** 读取 Workspace 服务。 */
function workspacesOf(ctx: Context): WorkspacesServiceLike {
  return (ctx as Context & { workspaces: WorkspacesServiceLike }).workspaces;
}

/** 列表首个快照是否就绪；0.2.2 客户端用 phase，更早的版本用 state。 */
function listReady(snapshot: WorkspaceSnapshotLike): boolean {
  return snapshot.phase === 'ready' || snapshot.state === 'ready';
}

/** 把清理结果或请求失败组合成一行文案。 */
function describeResult(t: TranslateNS<typeof NS>, result: SweepOutcome | null): string | null {
  if (result === null) return null;
  if ('blocked' in result) return t('result.notReady');
  if (!('archived' in result)) return t('result.error');
  const parts: string[] = [];
  if (result.archived > 0) parts.push(t('result.archived', { n: result.archived }));
  if (result.deleted > 0) parts.push(t('result.deleted', { n: result.deleted }));
  if (result.skipped > 0) parts.push(t('result.skipped', { n: result.skipped }));
  if (result.deferred > 0) parts.push(t('result.deferred', { n: result.deferred }));
  if (result.failed > 0) parts.push(t('result.failed', { n: result.failed }));
  if (parts.length === 0) return t('result.empty');
  return parts.join(' · ');
}

/** 手绘扫帚图标，描边继承 currentColor。 */
function BroomIcon(): ReactNode {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19.5 4.5 13 11" />
      <path d="M12.6 11.4c-2.3.3-4.3 1.5-5.7 3.3l2.4 2.4c1.8-1.4 3-3.4 3.3-5.7z" />
      <path d="M6.9 14.7 3.5 20.5l5.8-3.4" />
    </svg>
  );
}

/** 触发按钮的基础样式：与重启按钮同尺寸、同圆角。 */
const TRIGGER_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  font: 'inherit',
  fontSize: 12,
  padding: 0,
  width: 36,
  height: 36,
  borderRadius: '50%',
  cursor: 'pointer',
  lineHeight: 1,
};

/** 触发按钮的样式；悬停时换成 12% 强调色混合。 */
export function triggerStyle(hover: boolean): CSSProperties {
  return { ...TRIGGER_STYLE, background: hover ? HOVER_BACKGROUND : 'transparent' };
}

/** 面板与行的行内样式。 */
const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 900,
  } as CSSProperties,
  panel(anchor: SweepAnchor): CSSProperties {
    return {
      position: 'fixed',
      left: Math.max(8, anchor.left),
      bottom: anchor.bottom,
      width: 300,
      maxHeight: 'min(60vh, 480px)',
      overflowY: 'auto',
      zIndex: 901,
      background: 'var(--dsw-alias-bg-overlay)',
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 10,
      boxShadow: '0 8px 28px rgba(0,0,0,.28)',
      padding: 12,
      color: 'var(--dsw-alias-label-primary)',
      fontSize: 13,
    };
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  } as CSSProperties,
  closeButton: {
    border: 'none',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    padding: 4,
  } as CSSProperties,
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '2px 0',
  } as CSSProperties,
  rowText: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  } as CSSProperties,
  rowTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  rowCount: {
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: 12,
    whiteSpace: 'nowrap',
  } as CSSProperties,
  action(busy: boolean, armed: boolean): CSSProperties {
    return {
      border: armed
        ? '1px solid var(--dsw-alias-state-error-primary)'
        : '1px solid var(--dsw-alias-border-l2)',
      background: 'transparent',
      color: busy
        ? 'var(--dsw-alias-label-secondary)'
        : armed
          ? 'var(--dsw-alias-state-error-primary)'
          : 'var(--dsw-alias-state-warn-primary)',
      font: 'inherit',
      fontSize: 12,
      padding: '3px 10px',
      borderRadius: 7,
      cursor: busy ? 'default' : 'pointer',
      whiteSpace: 'nowrap',
    };
  },
  hint: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid var(--dsw-alias-border-l1)',
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: 11,
    lineHeight: 1.5,
  } as CSSProperties,
  result: {
    marginTop: 8,
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: 12,
  } as CSSProperties,
};

/** 清理面板：计数、两次点击确认与结果摘要。 */
export function SweepPanel({ t, api, anchor, onClose }: SweepPanelProps): ReactNode {
  const [data, setData] = useState<SweepOverview>(() => api.overview());
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<SweepOutcome | null>(null);
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => api.subscribe(() => setData(api.overview())), [api]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(
    () => () => {
      if (disarm.current !== null) clearTimeout(disarm.current);
    },
    [],
  );

  const run = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await api.sweep());
    } catch {
      setResult({ failed: -1 });
    } finally {
      setBusy(false);
      setData(api.overview());
    }
  };

  // 清理不可恢复：第一次点击只让按钮进入确认态，四秒内再点一次才执行。
  const click = (): void => {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      if (disarm.current !== null) clearTimeout(disarm.current);
      disarm.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    if (disarm.current !== null) clearTimeout(disarm.current);
    disarm.current = null;
    setArmed(false);
    void run();
  };

  const nothing = data.unpinned === 0 && data.archived === 0;
  const summary = describeResult(t, result);

  return (
    <>
      <div style={styles.backdrop} onClick={onClose} aria-hidden />
      <div style={styles.panel(anchor)} role="menu" aria-label={t('panel.title')}>
        <div style={styles.header}>
          <span>{t('panel.title')}</span>
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            aria-label={t('close')}
            title={t('close')}
          >
            ✕
          </button>
        </div>
        <div style={styles.row}>
          <div style={styles.rowText}>
            <span style={styles.rowTitle}>{t('scope.all')}</span>
            <span style={styles.rowCount}>
              {data.ready
                ? t('count', { unpinned: data.unpinned, archived: data.archived })
                : t('count.waiting')}
            </span>
          </div>
          <button
            type="button"
            style={styles.action(busy, armed)}
            disabled={busy || nothing || !data.ready}
            onClick={click}
            role="menuitem"
          >
            {busy ? t('busy') : armed ? t('runConfirm') : t('run')}
          </button>
        </div>
        {summary === null ? null : <div style={styles.result}>{summary}</div>}
        <div style={styles.hint}>{t('hint')}</div>
      </div>
    </>
  );
}

/** 侧栏底部的扫帚按钮；打开时挂载 {@link SweepPanel}。 */
export function SweepButton({ t, api }: SweepButtonProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<SweepAnchor | null>(null);
  const [hover, setHover] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggle = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    setAnchor({
      left: rect ? rect.left : 16,
      bottom: rect ? window.innerHeight - rect.top + 8 : 64,
    });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        style={triggerStyle(hover)}
        onClick={toggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={t('action.label')}
        aria-label={t('action.label')}
        data-dsh-part="entry"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <BroomIcon />
      </button>
      {open && anchor !== null ? (
        <SweepPanel t={t} api={api} anchor={anchor} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/** 构造清理 API：会话列表、Workspace 归档集与宿主清理路由。 */
export function createSweepApi(ctx: Context): SweepApi {
  const sessionList = (): SessionListStoreLike | undefined => sessionListOf(ctx);
  /** 本页已删除的会话；列表重新发布前不再把它们送去清理。 */
  const purged = new Set<string>();

  /** 侧栏会展示的普通会话 id；Session 列表缺失时返回 null。 */
  const listedIds = (): string[] | null => {
    const list = sessionList()?.getSnapshot?.();
    if (list === undefined) return null;
    return list.ids.filter((id) => {
      const session = list.byId[id];
      return session !== undefined && session.origin !== 'subagent' && !purged.has(id);
    });
  };

  /** 普通会话 id：优先 Session 列表，缺失时回退到 Workspace 成员。 */
  const ordinaryIds = (): string[] => {
    const listed = listedIds();
    if (listed !== null) return listed;
    const ids = new Set<string>();
    for (const view of workspacesOf(ctx).list.getSnapshot().items) {
      for (const id of view.sessionIds) if (!purged.has(id)) ids.add(id);
    }
    return [...ids];
  };

  /**
   * 正在显示的会话与它的全部祖先；清理必须保留它们。
   * 持有来源含主对话区、子代理聊天与右侧会话视图；列表缺失时返回空集。
   */
  const protectedIds = (): string[] => {
    const list = sessionList()?.getSnapshot?.();
    if (list === undefined) return [];
    const kept = new Set<string>();
    for (const id of Object.keys(list.byId)) {
      const row = list.byId[id];
      if (row === undefined) continue;
      const shown = PROTECTED_SOURCES.some((source) => (row.retainedBy?.[source] ?? 0) > 0);
      if (!shown) continue;
      // 已收集的 id 直接终止上溯，顺带挡住自引用。
      for (let current: string | undefined = id; current !== undefined && !kept.has(current); ) {
        kept.add(current);
        current = list.byId[current]?.parentId;
      }
    }
    return [...kept];
  };

  /** 仍值得展示的已归档会话数。 */
  const archivedCount = (): number => {
    const archived = workspacesOf(ctx).list.getSnapshot().archivedSessionIds;
    const list = sessionList()?.getSnapshot?.();
    let count = 0;
    for (const id of archived) {
      if (purged.has(id)) continue;
      // 列表已不持有的已归档 id 没有日志可删，不再重复计数。
      if (list !== undefined && list.byId[id] === undefined) continue;
      count += 1;
    }
    return count;
  };

  return {
    overview() {
      const snapshot = workspacesOf(ctx).list.getSnapshot();
      const pinned = new Set(snapshot.pinnedSessionIds);
      const archived = new Set(snapshot.archivedSessionIds);
      const keep = new Set(protectedIds());
      let unpinned = 0;
      for (const id of ordinaryIds()) {
        if (!pinned.has(id) && !archived.has(id) && !keep.has(id)) unpinned += 1;
      }
      return { unpinned, archived: archivedCount(), ready: listReady(snapshot) };
    },
    subscribe(listener) {
      const disposers: Array<() => void> = [workspacesOf(ctx).list.subscribe(listener)];
      const disposeSessions = sessionList()?.subscribe?.(listener);
      if (disposeSessions !== undefined) disposers.push(disposeSessions);
      return () => {
        for (const dispose of disposers) dispose();
      };
    },
    async sweep() {
      const snapshot = workspacesOf(ctx).list.getSnapshot();
      // 快照未就绪时读到的置顶集合不可信，先拒绝执行。
      if (!listReady(snapshot)) return { blocked: true };
      const pinned = new Set(snapshot.pinnedSessionIds);
      const archived = new Set(snapshot.archivedSessionIds);
      // 已归档的 id 不再提交：宿主会删除全部已归档日志，只差未归档的部分。
      const keepIds = protectedIds();
      const keep = new Set(keepIds);
      const ids = ordinaryIds().filter(
        (id) => !pinned.has(id) && !archived.has(id) && !keep.has(id),
      );
      const response = await fetch(SWEEP_API, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids, keepIds }),
      });
      const payload = (await response.json().catch(() => null)) as SweepPayload | null;
      if (!response.ok || payload === null || payload.ok !== true) return { failed: -1 };
      for (const id of payload.deletedIds ?? []) purged.add(id);
      return {
        archived: payload.archived ?? 0,
        deleted: payload.deleted ?? 0,
        skipped: payload.skipped ?? 0,
        deferred: payload.deferred ?? 0,
        failed: payload.failed ?? 0,
      };
    },
  };
}

/** 把扫帚按钮挂到侧栏底部动作槽位。 */
export function installSweeper(ctx: Context): void {
  const api = createSweepApi(ctx);
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'session-sweeper',
        order: 50,
        locale: NS,
        inject: () => ({ api }),
      },
      SweepButton,
    ),
  );
}

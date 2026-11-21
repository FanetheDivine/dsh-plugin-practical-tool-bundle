/**
 * 宿主 loader 的最小结构与查找规则：只用到枚举条目、改一条条目与等待装载。
 * 与 `src/row-status.ts` 一样按完整 id、再按组路径末段匹配。
 */
import type { Context } from '../types.ts';
import { AGENT_PRESET_MODULE } from './catalog.ts';

/** `FiberState.ACTIVE`：cordis 里是 const enum，运行时按序号比较。 */
export const FIBER_ACTIVE = 2;

/** `FiberState.LOADING`：正在装载也计为运行中。 */
export const FIBER_LOADING = 1;

/** preset 声明里的一个子行；`cordis:group` 行用 `config` 承载子列表。 */
export interface ChildRowLike {
  readonly id?: string;
  readonly name?: string;
  readonly group?: boolean;
  readonly disabled?: unknown;
  readonly config?: unknown;
}

/** loader 条目的最小结构。 */
export interface LoaderEntryLike {
  readonly id: string;
  readonly disabled: boolean;
  readonly fiber?: { readonly state: number } | undefined;
  readonly options?: {
    readonly name?: string;
    readonly config?: unknown;
  };
}

/** 一条条目的更新内容。 */
export interface EntryUpdate {
  readonly disabled?: boolean;
  readonly config?: unknown;
}

/** 宿主 loader 的最小结构。 */
export interface LoaderLike {
  entries(): Iterable<LoaderEntryLike>;
  update(id: string, options: EntryUpdate): Promise<unknown>;
  await?(): Promise<unknown>;
}

/** 读取宿主 loader；服务缺失时返回 undefined。 */
export function readLoader(ctx: Context): LoaderLike | undefined {
  const loader = ctx.get('loader') as LoaderLike | undefined;
  if (loader === undefined || typeof loader.entries !== 'function') return undefined;
  if (typeof loader.update !== 'function') return undefined;
  return loader;
}

/**
 * 按行 id 找条目：先完整 id，再组路径末段。
 * @param loader - 宿主 loader。
 * @param rowId - 常量里写的行 id。
 * @returns 命中的条目，或 undefined。
 */
export function findEntry(loader: LoaderLike, rowId: string): LoaderEntryLike | undefined {
  for (const entry of loader.entries()) {
    if (entry.id === rowId) return entry;
  }
  for (const entry of loader.entries()) {
    if (entry.id.endsWith(`:${rowId}`)) return entry;
  }
  return undefined;
}

/** 全部 preset 声明行：模块名等于 `@deepseek-ai/dsh-agent-preset` 的条目。 */
export function presetEntries(loader: LoaderLike): LoaderEntryLike[] {
  const presets: LoaderEntryLike[] = [];
  for (const entry of loader.entries()) {
    if (entry.options?.name === AGENT_PRESET_MODULE) presets.push(entry);
  }
  return presets;
}

/** 一条条目是否正在运行：未停用且 fiber 处于 ACTIVE 或 LOADING。 */
export function isEntryRunning(entry: LoaderEntryLike): boolean {
  if (entry.disabled) return false;
  const state = entry.fiber?.state;
  return state === FIBER_ACTIVE || state === FIBER_LOADING;
}

/** 等待装载落定；loader 不提供 `await` 时直接返回。 */
export async function settle(loader: LoaderLike): Promise<void> {
  if (typeof loader.await !== 'function') return;
  await loader.await().catch(() => {});
}

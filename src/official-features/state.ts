/**
 * 功能状态：由宿主 loader 的当前状态推导每个功能是否可用。
 * 宿主行与 preset 子行都看，任一受管项启用即为开。
 */
import { FEATURES, type FeatureId, type FeatureSpec } from './catalog.ts';
import {
  type ChildRowLike,
  findEntry,
  isEntryRunning,
  type LoaderEntryLike,
  type LoaderLike,
  presetEntries,
} from './loader.ts';

/** 一个功能在面板上的状态。 */
export interface FeatureState {
  /** 功能标识。 */
  readonly id: FeatureId;
  /** 有任一受管项启用即为 `true`。 */
  readonly on: boolean;
}

/** 一条宿主行是否算作启用：存在且正在运行。 */
function hostRowOn(loader: LoaderLike, rowId: string): boolean {
  const entry: LoaderEntryLike | undefined = findEntry(loader, rowId);
  return entry !== undefined && isEntryRunning(entry);
}

/** 取出子行列表：`group: true` 的行把子列表放在 `config`，普通行的 `config` 是配置对象。 */
function childRows(list: unknown): ChildRowLike[] {
  if (!Array.isArray(list)) return [];
  const rows: ChildRowLike[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    rows.push(item as ChildRowLike);
  }
  return rows;
}

/** 一个子行是否启用：`disabled` 只有字面 `true` 才算停用，表达式留给宿主求值。 */
function childRunning(row: ChildRowLike): boolean {
  return row.disabled !== true;
}

/**
 * 递归查找受管模块。
 * @param list - 一层子行列表。
 * @param modules - 受管模块名。
 * @returns 命中且仍启用的模块名，没有则为 undefined。
 */
function findModule(list: unknown, modules: readonly string[]): string | undefined {
  for (const row of childRows(list)) {
    if (typeof row.name === 'string' && modules.includes(row.name) && childRunning(row)) {
      return row.name;
    }
    if (row.group === true) {
      const nested = findModule(row.config, modules);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

/** 某个功能的受管子行是否还在任一声明里。 */
function presetRowOn(loader: LoaderLike, feature: FeatureSpec): boolean {
  if (feature.presetModules.length === 0) return false;
  for (const entry of presetEntries(loader)) {
    const config = entry.options?.config;
    if (typeof config !== 'object' || config === null) continue;
    const plugins = (config as { plugins?: unknown }).plugins;
    if (findModule(plugins, feature.presetModules) !== undefined) return true;
  }
  return false;
}

/**
 * 汇总一个功能的状态：宿主行或 preset 子行任一启用即为开。
 * @param loader - 宿主 loader。
 * @param feature - 功能定义。
 * @returns 该功能是否可用。
 */
export function featureOn(loader: LoaderLike, feature: FeatureSpec): boolean {
  for (const rowId of feature.hostRows) {
    if (hostRowOn(loader, rowId)) return true;
  }
  return presetRowOn(loader, feature);
}

/**
 * 读取全部功能的状态，顺序与清单一致。
 * @param loader - 宿主 loader。
 * @returns 五个功能的状态。
 */
export function readFeatureStates(loader: LoaderLike): FeatureState[] {
  return FEATURES.map((feature) => ({ id: feature.id, on: featureOn(loader, feature) }));
}

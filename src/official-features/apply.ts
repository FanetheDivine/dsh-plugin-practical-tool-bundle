/**
 * 施加与撤销：在运行期停用功能对应的宿主行，并从 preset 声明里摘掉对应子行。
 * 只改受管行，不动宿主配置文件；撤销依据内存中保存的基线。
 */
import { type FeatureSpec, featureOf } from './catalog.ts';
import {
  type ChildRowLike,
  findEntry,
  type LoaderEntryLike,
  type LoaderLike,
  presetEntries,
  settle,
} from './loader.ts';

/** 施加前保存的原始状态，供撤销使用。 */
export interface ApplySnapshot {
  /** 宿主行：条目 id 到施加前的 `disabled` 原值。 */
  readonly hostRows: Map<string, boolean>;
  /** preset 声明：条目 id 到施加前的 raw `config`，是重算的基线。 */
  readonly presets: Map<string, unknown>;
}

/** 新建一份空快照。 */
export function createSnapshot(): ApplySnapshot {
  return { hostRows: new Map(), presets: new Map() };
}

/**
 * 丢弃 preset 基线，下一次施加从当前树重新捕获。
 * 配置重组后树就是文件状态，旧基线已经过期。
 * @param snapshot - 目标快照。
 */
export function resetPresetBaseline(snapshot: ApplySnapshot): void {
  snapshot.presets.clear();
}

/** 一次施加的结果：未生效的宿主行 id 与 preset 条目 id 分别列出。 */
export interface ApplyReport {
  readonly pendingRows: string[];
  readonly pendingPresets: string[];
}

/** 把值收窄成对象行列表。 */
function rowsOf(list: unknown): ChildRowLike[] {
  if (!Array.isArray(list)) return [];
  const rows: ChildRowLike[] = [];
  for (const item of list) {
    if (typeof item === 'object' && item !== null) rows.push(item as ChildRowLike);
  }
  return rows;
}

/** 一个子行是否属于受管模块。 */
function isManaged(row: ChildRowLike, modules: readonly string[]): boolean {
  return typeof row.name === 'string' && modules.includes(row.name);
}

/** 结构化深比较，用于判断写回是否必要。 */
function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  if (left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  const leftKeys = Object.keys(left as Record<string, unknown>);
  const rightKeys = Object.keys(right as Record<string, unknown>);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) =>
    deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  );
}

/**
 * 由基线与当前列表算出目标列表。
 * 基线顺序决定顺序：受管子行被关闭时不出现；未关闭时用当前版本（可能被用户改过）。
 * 当前列表里基线没有的子行按原位置追加，不被丢弃。
 * @param baselineList - 本包第一次改写该声明时的子行列表。
 * @param currentList - 树上当前的子行列表。
 * @param modules - 当前关闭的功能涉及的模块名。
 * @returns 目标子行列表。
 */
function rebuild(baselineList: unknown, currentList: unknown, modules: readonly string[]): unknown {
  const baseline = rowsOf(baselineList);
  const current = rowsOf(currentList);
  if (baseline.length === 0) return currentList;
  const currentById = new Map(
    current.filter((row) => row.id !== undefined).map((row) => [row.id as string, row]),
  );
  const baselineIds = new Set(baseline.map((row) => row.id));

  const out: unknown[] = [];
  for (const row of baseline) {
    const live = row.id === undefined ? undefined : currentById.get(row.id);
    if (row.group === true) {
      if (isManaged(row, modules)) continue;
      const nextConfig = rebuild(row.config, live?.config, modules);
      const children = rowsOf(nextConfig);
      // 组里的子行全是受管模块且都被关闭时，整组移除。
      if (children.length === 0 && rowsOf(row.config).length > 0) continue;
      out.push({ ...row, ...(live ?? {}), config: nextConfig });
      continue;
    }
    if (isManaged(row, modules)) continue;
    out.push(live ?? row);
  }

  for (const row of current) {
    if (row.id !== undefined && baselineIds.has(row.id)) continue;
    out.push(row);
  }
  return out;
}

/**
 * 停用或恢复一个功能在宿主配置里的行。
 * 关闭时跳过本来就停用的行，打开时按快照里的原值放回。
 * @param loader - 宿主 loader。
 * @param feature - 功能定义。
 * @param off - `true` 关闭，`false` 打开。
 * @param snapshot - 记录原始状态。
 * @returns 施加结果。
 */
export async function applyHostRows(
  loader: LoaderLike,
  feature: FeatureSpec,
  off: boolean,
  snapshot: ApplySnapshot,
): Promise<ApplyReport> {
  const pendingRows: string[] = [];
  for (const rowId of feature.hostRows) {
    const entry = findEntry(loader, rowId);
    if (entry === undefined) continue;
    if (off) {
      if (entry.disabled) continue;
      snapshot.hostRows.set(entry.id, entry.disabled);
      await loader.update(entry.id, { disabled: true });
    } else {
      const original = snapshot.hostRows.get(entry.id);
      if (original === undefined) continue;
      snapshot.hostRows.delete(entry.id);
      if (entry.disabled === original) continue;
      await loader.update(entry.id, { disabled: original });
    }
    pendingRows.push(rowId);
  }
  if (pendingRows.length > 0) await settle(loader);
  return { pendingRows, pendingPresets: [] };
}

/**
 * 按「当前关闭的功能」重算全部 preset 声明并写回。
 * 每次从基线重算，多个功能叠加与逐个撤销都会收敛到同一结果。
 * @param loader - 宿主 loader。
 * @param off - 当前关闭的功能标识。
 * @param snapshot - 保存与复用基线。
 * @returns 施加结果。
 */
export async function applyPresetRows(
  loader: LoaderLike,
  off: readonly string[],
  snapshot: ApplySnapshot,
): Promise<ApplyReport> {
  const modules = new Set<string>();
  for (const id of off) {
    for (const module of featureOf(id)?.presetModules ?? []) modules.add(module);
  }
  const managed = [...modules];

  const pendingPresets: string[] = [];
  for (const entry of presetEntries(loader)) {
    const current = entry.options?.config;
    if (typeof current !== 'object' || current === null) continue;
    if (!snapshot.presets.has(entry.id)) snapshot.presets.set(entry.id, current);
    const baseline = snapshot.presets.get(entry.id) as { plugins?: unknown };

    const plugins = rebuild(baseline.plugins, (current as { plugins?: unknown }).plugins, managed);
    const desired = { ...(baseline as Record<string, unknown>), plugins };
    if (deepEqual(desired, current)) continue;
    await loader.update(entry.id, { config: desired });
    pendingPresets.push(entry.id);
  }
  if (pendingPresets.length > 0) await settle(loader);
  return { pendingRows: [], pendingPresets };
}

/**
 * 施加一个功能：宿主行按功能开关，preset 子行按全部关闭的功能重算。
 * @param loader - 宿主 loader。
 * @param feature - 功能定义。
 * @param off - `true` 关闭，`false` 打开。
 * @param snapshot - 记录原始状态。
 * @param offFeatures - 当前关闭的全部功能，缺省只按本功能推算。
 * @returns 施加结果。
 */
export async function applyFeature(
  loader: LoaderLike,
  feature: FeatureSpec,
  off: boolean,
  snapshot: ApplySnapshot,
  offFeatures: readonly string[] = off ? [feature.id] : [],
): Promise<ApplyReport> {
  const rows = await applyHostRows(loader, feature, off, snapshot);
  const presets = await applyPresetRows(loader, offFeatures, snapshot);
  return { pendingRows: rows.pendingRows, pendingPresets: presets.pendingPresets };
}

/**
 * 撤销快照里的全部宿主行改动，本包停用时使用。
 * @param loader - 宿主 loader。
 * @param snapshot - 记录原始状态；撤销后相应条目被移除。
 * @returns 被恢复的条目 id。
 */
export async function restoreSnapshot(
  loader: LoaderLike,
  snapshot: ApplySnapshot,
): Promise<string[]> {
  const restored: string[] = [];
  for (const [entryId, original] of [...snapshot.hostRows]) {
    const entry: LoaderEntryLike | undefined = [...loader.entries()].find(
      (item) => item.id === entryId,
    );
    snapshot.hostRows.delete(entryId);
    if (entry === undefined || entry.disabled === original) continue;
    await loader.update(entryId, { disabled: original });
    restored.push(entryId);
  }
  if (restored.length > 0) await settle(loader);
  return restored;
}

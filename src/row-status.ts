/**
 * 行状态：从宿主 loader 的条目树上判断五行是否可用。
 * 只读取条目的 `disabled` 与 fiber 状态，不修改 loader。
 */
import { ROW_NAME_TO_ID, type RowName } from './rows.ts';

/** 状态路由回答中的一行：`null` 表示 loader 不可用，前端保留当前界面。 */
export type RowAvailability = boolean | null;

/** 状态路由的回答视图。 */
export type RowStatus = Readonly<Record<RowName, RowAvailability>>;

/**
 * loader 条目的最小结构：只用到 id、disabled 与 fiber 状态。
 * `Loader` 的 `Entry` 结构比这里更大，只要字段兼容即可传入。
 */
export interface LoaderEntryLike {
  readonly id: string;
  readonly disabled: boolean;
  readonly fiber?: { readonly state: number } | undefined;
}

/** loader 的最小结构：`EntryTree.entries()` 遍历全部条目。 */
export interface LoaderLike {
  entries(): Iterable<LoaderEntryLike>;
}

/**
 * `FiberState.ACTIVE` 在 `@deepseek-ai/cordis` 里是 const enum，编译产物中没有运行时值，
 * 只能按序号比较：PENDING 0、LOADING 1、ACTIVE 2、FAILED 3、DISPOSED 4、UNLOADING 5。
 */
const FIBER_ACTIVE = 2;

/** 一条记录是否可用：存在、未禁用、fiber 已进入 ACTIVE。 */
function isAvailable(entry: LoaderEntryLike | undefined): boolean {
  if (entry === undefined) return false;
  if (entry.disabled) return false;
  return entry.fiber?.state === FIBER_ACTIVE;
}

/**
 * 汇总五行状态。
 * @param loader - 宿主 loader；缺失时五项都是 `null`。
 */
export function readRowStatus(loader: LoaderLike | undefined): RowStatus {
  if (loader === undefined) {
    return {
      sweeper: null,
      reasoningReset: null,
      claudeSkills: null,
      restart: null,
      mobile: null,
    };
  }
  const byId = new Map<string, LoaderEntryLike>();
  for (const entry of loader.entries()) byId.set(entry.id, entry);
  /**
   * 条目 id 带组路径前缀，例如 bundle 行落在 `include:session-sweeper`。
   * 先按完整 id 查，再按最后一段匹配。
   */
  const find = (rowId: string): LoaderEntryLike | undefined => {
    const exact = byId.get(rowId);
    if (exact !== undefined) return exact;
    for (const [id, entry] of byId) if (id.endsWith(`:${rowId}`)) return entry;
    return undefined;
  };
  const at = (name: RowName): RowAvailability => isAvailable(find(ROW_NAME_TO_ID[name]));
  return {
    sweeper: at('sweeper'),
    reasoningReset: at('reasoningReset'),
    claudeSkills: at('claudeSkills'),
    restart: at('restart'),
    mobile: at('mobile'),
  };
}

/**
 * 标准模式叠加行：在运行期给官方 `standard` 预设追加 Codex 行为子行，并清空含模型名的 persona 前缀。
 * 只改内存里的 preset 配置，不编辑官方声明文件；配置重组后重新施加，行停用时恢复。
 */

import {
  type ChildRowLike,
  type LoaderLike,
  presetEntries,
  readLoader,
  settle,
} from '../official-features/loader.ts';
import type { Context } from '../types.ts';

/** 插件名，与 cordis.patch.yml 的行 id 一致。 */
export const name = 'standard-codex';

/** 依赖宿主 loader。 */
export const inject = ['loader'];

/** 追加的子行 id。 */
export const BEHAVIOR_ID = 'codex-behavior';

/** 追加的子行模块名。 */
export const BEHAVIOR_NAME = 'dsh-plugin-practical-tool-bundle/codex-behavior';

/** persona 子行的模块名。 */
export const PERSONA_MODULE = '@deepseek-ai/dsh-persona';

/** 目标预设 id。 */
const TARGET_PRESET_ID = 'standard';

/** 一条 preset 子行。 */
interface PresetRow extends ChildRowLike {
  readonly [key: string]: unknown;
}

/** 判断值是不是普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 把子行列表收窄成对象数组。 */
function rowsOf(list: unknown): PresetRow[] {
  if (!Array.isArray(list)) return [];
  return list.filter(isRecord) as PresetRow[];
}

/** 一次叠加的结果。 */
export interface OverlayResult {
  /** 改写后的子行列表。 */
  readonly plugins: unknown[];
  /** 是否发生改动。 */
  readonly changed: boolean;
}

/**
 * 改写子行列表：persona 前缀置空，末尾补上行为子行。
 * @param list - 当前子行列表。
 * @returns 目标列表与是否改动。
 */
export function overlayPlugins(list: unknown): OverlayResult {
  const rows = rowsOf(list);
  let changed = false;
  const plugins = rows.map((row) => {
    if (row.name !== PERSONA_MODULE) return row;
    if (!isRecord(row.config)) return row;
    if (row.config['prefix'] === '') return row;
    changed = true;
    return { ...row, config: { ...row.config, prefix: '' } };
  });
  if (!plugins.some((row) => row.id === BEHAVIOR_ID)) {
    changed = true;
    plugins.push({ id: BEHAVIOR_ID, name: BEHAVIOR_NAME });
  }
  return { plugins, changed };
}

/**
 * 计算叠加后的 preset 配置。
 * @param config - 条目的当前配置。
 * @returns 目标配置；无需改动时返回 undefined。
 */
export function overlayConfig(config: unknown): unknown | undefined {
  if (!isRecord(config)) return undefined;
  if (config['id'] !== TARGET_PRESET_ID) return undefined;
  if (!Array.isArray(config['plugins'])) return undefined;
  const { plugins, changed } = overlayPlugins(config['plugins']);
  if (!changed) return undefined;
  return { ...config, plugins };
}

/**
 * 插件启用时施加叠加，配置重组后重新施加，停用时恢复。
 * @param ctx - 宿主上下文。
 */
export function apply(ctx: Context): void {
  const loader: LoaderLike | undefined = readLoader(ctx);
  if (loader === undefined) {
    ctx.logger.warn('standard-codex: loader 服务不可用，跳过叠加');
    return;
  }
  const baselines = new Map<string, unknown>();

  /** 遍历标准预设，必要时写回目标配置。 */
  const applyOnce = async (): Promise<void> => {
    for (const entry of presetEntries(loader)) {
      if (entry.disabled) continue;
      const current = entry.options?.config;
      const desired = overlayConfig(current);
      if (desired === undefined) continue;
      if (!baselines.has(entry.id)) baselines.set(entry.id, current);
      try {
        await loader.update(entry.id, { config: desired });
      } catch (error) {
        ctx.logger.warn(`standard-codex: 更新 ${entry.id} 失败：${String(error)}`);
      }
    }
    await settle(loader);
  };

  /** 按首次施加前的快照恢复。 */
  const restore = async (): Promise<void> => {
    for (const [entryId, config] of baselines) {
      try {
        await loader.update(entryId, { config });
      } catch (error) {
        ctx.logger.warn(`standard-codex: 恢复 ${entryId} 失败：${String(error)}`);
      }
    }
    baselines.clear();
    await settle(loader);
  };

  ctx.effect(() => {
    void applyOnce();
    return async () => {
      await restore();
    };
  }, 'standard-codex overlay');

  ctx.on('app-boot/config-reload', () => {
    // 重组后树是文件状态，旧基线已过期，重新捕获。
    baselines.clear();
    void applyOnce();
  });
}

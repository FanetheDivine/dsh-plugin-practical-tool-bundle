/**
 * 关闭记录：打开宿主存储域里的一个 global 单例，保存被关闭的功能标识。
 * 记录写在本包自己的域中，不触碰 profile 配置。
 */
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';

import type { Context } from '../types.ts';
import { FEATURE_IDS, type FeatureId } from './catalog.ts';

/** 域名的允许形状：小写字母开头，只含小写字母、数字与下划线。 */
const DOMAIN_NAME = 'practical_tool_official_features';

/** 记录格式版本。每次写入都必须带上，读取时按它校验。 */
const RECORD_VERSION = 1;

/** 空记录，也是域未写过时的初值。 */
const EMPTY_RECORD = { version: RECORD_VERSION, off: [] as FeatureId[] } as const;

/** 关闭记录的形状；`null` 是存储层的「从未写入」标记，因此 schema 不接受 `null`。 */
const recordSchema = z.object({
  version: z.literal(RECORD_VERSION),
  off: z.array(z.enum(FEATURE_IDS)),
});

/** 记录的本包形态。 */
export interface OffRecord {
  readonly version: typeof RECORD_VERSION;
  readonly off: readonly FeatureId[];
}

/** 打开后的域句柄：只用到 global 单例与关闭。 */
interface DomainLike {
  readonly global: {
    get(): { version?: unknown; off?: unknown };
    set(value: OffRecord): Promise<void>;
  };
  close(): Promise<void>;
}

/** 打开后的记录句柄。 */
export interface OffStore {
  /** 读取当前记录；打开失败时恒为空记录。 */
  read(): readonly FeatureId[];
  /** 覆盖写入记录；打开失败或后端拒绝时抛出。 */
  write(off: readonly FeatureId[]): Promise<void>;
  /** 关闭域，释放域名占用。 */
  close(): Promise<void>;
}

/** 本包声明的域，模块加载时校验一次。 */
export const OFFICIAL_FEATURES_DOMAIN = defineDomain({
  name: DOMAIN_NAME,
  version: RECORD_VERSION,
  tables: {},
  global: { schema: recordSchema, initial: EMPTY_RECORD },
});

/** 去重并保持顺序，得到一份只含已知标识的记录。 */
function normalize(off: readonly FeatureId[]): OffRecord {
  const seen = new Set<FeatureId>();
  const next: FeatureId[] = [];
  for (const id of off) {
    if (!FEATURE_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return { version: RECORD_VERSION, off: next };
}

/**
 * 打开关闭记录。
 * 打不开时记一条警告并返回只读空记录：功能全部保持宿主默认，切换会被拒绝。
 * @param ctx - 带 `storageDomain` 服务的宿主上下文。
 * @returns 记录句柄。
 */
export async function openStore(ctx: Context): Promise<OffStore> {
  let domain: DomainLike | undefined;
  try {
    domain = (await ctx.storageDomain.open(OFFICIAL_FEATURES_DOMAIN)) as unknown as DomainLike;
  } catch (error) {
    ctx.logger.warn(
      '[dsh-plugin-practical-tool-bundle] official-features store unavailable, running without records',
      error,
    );
    return {
      read: () => [],
      write: async () => {
        throw new Error('official-features store unavailable');
      },
      close: async () => {},
    };
  }

  const handle = domain;
  return {
    read: () => {
      const current = handle.global.get();
      const off = Array.isArray(current?.off) ? (current.off as FeatureId[]) : [];
      return normalize(off).off;
    },
    async write(off) {
      await handle.global.set(normalize(off));
    },
    close: () => handle.close(),
  };
}

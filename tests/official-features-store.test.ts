// 关闭记录测试：域打开、读写归一、打开失败降级与关闭后重开。
import { describe, expect, it, vi } from 'vitest';
import { OFFICIAL_FEATURES_DOMAIN, openStore } from '../src/official-features/store.ts';
import type { Context } from '../src/types.ts';

/** 一个可编程的域句柄：`global` 读写走内存，可注入失败。 */
function makeDomain(options: { openError?: unknown; writeError?: unknown } = {}) {
  let stored: unknown;
  const closes: number[] = [];
  const domain = {
    global: {
      // 与真实域一致：未写过时返回规格里的初值。
      get: () => stored ?? { version: 1, off: [] },
      set: async (value: unknown) => {
        if (options.writeError !== undefined) throw options.writeError;
        stored = value;
      },
    },
    close: async () => {
      closes.push(1);
    },
  };
  return { domain, closes, peek: () => stored };
}

/** 造一个只带 storageDomain 与 logger 的上下文。 */
function makeCtx(open: (spec: unknown) => Promise<unknown>) {
  const warnings: unknown[][] = [];
  const ctx = {
    storageDomain: { open: vi.fn(open) },
    logger: {
      debug: () => {},
      info: () => {},
      warn: (...args: unknown[]) => {
        warnings.push(args);
      },
    },
  };
  return { ctx: ctx as unknown as Context, warnings, open: ctx.storageDomain.open };
}

describe('openStore', () => {
  it('未写入时读空记录，写入后读回且去重', async () => {
    const { domain } = makeDomain();
    const { ctx } = makeCtx(async () => domain);
    const store = await openStore(ctx);
    expect(store.read()).toEqual([]);
    await store.write(['goal', 'plan', 'goal']);
    expect(store.read()).toEqual(['goal', 'plan']);
  });

  it('写入的对象带格式版本，落在 global 单例里', async () => {
    const { domain, peek } = makeDomain();
    const { ctx } = makeCtx(async () => domain);
    const store = await openStore(ctx);
    await store.write(['task']);
    expect(peek()).toEqual({ version: 1, off: ['task'] });
  });

  it('打开时传入已声明的域规格，域名符合存储层的命名规则', async () => {
    const { domain } = makeDomain();
    const { ctx, open } = makeCtx(async () => domain);
    await openStore(ctx);
    expect(open).toHaveBeenCalledWith(OFFICIAL_FEATURES_DOMAIN);
    expect(OFFICIAL_FEATURES_DOMAIN.name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('打开失败时记警告并降级为只读空记录', async () => {
    const { ctx, warnings } = makeCtx(async () => {
      throw new Error('invalid-record');
    });
    const store = await openStore(ctx);
    expect(store.read()).toEqual([]);
    expect(warnings).toHaveLength(1);
    await expect(store.write(['goal'])).rejects.toThrow();
    await expect(store.close()).resolves.toBeUndefined();
  });

  it('后端写入失败时抛出，内存状态保持写入前的值', async () => {
    const { domain, peek } = makeDomain({ writeError: new Error('unknown-state') });
    const { ctx } = makeCtx(async () => domain);
    const store = await openStore(ctx);
    await expect(store.write(['goal'])).rejects.toThrow('unknown-state');
    expect(peek()).toBeUndefined();
  });

  it('关闭后释放域，同名域可以再次打开', async () => {
    const first = makeDomain();
    const second = makeDomain();
    const opened = [first.domain, second.domain];
    const { ctx, open } = makeCtx(async () => {
      const next = opened.shift();
      if (next === undefined) throw new Error('already-open');
      return next;
    });
    const store = await openStore(ctx);
    await store.close();
    expect(first.closes).toHaveLength(1);
    const reopened = await openStore(ctx);
    expect(reopened.read()).toEqual([]);
    expect(open).toHaveBeenCalledTimes(2);
  });
});

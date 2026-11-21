// 生命周期测试：启用按记录施加、停用撤销并关闭域、重开再次施加、记录不可用时降级。
import { describe, expect, it } from 'vitest';

import { apply as applyRow, createFeatureService } from '../src/official-features/index.ts';
import type { OffStore } from '../src/official-features/store.ts';
import { makeLoader } from './helpers.ts';

/** 一段对话里的宿主行与 preset。 */
function makeWorld() {
  return makeLoader([
    { id: 'include:schedule', disabled: false, fiber: { state: 2 } },
    { id: 'include:ui-schedule', disabled: false, fiber: { state: 2 } },
    {
      id: 'include:preset-standard',
      disabled: false,
      fiber: { state: 2 },
      options: {
        name: '@deepseek-ai/dsh-agent-preset',
        config: {
          id: 'standard',
          plugins: [
            { id: 'tool-schedule', name: '@deepseek-ai/dsh-tool-schedule' },
            { id: 'persona', name: '@deepseek-ai/dsh-persona' },
          ],
        },
      },
    },
  ]);
}

/** 内存记录，可统计 close。 */
function makeStore(initial: string[] = []) {
  let off = [...initial];
  const closes: number[] = [];
  const store: OffStore = {
    read: () => [...off],
    write: async (next) => {
      off = [...next];
    },
    close: async () => {
      closes.push(1);
    },
  };
  return { store, closes, peek: () => [...off] };
}

/** 记录不可用的降级句柄，与 openStore 的降级形态一致。 */
function degradedStore(): OffStore {
  return {
    read: () => [],
    write: async () => {
      throw new Error('official-features store unavailable');
    },
    close: async () => {},
  };
}

/** 当前 preset 的子行 id。 */
function presetIds(loader: ReturnType<typeof makeLoader>): string[] {
  const config = loader.entry('include:preset-standard')?.options?.config as {
    plugins: Array<{ id: string }>;
  };
  return config.plugins.map((row) => row.id);
}

describe('记录可用时的生命周期', () => {
  it('停用撤销全部宿主行与 preset 改动，并关闭域', async () => {
    const loader = makeWorld();
    const { store, closes, peek } = makeStore();
    const service = createFeatureService({ loader, store, waitMs: 0 });
    await service.toggle('schedule', false);
    expect(loader.entry('include:schedule')?.disabled).toBe(true);
    expect(presetIds(loader)).toEqual(['persona']);

    await service.dispose();
    expect(loader.entry('include:schedule')?.disabled).toBe(false);
    expect(presetIds(loader)).toEqual(['tool-schedule', 'persona']);
    expect(closes).toHaveLength(1);
    // 记录保留：重新启用时据此再施加。
    expect(peek()).toEqual(['schedule']);
  });

  it('重新启用后按保留的记录再次施加', async () => {
    const loader = makeWorld();
    const { store } = makeStore();
    const first = createFeatureService({ loader, store, waitMs: 0 });
    await first.toggle('schedule', false);
    await first.dispose();
    expect(loader.entry('include:schedule')?.disabled).toBe(false);

    const second = createFeatureService({ loader, store, waitMs: 0 });
    await second.reapply();
    expect(loader.entry('include:schedule')?.disabled).toBe(true);
    expect(presetIds(loader)).toEqual(['persona']);
  });

  it('记录为空时启用不做任何改动，也不关闭域之外的副作用', async () => {
    const loader = makeWorld();
    const { store } = makeStore();
    const service = createFeatureService({ loader, store, waitMs: 0 });
    await service.reapply();
    expect(loader.calls).toEqual([]);
    await service.dispose();
    expect(loader.calls).toEqual([]);
  });
});

describe('记录不可用时的降级', () => {
  it('按无记录运行：不施加任何关闭，读到的状态是真实状态', async () => {
    const loader = makeWorld();
    const service = createFeatureService({ loader, store: degradedStore(), waitMs: 0 });
    await service.reapply();
    expect(loader.calls).toEqual([]);
    expect(service.states()?.find((row) => row.id === 'schedule')?.on).toBe(true);
  });

  it('切换返回 store-failed，且不改动任何行', async () => {
    const loader = makeWorld();
    const service = createFeatureService({ loader, store: degradedStore(), waitMs: 0 });
    const result = await service.toggle('schedule', false);
    expect(result).toEqual({
      ok: false,
      error: 'store-failed',
      message: 'official-features store unavailable',
    });
    expect(loader.calls).toEqual([]);
  });

  it('停用时仍可正常撤销与关闭', async () => {
    const loader = makeWorld();
    const service = createFeatureService({ loader, store: degradedStore(), waitMs: 0 });
    await expect(service.dispose()).resolves.toBeUndefined();
  });
});

describe('行接线在记录不可用时', () => {
  it('仍注册路由，面板可以显示真实状态', async () => {
    const loader = makeWorld();
    const routes: string[] = [];
    const ctx = {
      get: (name: string) => (name === 'loader' ? loader : undefined),
      get storageDomain() {
        return {
          open: async () => {
            throw new Error('invalid-record');
          },
        };
      },
      logger: { debug: () => {}, info: () => {}, warn: () => {} },
      inject(deps: string[], callback: (injected: unknown) => void) {
        if (!deps.includes('storageDomain')) throw new Error('missing storageDomain dep');
        callback({
          connection: {
            fetch: {
              register: (route: { path: string }) => {
                routes.push(route.path);
                return () => {};
              },
            },
          },
          get: ctx.get,
          effect: ctx.effect,
          on: ctx.on,
          logger: ctx.logger,
          get storageDomain() {
            return ctx.storageDomain;
          },
        });
        return () => true;
      },
      effect(fn: () => unknown) {
        return fn();
      },
      on() {
        return () => {};
      },
    };
    applyRow(ctx as never);
    for (let i = 0; i < 4; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(routes).toEqual(['/api/dsh-practical-tools/official-features']);
  });
});

/** 等待接线内部的异步启动与重新施加落定。 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** 行接线用的宿主上下文：loader、存储域与可选的启动完成信号。 */
function makeRowCtx(options: {
  loader: ReturnType<typeof makeLoader>;
  off?: string[];
  appReady?: { onReady(listener: () => void): () => void };
}) {
  let record = [...(options.off ?? [])];
  const storeReads: number[] = [];
  const closes: number[] = [];
  const routes: string[] = [];
  let cleanup: (() => void) | undefined;
  const logger = { debug: () => {}, info: () => {}, warn: () => {} };
  const injected = {
    connection: {
      fetch: {
        register: (route: { path: string }) => {
          routes.push(route.path);
          return () => {};
        },
      },
    },
    get(name: string) {
      if (name === 'loader') return options.loader;
      if (name === 'appReady') return options.appReady;
      return undefined;
    },
    get storageDomain() {
      return {
        open: async () => ({
          global: {
            get: () => {
              storeReads.push(1);
              return { version: 1, off: record };
            },
            set: async (value: { off: string[] }) => {
              record = [...value.off];
            },
          },
          close: async () => {
            closes.push(1);
          },
        }),
      };
    },
    logger,
    effect(fn: () => unknown) {
      cleanup = fn() as (() => void) | undefined;
    },
    on() {
      return () => {};
    },
  };
  const ctx = {
    get: injected.get,
    inject(deps: string[], callback: (context: unknown) => void) {
      if (!deps.includes('storageDomain')) throw new Error('missing storageDomain dep');
      callback(injected);
      return () => true;
    },
    effect: injected.effect,
  };
  return {
    ctx,
    storeReads,
    closes,
    routes,
    runCleanup: () => cleanup?.(),
  };
}

describe('启动完成信号', () => {
  it('启动施加一次，启动完成后再施加一次', async () => {
    const loader = makeLoader([
      { id: 'include:schedule', disabled: true },
      { id: 'include:ui-schedule', disabled: true },
    ]);
    const listeners: Array<() => void> = [];
    const row = makeRowCtx({
      loader,
      off: ['schedule'],
      appReady: {
        onReady(listener) {
          listeners.push(listener);
          return () => {};
        },
      },
    });

    applyRow(row.ctx as never);
    await flush();
    expect(row.routes).toEqual(['/api/dsh-practical-tools/official-features']);
    expect(row.storeReads).toHaveLength(1);
    expect(listeners).toHaveLength(1);

    listeners[0]();
    await flush();
    expect(row.storeReads).toHaveLength(2);
  });

  it('宿主未提供启动完成信号时只施加一次', async () => {
    const loader = makeLoader([
      { id: 'include:schedule', disabled: true },
      { id: 'include:ui-schedule', disabled: true },
    ]);
    const row = makeRowCtx({ loader, off: ['schedule'] });

    applyRow(row.ctx as never);
    await flush();
    expect(row.storeReads).toHaveLength(1);
  });

  it('行卸载时取消启动完成信号的监听', async () => {
    const loader = makeLoader([{ id: 'include:schedule', disabled: true }]);
    let cancelled = 0;
    const row = makeRowCtx({
      loader,
      off: ['schedule'],
      appReady: {
        onReady() {
          return () => {
            cancelled += 1;
          };
        },
      },
    });

    applyRow(row.ctx as never);
    await flush();
    row.runCleanup();
    await flush();
    expect(cancelled).toBe(1);
    expect(row.closes).toHaveLength(1);
  });
});

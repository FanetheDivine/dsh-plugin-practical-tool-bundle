// 重新施加与生命周期测试：重组后按记录重新施加、并发时标记处理中、本行停用后撤销。
import { describe, expect, it } from 'vitest';
import { apply as applyRow, createFeatureService } from '../src/official-features/index.ts';
import type { OffStore } from '../src/official-features/store.ts';
import { makeLoader } from './helpers.ts';

/** 内存记录。 */
function makeStore(initial: string[] = []): OffStore & { peek(): string[] } {
  let off = [...initial];
  return {
    read: () => [...off],
    write: async (next) => {
      off = [...next];
    },
    close: async () => {},
    peek: () => [...off],
  };
}

/** 三个宿主行都在运行。 */
function runningLoader() {
  return makeLoader([
    { id: 'include:schedule', disabled: false, fiber: { state: 2 } },
    { id: 'include:ui-schedule', disabled: false, fiber: { state: 2 } },
    { id: 'include:ui-goal', disabled: false, fiber: { state: 2 } },
  ]);
}

describe('reapply', () => {
  it('按记录重新施加全部关闭的功能', async () => {
    const loader = runningLoader();
    const store = makeStore(['goal']);
    const service = createFeatureService({ loader, store, waitMs: 0 });
    await service.reapply();
    expect(loader.entry('include:ui-goal')?.disabled).toBe(true);
    expect(loader.entry('include:schedule')?.disabled).toBe(false);
  });

  it('记录为空时不做任何改动', async () => {
    const loader = runningLoader();
    const service = createFeatureService({ loader, store: makeStore(), waitMs: 0 });
    await service.reapply();
    expect(loader.calls).toEqual([]);
  });

  it('记录里的功能已被外部关闭时，重新施加不重复写入', async () => {
    const loader = makeLoader([
      { id: 'include:ui-goal', disabled: true },
      { id: 'include:goal', disabled: true },
      { id: 'include:goal-round-driver', disabled: true },
    ]);
    const service = createFeatureService({ loader, store: makeStore(['goal']), waitMs: 0 });
    await service.reapply();
    expect(loader.calls).toEqual([]);
  });

  it('单次施加失败不抛出，下一轮重试', async () => {
    const loader = runningLoader();
    const baseUpdate = loader.update.bind(loader);
    let failures = 1;
    const flaky = Object.assign(loader, {
      update: async (id: string, options: { disabled?: boolean }) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error('loader rejected');
        }
        return baseUpdate(id, options);
      },
    });
    const service = createFeatureService({
      loader: flaky,
      store: makeStore(['goal']),
      waitMs: 0,
      reapplyAttempts: 3,
      reapplyIntervalMs: 0,
    });
    await expect(service.reapply()).resolves.toBeUndefined();
    expect(loader.entry('include:ui-goal')?.disabled).toBe(true);
  });

  it('首轮 loader 条目还没列全时重试到生效', async () => {
    const loader = runningLoader();
    const baseEntries = loader.entries.bind(loader);
    let calls = 0;
    const partial = Object.assign(loader, {
      entries: () => {
        calls += 1;
        return calls <= 2 ? [] : baseEntries();
      },
    });
    const service = createFeatureService({
      loader: partial,
      store: makeStore(['goal']),
      waitMs: 0,
      reapplyAttempts: 5,
      reapplyIntervalMs: 0,
    });
    await service.reapply();
    expect(loader.entry('include:ui-goal')?.disabled).toBe(true);
  });
});

describe('多个功能叠加', () => {
  /** 一个含四个受管子行的 preset。 */
  function presetLoader() {
    return makeLoader([
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
              { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
              { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo' },
              { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
            ],
          },
        },
      },
      { id: 'include:ui-goal', disabled: false, fiber: { state: 2 } },
    ]);
  }

  /** 当前 preset 的子行 id。 */
  function ids(loader: ReturnType<typeof makeLoader>): string[] {
    const config = loader.entry('include:preset-standard')?.options?.config as {
      plugins: Array<{ id: string }>;
    };
    return config.plugins.map((row) => row.id);
  }

  it('关掉两个功能后各自子行都不在，打开一个只恢复它', async () => {
    const loader = presetLoader();
    const service = createFeatureService({ loader, store: makeStore(), waitMs: 0 });
    await service.toggle('goal', false);
    await service.toggle('task', false);
    expect(ids(loader)).toEqual(['tool-schedule', 'present']);

    await service.toggle('goal', true);
    // 恢复按基线顺序放回：tool-goal 回到 tool-schedule 之后。
    expect(ids(loader)).toEqual(['tool-schedule', 'tool-goal', 'present']);
  });

  it('两个都打开后回到原始顺序', async () => {
    const loader = presetLoader();
    const service = createFeatureService({ loader, store: makeStore(), waitMs: 0 });
    await service.toggle('schedule', false);
    await service.toggle('present', false);
    await service.toggle('schedule', true);
    await service.toggle('present', true);
    expect(ids(loader)).toEqual(['tool-schedule', 'tool-goal', 'tool-todo', 'present']);
  });
});

describe('busy', () => {
  it('切换进行中报告处理中，结束后恢复', async () => {
    let release: (() => void) | undefined;
    const loader = makeLoader([{ id: 'include:ui-goal', disabled: false, fiber: { state: 2 } }]);
    const slow = Object.assign(loader, {
      update: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });
    const service = createFeatureService({ loader: slow, store: makeStore(), waitMs: 0 });
    const pending = service.toggle('goal', false);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(service.busy()).toBe(true);
    expect(release).toBeTypeOf('function');
    release?.();
    await pending;
    expect(service.busy()).toBe(false);
  });
});

describe('dispose', () => {
  it('撤销本包做过的全部改动，并保留记录', async () => {
    const loader = runningLoader();
    const store = makeStore();
    const service = createFeatureService({ loader, store, waitMs: 0 });
    await service.toggle('goal', false);
    expect(loader.entry('include:ui-goal')?.disabled).toBe(true);

    await service.dispose();
    expect(loader.entry('include:ui-goal')?.disabled).toBe(false);
    expect(store.peek()).toEqual(['goal']);
  });
});

describe('apply 的行接线', () => {
  /** 造一个够用的宿主 ctx：记录 effect 清理、事件监听与路由注册。 */
  function makeHostCtx(loader: ReturnType<typeof makeLoader>, store: OffStore) {
    let off = store.read() as string[];
    const disposers: Array<() => void> = [];
    const listeners: Array<() => void> = [];
    const routes: string[] = [];
    const warnings: unknown[][] = [];
    const storageDomain = {
      open: async () => ({
        global: {
          get: () => ({ version: 1, off }),
          set: async (value: { off: string[] }) => {
            off = [...value.off];
            await store.write(off);
          },
        },
        close: async () => {},
      }),
    };
    const ctx = {
      get: (name: string) => (name === 'loader' ? loader : undefined),
      storageDomain,
      logger: {
        debug: () => {},
        info: () => {},
        warn: (...args: unknown[]) => warnings.push(args),
      },
      inject(deps: string[], callback: (injected: unknown) => void) {
        if (!deps.includes('connection') || !deps.includes('storageDomain')) {
          throw new Error(`unexpected deps ${deps.join(',')}`);
        }
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
          storageDomain,
        });
        return () => true;
      },
      effect(fn: () => unknown) {
        const disposer = fn();
        if (typeof disposer === 'function') disposers.push(disposer as () => void);
        return () => true;
      },
      on(type: string, fn: () => void) {
        if (type === 'app-boot/config-reload') listeners.push(fn);
        return () => {};
      },
      _dispose: () => {
        for (const disposer of disposers.splice(0).reverse()) disposer();
      },
      _reload: () => {
        for (const listener of listeners.splice(0)) listener();
      },
      _routes: routes,
      _warnings: warnings,
    };
    return ctx;
  }

  /** 等异步接线跑完。 */
  const flush = async () => {
    for (let i = 0; i < 4; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };

  it('启用时注册路由并订阅重组事件', async () => {
    const loader = runningLoader();
    const ctx = makeHostCtx(loader, makeStore(['goal']));
    applyRow(ctx as never);
    await flush();
    expect(ctx._routes).toHaveLength(1);
    // 启动时已按记录施加
    expect(loader.entry('include:ui-goal')?.disabled).toBe(true);
  });

  it('重组事件触发后重新施加', async () => {
    const loader = runningLoader();
    const ctx = makeHostCtx(loader, makeStore(['goal']));
    applyRow(ctx as never);
    await flush();
    // 模拟重组把行还原
    await loader.update('include:ui-goal', { disabled: false });
    expect(loader.entry('include:ui-goal')?.disabled).toBe(false);

    ctx._reload();
    await flush();
    expect(loader.entry('include:ui-goal')?.disabled).toBe(true);
  });

  it('本行停用时撤销全部施加，且不抛出', async () => {
    const loader = runningLoader();
    const ctx = makeHostCtx(loader, makeStore(['goal']));
    applyRow(ctx as never);
    await flush();
    expect(loader.entry('include:ui-goal')?.disabled).toBe(true);
    ctx._dispose();
    await flush();
    expect(loader.entry('include:ui-goal')?.disabled).toBe(false);
  });
});

describe('施加轮数用尽', () => {
  it('写一条 warn，包含未达成的功能 id', async () => {
    const loader = runningLoader();
    const warnings: string[] = [];
    const rejected = Object.assign(loader, {
      update: async () => {
        throw new Error('loader rejected');
      },
    });
    const service = createFeatureService({
      loader: rejected,
      store: makeStore(['goal']),
      waitMs: 0,
      reapplyAttempts: 2,
      reapplyIntervalMs: 0,
      warn: (message) => warnings.push(message),
    });

    await service.reapply();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('goal');
  });

  it('达成后不再写 warn', async () => {
    const loader = runningLoader();
    const warnings: string[] = [];
    const service = createFeatureService({
      loader,
      store: makeStore(['goal']),
      waitMs: 0,
      reapplyAttempts: 2,
      reapplyIntervalMs: 0,
      warn: (message) => warnings.push(message),
    });

    await service.reapply();
    expect(warnings).toEqual([]);
  });
});

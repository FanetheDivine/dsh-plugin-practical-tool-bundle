// 前端状态轮询测试：按状态路由的结论挂载与卸载界面块，取不到结论时保持现状。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRowWatch } from '../src/client/status.ts';
import type { Context } from '../src/types.ts';

/** 记录启动与卸载的插件。 */
interface Mounted {
  name?: string;
  disposed: boolean;
}

/** 造一个记录 plugin 调用的前端 ctx；不执行插件体，只验证装卸。 */
function makeWatchCtx() {
  const mounted: Mounted[] = [];
  const ctx = {
    plugin(plugin: { name?: string; apply?: (ctx: unknown) => void }) {
      const record: Mounted = { name: plugin.name, disposed: false };
      mounted.push(record);
      return {
        dispose: async () => {
          record.disposed = true;
        },
      };
    },
  };
  return { ctx: ctx as unknown as Context, mounted };
}

/** 浏览器的桩对象，返回可见性监听表。 */
function stubBrowser() {
  const listeners = new Map<string, Array<() => void>>();
  const documentStub = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (type: string, listener: () => void) => {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener: () => undefined,
  };
  const windowStub = {
    addEventListener: (type: string, listener: () => void) => {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener: () => undefined,
  };
  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('setInterval', () => 0);
  vi.stubGlobal('clearInterval', () => undefined);
  return { listeners, documentStub };
}

/** 让已排队的 Promise 跑完。 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 状态路由的 fetch 桩。 */
function stubStatus(rows: Record<string, boolean | null>) {
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ rows }) }));
}

describe('startRowWatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('可用行为 true 时挂载对应界面块', async () => {
    stubBrowser();
    stubStatus({ sweeper: true, restart: false, mobile: null });
    const { ctx, mounted } = makeWatchCtx();
    const stop = startRowWatch(ctx);
    await flush();
    expect(mounted.map((item) => item.name)).toEqual(['dsh-plugin-practical-tool-bundle/sweeper']);
    stop();
  });

  it('状态变为 false 时卸载已在运行的块，null 保持现状', async () => {
    const { listeners } = stubBrowser();
    stubStatus({ sweeper: true, restart: false, mobile: null });
    const { ctx, mounted } = makeWatchCtx();
    const stop = startRowWatch(ctx);
    await flush();
    expect(mounted).toHaveLength(1);

    stubStatus({ sweeper: false, restart: null, mobile: null });
    for (const listener of listeners.get('focus') ?? []) listener();
    await flush();
    expect(mounted[0]?.disposed).toBe(true);
    stop();
  });

  it('请求失败时保留已挂载的界面块', async () => {
    stubBrowser();
    stubStatus({ sweeper: true, restart: false, mobile: false });
    const { ctx, mounted } = makeWatchCtx();
    const stop = startRowWatch(ctx);
    await flush();
    expect(mounted).toHaveLength(1);

    vi.stubGlobal('fetch', async () => ({ ok: false, status: 502, json: async () => null }));
    const { listeners } = stubBrowser();
    for (const listener of listeners.get('focus') ?? []) listener();
    await flush();
    expect(mounted[0]?.disposed).toBe(false);
    stop();
  });

  it('卸载函数清掉已挂载的块', async () => {
    stubBrowser();
    stubStatus({ sweeper: true, restart: true, mobile: true });
    const { ctx, mounted } = makeWatchCtx();
    const stop = startRowWatch(ctx);
    await flush();
    expect(mounted).toHaveLength(3);
    stop();
    expect(mounted.every((item) => item.disposed)).toBe(true);
  });
});

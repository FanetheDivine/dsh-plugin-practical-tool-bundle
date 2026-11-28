// 标准模式叠加行测试：变换、幂等、恢复、重载与缺失依赖。
import { describe, expect, it } from 'vitest';

import { applyPresetRows, createSnapshot } from '../src/official-features/apply.ts';
import {
  apply,
  BEHAVIOR_ID,
  BEHAVIOR_NAME,
  overlayConfig,
  overlayPlugins,
  PERSONA_MODULE,
} from '../src/standard-codex/index.ts';
import { type FakeLoaderEntry, type FakeLoaderUpdate, makeCtx, makeLoader } from './helpers.ts';

/** 一条 profile 条目。 */
type Entry = FakeLoaderEntry;

/** 造一个 persona 子行。 */
function persona(prefix = 'You are a coding agent powered by the {{model}} model.') {
  return { id: 'persona', name: PERSONA_MODULE, config: { prefix } };
}

/** 造一个标准预设声明条目。 */
function standardEntry(
  plugins: unknown[] = [persona(), { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' }],
): Entry {
  return {
    id: 'include:preset-standard',
    disabled: false,
    options: {
      name: '@deepseek-ai/dsh-agent-preset',
      config: { id: 'standard', order: 1, plugins },
    },
  };
}

/** 等待 apply 里的异步链完成。 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 把 loader 挂到模拟 ctx 上。 */
function withLoader(entries: Entry[]) {
  const ctx = makeCtx();
  const loader = makeLoader(entries);
  Object.assign(ctx as unknown as Record<string, unknown>, {
    loader,
    get: (name: string) => (name === 'loader' ? loader : undefined),
  });
  return { ctx, loader };
}

describe('overlayPlugins', () => {
  it('清空 persona 前缀并追加行为子行，其它子行原样保留', () => {
    const rows = [persona(), { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' }];
    const { plugins, changed } = overlayPlugins(rows);
    expect(changed).toBe(true);
    expect(plugins).toHaveLength(3);
    expect(plugins[0]).toMatchObject({ id: 'persona', config: { prefix: '' } });
    expect(plugins[1]).toBe(rows[1]);
    expect(plugins[2]).toEqual({ id: BEHAVIOR_ID, name: BEHAVIOR_NAME });
  });

  it('已有行为子行时不再追加', () => {
    const rows = [persona(), { id: BEHAVIOR_ID, name: BEHAVIOR_NAME }];
    const { plugins, changed } = overlayPlugins(rows);
    expect(changed).toBe(true);
    expect(plugins).toHaveLength(2);
    expect(plugins.filter((row) => (row as { id?: string }).id === BEHAVIOR_ID)).toHaveLength(1);
  });

  it('目标状态已满足时报告未改动', () => {
    const rows = [
      persona(''),
      { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
      { id: BEHAVIOR_ID, name: BEHAVIOR_NAME },
    ];
    const { plugins, changed } = overlayPlugins(rows);
    expect(changed).toBe(false);
    expect(plugins).toEqual(rows);
  });

  it('persona 子行没有对象 config 时保持原样', () => {
    const rows = [
      { id: 'persona', name: PERSONA_MODULE },
      { id: BEHAVIOR_ID, name: BEHAVIOR_NAME },
    ];
    const { plugins, changed } = overlayPlugins(rows);
    expect(changed).toBe(false);
    expect(plugins).toEqual(rows);
  });
});

describe('overlayConfig', () => {
  it('只处理 id 为 standard 且 plugins 是数组的配置', () => {
    expect(overlayConfig({ id: 'cordis', plugins: [] })).toBeUndefined();
    expect(overlayConfig({ id: 'standard', plugins: 'x' })).toBeUndefined();
    expect(overlayConfig(null)).toBeUndefined();
  });

  it('保留配置的其它字段', () => {
    const config = { id: 'standard', order: 1, name: '标准模式', plugins: [persona()] };
    const desired = overlayConfig(config) as Record<string, unknown>;
    expect(desired['order']).toBe(1);
    expect(desired['name']).toBe('标准模式');
    expect(desired['plugins']).toHaveLength(2);
  });
});

describe('standard-codex 行', () => {
  it('启动时写回一次目标配置，其它子行不动', async () => {
    const rows = [persona(), { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' }];
    const { ctx, loader } = withLoader([
      standardEntry(rows),
      {
        id: 'include:preset-cordis',
        disabled: false,
        options: { name: '@deepseek-ai/dsh-agent-preset', config: { id: 'cordis', plugins: [] } },
      },
    ]);
    apply(ctx);
    await flush();
    expect(loader.calls).toHaveLength(1);
    expect(loader.calls[0]?.id).toBe('include:preset-standard');
    const first = loader.calls[0] as FakeLoaderUpdate;
    const plugins = (
      first.options.config as {
        plugins: Array<{ id?: string; config?: { prefix?: string } }>;
      }
    ).plugins;
    expect(plugins.map((row) => row.id)).toEqual(['persona', 'tool-fs', BEHAVIOR_ID]);
    expect(plugins[0]?.config?.prefix).toBe('');
    expect(plugins[1]).toBe(rows[1]);
  });

  it('重复施加不重复写回', async () => {
    const { ctx, loader } = withLoader([standardEntry()]);
    apply(ctx);
    await flush();
    await flush();
    expect(loader.calls).toHaveLength(1);
  });

  it('配置重组后从文件状态重新施加', async () => {
    const original = standardEntry();
    const fileConfig = original.options?.config;
    const { ctx, loader } = withLoader([original]);
    apply(ctx);
    await flush();
    // 模拟重组：条目回到文件状态
    const entry = loader.entry('include:preset-standard');
    if (entry) entry.options = { ...entry.options, config: fileConfig };
    loader.calls.length = 0;
    ctx._emit('app-boot/config-reload');
    await flush();
    expect(loader.calls).toHaveLength(1);
    const first = loader.calls[0] as FakeLoaderUpdate;
    expect((first.options.config as { plugins: unknown[] }).plugins).toHaveLength(3);
  });

  it('停用时恢复首次施加前的配置', async () => {
    const original = standardEntry();
    const fileConfig = original.options?.config;
    const { ctx, loader } = withLoader([original]);
    apply(ctx);
    await flush();
    loader.calls.length = 0;
    ctx._dispose();
    await flush();
    expect(loader.calls).toHaveLength(1);
    expect(loader.calls[0]?.options.config).toEqual(fileConfig);
  });

  it('没有标准预设时不写回', async () => {
    const { ctx, loader } = withLoader([
      {
        id: 'include:preset-cordis',
        disabled: false,
        options: { name: '@deepseek-ai/dsh-agent-preset', config: { id: 'cordis', plugins: [] } },
      },
    ]);
    apply(ctx);
    await flush();
    expect(loader.calls).toHaveLength(0);
  });

  it('停用的标准预设不写回', async () => {
    const entry = standardEntry();
    entry.disabled = true;
    const { ctx, loader } = withLoader([entry]);
    apply(ctx);
    await flush();
    expect(loader.calls).toHaveLength(0);
  });

  it('loader 缺失时只记 warn', () => {
    const ctx = makeCtx();
    Object.assign(ctx as unknown as Record<string, unknown>, { get: () => undefined });
    apply(ctx);
    expect(ctx._loggerCalls.some((call) => call.level === 'warn')).toBe(true);
  });
});

describe('与 official-features 共存', () => {
  it('功能重算后保留空 persona 前缀与行为子行', async () => {
    const rows = [
      persona(),
      { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
      {
        id: 'planning',
        name: 'cordis:group',
        group: true,
        config: [{ id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode' }],
      },
    ];
    const original = standardEntry(rows);
    const { ctx, loader } = withLoader([original]);
    apply(ctx);
    await flush();

    // 模拟官方功能开关重算：关闭 plan
    const snapshot = createSnapshot();
    await applyPresetRows(loader, ['plan'], snapshot);
    const config = loader.entry('include:preset-standard')?.options?.config as {
      plugins: Array<{ id?: string; config?: { prefix?: string } }>;
    };
    const ids = config.plugins.map((row) => row.id);
    expect(ids).toContain(BEHAVIOR_ID);
    expect(ids).not.toContain('planning');
    expect(config.plugins[0]?.config?.prefix).toBe('');
  });
});

// preset 撤销测试：一个开关作用于全部 preset 声明，撤销只还原本包摘掉的子行。
import { describe, expect, it } from 'vitest';

import {
  applyPresetRows,
  createSnapshot,
  resetPresetBaseline,
} from '../src/official-features/apply.ts';
import { featureOf } from '../src/official-features/catalog.ts';
import { makeLoader } from './helpers.ts';

/** 造一条 preset 声明行。 */
function preset(id: string, plugins: unknown[]) {
  return {
    id,
    disabled: false,
    fiber: { state: 2 },
    options: { name: '@deepseek-ai/dsh-agent-preset', config: { id, plugins } },
  };
}

/** 取某个 preset 的子行 id 列表。 */
function idsOf(loader: ReturnType<typeof makeLoader>, entryId: string): string[] {
  const config = loader.entry(entryId)?.options?.config as
    | { plugins?: Array<{ id?: string }> }
    | undefined;
  return (config?.plugins ?? []).map((row) => row.id ?? '');
}

/** 一份标准 preset 的子行，含 group 与表达式。 */
function standardPlugins() {
  return [
    { id: 'persona', name: '@deepseek-ai/dsh-persona' },
    {
      id: 'tool-bash',
      name: '@deepseek-ai/dsh-tool-bash',
      disabled: { __jsExpr: "process.platform === 'win32'" },
    },
    { id: 'tool-schedule', name: '@deepseek-ai/dsh-tool-schedule' },
    { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
    { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
    {
      id: 'planning',
      name: 'cordis:group',
      group: true,
      isolate: { planMode: true },
      config: [{ id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode', config: { section: 'x' } }],
    },
    { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo' },
    { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
  ];
}

describe('applyPresetRows 关闭', () => {
  it('摘掉 goal 的两个子行，其余子行顺序不变', async () => {
    const loader = makeLoader([preset('include:preset-standard', standardPlugins())]);
    const snapshot = createSnapshot();
    await applyPresetRows(loader, ['goal'], snapshot);
    expect(idsOf(loader, 'include:preset-standard')).toEqual([
      'persona',
      'tool-bash',
      'tool-schedule',
      'planning',
      'tool-todo',
      'present',
    ]);
  });

  it('未改动的子行连表达式对象都原样保留', async () => {
    const loader = makeLoader([preset('include:preset-standard', standardPlugins())]);
    await applyPresetRows(loader, ['goal'], createSnapshot());
    const config = loader.entry('include:preset-standard')?.options?.config as {
      plugins: Array<{ id: string; disabled?: unknown }>;
    };
    const bash = config.plugins.find((row) => row.id === 'tool-bash');
    expect(bash?.disabled).toEqual({ __jsExpr: "process.platform === 'win32'" });
  });

  it('plan 关掉后 planning 组整组移除', async () => {
    const loader = makeLoader([preset('include:preset-standard', standardPlugins())]);
    await applyPresetRows(loader, ['plan'], createSnapshot());
    expect(idsOf(loader, 'include:preset-standard')).not.toContain('planning');
  });

  it('同一功能在多个 preset 声明里都被摘掉', async () => {
    const loader = makeLoader([
      preset('include:preset-standard', standardPlugins()),
      preset('include:preset-ptc', [{ id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' }]),
    ]);
    await applyPresetRows(loader, ['goal'], createSnapshot());
    expect(idsOf(loader, 'include:preset-ptc')).toEqual([]);
  });

  it('不含受管子行的 preset 不被改写', async () => {
    const loader = makeLoader([
      preset('include:preset-minimal', [{ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' }]),
    ]);
    await applyPresetRows(loader, ['goal'], createSnapshot());
    expect(loader.calls).toEqual([]);
  });

  it('用户新建的 preset 声明同样被覆盖', async () => {
    const loader = makeLoader([
      preset('include:preset-mine', [
        { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
        { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web' },
      ]),
    ]);
    await applyPresetRows(loader, ['goal'], createSnapshot());
    expect(idsOf(loader, 'include:preset-mine')).toEqual(['tool-web']);
  });

  it('重复施加同一组关闭不产生新的写入', async () => {
    const loader = makeLoader([preset('include:preset-standard', standardPlugins())]);
    const snapshot = createSnapshot();
    await applyPresetRows(loader, ['goal'], snapshot);
    loader.calls.length = 0;
    await applyPresetRows(loader, ['goal'], snapshot);
    expect(loader.calls).toEqual([]);
  });
});

describe('applyPresetRows 撤销', () => {
  it('全部打开后与原始配置深度相等', async () => {
    const original = standardPlugins();
    const loader = makeLoader([preset('include:preset-standard', original)]);
    const snapshot = createSnapshot();
    await applyPresetRows(loader, ['goal', 'plan'], snapshot);
    await applyPresetRows(loader, [], snapshot);
    const config = loader.entry('include:preset-standard')?.options?.config;
    expect(config).toEqual({ id: 'include:preset-standard', plugins: original });
  });

  it('多个功能先后关闭再逐个打开，最终等于原始', async () => {
    const original = standardPlugins();
    const loader = makeLoader([preset('include:preset-standard', original)]);
    const snapshot = createSnapshot();
    await applyPresetRows(loader, ['goal'], snapshot);
    await applyPresetRows(loader, ['goal', 'schedule'], snapshot);
    await applyPresetRows(loader, ['schedule'], snapshot);
    expect(idsOf(loader, 'include:preset-standard')).not.toContain('tool-schedule');
    await applyPresetRows(loader, [], snapshot);
    const config = loader.entry('include:preset-standard')?.options?.config;
    expect(config).toEqual({ id: 'include:preset-standard', plugins: original });
  });

  it('只摘掉本包的受管子行，用户改过的其他子行保持不动', async () => {
    const loader = makeLoader([preset('include:preset-standard', standardPlugins())]);
    const snapshot = createSnapshot();
    await applyPresetRows(loader, ['goal'], snapshot);
    // 用户在关闭期间改了别的子行
    const config = loader.entry('include:preset-standard')?.options?.config as {
      plugins: Array<{ id: string; config?: unknown }>;
      id: string;
    };
    await loader.update('include:preset-standard', {
      config: {
        ...config,
        plugins: config.plugins.map((row) =>
          row.id === 'persona' ? { ...row, config: { prefix: 'edited' } } : row,
        ),
      },
    });
    await applyPresetRows(loader, [], snapshot);
    const restored = loader.entry('include:preset-standard')?.options?.config as {
      plugins: Array<{ id: string; config?: unknown }>;
    };
    expect(restored.plugins.find((row) => row.id === 'persona')?.config).toEqual({
      prefix: 'edited',
    });
    expect(restored.plugins.map((row) => row.id)).toContain('tool-goal');
  });

  it('重置基线后不复活外部已移除的子行', async () => {
    const loader = makeLoader([preset('include:preset-standard', standardPlugins())]);
    const snapshot = createSnapshot();
    await applyPresetRows(loader, ['goal'], snapshot);
    // 外部把 goal 子行彻底删掉，随后配置重组
    const config = loader.entry('include:preset-standard')?.options?.config as {
      plugins: Array<{ id: string }>;
      id: string;
    };
    await loader.update('include:preset-standard', {
      config: { ...config, plugins: config.plugins.filter((row) => row.id !== 'command-goal') },
    });
    resetPresetBaseline(snapshot);
    await applyPresetRows(loader, [], snapshot);
    expect(idsOf(loader, 'include:preset-standard')).not.toContain('command-goal');
  });

  it('受管功能全部打开时与关闭前的基线一致', async () => {
    const original = standardPlugins();
    const loader = makeLoader([preset('include:preset-standard', original)]);
    const snapshot = createSnapshot();
    await applyPresetRows(loader, ['present'], snapshot);
    expect(idsOf(loader, 'include:preset-standard')).not.toContain('present');
    await applyPresetRows(loader, [], snapshot);
    expect(idsOf(loader, 'include:preset-standard')).toContain('present');
  });
});

describe('功能定义与 preset 的关系', () => {
  it('plan 的受管模块只有 plan-mode，不涉及提问界面行', () => {
    expect(featureOf('plan')?.presetModules).toEqual(['@deepseek-ai/dsh-plan-mode']);
  });

  it('present 只摘 present 工具，不动界面行', () => {
    expect(featureOf('present')?.presetModules).toEqual(['@deepseek-ai/dsh-tool-present']);
    expect(featureOf('present')?.hostRows).not.toContain('ui-deliverables');
  });
});

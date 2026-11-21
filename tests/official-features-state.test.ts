// 功能状态测试：宿主行与 preset 子行共同决定开关，覆盖 Web 面本来停用的行与嵌套组。
import { describe, expect, it } from 'vitest';

import { featureOf } from '../src/official-features/catalog.ts';
import { readFeatureStates } from '../src/official-features/state.ts';
import type { FakeLoader, FakeLoaderEntry } from './helpers.ts';
import { makeLoader } from './helpers.ts';

/** 造一条 preset 声明行。 */
function preset(id: string, plugins: unknown[]): FakeLoaderEntry {
  return {
    id,
    disabled: false,
    fiber: { state: 2 },
    options: { name: '@deepseek-ai/dsh-agent-preset', config: { id, plugins } },
  };
}

/** 一条 preset 子行。 */
function row(id: string, name: string, extra: Record<string, unknown> = {}) {
  return { id, name, ...extra };
}

/** 正在运行的宿主行。 */
function host(id: string): FakeLoaderEntry {
  return { id, disabled: false, fiber: { state: 2 } };
}

/** 已停用的宿主行（Web 面的常态）。 */
function offHost(id: string): FakeLoaderEntry {
  return { id, disabled: true };
}

/** 取某功能在结果里的开关。 */
function on(loader: FakeLoader, id: string): boolean | undefined {
  return readFeatureStates(loader).find((row) => row.id === id)?.on;
}

describe('readFeatureStates 的宿主行部分', () => {
  it('宿主行在运行时该功能为开，全部停用或缺失时为关', () => {
    const loader = makeLoader([host('include:schedule'), host('include:ui-schedule')]);
    expect(on(loader, 'schedule')).toBe(true);

    const idle = makeLoader([offHost('include:schedule'), offHost('include:ui-schedule')]);
    expect(on(idle, 'schedule')).toBe(false);

    const missing = makeLoader([host('include:ui-schedule')]);
    expect(on(missing, 'goal')).toBe(false);
  });

  it('fiber 未进入运行状态的行不算启用', () => {
    const loader = makeLoader([{ id: 'include:ui-plan', disabled: false, fiber: { state: 0 } }]);
    expect(on(loader, 'plan')).toBe(false);
  });
});

describe('readFeatureStates 的 preset 部分', () => {
  it('preset 子行仍在时即使宿主行停用也算开', () => {
    const loader = makeLoader([
      offHost('include:tool-todo'),
      preset('include:preset-standard', [row('tool-todo', '@deepseek-ai/dsh-tool-todo')]),
    ]);
    expect(on(loader, 'task')).toBe(true);
  });

  it('子行被其自身 config 停用时不算启用', () => {
    const loader = makeLoader([
      preset('include:preset-standard', [
        row('tool-todo', '@deepseek-ai/dsh-tool-todo', { disabled: true }),
      ]),
    ]);
    expect(on(loader, 'task')).toBe(false);
  });

  it('停用表达式不作字面判断，交给宿主求值', () => {
    const loader = makeLoader([
      preset('include:preset-standard', [
        row('tool-todo', '@deepseek-ai/dsh-tool-todo', { disabled: { __jsExpr: 'true' } }),
      ]),
    ]);
    expect(on(loader, 'task')).toBe(true);
  });

  it('嵌套在 cordis:group 里的子行同样识别', () => {
    const loader = makeLoader([
      preset('include:preset-standard', [
        row('tool-skill', '@deepseek-ai/dsh-tool-skill'),
        {
          id: 'planning',
          name: 'cordis:group',
          group: true,
          config: [row('plan-mode', '@deepseek-ai/dsh-plan-mode')],
        },
      ]),
    ]);
    expect(on(loader, 'plan')).toBe(true);
  });

  it('组里两个受管子行只摘掉一个时仍算开', () => {
    const loader = makeLoader([
      preset('include:preset-standard', [
        row('command-goal', '@deepseek-ai/dsh-command-goal'),
        row('tool-goal', '@deepseek-ai/dsh-tool-goal'),
      ]),
    ]);
    const trimmed = makeLoader([
      preset('include:preset-standard', [row('command-goal', '@deepseek-ai/dsh-command-goal')]),
    ]);
    expect(on(loader, 'goal')).toBe(true);
    expect(on(trimmed, 'goal')).toBe(true);
    const none = makeLoader([preset('include:preset-standard', [])]);
    expect(on(none, 'goal')).toBe(false);
  });

  it('看全部 preset 声明：任一仍含受管子行即为开', () => {
    const loader = makeLoader([
      preset('include:preset-standard', []),
      preset('include:preset-ptc', [row('tool-goal', '@deepseek-ai/dsh-tool-goal')]),
    ]);
    expect(on(loader, 'goal')).toBe(true);
  });

  it('不含受管子行的 preset（如 minimal）不影响结果', () => {
    const loader = makeLoader([
      preset('include:preset-minimal', [row('tool-fs', '@deepseek-ai/dsh-tool-fs')]),
    ]);
    expect(readFeatureStates(loader).every((row) => row.on === false)).toBe(true);
  });

  it('受管模块名与功能定义一致', () => {
    const goal = featureOf('goal');
    expect(goal?.presetModules).toEqual([
      '@deepseek-ai/dsh-command-goal',
      '@deepseek-ai/dsh-tool-goal',
    ]);
  });

  it('没有 preset 声明时只看宿主行', () => {
    const loader = makeLoader([offHost('include:ui-plan')]);
    expect(on(loader, 'plan')).toBe(false);
  });
});

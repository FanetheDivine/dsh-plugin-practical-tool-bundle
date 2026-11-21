// 施加测试：按功能停用与恢复宿主行，记录原始值，不碰受管行之外的条目。
import { describe, expect, it } from 'vitest';
import { applyFeature, createSnapshot } from '../src/official-features/apply.ts';
import { type FeatureId, featureOf } from '../src/official-features/catalog.ts';
import { makeLoader } from './helpers.ts';

/** 取一个功能定义，缺失即测试写错。 */
function spec(id: FeatureId) {
  const found = featureOf(id);
  if (found === undefined) throw new Error(`unknown feature ${id}`);
  return found;
}

/** 造一组正在运行的宿主行。 */
function running(ids: readonly string[]) {
  return ids.map((id) => ({ id, disabled: false, fiber: { state: 2 } }));
}

describe('applyFeature 的宿主行部分', () => {
  it('关闭 schedule 时停用 schedule 与 ui-schedule，且只动这两行', async () => {
    const loader = makeLoader([
      { id: 'include:schedule', disabled: false, fiber: { state: 2 } },
      { id: 'include:ui-schedule', disabled: false, fiber: { state: 2 } },
      { id: 'include:ui-goal', disabled: false, fiber: { state: 2 } },
    ]);
    const snapshot = createSnapshot();
    await applyFeature(loader, spec('schedule'), true, snapshot);
    expect(loader.calls).toEqual([
      { id: 'include:schedule', options: { disabled: true } },
      { id: 'include:ui-schedule', options: { disabled: true } },
    ]);
    expect(loader.entry('include:ui-goal')?.disabled).toBe(false);
  });

  it('关闭 goal 时停用 goal、goal-round-driver 与 ui-goal', async () => {
    const loader = makeLoader(running(['goal', 'goal-round-driver', 'ui-goal']));
    await applyFeature(loader, spec('goal'), true, createSnapshot());
    expect(loader.calls.map((call) => call.id)).toEqual(['goal', 'goal-round-driver', 'ui-goal']);
    for (const call of loader.calls) expect(call.options).toEqual({ disabled: true });
  });

  it('打开时按施加前的原值放回，不是一律启用', async () => {
    const loader = makeLoader([
      { id: 'tool-todo', disabled: true, fiber: undefined },
      { id: 'other-row', disabled: false, fiber: { state: 2 } },
    ]);
    const snapshot = createSnapshot();
    // 该行在 Web 面本来就停用：关闭时不产生调用，打开时也不该强制启用。
    await applyFeature(loader, spec('task'), true, snapshot);
    expect(loader.calls).toEqual([]);
    await applyFeature(loader, spec('task'), false, snapshot);
    expect(loader.calls).toEqual([]);
    expect(loader.entry('tool-todo')?.disabled).toBe(true);
    expect(loader.entry('other-row')?.disabled).toBe(false);
  });

  it('关闭再打开时，把关闭前的启用状态恢复回来', async () => {
    const loader = makeLoader(running(['plan-mode', 'ui-plan']));
    const snapshot = createSnapshot();
    await applyFeature(loader, spec('plan'), true, snapshot);
    expect(loader.entry('ui-plan')?.disabled).toBe(true);
    loader.calls.length = 0;
    await applyFeature(loader, spec('plan'), false, snapshot);
    expect(loader.calls).toEqual([
      { id: 'plan-mode', options: { disabled: false } },
      { id: 'ui-plan', options: { disabled: false } },
    ]);
    expect(loader.entry('plan-mode')?.disabled).toBe(false);
  });

  it('条目缺失时跳过，不抛错，也不影响其他受管行', async () => {
    const loader = makeLoader(running(['ui-goal']));
    await expect(applyFeature(loader, spec('goal'), true, createSnapshot())).resolves.toBeDefined();
    expect(loader.calls).toEqual([{ id: 'ui-goal', options: { disabled: true } }]);
  });

  it('重复关闭同一功能不会重复写入', async () => {
    const loader = makeLoader(running(['ui-schedule']));
    const snapshot = createSnapshot();
    await applyFeature(loader, spec('schedule'), true, snapshot);
    loader.calls.length = 0;
    await applyFeature(loader, spec('schedule'), true, snapshot);
    expect(loader.calls).toEqual([]);
  });
});

// 行状态测试：读 loader 条目判断七个功能行是否可用，覆盖禁用、fiber 状态与 loader 缺失。
import { describe, expect, it } from 'vitest';

import { type LoaderEntryLike, readRowStatus } from '../src/row-status.ts';

/** 造一条 loader 条目。 */
function entry(id: string, options: { disabled?: boolean; state?: number | undefined } = {}) {
  return {
    id,
    disabled: options.disabled ?? false,
    fiber: options.state === undefined ? undefined : { state: options.state },
  } satisfies LoaderEntryLike;
}

/** 造一个 loader。 */
function loader(entries: LoaderEntryLike[]) {
  return { entries: () => entries };
}

describe('readRowStatus', () => {
  it('fiber 处于 ACTIVE 且未禁用时报告可用', () => {
    const status = readRowStatus(
      loader([
        // bundle 行的运行时 id 带组路径前缀
        entry('include:session-sweeper', { state: 2 }),
        entry('reasoning-reset', { state: 2 }),
        entry('claude-skills', { state: 2 }),
        entry('restart-button', { state: 2 }),
        entry('mobile-touch-ui', { state: 2 }),
        entry('official-features', { state: 2 }),
        entry('lark-super-agent', { state: 2 }),
      ]),
    );
    expect(status).toEqual({
      sweeper: true,
      reasoningReset: true,
      claudeSkills: true,
      restart: true,
      mobile: true,
      officialFeatures: true,
      larkSuperAgent: true,
    });
  });

  it('禁用、fiber 未 ACTIVE 与缺失条目都报告不可用', () => {
    const status = readRowStatus(
      loader([
        entry('session-sweeper', { disabled: true, state: 2 }),
        entry('restart-button', { state: 1 }),
        entry('mobile-touch-ui'),
        entry('official-features', { state: 0 }),
        entry('lark-super-agent', { disabled: true, state: 2 }),
        // claude-skills 与 reasoning-reset 不在条目的树上
      ]),
    );
    expect(status.officialFeatures).toBe(false);
    expect(status.larkSuperAgent).toBe(false);
    expect(status.sweeper).toBe(false);
    expect(status.restart).toBe(false);
    expect(status.mobile).toBe(false);
    expect(status.claudeSkills).toBe(false);
    expect(status.reasoningReset).toBe(false);
  });

  it('loader 缺失时六项都是 null', () => {
    expect(readRowStatus(undefined)).toEqual({
      sweeper: null,
      reasoningReset: null,
      claudeSkills: null,
      restart: null,
      mobile: null,
      officialFeatures: null,
      larkSuperAgent: null,
    });
  });
});

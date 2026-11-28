// 行为子行测试：三段 section 的名称、段序与逐字文本。
import { describe, expect, it } from 'vitest';

import { apply, inject, name, SECTIONS } from '../src/codex-behavior/index.ts';
import { PROGRESS_UPDATES, RESPONSIVENESS, STOP_LOSS } from '../src/codex-behavior/prompts.ts';
import { makeCtx } from './helpers.ts';

/** 一次 section 注册。 */
interface SectionSpec {
  readonly name: string;
  readonly order: number;
  readonly text: string;
}

/** 在公共模拟 ctx 上补系统提示词服务。 */
function makeHost() {
  const ctx = makeCtx();
  const sections: SectionSpec[] = [];
  let disposed = 0;
  Object.assign(ctx as unknown as Record<string, unknown>, {
    systemPrompt: {
      section(spec: SectionSpec) {
        sections.push(spec);
        return () => {
          disposed += 1;
          return true;
        };
      },
    },
  });
  return { ctx, sections, disposed: () => disposed };
}

describe('codex-behavior', () => {
  it('插件名与依赖固定', () => {
    expect(name).toBe('codex-behavior');
    expect(inject).toEqual(['systemPrompt']);
  });

  it('注册三段，名称与段序固定', () => {
    const host = makeHost();
    apply(host.ctx);
    expect(host.sections.map((section) => section.name)).toEqual([
      'codex:responsiveness',
      'codex:progress-updates',
      'codex:stop-loss',
    ]);
    expect(host.sections.map((section) => section.order)).toEqual([100, 110, 120]);
  });

  it('文本与常量逐字一致', () => {
    const host = makeHost();
    apply(host.ctx);
    expect(host.sections.map((section) => section.text)).toEqual([
      RESPONSIVENESS,
      PROGRESS_UPDATES,
      STOP_LOSS,
    ]);
    expect(SECTIONS.map((section) => section.text)).toEqual([
      RESPONSIVENESS,
      PROGRESS_UPDATES,
      STOP_LOSS,
    ]);
  });

  it('文本不含模型插值与模型名', () => {
    for (const text of [RESPONSIVENESS, PROGRESS_UPDATES, STOP_LOSS]) {
      expect(text).not.toContain('{{');
      expect(text).not.toMatch(/mock-model|GPT-?5|DeepSeek-?V\d|claude/i);
    }
  });

  it('三段标题与 Codex 原文一致', () => {
    expect(RESPONSIVENESS).toContain('## Responsiveness');
    expect(RESPONSIVENESS).toContain('### Preamble messages');
    expect(PROGRESS_UPDATES).toContain('### Sharing progress updates');
    expect(STOP_LOSS).toContain('### Stop-loss and convergence');
  });

  it('卸载时释放三段注册', () => {
    const host = makeHost();
    apply(host.ctx);
    host.ctx._dispose();
    expect(host.disposed()).toBe(3);
  });
});

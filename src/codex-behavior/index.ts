/**
 * Codex 行为子行：在标准模式的预设作用域里注册三段系统提示词。
 * 段序 100、110、120 位于 persona 之后、plan 政策与工具规则之前。
 */

import type { Context } from '../types.ts';
import { PROGRESS_UPDATES, RESPONSIVENESS, STOP_LOSS } from './prompts.ts';

/** 插件名，与 cordis.patch.yml 中预设子行的 id 一致。 */
export const name = 'codex-behavior';

/** 只依赖系统提示词组装。 */
export const inject = ['systemPrompt'];

/** 一段提示词注册。 */
interface PromptSection {
  readonly name: string;
  readonly order: number;
  readonly text: string;
}

/** 三段提示词及其段序。 */
export const SECTIONS: readonly PromptSection[] = [
  { name: 'codex:responsiveness', order: 100, text: RESPONSIVENESS },
  { name: 'codex:progress-updates', order: 110, text: PROGRESS_UPDATES },
  { name: 'codex:stop-loss', order: 120, text: STOP_LOSS },
];

/** 本行用到的宿主上下文。 */
interface HostContext extends Context {
  readonly systemPrompt: {
    section(spec: PromptSection): () => void;
  };
}

/**
 * 插件启用时注册三段提示词，卸载时随 fiber 释放。
 * @param ctx - 预设作用域内的宿主上下文。
 */
export function apply(ctx: Context): void {
  const host = ctx as HostContext;
  for (const section of SECTIONS) {
    ctx.effect(() => host.systemPrompt.section(section), `codex-behavior.${section.name}`);
  }
}

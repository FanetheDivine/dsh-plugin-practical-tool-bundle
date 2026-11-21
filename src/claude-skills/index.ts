/**
 * Claude 技能行：向宿主技能注册表登记一个项目 `.claude/skills` provider。
 * 技能目录只读，监听目录变化并在宿主写入时主动失效。
 */
import type { SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill';
import type { Context } from '../types.ts';
import { type ClaudeSkillContext, ClaudeSkillProvider, DEFAULTS } from './provider.ts';

/** 插件名，与 cordis.patch.yml 的行 id 一致。 */
export const name = 'claude-skills';

/** 依赖宿主技能注册表。 */
export const inject = ['skills'];

/** `fs/observed` 事件的载荷：只用 `displayPath`。 */
interface FsObservedTarget {
  readonly displayPath?: string;
}

/** 本行用到的宿主上下文：技能注册、效果释放与文件变更事件。 */
interface ClaudeSkillsHost extends ClaudeSkillContext {
  readonly skills: {
    registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void;
  };
  effect(execute: () => () => Promise<void>, label: string): unknown;
  on(event: 'fs/observed', listener: (target: FsObservedTarget | undefined) => void): unknown;
}

/**
 * 插件启用时注册 provider，卸载时释放监听器。
 * @param ctx - 宿主上下文。
 */
export function apply(ctx: Context): void {
  // fs/observed 由宿主模块声明，本包只用到其中的 displayPath。
  const host = ctx as unknown as ClaudeSkillsHost;
  let provider: ClaudeSkillProvider | undefined;
  host.skills.registerProvider((control) => {
    provider = new ClaudeSkillProvider(ctx, control, DEFAULTS);
    return provider;
  });
  host.effect(
    () => async () => {
      await provider?.dispose();
    },
    'claude-skills watcher',
  );
  host.on('fs/observed', (target) => {
    if (typeof target?.displayPath === 'string') provider?.observeHostMutation(target.displayPath);
  });
}

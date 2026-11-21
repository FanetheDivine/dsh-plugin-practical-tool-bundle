/**
 * 官方功能清单：五个功能各自对应的宿主行与 preset 子行。
 * 受管行按宿主行 id（或组路径末段）与 preset 子行模块名匹配。
 */

/** 面板中的功能顺序，也是路由与记录里的键序。 */
export const FEATURE_IDS = ['schedule', 'goal', 'task', 'plan', 'present'] as const;

/** 一个受管功能。 */
export type FeatureId = (typeof FEATURE_IDS)[number];

/** 一个功能的受管项。 */
export interface FeatureSpec {
  /** 功能标识，同时是路由与关闭记录里的键。 */
  readonly id: FeatureId;
  /** 宿主配置里的受管行 id，按完整 id 或组路径末段匹配。 */
  readonly hostRows: readonly string[];
  /** preset 声明里受管子行的模块名。 */
  readonly presetModules: readonly string[];
}

/**
 * 五个功能及其受管项。
 * plan 不含 `ui-user-questions`（它同时是提问界面），present 不含 `ui-deliverables`（变更文件卡片）。
 */
export const FEATURES: readonly FeatureSpec[] = [
  {
    id: 'schedule',
    hostRows: ['schedule', 'ui-schedule'],
    presetModules: ['@deepseek-ai/dsh-tool-schedule'],
  },
  {
    id: 'goal',
    hostRows: ['goal', 'goal-round-driver', 'ui-goal'],
    presetModules: ['@deepseek-ai/dsh-command-goal', '@deepseek-ai/dsh-tool-goal'],
  },
  {
    id: 'task',
    hostRows: ['tool-todo'],
    presetModules: ['@deepseek-ai/dsh-tool-todo'],
  },
  {
    id: 'plan',
    hostRows: ['plan-mode', 'ui-plan'],
    presetModules: ['@deepseek-ai/dsh-plan-mode'],
  },
  {
    id: 'present',
    hostRows: ['deliverable-file-references'],
    presetModules: ['@deepseek-ai/dsh-tool-present'],
  },
];

/** preset 声明行的模块名：带此名字的 loader 条目提供 preset 子行列表。 */
export const AGENT_PRESET_MODULE = '@deepseek-ai/dsh-agent-preset';

/** 按标识取功能定义。 */
export function featureOf(id: string): FeatureSpec | undefined {
  return FEATURES.find((feature) => feature.id === id);
}

/** 判断值是否是已知功能标识。 */
export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === 'string' && FEATURE_IDS.includes(value as FeatureId);
}

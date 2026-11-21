/**
 * 行标识与路由常量。宿主与前端共用同一份字符串，避免两侧写错。
 */

/** 包名，也是根行的 id、前端产物的注册 id。 */
export const PLUGIN_NAME = 'dsh-plugin-practical-tool-bundle';

/** 本包全部 HTTP 路由的前缀。 */
export const API_BASE = '/api/dsh-practical-tools';

/** 根行提供的状态路由。 */
export const STATUS_PATH = `${API_BASE}/status`;

/** 清理会话路由。 */
export const SWEEP_PATH = `${API_BASE}/sweep`;

/** 重启行的路由。 */
export const RESTART_INFO_PATH = `${API_BASE}/restart/info`;
export const RESTART_ACTION_PATH = `${API_BASE}/restart`;

/** 手机样式表路由。 */
export const MOBILE_CSS_PATH = `${API_BASE}/mobile.css`;

/** profile 中各行的 id，与 cordis.patch.yml 一致。 */
export const ROW_IDS = {
  root: PLUGIN_NAME,
  sweeper: 'session-sweeper',
  reasoningReset: 'reasoning-reset',
  claudeSkills: 'claude-skills',
  restart: 'restart-button',
  mobile: 'mobile-touch-ui',
} as const;

/** 状态路由回答中使用的行名。 */
export type RowName = 'sweeper' | 'reasoningReset' | 'claudeSkills' | 'restart' | 'mobile';

/** 行名到 profile 行 id 的映射。 */
export const ROW_NAME_TO_ID: Readonly<Record<RowName, string>> = {
  sweeper: ROW_IDS.sweeper,
  reasoningReset: ROW_IDS.reasoningReset,
  claudeSkills: ROW_IDS.claudeSkills,
  restart: ROW_IDS.restart,
  mobile: ROW_IDS.mobile,
};

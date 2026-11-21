/**
 * 宿主导出再出口：本行从宿主同一份包实例取 freezeMessage 与 appendPluginRecord，
 * 测试用 vi.mock 替换本模块以隔离这两个副作用。
 */
export { freezeMessage } from '@deepseek-ai/dsh-llm';
export { appendPluginRecord } from '@deepseek-ai/dsh-session';

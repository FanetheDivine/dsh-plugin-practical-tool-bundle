/**
 * lark-super-agent 的共享数据与服务接口。全局行实现服务，两个预设行只依赖这些类型。
 */

/** 任务状态。 */
export type TaskStatus = 'in_progress' | 'waiting_user' | 'failed' | 'completed';

/** 任务关联的一条用户消息。 */
export interface TaskMessage {
  readonly messageId?: string;
  readonly text: string;
  readonly time: string;
}

/** 一条未归档任务。 */
export interface Task {
  readonly id: string;
  title: string;
  status: TaskStatus;
  workspaceId: string;
  sessionIds: string[];
  reportIds: string[];
  messages: TaskMessage[];
  readonly createdAt: string;
  updatedAt: string;
}

/** 一个可派发工作区的笔记。 */
export interface WorkspaceNote {
  readonly workspaceId: string;
  path: string;
  summary: string;
  keywords: string[];
  notes: string;
  updatedAt: string;
}

/** 新建任务的参数。 */
export interface CreateTaskInput {
  title: string;
  workspaceId: string;
  message: { text: string; messageId?: string };
}

/** 修改任务的参数。 */
export interface UpdateTaskInput {
  taskId: string;
  status?: TaskStatus;
  addSessionIds?: string[];
  addMessage?: { text: string; messageId?: string };
  title?: string;
}

/** 上报参数。 */
export interface SendReportInput {
  text?: string;
  files?: string[];
}

/** 上报结果。 */
export interface SendReportResult {
  reportId: string;
  taskId: string | null;
  delivered: true;
  warning?: string;
}

/** 候选会话。 */
export interface SessionCandidate {
  sessionId: string;
  title: string;
  running: boolean;
  taskIds: string[];
  lastActiveAt: string;
}

/** lark-bridge 的桥接状态。 */
export interface BridgeState {
  sessionId: string | null;
  workspaceRoot: string | null;
}

/** 笔记与上报服务。 */
export interface LarkSuperAgentService {
  createTask(input: CreateTaskInput): Promise<{ taskId: string }>;
  updateTask(
    input: UpdateTaskInput,
  ): Promise<{ taskId: string; status: TaskStatus; archived: boolean }>;
  setWorkspaceNote(input: {
    workspaceId: string;
    summary: string;
    keywords: string[];
    notes?: string;
  }): Promise<{ workspaceId: string; created: boolean }>;
  removeWorkspaceNote(workspaceId: string): Promise<{ workspaceId: string; removed: boolean }>;
  listCandidates(workspaceId: string, taskId?: string): Promise<{ candidates: SessionCandidate[] }>;
  sendReport(input: SendReportInput, callerSessionId: string): Promise<SendReportResult>;
  notifyFailure(sessionId: string, error: unknown): Promise<void>;
}

/** 调用工具时的最小 Agent 结构。 */
export interface AgentExecution {
  agent?: { session?: { id?: string } };
}

/** 宿主工作区注册表的最小结构。 */
export interface WorkspaceRegistryLike {
  list?(): Iterable<{ id: unknown; path: string }>;
  workspaces?(): Iterable<{ id: unknown; path: string }>;
  entries?(): Iterable<{ id: unknown; path: string }>;
  archivedSessionIds?: readonly string[];
}

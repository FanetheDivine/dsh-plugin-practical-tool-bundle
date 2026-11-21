import { createUserMessage } from '@deepseek-ai/dsh-llm';

import type { Context } from '../types.ts';
import type {
  BridgeState,
  CreateTaskInput,
  LarkSuperAgentService,
  SendReportInput,
  SendReportResult,
  SessionCandidate,
  Task,
  UpdateTaskInput,
  WorkspaceRegistryLike,
} from './api.ts';
import { workSessionFailure, workSessionMessage } from './blocks.ts';
import { readBridgeState } from './bridge.ts';
import { findTaskBySession, NotesStore } from './notes.ts';
import { ReportStore, validateReportInput } from './reports.ts';
import { readSuperAgentStatus, type SuperAgentStatus } from './status.ts';

export { readBridgeState } from './bridge.ts';

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'lark-super-agent': {
      kind: 'lark-super-agent';
    };
  }
}

interface SessionLike {
  id?: string;
  title?: string;
  cwd?: string;
  running?: boolean;
  driver?: { running?: boolean };
}

export interface AgentLike {
  session?: SessionLike;
  running?: boolean;
  status?: string;
  driver?: { running?: boolean };
  steer?(message: unknown): unknown;
}

interface SessionControllerLike {
  resolveAgent(
    sessionId: string,
  ): Promise<
    | { agent: AgentLike; error?: never }
    | { error: Error; agent?: never }
    | AgentLike
    | null
    | undefined
  >;
}

interface SessionQueryLike {
  listSessions?(): Promise<readonly unknown[]>;
  readTitleSnapshots?(ids: readonly string[]): Promise<
    readonly {
      sessionId: string;
      status: string;
      value?: { title?: { title?: string } };
    }[]
  >;
}

interface AgentsLike {
  get(sessionId: string): AgentLike | undefined;
}

/** 服务所需的宿主最小上下文；实际 Context 可直接传入。 */
export interface ContextLike {
  get: Context['get'];
  logger?: {
    warn?(...args: unknown[]): void;
  };
}

export interface SuperAgentServiceOptions {
  home?: string;
  now?: () => Date;
  taskId?: (date: Date) => string;
  reportId?: (date: Date) => string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** lark-super-agent 的笔记、候选会话、上报与失败通知服务。 */
export class SuperAgentService implements LarkSuperAgentService {
  private readonly ctx: ContextLike;
  private readonly options: SuperAgentServiceOptions;

  constructor(ctx: ContextLike, options: SuperAgentServiceOptions = {}) {
    this.ctx = ctx;
    this.options = options;
  }

  private bridgeState(): Promise<BridgeState> {
    return readBridgeState(this.options.home);
  }

  private async storageRoot(): Promise<string> {
    const state = await this.bridgeState();
    if (state.workspaceRoot === null) {
      throw new Error('lark-bridge has no workspaceRoot; configure the dispatch workspace first');
    }
    return state.workspaceRoot;
  }

  private notes(root: string): NotesStore {
    return new NotesStore(root, {
      ...(this.options.now === undefined ? {} : { now: this.options.now }),
      ...(this.options.taskId === undefined ? {} : { taskId: this.options.taskId }),
    });
  }

  async createTask(input: CreateTaskInput): Promise<{ taskId: string }> {
    return this.notes(await this.storageRoot()).createTask(input);
  }

  async updateTask(input: UpdateTaskInput) {
    return this.notes(await this.storageRoot()).updateTask(input);
  }

  private registeredWorkspace(workspaceId: string): { id: unknown; path: string } {
    const registry = this.ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined;
    if (registry === undefined) throw new Error('workspaceRegistry is unavailable');
    const list = registry.list ?? registry.workspaces ?? registry.entries;
    if (list === undefined) throw new Error('workspaceRegistry cannot list workspaces');
    for (const workspace of list.call(registry)) {
      if (workspace.id === workspaceId) {
        if (typeof workspace.path !== 'string' || workspace.path.trim() === '') {
          throw new Error(`registered workspace ${workspaceId} has no valid path`);
        }
        return workspace;
      }
    }
    throw new Error(`workspace ${workspaceId} is not registered in DSH`);
  }

  async setWorkspaceNote(input: {
    workspaceId: string;
    summary: string;
    keywords: string[];
    notes?: string;
  }): Promise<{ workspaceId: string; created: boolean }> {
    const workspace = this.registeredWorkspace(input.workspaceId);
    return this.notes(await this.storageRoot()).setWorkspaceNote({
      ...input,
      path: workspace.path,
    });
  }

  async removeWorkspaceNote(workspaceId: string) {
    return this.notes(await this.storageRoot()).removeWorkspaceNote(workspaceId);
  }

  private async resolveDispatchAgent(state: BridgeState): Promise<AgentLike> {
    if (state.sessionId === null) throw new Error('lark-bridge has no dispatch sessionId');
    const controller = this.ctx.get('sessionController') as SessionControllerLike | undefined;
    if (controller === undefined || typeof controller.resolveAgent !== 'function') {
      throw new Error('sessionController is unavailable; cannot reach the dispatch session');
    }
    const resolved = await controller.resolveAgent(state.sessionId);
    if (resolved === null || resolved === undefined) {
      throw new Error(`dispatch session is unavailable: ${state.sessionId}`);
    }
    if ('error' in resolved && resolved.error !== undefined) throw resolved.error;
    const agent = 'agent' in resolved ? resolved.agent : resolved;
    if (agent === undefined || typeof agent.steer !== 'function') {
      throw new Error(`dispatch agent cannot accept messages: ${state.sessionId}`);
    }
    return agent;
  }

  private async deliver(agent: AgentLike, block: string): Promise<void> {
    const message = createUserMessage({
      content: [{ type: 'text', text: block }],
      source: { kind: 'lark-super-agent' },
    });
    await agent.steer?.(message);
  }

  async sendReport(input: SendReportInput, callerSessionId: string): Promise<SendReportResult> {
    const caller = this.agent(callerSessionId);
    const cwd = caller?.session?.cwd ?? process.cwd();
    await validateReportInput(input, cwd);
    const state = await this.bridgeState();
    if (state.workspaceRoot === null) {
      throw new Error('lark-bridge has no workspaceRoot; report was not archived');
    }
    const agent = await this.resolveDispatchAgent(state);
    const reports = new ReportStore(state.workspaceRoot, {
      cwd,
      ...(this.options.now === undefined ? {} : { now: this.options.now }),
      ...(this.options.reportId === undefined ? {} : { reportId: this.options.reportId }),
    });
    const archived = await reports.archiveReport(input, callerSessionId, async (report) => {
      await this.deliver(
        agent,
        workSessionMessage({
          sessionId: callerSessionId,
          reportId: report.reportId,
          taskId: report.taskId,
          text: input.text ?? '',
          files: report.files,
        }),
      );
    });
    return {
      reportId: archived.reportId,
      taskId: archived.taskId,
      delivered: true,
      ...(archived.warning === undefined ? {} : { warning: archived.warning }),
    };
  }

  async notifyFailure(sessionId: string, error: unknown): Promise<void> {
    try {
      const state = await this.bridgeState();
      let task: Task | undefined;
      if (state.workspaceRoot !== null) {
        task = findTaskBySession(await this.notes(state.workspaceRoot).listTasks(), sessionId);
      }
      const agent = await this.resolveDispatchAgent(state);
      await this.deliver(
        agent,
        workSessionFailure({ sessionId, taskId: task?.id ?? '', error: errorMessage(error) }),
      );
    } catch (notificationError) {
      this.ctx.logger?.warn?.(
        `lark-super-agent: failure notification was not delivered: ${errorMessage(notificationError)}`,
        { sessionId },
      );
    }
  }

  private agent(sessionId: string): AgentLike | undefined {
    const agents = this.ctx.get('agents') as AgentsLike | undefined;
    return agents?.get(sessionId);
  }

  private running(sessionId: string): boolean {
    const agent = this.agent(sessionId);
    if (agent === undefined) return false;
    const running =
      agent.running ??
      agent.session?.running ??
      agent.driver?.running ??
      agent.session?.driver?.running;
    if (typeof running === 'boolean') return running;
    return agent.status === 'running';
  }

  /** 合并活动任务与任务归档中的会话，按指定任务、空闲、最近活动排序。 */
  async listCandidates(
    workspaceId: string,
    taskId?: string,
  ): Promise<{ candidates: SessionCandidate[] }> {
    const root = await this.storageRoot();
    const notes = this.notes(root);
    const [active, archived] = await Promise.all([notes.listTasks(), notes.listArchivedTasks()]);
    const registry = this.ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined;
    const archivedSessionIds = new Set(registry?.archivedSessionIds ?? []);
    const query = this.ctx.get('sessionQuery') as SessionQueryLike | undefined;

    let existing: Set<string> | undefined;
    if (typeof query?.listSessions === 'function') {
      try {
        const records = await query.listSessions();
        existing = new Set(
          records.flatMap((record) => {
            if (!isRecord(record)) return [];
            if (record.live === false && record.persisted === false) return [];
            const header = isRecord(record.header) ? record.header : record;
            return typeof header.id === 'string' ? [header.id] : [];
          }),
        );
      } catch {
        existing = undefined;
      }
    }

    const bySession = new Map<string, SessionCandidate & { preferred: boolean }>();
    const collect = (tasks: readonly Task[], archivedTasks: boolean) => {
      for (const task of tasks) {
        if (task.workspaceId !== workspaceId) continue;
        const lastActiveAt =
          archivedTasks && 'archivedAt' in task && typeof task.archivedAt === 'string'
            ? task.archivedAt
            : task.updatedAt;
        for (const sessionId of task.sessionIds) {
          if (archivedSessionIds.has(sessionId) || existing?.has(sessionId) === false) continue;
          const current = bySession.get(sessionId);
          if (current === undefined) {
            bySession.set(sessionId, {
              sessionId,
              title: sessionId,
              running: this.running(sessionId),
              taskIds: [task.id],
              lastActiveAt,
              preferred: task.id === taskId,
            });
          } else {
            if (!current.taskIds.includes(task.id)) current.taskIds.push(task.id);
            if (Date.parse(lastActiveAt) > Date.parse(current.lastActiveAt)) {
              current.lastActiveAt = lastActiveAt;
            }
            current.preferred ||= task.id === taskId;
          }
        }
      }
    };
    collect(active, false);
    collect(archived, true);

    const candidates = [...bySession.values()];
    if (typeof query?.readTitleSnapshots === 'function' && candidates.length > 0) {
      try {
        const titles = await query.readTitleSnapshots(candidates.map((item) => item.sessionId));
        for (const result of titles) {
          const candidate = bySession.get(result.sessionId);
          const title = result.status === 'fulfilled' ? result.value?.title?.title : undefined;
          if (candidate !== undefined && typeof title === 'string' && title.trim() !== '') {
            candidate.title = title;
          }
        }
      } catch {
        // 标题读取失败时保留 sessionId。
      }
    }
    for (const candidate of candidates) {
      if (candidate.title === candidate.sessionId) {
        const title = this.agent(candidate.sessionId)?.session?.title;
        if (typeof title === 'string' && title.trim() !== '') candidate.title = title;
      }
    }
    candidates.sort(
      (left, right) =>
        Number(right.preferred) - Number(left.preferred) ||
        Number(left.running) - Number(right.running) ||
        Date.parse(right.lastActiveAt) - Date.parse(left.lastActiveAt) ||
        left.sessionId.localeCompare(right.sessionId),
    );
    return {
      candidates: candidates
        .slice(0, 5)
        .map(({ preferred: _preferred, ...candidate }) => candidate),
    };
  }

  /** 状态路由同一实现的服务形式。 */
  status(): Promise<SuperAgentStatus> {
    return readSuperAgentStatus(this.ctx as unknown as Context);
  }

  getStatus(): Promise<SuperAgentStatus> {
    return this.status();
  }
}

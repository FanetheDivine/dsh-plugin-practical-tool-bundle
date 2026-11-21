import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  CreateTaskInput,
  Task,
  TaskMessage,
  TaskStatus,
  UpdateTaskInput,
  WorkspaceNote,
} from './api.ts';
import { commitFilesInQueue, runSerial } from './git.ts';
import { createTaskId } from './ids.ts';

export const TASKS_FILE = 'message-task-status.json';
export const WORKSPACES_FILE = 'workspaces.json';

export interface TaskState {
  version: 1;
  tasks: Task[];
}

export interface WorkspaceState {
  version: 1;
  workspaces: WorkspaceNote[];
}

export interface ArchivedTask extends Task {
  archivedAt: string;
}

export interface NotesStoreOptions {
  now?: () => Date;
  taskId?: (date: Date) => string;
}

export interface WorkspaceNoteInput {
  workspaceId: string;
  path: string;
  summary: string;
  keywords: string[];
  notes?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isTime(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isStringArray(value: unknown, unique = false): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(isNonEmptyString) &&
    (!unique || new Set(value).size === value.length)
  );
}

function validateMessage(value: unknown, label: string): asserts value is TaskMessage {
  if (!isRecord(value) || !isNonEmptyString(value.text) || !isTime(value.time)) {
    throw new Error(`${label} needs non-empty text and an ISO time`);
  }
  if (value.messageId !== undefined && typeof value.messageId !== 'string') {
    throw new Error(`${label}.messageId must be a string`);
  }
}

/** 校验完整 Task，避免损坏笔记被后续写入静默替换。 */
export function validateTask(value: unknown, label = 'task'): asserts value is Task {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  if (!/^task-\d{14}-[0-9a-f]{4}$/.test(String(value.id))) {
    throw new Error(`${label}.id has an invalid format`);
  }
  if (
    !isNonEmptyString(value.title) ||
    /[\r\n]/.test(value.title) ||
    !isNonEmptyString(value.workspaceId) ||
    !['in_progress', 'waiting_user', 'failed', 'completed'].includes(String(value.status)) ||
    !isStringArray(value.sessionIds, true) ||
    !isStringArray(value.reportIds, true) ||
    !Array.isArray(value.messages) ||
    value.messages.length === 0 ||
    !isTime(value.createdAt) ||
    !isTime(value.updatedAt)
  ) {
    throw new Error(`${label} has invalid fields`);
  }
  value.messages.forEach((message, index) => {
    validateMessage(message, `${label}.messages[${index}]`);
  });
}

function validateWorkspace(value: unknown, label: string): asserts value is WorkspaceNote {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.workspaceId) ||
    !isNonEmptyString(value.path) ||
    !isNonEmptyString(value.summary) ||
    !isStringArray(value.keywords, true) ||
    value.keywords.length === 0 ||
    typeof value.notes !== 'string' ||
    !isTime(value.updatedAt)
  ) {
    throw new Error(`${label} has invalid fields`);
  }
}

/** JSON 先写同目录临时文件，再原子替换目标。 */
export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readJson(path: string): Promise<unknown | undefined> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(
      `invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    );
  }
}

/** 读取并校验未归档任务；文件尚未创建时返回空台账。 */
export async function readTaskState(root: string): Promise<TaskState> {
  const value = await readJson(join(root, TASKS_FILE));
  if (value === undefined) return { version: 1, tasks: [] };
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tasks)) {
    throw new Error(`${TASKS_FILE} must be {"version":1,"tasks":[...]}`);
  }
  const ids = new Set<string>();
  value.tasks.forEach((task, index) => {
    validateTask(task, `tasks[${index}]`);
    if (ids.has(task.id)) throw new Error(`duplicate task id: ${task.id}`);
    ids.add(task.id);
  });
  return { version: 1, tasks: value.tasks };
}

/** 读取并校验工作区笔记；文件尚未创建时返回空白名单。 */
export async function readWorkspaceState(root: string): Promise<WorkspaceState> {
  const value = await readJson(join(root, WORKSPACES_FILE));
  if (value === undefined) return { version: 1, workspaces: [] };
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.workspaces)) {
    throw new Error(`${WORKSPACES_FILE} must be {"version":1,"workspaces":[...]}`);
  }
  const ids = new Set<string>();
  value.workspaces.forEach((workspace, index) => {
    validateWorkspace(workspace, `workspaces[${index}]`);
    if (ids.has(workspace.workspaceId)) {
      throw new Error(`duplicate workspace id: ${workspace.workspaceId}`);
    }
    ids.add(workspace.workspaceId);
  });
  return { version: 1, workspaces: value.workspaces };
}

/** 生成带本机时区偏移的 ISO 8601 时间。 */
export function isoTime(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error('timestamp needs a valid date');
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const absolute = Math.abs(offset);
  const local = [
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    `.${pad(date.getMilliseconds(), 3)}`,
  ].join('');
  return `${local}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

function messageOf(input: { text: string; messageId?: string }, time: string): TaskMessage {
  if (!isNonEmptyString(input.text)) throw new Error('message.text must not be empty');
  return {
    ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
    text: input.text,
    time,
  };
}

function validateTitle(title: string): string {
  if (!isNonEmptyString(title) || /[\r\n]/.test(title)) {
    throw new Error('task title must be non-empty and single-line');
  }
  return title.trim();
}

/** 查找调用会话最新更新的未归档任务；时间相同时保留台账中靠后的任务。 */
export function findTaskBySession(tasks: readonly Task[], sessionId: string): Task | undefined {
  let found: Task | undefined;
  for (const task of tasks) {
    if (!task.sessionIds.includes(sessionId)) continue;
    if (found === undefined || Date.parse(task.updatedAt) >= Date.parse(found.updatedAt)) {
      found = task;
    }
  }
  return found;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

/** 任务与工作区笔记存储。所有公开写操作都包含一次限定路径 git 提交。 */
export class NotesStore {
  readonly root: string;
  private readonly now: () => Date;
  private readonly taskId: (date: Date) => string;

  constructor(root: string, options: NotesStoreOptions = {}) {
    this.root = root;
    this.now = options.now ?? (() => new Date());
    this.taskId = options.taskId ?? ((date) => createTaskId(date));
  }

  async createTask(input: CreateTaskInput): Promise<{ taskId: string }> {
    return runSerial(this.root, async () => {
      const [taskState, workspaceState] = await Promise.all([
        readTaskState(this.root),
        readWorkspaceState(this.root),
      ]);
      if (!workspaceState.workspaces.some((item) => item.workspaceId === input.workspaceId)) {
        throw new Error(`workspace ${input.workspaceId} is not registered in ${WORKSPACES_FILE}`);
      }
      const date = this.now();
      const time = isoTime(date);
      const id = this.taskId(date);
      validateTitle(input.title);
      if (!/^task-\d{14}-[0-9a-f]{4}$/.test(id)) throw new Error(`invalid task id: ${id}`);
      const task: Task = {
        id,
        title: validateTitle(input.title),
        status: 'in_progress',
        workspaceId: input.workspaceId,
        sessionIds: [],
        reportIds: [],
        messages: [messageOf(input.message, time)],
        createdAt: time,
        updatedAt: time,
      };
      taskState.tasks.push(task);
      await atomicWriteJson(join(this.root, TASKS_FILE), taskState);
      await commitFilesInQueue(this.root, [TASKS_FILE], `lark-super-agent: create ${id}`);
      return { taskId: id };
    });
  }

  async updateTask(
    input: UpdateTaskInput,
  ): Promise<{ taskId: string; status: TaskStatus; archived: boolean }> {
    if (
      input.status === undefined &&
      input.addSessionIds === undefined &&
      input.addMessage === undefined &&
      input.title === undefined
    ) {
      throw new Error('task_update needs at least one change');
    }
    return runSerial(this.root, async () => {
      const state = await readTaskState(this.root);
      const task = state.tasks.find((item) => item.id === input.taskId);
      if (task === undefined) throw new Error(`task not found: ${input.taskId}`);
      if (input.status !== undefined && input.status !== task.status) {
        const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
          in_progress: ['waiting_user', 'failed', 'completed'],
          waiting_user: ['in_progress', 'completed'],
          failed: ['in_progress', 'completed'],
          completed: [],
        };
        if (!transitions[task.status].includes(input.status)) {
          throw new Error(`invalid task status transition: ${task.status} -> ${input.status}`);
        }
      }
      if (input.title !== undefined) task.title = validateTitle(input.title);
      if (input.addSessionIds !== undefined) {
        if (!isStringArray(input.addSessionIds))
          throw new Error('addSessionIds must contain strings');
        for (const id of input.addSessionIds) {
          if (!task.sessionIds.includes(id)) task.sessionIds.push(id);
        }
      }
      const time = isoTime(this.now());
      if (input.addMessage !== undefined) task.messages.push(messageOf(input.addMessage, time));
      if (input.status !== undefined) task.status = input.status;
      task.updatedAt = time;

      if (task.status !== 'completed') {
        await atomicWriteJson(join(this.root, TASKS_FILE), state);
        await commitFilesInQueue(this.root, [TASKS_FILE], `lark-super-agent: update ${task.id}`);
        return { taskId: task.id, status: task.status, archived: false };
      }

      const archiveDirectory = join(this.root, 'archive', task.id);
      const archiveTaskPath = join(archiveDirectory, 'task.json');
      const reportDirectory = join(this.root, 'reports', task.id);
      const archivedReports = join(archiveDirectory, 'reports');
      const hasReports = await exists(reportDirectory);
      const archivedTask: ArchivedTask = { ...task, archivedAt: time };
      await mkdir(archiveDirectory, { recursive: true });
      await atomicWriteJson(archiveTaskPath, archivedTask);
      if (hasReports) await rename(reportDirectory, archivedReports);
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      await atomicWriteJson(join(this.root, TASKS_FILE), state);
      const paths = [TASKS_FILE, join('archive', task.id, 'task.json')];
      if (hasReports) {
        paths.push(join('reports', task.id), join('archive', task.id, 'reports'));
      }
      await commitFilesInQueue(this.root, paths, `lark-super-agent: archive ${task.id}`);
      return { taskId: task.id, status: 'completed', archived: true };
    });
  }

  async setWorkspaceNote(
    input: WorkspaceNoteInput,
  ): Promise<{ workspaceId: string; created: boolean }> {
    if (!isNonEmptyString(input.workspaceId)) throw new Error('workspaceId must not be empty');
    if (!isNonEmptyString(input.path)) throw new Error('workspace path must not be empty');
    if (!isNonEmptyString(input.summary)) throw new Error('workspace summary must not be empty');
    if (!isStringArray(input.keywords) || input.keywords.length === 0) {
      throw new Error('workspace keywords must contain at least one non-empty string');
    }
    return runSerial(this.root, async () => {
      const state = await readWorkspaceState(this.root);
      const keywords = [...new Set(input.keywords.map((keyword) => keyword.trim()))];
      const note: WorkspaceNote = {
        workspaceId: input.workspaceId,
        path: input.path.replaceAll('\\', '/'),
        summary: input.summary.trim(),
        keywords,
        notes: input.notes ?? '',
        updatedAt: isoTime(this.now()),
      };
      const index = state.workspaces.findIndex((item) => item.workspaceId === input.workspaceId);
      const created = index < 0;
      if (created) state.workspaces.push(note);
      else state.workspaces[index] = note;
      await atomicWriteJson(join(this.root, WORKSPACES_FILE), state);
      await commitFilesInQueue(
        this.root,
        [WORKSPACES_FILE],
        `lark-super-agent: note ${input.workspaceId}`,
      );
      return { workspaceId: input.workspaceId, created };
    });
  }

  async removeWorkspaceNote(
    workspaceId: string,
  ): Promise<{ workspaceId: string; removed: boolean }> {
    return runSerial(this.root, async () => {
      const state = await readWorkspaceState(this.root);
      const remaining = state.workspaces.filter((item) => item.workspaceId !== workspaceId);
      const removed = remaining.length !== state.workspaces.length;
      if (!removed) return { workspaceId, removed: false };
      state.workspaces = remaining;
      await atomicWriteJson(join(this.root, WORKSPACES_FILE), state);
      await commitFilesInQueue(
        this.root,
        [WORKSPACES_FILE],
        `lark-super-agent: remove note ${workspaceId}`,
      );
      return { workspaceId, removed: true };
    });
  }

  listTasks(): Promise<Task[]> {
    return readTaskState(this.root).then((state) => state.tasks);
  }

  listWorkspaces(): Promise<WorkspaceNote[]> {
    return readWorkspaceState(this.root).then((state) => state.workspaces);
  }

  /** 读取全部归档快照，归档时间参与候选会话排序。 */
  async listArchivedTasks(): Promise<ArchivedTask[]> {
    const directory = join(this.root, 'archive');
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return [];
      throw error;
    }
    const tasks: ArchivedTask[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name, 'task.json');
      const value = await readJson(path);
      if (value === undefined) continue;
      validateTask(value, `archive/${entry.name}/task.json`);
      if (!isRecord(value) || !isTime(value.archivedAt) || value.id !== entry.name) {
        throw new Error(`archive/${entry.name}/task.json has invalid archive fields`);
      }
      tasks.push({ ...value, archivedAt: value.archivedAt });
    }
    return tasks;
  }
}

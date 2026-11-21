import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, resolve } from 'node:path';

import type { SendReportInput } from './api.ts';
import { commitFilesInQueue, gitErrorMessage, runSerial } from './git.ts';
import { createReportId } from './ids.ts';
import { atomicWriteJson, findTaskBySession, isoTime, readTaskState, TASKS_FILE } from './notes.ts';

export interface ValidatedReportInput {
  text: string;
  files: string[];
}

export interface ArchivedReport {
  reportId: string;
  taskId: string | null;
  reportPath: string;
  files: string[];
  warning?: string;
}

export interface ReportStoreOptions {
  now?: () => Date;
  reportId?: (date: Date) => string;
  cwd?: string;
}

export type ReportDelivery = (report: ArchivedReport) => Promise<void> | void;

/** 校验空参数与全部附件，返回解析后的绝对附件路径。 */
export async function validateReportInput(
  input: SendReportInput,
  cwd: string = process.cwd(),
): Promise<ValidatedReportInput> {
  const text = input.text ?? '';
  const files = input.files ?? [];
  if (!Array.isArray(files) || files.some((file) => typeof file !== 'string')) {
    throw new Error('send_report files must be an array of paths');
  }
  if (text.trim() === '' && files.length === 0) {
    throw new Error('send_report needs text or files');
  }
  const invalid: string[] = [];
  const resolvedFiles: string[] = [];
  for (const file of files) {
    const path = isAbsolute(file) ? resolve(file) : resolve(cwd, file);
    resolvedFiles.push(path);
    if (file.trim() === '' || extname(path).toLowerCase() !== '.md') {
      invalid.push(file);
      continue;
    }
    try {
      if (!(await stat(path)).isFile()) invalid.push(file);
    } catch {
      invalid.push(file);
    }
  }
  if (invalid.length > 0) {
    throw new Error(`send_report files must be existing .md files: ${invalid.join(', ')}`);
  }
  return { text, files: resolvedFiles };
}

function reportMarkdown(input: {
  reportId: string;
  sessionId: string;
  taskId: string | null;
  time: string;
  files: readonly string[];
  text: string;
}): string {
  const files =
    input.files.length === 0
      ? 'files: []'
      : `files:\n${input.files.map((file) => `  - ${JSON.stringify(file)}`).join('\n')}`;
  return [
    '---',
    `reportId: ${JSON.stringify(input.reportId)}`,
    `sessionId: ${JSON.stringify(input.sessionId)}`,
    `taskId: ${input.taskId === null ? 'null' : JSON.stringify(input.taskId)}`,
    `time: ${JSON.stringify(input.time)}`,
    files,
    '---',
    '',
    input.text,
    '',
  ].join('\n');
}

/** 上报存档。文件、所属任务与限定路径提交在一个工作区队列中完成。 */
export class ReportStore {
  readonly root: string;
  private readonly now: () => Date;
  private readonly reportId: (date: Date) => string;
  private readonly cwd: string;

  constructor(root: string, options: ReportStoreOptions = {}) {
    this.root = root;
    this.now = options.now ?? (() => new Date());
    this.reportId = options.reportId ?? ((date) => createReportId(date));
    this.cwd = options.cwd ?? process.cwd();
  }

  /**
   * 保存一份上报。delivery 在写入后、提交前执行；提交失败转为 warning。
   * 参数校验、任务读取或投递失败均不会被 warning 吞掉。
   */
  async archiveReport(
    input: SendReportInput,
    callerSessionId: string,
    delivery?: ReportDelivery,
  ): Promise<ArchivedReport> {
    const validated = await validateReportInput(input, this.cwd);
    if (callerSessionId.trim() === '') throw new Error('send_report needs a caller session id');
    return runSerial(this.root, async () => {
      const state = await readTaskState(this.root);
      const task = findTaskBySession(state.tasks, callerSessionId);
      const date = this.now();
      const reportId = this.reportId(date);
      if (!/^report-\d{14}-[0-9a-f]{6}$/.test(reportId)) {
        throw new Error(`invalid report id: ${reportId}`);
      }
      const taskId = task?.id ?? null;
      const storageId = taskId ?? '_unassigned';
      const directory = resolve(this.root, 'reports', storageId);
      const time = isoTime(date);
      const copiedNames = validated.files.map(
        (file, index) => `${reportId}-${index + 1}-${basename(file)}`,
      );
      const reportPath = resolve(directory, `${reportId}.md`);
      const copiedPaths = copiedNames.map((name) => resolve(directory, name));

      await mkdir(directory, { recursive: true });
      for (let index = 0; index < validated.files.length; index += 1) {
        const source = validated.files[index];
        const destination = copiedPaths[index];
        if (source === undefined || destination === undefined) continue;
        await copyFile(source, destination);
      }
      await writeFile(
        reportPath,
        reportMarkdown({
          reportId,
          sessionId: callerSessionId,
          taskId,
          time,
          files: copiedNames,
          text: validated.text,
        }),
        'utf8',
      );

      const commitPaths = [reportPath, ...copiedPaths];
      if (task !== undefined) {
        if (!task.reportIds.includes(reportId)) task.reportIds.push(reportId);
        task.updatedAt = time;
        await atomicWriteJson(resolve(this.root, TASKS_FILE), state);
        commitPaths.push(resolve(this.root, TASKS_FILE));
      }

      const result: ArchivedReport = {
        reportId,
        taskId,
        reportPath,
        files: copiedPaths,
      };
      await delivery?.(result);
      try {
        await commitFilesInQueue(this.root, commitPaths, `lark-super-agent: report ${reportId}`);
      } catch (error) {
        result.warning = `report ${reportId} was delivered but git commit failed: ${gitErrorMessage(error)}`;
      }
      return result;
    });
  }

  /** send_report 的语义别名。 */
  save(input: SendReportInput, callerSessionId: string, delivery?: ReportDelivery) {
    return this.archiveReport(input, callerSessionId, delivery);
  }
}

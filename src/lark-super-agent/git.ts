import { execFile } from 'node:child_process';
import { mkdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** 一次真实 git 命令的结果。 */
export interface GitResult {
  stdout: string;
  stderr: string;
}

/** git 执行失败时保留命令与 stderr，方便工具返回可读原因。 */
export class GitCommandError extends Error {
  readonly command: string;

  constructor(args: readonly string[], cause: unknown) {
    const detail =
      typeof cause === 'object' && cause !== null && 'stderr' in cause
        ? String((cause as { stderr?: unknown }).stderr ?? '').trim()
        : '';
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`git ${args.join(' ')} failed: ${detail || message}`, { cause });
    this.name = 'GitCommandError';
    this.command = `git ${args.join(' ')}`;
  }
}

/** 执行本机 git，不使用 shell，路径与提交信息作为独立参数传递。 */
export function runGit(args: readonly string[], cwd?: string): Promise<GitResult> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      'git',
      [...args],
      {
        ...(cwd === undefined ? {} : { cwd }),
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error !== null) reject(new GitCommandError(args, error));
        else resolvePromise({ stdout, stderr });
      },
    );
  });
}

const queues = new Map<string, Promise<void>>();

/** 同一规范化工作区根目录中的操作严格串行；失败不会阻塞后续操作。 */
export async function runSerial<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const key = resolve(root);
  const previous = queues.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, tail);
  try {
    return await result;
  } finally {
    if (queues.get(key) === tail) queues.delete(key);
  }
}

/** 仓库顶层必须正好是工作区根；嵌在别的仓库中时初始化独立仓库。 */
export async function ensureGitRepository(root: string): Promise<void> {
  const workspace = resolve(root);
  await mkdir(workspace, { recursive: true });
  let matches = false;
  try {
    const { stdout } = await runGit(['rev-parse', '--show-toplevel'], workspace);
    const [actualRoot, expectedRoot] = await Promise.all([
      realpath(stdout.trim()),
      realpath(workspace),
    ]);
    matches = actualRoot === expectedRoot;
  } catch {
    matches = false;
  }
  if (!matches) await runGit(['init'], workspace);
}

function gitPath(root: string, file: string): string {
  const workspace = resolve(root);
  const absolute = isAbsolute(file) ? resolve(file) : resolve(workspace, file);
  const path = relative(workspace, absolute);
  if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`git path must name a file inside the workspace: ${file}`);
  }
  return `./${path.split(sep).join('/')}`;
}

/**
 * 在已经持有的同工作区队列中提交指定路径。
 * 业务写入失败时不会调用本函数，因此失败前的文件保持原样。
 */
export async function commitFilesInQueue(
  root: string,
  paths: readonly string[],
  message: string,
): Promise<void> {
  if (paths.length === 0) throw new Error('git commit needs at least one path');
  const files = [...new Set(paths.map((file) => gitPath(root, file)))];
  await ensureGitRepository(root);
  await runGit(['add', '--', ...files], root);
  await runGit(['commit', '-m', message, '--', ...files], root);
}

/** 串行执行初始化、限定路径暂存与限定路径提交。 */
export function commitFiles(
  root: string,
  paths: readonly string[],
  message: string,
): Promise<void> {
  return runSerial(root, () => commitFilesInQueue(root, paths, message));
}

/** 面向调用的简短错误文本。 */
export function gitErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

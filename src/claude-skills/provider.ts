/**
 * 项目 `.claude/skills` 技能 provider：只读扫描目录包与扁平 `.md`。
 * 解析 frontmatter，并监听技能目录变化后刷新目录。
 */
import { type Dirent, existsSync, type FSWatcher, watch } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import {
  isSkillName,
  type SkillCandidate,
  type SkillDefinition,
  type SkillInvocationPolicy,
  type SkillLookupOptions,
  type SkillProvider,
  type SkillProviderControl,
  type SkillProviderObservation,
} from '@deepseek-ai/dsh-skill';
import { parse } from 'yaml';
import { isRecord } from '../utils.ts';

/** 默认技能目录，相对项目根。 */
export const DEFAULT_SKILL_DIRS = ['.claude/skills'] as const;

/** 项目 Claude 技能的固定优先级：排在 `.dsh/skills` 之后、`.agents/skills` 之前。 */
export const PROJECT_CLAUDE_RANK = 150;

/** 本 provider 的固定配置。 */
export interface ClaudeSkillOptions {
  /** 技能目录中显示为来源的 provider 名称。 */
  readonly providerName: string;
  /** 相对项目根扫描的技能目录。 */
  readonly dirs: readonly string[];
  /** 同一层内的优先级，数值越小越优先。 */
  readonly rank: number;
  /** 是否监听技能目录变化。 */
  readonly watch: boolean;
  /** 文件事件合并窗口，单位毫秒。 */
  readonly watchDebounceMs: number;
  /** 技能目录尚不存在时的探测间隔，单位毫秒。 */
  readonly watchPollMs: number;
  /** 同时保持监听的技能目录上限。 */
  readonly watchMaxProjects: number;
}

/** 本 provider 的固定配置；原有实现的七个配置字段收敛为常量。 */
export const DEFAULTS = {
  providerName: 'claude',
  dirs: [...DEFAULT_SKILL_DIRS],
  rank: PROJECT_CLAUDE_RANK,
  watch: true,
  watchDebounceMs: 150,
  watchPollMs: 5000,
  watchMaxProjects: 64,
} as const satisfies ClaudeSkillOptions;

/** 技能文件超过此大小时跳过，不读入内存。 */
const MAX_SKILL_BYTES = 256 * 1024;

/** 目录包内的技能说明文件。 */
const SKILL_FILE = 'SKILL.md';

/** 本行用到的最小日志接口。 */
export interface SkillsLogger {
  readonly warn?: (message: string) => void;
}

/** 本行用到的宿主上下文：只读取日志。 */
export interface ClaudeSkillContext {
  readonly logger?: SkillsLogger | undefined;
}

/** 一个根目录的扫描结果。 */
export interface DiscoveryResult {
  readonly candidates: SkillCandidate[];
  readonly complete: boolean;
}

/** frontmatter 的解析结果：数据与正文，或 YAML 错误。 */
export type FrontmatterSplit =
  | { readonly data: Record<string, unknown>; readonly body: string }
  | { readonly error: unknown };

/** 一个可用的技能文件。 */
interface ParsedSkill {
  readonly name: string;
  readonly description: string;
  readonly whenToUse?: string;
  readonly invocation: SkillInvocationPolicy;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly body: string;
}

/** 一个不可用的技能文件及原因。 */
interface SkillProblem {
  readonly problem: string;
}

/** 一个被监听的技能目录状态。 */
interface WatchState {
  readonly root: string;
  watcher: FSWatcher | undefined;
  timer: NodeJS.Timeout | undefined;
  poll: NodeJS.Timeout | undefined;
}

/** 监听器的固定参数。 */
interface WatcherOptions {
  readonly debounceMs: number;
  readonly pollMs: number;
  readonly maxProjects: number;
}

/** 取错误码，用于识别缺失的目录与文件。 */
function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

/** 取错误文本。 */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return String(error);
}

/** 从 cwd 向上找最近的含 `.git` 的祖先；没有时返回 cwd。 */
export function findProjectRoot(cwd: string): string {
  const start = resolve(cwd);
  let current = start;
  for (;;) {
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

/** 从 Markdown 正文中拆出 YAML frontmatter；YAML 非法时返回 error。 */
export function splitFrontmatter(raw: string): FrontmatterSplit {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return { data: {}, body: raw };
  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === '---') {
      end = index;
      break;
    }
  }
  if (end < 0) return { data: {}, body: raw };
  let parsed: unknown;
  try {
    parsed = parse(lines.slice(1, end).join('\n'));
  } catch (error) {
    return { error };
  }
  const data = isRecord(parsed) ? parsed : {};
  return { data, body: lines.slice(end + 1).join('\n') };
}

/** 解释 Claude Code 的两种布尔写法。 */
function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'on' ||
      normalized === '1'
    ) {
      return true;
    }
    if (
      normalized === 'false' ||
      normalized === 'no' ||
      normalized === 'off' ||
      normalized === '0'
    ) {
      return false;
    }
  }
  return fallback;
}

/** 由 Claude Code 的 frontmatter 键得到调用策略。 */
function invocationOf(data: Record<string, unknown>): SkillInvocationPolicy {
  return {
    modelInvocable: !readBoolean(data['disable-model-invocation'], false),
    userInvocable: readBoolean(data['user-invocable'], true),
  };
}

/** 解析一个技能文件；不可用时返回原因。 */
function parseSkillFile(raw: string, fallbackName: string): ParsedSkill | SkillProblem {
  const split = splitFrontmatter(raw);
  if ('error' in split) {
    return { problem: `invalid frontmatter: ${errorMessage(split.error)}` };
  }
  const { data, body } = split;
  const declared = typeof data.name === 'string' ? data.name.trim() : '';
  const name = declared === '' ? fallbackName : declared;
  if (!isSkillName(name)) return { problem: `invalid skill name "${name}"` };
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (description === '') return { problem: 'missing description' };
  const routing =
    typeof data.whenToUse === 'string'
      ? data.whenToUse
      : typeof data.when_to_use === 'string'
        ? data.when_to_use
        : undefined;
  const metadata = isRecord(data.metadata) ? data.metadata : undefined;
  return {
    name,
    description,
    ...(routing !== undefined && routing.trim() !== '' ? { whenToUse: routing } : {}),
    invocation: invocationOf(data),
    ...(metadata !== undefined ? { metadata } : {}),
    body,
  };
}

/** 把解析结果转成发现候选。 */
function buildCandidate(
  file: string,
  parsed: ParsedSkill,
  providerName: string,
  rank: number,
): SkillCandidate {
  return {
    name: parsed.name,
    description: parsed.description,
    ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
    invocation: parsed.invocation,
    source: 'project-claude',
    provider: providerName,
    rank,
    path: file,
    resourceBase: { kind: 'directory', path: dirname(file) },
    locator: { path: file },
    ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
  };
}

/** 把解析结果转成完整技能定义。 */
function buildDefinition(file: string, parsed: ParsedSkill, providerName: string): SkillDefinition {
  return {
    name: parsed.name,
    description: parsed.description,
    ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
    invocation: parsed.invocation,
    source: 'project-claude',
    provider: providerName,
    path: file,
    resourceBase: { kind: 'directory', path: dirname(file) },
    content: parsed.body.trim(),
    ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
  };
}

/** 读取一个技能文件，超过上限或已取消时返回 undefined。 */
export async function readSkillText(
  file: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (signal?.aborted === true) return undefined;
  const raw = await readFile(file, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_SKILL_BYTES) return undefined;
  return raw;
}

/** 扫描一个根目录，返回候选与是否全部读取成功。 */
export async function discoverRoot(
  root: string,
  providerName: string,
  rank: number,
  logger: SkillsLogger | undefined,
  signal: AbortSignal | undefined,
): Promise<DiscoveryResult> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) {
      return { candidates: [], complete: true };
    }
    throw error;
  }
  const candidates: SkillCandidate[] = [];
  let complete = true;
  for (const entry of entries) {
    if (signal?.aborted === true) return { candidates, complete: false };
    if (entry.name.startsWith('.')) continue;
    let file: string;
    let fallbackName: string;
    if (entry.isDirectory()) {
      file = join(root, entry.name, SKILL_FILE);
      fallbackName = entry.name;
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      file = join(root, entry.name);
      fallbackName = entry.name.slice(0, -3);
    } else {
      continue;
    }
    let raw: string | undefined;
    try {
      raw = await readSkillText(file, signal);
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) continue;
      complete = false;
      logger?.warn?.(`claude-skills: cannot read ${file}: ${errorMessage(error)}`);
      continue;
    }
    if (raw === undefined) continue;
    const parsed = parseSkillFile(raw, fallbackName);
    if ('problem' in parsed) {
      logger?.warn?.(`claude-skills: skipped ${file}: ${parsed.problem}`);
      continue;
    }
    candidates.push(buildCandidate(file, parsed, providerName, rank));
  }
  return { candidates, complete };
}

/** 技能目录变化时让目录缓存失效的监听器。 */
class RootWatcher {
  private readonly ctx: ClaudeSkillContext;
  private readonly control: SkillProviderControl;
  private readonly debounceMs: number;
  private readonly pollMs: number;
  private readonly maxProjects: number;
  private readonly states = new Map<string, WatchState>();
  private disposed = false;

  constructor(ctx: ClaudeSkillContext, control: SkillProviderControl, options: WatcherOptions) {
    this.ctx = ctx;
    this.control = control;
    this.debounceMs = options.debounceMs;
    this.pollMs = options.pollMs;
    this.maxProjects = options.maxProjects;
  }

  /** 监听本次查找的全部根目录；超出上限时淘汰最久未使用的项目。 */
  observe(roots: readonly string[]): boolean {
    if (this.disposed) return false;
    let complete = true;
    for (const root of roots) {
      if (this.states.has(root)) continue;
      const state: WatchState = {
        root,
        watcher: undefined,
        timer: undefined,
        poll: undefined,
      };
      this.states.set(root, state);
      if (!this.attach(state)) complete = false;
      this.evict();
    }
    return complete;
  }

  /** 为一个根目录启动监听；目录缺失时改为轮询探测。 */
  private attach(state: WatchState): boolean {
    if (this.disposed) return false;
    if (!existsSync(state.root)) {
      this.pollUntilPresent(state);
      return true;
    }
    try {
      const watcher = watch(state.root, { recursive: true, persistent: false }, () =>
        this.schedule(state),
      );
      state.watcher = watcher;
      watcher.on('error', (error: Error) => {
        this.ctx.logger?.warn?.(
          `claude-skills: watcher failed for ${state.root}: ${errorMessage(error)}`,
        );
        this.closeWatcher(state);
        this.control.invalidate();
        this.pollUntilPresent(state);
      });
      return true;
    } catch (error) {
      this.ctx.logger?.warn?.(`claude-skills: cannot watch ${state.root}: ${errorMessage(error)}`);
      this.pollUntilPresent(state);
      return false;
    }
  }

  /** 定期探测缺失的根目录，出现后改为监听。 */
  private pollUntilPresent(state: WatchState): void {
    if (state.poll !== undefined || this.disposed) return;
    const poll = setInterval(() => {
      if (this.disposed) return;
      if (!existsSync(state.root)) return;
      clearInterval(poll);
      state.poll = undefined;
      if (this.attach(state)) this.control.invalidate();
    }, this.pollMs);
    poll.unref();
    state.poll = poll;
  }

  /** 合并一串文件事件，只触发一次失效。 */
  private schedule(state: WatchState): void {
    if (state.timer !== undefined || this.disposed) return;
    const timer = setTimeout(() => {
      state.timer = undefined;
      if (!this.disposed) this.control.invalidate();
    }, this.debounceMs);
    timer.unref();
    state.timer = timer;
  }

  /** 第一方写入命中已监听的根目录时立即失效。 */
  observeHostMutation(displayPath: string): void {
    if (this.disposed || displayPath === '') return;
    const target = resolve(displayPath);
    for (const state of this.states.values()) {
      if (target === state.root || target.startsWith(state.root + sep)) {
        this.control.invalidate();
        return;
      }
    }
  }

  /** 让监听项目数保持在上限内。 */
  private evict(): void {
    while (this.states.size > this.maxProjects) {
      const oldest = this.states.keys().next();
      if (oldest.done === true) return;
      const state = this.states.get(oldest.value);
      this.states.delete(oldest.value);
      this.closeState(state);
    }
  }

  /** 关闭一个根目录的 watcher。 */
  private closeWatcher(state: WatchState): void {
    if (state.watcher === undefined) return;
    try {
      state.watcher.close();
    } catch {
      // 已经关闭。
    }
    state.watcher = undefined;
  }

  /** 关闭一个根目录的 watcher 与全部定时器。 */
  private closeState(state: WatchState | undefined): void {
    if (state === undefined) return;
    this.closeWatcher(state);
    if (state.timer !== undefined) clearTimeout(state.timer);
    state.timer = undefined;
    if (state.poll !== undefined) clearInterval(state.poll);
    state.poll = undefined;
  }

  /** 关闭全部 watcher 与定时器；之后的回调被忽略。 */
  async dispose(): Promise<void> {
    this.disposed = true;
    for (const state of this.states.values()) this.closeState(state);
    this.states.clear();
  }
}

/** 通过 `ctx.skills` 暴露项目 Claude Code 技能的 provider。 */
export class ClaudeSkillProvider implements SkillProvider {
  readonly name: string;
  private readonly ctx: ClaudeSkillContext;
  private readonly dirs: readonly string[];
  private readonly rank: number;
  private readonly watcher: RootWatcher;
  private readonly watching: boolean;
  private disposal: Promise<void> | undefined;

  /**
   * @param ctx - 插件上下文，只用于日志。
   * @param control - 注册作用域的失效能力。
   * @param options - 固定配置。
   */
  constructor(
    ctx: ClaudeSkillContext,
    control: SkillProviderControl,
    options: ClaudeSkillOptions = DEFAULTS,
  ) {
    this.ctx = ctx;
    this.name = options.providerName;
    this.dirs = options.dirs.length > 0 ? options.dirs : DEFAULT_SKILL_DIRS;
    this.rank = options.rank;
    this.watcher = new RootWatcher(ctx, control, {
      debounceMs: options.watchDebounceMs,
      pollMs: options.watchPollMs,
      maxProjects: options.watchMaxProjects,
    });
    this.watching = options.watch;
    this.disposal = undefined;
  }

  /** 扫描本次 cwd 对应项目下的全部根目录。 */
  async list(
    options: SkillLookupOptions = {},
  ): Promise<readonly SkillCandidate[] | SkillProviderObservation> {
    const cwd = resolve(options.cwd ?? process.cwd());
    const projectRoot = findProjectRoot(cwd);
    const roots = this.dirs.map((dir) => resolve(projectRoot, dir));
    let complete = this.watching ? this.watcher.observe(roots) : true;
    const candidates: SkillCandidate[] = [];
    for (const root of roots) {
      if (options.signal?.aborted === true) return { candidates, complete: false };
      try {
        const found = await discoverRoot(
          root,
          this.name,
          this.rank,
          this.ctx.logger,
          options.signal,
        );
        candidates.push(...found.candidates);
        if (!found.complete) complete = false;
      } catch (error) {
        complete = false;
        this.ctx.logger?.warn?.(`claude-skills: cannot scan ${root}: ${errorMessage(error)}`);
      }
    }
    return complete ? candidates : { candidates, complete };
  }

  /** 重新读取候选对应的正文。 */
  async get(
    candidate: SkillCandidate,
    options: SkillLookupOptions = {},
  ): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator;
    if (!isRecord(locator) || typeof locator.path !== 'string') return undefined;
    const file = locator.path;
    let raw: string | undefined;
    try {
      raw = await readSkillText(file, options.signal);
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) return undefined;
      throw error;
    }
    if (raw === undefined) return undefined;
    const parsed = parseSkillFile(raw, candidate.name);
    if ('problem' in parsed) {
      this.ctx.logger?.warn?.(`claude-skills: ${file} is no longer loadable: ${parsed.problem}`);
      return undefined;
    }
    return buildDefinition(file, parsed, this.name);
  }

  /** 把第一方写入转发给监听器。 */
  observeHostMutation(displayPath: string): void {
    this.watcher.observeHostMutation(displayPath);
  }

  /** 插件卸载时关闭 watcher，只关闭一次。 */
  dispose(): Promise<void> {
    this.disposal ??= this.watcher.dispose();
    return this.disposal;
  }
}

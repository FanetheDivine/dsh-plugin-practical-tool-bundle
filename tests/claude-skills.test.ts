// Claude 技能 provider 测试：在临时项目里验证项目根查找、frontmatter 解析、
// 技能扫描与行注册的 provider 名称与 rank。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SkillCandidate, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apply, inject, name } from '../src/claude-skills/index.ts';
import {
  type ClaudeSkillProvider,
  DEFAULT_SKILL_DIRS,
  DEFAULTS,
  discoverRoot,
  findProjectRoot,
  PROJECT_CLAUDE_RANK,
  splitFrontmatter,
} from '../src/claude-skills/provider.ts';
import type { Context } from '../src/types.ts';

/** 临时根目录、项目目录与默认技能目录。 */
let base: string;
let project: string;
let skillsRoot: string;

/** 已创建、需要在清理前释放的 provider。 */
const providers: ClaudeSkillProvider[] = [];

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'claude-skills-'));
  project = path.join(base, 'project');
  skillsRoot = path.join(project, '.claude', 'skills');
  mkdirSync(path.join(project, '.git'), { recursive: true });
  mkdirSync(skillsRoot, { recursive: true });
});

afterEach(async () => {
  for (const provider of providers.splice(0)) await provider.dispose();
  rmSync(base, { recursive: true, force: true });
});

/** 写入一个文件，自动创建父目录。 */
function writeFile(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

/** 拼一个带 frontmatter 的技能文件。 */
function skillDoc(frontmatter: string, body = 'body'): string {
  return `---\n${frontmatter}\n---\n${body}\n`;
}

/** 扫描默认技能目录。 */
async function scan(): Promise<SkillCandidate[]> {
  const found = await discoverRoot(skillsRoot, 'claude', PROJECT_CLAUDE_RANK, undefined, undefined);
  return found.candidates;
}

/** 记录 apply 注册内容的宿主模拟。 */
function makeHost() {
  const factories: Array<(control: SkillProviderControl) => SkillProvider> = [];
  const listeners: Array<(target?: { displayPath?: string }) => void> = [];
  const disposers: Array<() => unknown> = [];
  const effectLabels: string[] = [];
  return {
    logger: { warn: () => {} },
    skills: {
      registerProvider(create: (control: SkillProviderControl) => SkillProvider) {
        factories.push(create);
        return () => {};
      },
    },
    effect(execute: () => () => Promise<void>, label: string) {
      effectLabels.push(label);
      disposers.push(execute());
      return () => {};
    },
    on(_event: string, listener: (target?: { displayPath?: string }) => void) {
      listeners.push(listener);
      return () => {};
    },
    _factories: factories,
    _listeners: listeners,
    _disposers: disposers,
    _effectLabels: effectLabels,
  };
}

describe('findProjectRoot', () => {
  it('返回含 .git 的最近祖先', () => {
    const nested = path.join(project, 'src', 'deep');
    mkdirSync(nested, { recursive: true });
    expect(findProjectRoot(nested)).toBe(path.resolve(project));
  });

  it('cwd 自身含 .git 时返回 cwd', () => {
    expect(findProjectRoot(project)).toBe(path.resolve(project));
  });

  it('没有 .git 时回落到 cwd', () => {
    const lonely = path.join(base, 'lonely', 'nested');
    mkdirSync(lonely, { recursive: true });
    expect(findProjectRoot(lonely)).toBe(path.resolve(lonely));
  });
});

describe('splitFrontmatter', () => {
  it('拆出 frontmatter 与正文', () => {
    const result = splitFrontmatter('---\nname: demo\ndescription: hi\n---\nhello\n');
    expect('body' in result ? result.body : undefined).toBe('hello\n');
    expect('data' in result ? result.data : undefined).toEqual({
      name: 'demo',
      description: 'hi',
    });
  });

  it('无 frontmatter 时返回原文', () => {
    expect(splitFrontmatter('# 标题\n正文')).toEqual({ data: {}, body: '# 标题\n正文' });
  });

  it('YAML 非法时返回 error', () => {
    const result = splitFrontmatter('---\nname: [oops\n---\nbody');
    expect('error' in result).toBe(true);
  });
});

describe('技能扫描', () => {
  it('解析目录包与扁平 md', async () => {
    writeFile(path.join(skillsRoot, 'alpha', 'SKILL.md'), skillDoc('description: 目录包'));
    writeFile(path.join(skillsRoot, 'flat.md'), skillDoc('description: 扁平'));
    const candidates = await scan();
    expect(candidates.map((candidate) => candidate.name).sort()).toEqual(['alpha', 'flat']);
    for (const candidate of candidates) {
      expect(candidate.provider).toBe('claude');
      expect(candidate.rank).toBe(150);
      expect(candidate.source).toBe('project-claude');
    }
  });

  it('跳过缺 description、非法 name 与非法 frontmatter 的技能', async () => {
    writeFile(path.join(skillsRoot, 'nodesc', 'SKILL.md'), skillDoc('name: nodesc'));
    writeFile(path.join(skillsRoot, 'Bad Name', 'SKILL.md'), skillDoc('description: 非法目录名'));
    writeFile(
      path.join(skillsRoot, 'bad-declared', 'SKILL.md'),
      skillDoc('name: Bad Name\ndescription: 非法声明名'),
    );
    writeFile(path.join(skillsRoot, 'broken', 'SKILL.md'), '---\nname: [oops\n---\nbody');
    expect(await scan()).toEqual([]);
  });

  it('frontmatter 的 name 覆盖目录名', async () => {
    writeFile(
      path.join(skillsRoot, 'dir-name', 'SKILL.md'),
      skillDoc('name: real-name\ndescription: 覆盖'),
    );
    const candidates = await scan();
    expect(candidates.map((candidate) => candidate.name)).toEqual(['real-name']);
  });

  it('解析 disable-model-invocation 与 user-invocable', async () => {
    writeFile(
      path.join(skillsRoot, 'model-off', 'SKILL.md'),
      skillDoc('description: 禁用模型\ndisable-model-invocation: true'),
    );
    writeFile(
      path.join(skillsRoot, 'user-off', 'SKILL.md'),
      skillDoc('description: 禁用用户\nuser-invocable: false'),
    );
    const byName = new Map((await scan()).map((candidate) => [candidate.name, candidate]));
    expect(byName.get('model-off')?.invocation).toEqual({
      modelInvocable: false,
      userInvocable: true,
    });
    expect(byName.get('user-off')?.invocation).toEqual({
      modelInvocable: true,
      userInvocable: false,
    });
  });

  it('跳过超过 256KB 的技能文件', async () => {
    const huge = `${skillDoc('description: 超大')}${'x'.repeat(256 * 1024)}`;
    writeFile(path.join(skillsRoot, 'huge', 'SKILL.md'), huge);
    expect(await scan()).toEqual([]);
  });
});

describe('行注册', () => {
  it('导出固定行名、依赖与默认值', () => {
    expect(name).toBe('claude-skills');
    expect(inject).toEqual(['skills']);
    expect(DEFAULT_SKILL_DIRS).toEqual(['.claude/skills']);
    expect(PROJECT_CLAUDE_RANK).toBe(150);
    expect(DEFAULTS).toMatchObject({
      providerName: 'claude',
      dirs: ['.claude/skills'],
      rank: 150,
      watch: true,
      watchDebounceMs: 150,
      watchPollMs: 5000,
      watchMaxProjects: 64,
    });
  });

  it('注册 provider 后返回 claude 与 rank 150，并转发 fs/observed', async () => {
    writeFile(path.join(skillsRoot, 'demo', 'SKILL.md'), skillDoc('description: 演示', '正文内容'));
    const host = makeHost();
    apply(host as unknown as Context);

    const factory = host._factories[0];
    expect(factory).toBeDefined();
    if (factory === undefined) throw new Error('未注册 provider');

    let invalidations = 0;
    const control: SkillProviderControl = {
      signal: new AbortController().signal,
      invalidate: () => {
        invalidations += 1;
      },
    };
    const provider = factory(control);
    providers.push(provider as ClaudeSkillProvider);

    const listed = await provider.list({ cwd: project });
    if (!Array.isArray(listed)) throw new Error('期望候选数组');
    expect(listed).toHaveLength(1);
    const candidate = listed[0];
    expect(candidate?.provider).toBe('claude');
    expect(candidate?.rank).toBe(150);

    const definition = await provider.get(candidate as SkillCandidate, { cwd: project });
    expect(definition?.provider).toBe('claude');
    expect(definition?.content).toBe('正文内容');

    host._listeners[0]?.({ displayPath: path.join(skillsRoot, 'demo', 'SKILL.md') });
    expect(invalidations).toBe(1);

    expect(host._effectLabels).toContain('claude-skills watcher');
    for (const dispose of host._disposers) await dispose();
  });
});

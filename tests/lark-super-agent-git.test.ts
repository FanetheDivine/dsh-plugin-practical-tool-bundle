import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  commitFiles,
  commitFilesInQueue,
  ensureGitRepository,
  runGit,
  runSerial,
} from '../src/lark-super-agent/git.ts';

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'lark-super-agent-git-'));
  directories.push(directory);
  return directory;
}

async function write(path: string, content: string): Promise<void> {
  await writeFile(path, content, 'utf8');
}

beforeAll(async () => {
  const { stdout } = await runGit(['--version']);
  expect(stdout).toContain('git version');
  process.env.GIT_CONFIG_COUNT = '2';
  process.env.GIT_CONFIG_KEY_0 = 'user.name';
  process.env.GIT_CONFIG_VALUE_0 = 'Lark Super Agent Test';
  process.env.GIT_CONFIG_KEY_1 = 'user.email';
  process.env.GIT_CONFIG_VALUE_1 = 'lark-super-agent@example.invalid';
});

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('lark-super-agent git', { timeout: 30000 }, () => {
  it('initializes at the workspace root and commits only requested files', async () => {
    const root = await temporaryDirectory();
    await write(join(root, 'user-change.txt'), 'keep untracked');
    await write(join(root, 'note.json'), '{}\n');

    await commitFiles(root, ['note.json'], 'test: note');

    const top = await runGit(['rev-parse', '--show-toplevel'], root);
    expect(await realPath(top.stdout.trim())).toBe(await realPath(root));
    const tree = await runGit(['ls-tree', '-r', '--name-only', 'HEAD'], root);
    expect(tree.stdout.trim()).toBe('note.json');
    const status = await runGit(['status', '--porcelain'], root);
    expect(status.stdout).toContain('user-change.txt');
    expect(status.stdout).not.toContain('note.json');
    expect(await readFile(join(root, 'user-change.txt'), 'utf8')).toBe('keep untracked');
  });

  it('initializes a nested workspace instead of committing into its parent', async () => {
    const parent = await temporaryDirectory();
    const root = join(parent, 'dispatch');
    await ensureGitRepository(parent);
    await mkdir(root, { recursive: true });
    await write(join(root, 'note.json'), '{}\n');
    await commitFiles(root, ['note.json'], 'test: nested');
    const top = await runGit(['rev-parse', '--show-toplevel'], root);
    expect(await realPath(top.stdout.trim())).toBe(await realPath(root));
  });

  it('serializes commits sharing one root', async () => {
    const root = await temporaryDirectory();
    await Promise.all([
      runSerial(root, async () => {
        await write(join(root, 'a.json'), '{}\n');
        await commitFilesInQueue(root, ['a.json'], 'test: a');
      }),
      runSerial(root, async () => {
        await write(join(root, 'b.json'), '{}\n');
        await commitFilesInQueue(root, ['b.json'], 'test: b');
      }),
    ]);
    const count = await runGit(['rev-list', '--count', 'HEAD'], root);
    expect(count.stdout.trim()).toBe('2');
    const tree = await runGit(['ls-tree', '-r', '--name-only', 'HEAD'], root);
    expect(tree.stdout.trim().split(/\r?\n/).sort()).toEqual(['a.json', 'b.json']);
  });

  it('keeps written files and reports hook stderr when a commit fails', async () => {
    const root = await temporaryDirectory();
    await write(join(root, 'first.json'), '{}\n');
    await commitFiles(root, ['first.json'], 'test: first');
    const head = await runGit(['rev-parse', 'HEAD'], root);
    const hook = join(root, '.git', 'hooks', 'pre-commit');
    await write(hook, '#!/bin/sh\necho deliberately-blocked >&2\nexit 1\n');
    await chmod(hook, 0o755);
    await write(join(root, 'second.json'), '{"kept":true}\n');

    await expect(commitFiles(root, ['second.json'], 'test: blocked')).rejects.toThrow(
      /deliberately-blocked/,
    );
    expect(await readFile(join(root, 'second.json'), 'utf8')).toBe('{"kept":true}\n');
    expect((await runGit(['rev-parse', 'HEAD'], root)).stdout).toBe(head.stdout);
  });
});

async function realPath(path: string): Promise<string> {
  return realpath(path);
}

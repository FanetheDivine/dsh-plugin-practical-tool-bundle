// 前端产物契约测试：执行 dist/client.js，断言闭包工厂按包名注册、导出 apply，
// 并在桩环境里注册字典与状态轮询依赖组。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { makeClientCtx } from './helpers.ts';
import { assertFreshDist } from './support/dist-freshness.ts';

/** 仓库根目录（tests/ 的上一级）。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 前端产物路径。 */
const CLIENT_FILE = path.join(ROOT, 'dist', 'client.js');

/** 浏览器产物注册 id，与 package.json 的 name 一致。 */
const CLIENT_ID = 'dsh-plugin-practical-tool-bundle';

/** 一条产物注册。 */
interface ClientRegistration {
  id: string;
  factory: (require: (id: string) => unknown) => Record<string, unknown>;
}

/** 产物在 apply 期间用到的浏览器全局桩。 */
function stubGlobals(registrations: ClientRegistration[]) {
  const listeners: unknown[] = [];
  const documentStub = {
    visibilityState: 'hidden',
    head: { appendChild: () => undefined },
    documentElement: { setAttribute: () => undefined, removeAttribute: () => undefined },
    addEventListener: (...args: unknown[]) => listeners.push(args),
    removeEventListener: () => undefined,
    createElement: () => ({ setAttribute: () => undefined, remove: () => undefined }),
  };
  const windowStub = {
    __ModuleLoader__: {
      load: (registration: ClientRegistration) => registrations.push(registration),
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    location: { hostname: 'localhost', protocol: 'http:' },
  };
  return {
    window: windowStub,
    document: documentStub,
    // 状态路由取不到结论：本轮不挂载任何界面块
    fetch: async () => ({ ok: false, status: 503, json: async () => null }),
    setInterval: () => 0,
    AbortController,
    clearInterval: () => undefined,
    setTimeout: () => 0,
    console,
  };
}

/** 平台种子桩。 */
const PLATFORM_STUBS: Record<string, unknown> = {
  react: {
    Fragment: 'Fragment',
    useState: (value: unknown) => [value, () => undefined],
    useEffect: () => undefined,
    useRef: (value: unknown) => ({ current: value }),
    useCallback: (fn: unknown) => fn,
    createElement: () => null,
  },
  'react/jsx-runtime': { Fragment: 'Fragment', jsx: () => null, jsxs: () => null },
  'react-dom': { createRoot: () => ({ render: () => undefined }) },
  'react-dom/client': { createRoot: () => ({ render: () => undefined }) },
};

/** 在桩 window 中执行产物，返回注册列表。 */
function loadRegistrations(): ClientRegistration[] {
  const code = readFileSync(CLIENT_FILE, 'utf8');
  const registrations: ClientRegistration[] = [];
  vm.runInNewContext(code, stubGlobals(registrations));
  return registrations;
}

describe('前端产物（dist/client.js）', () => {
  it('按包名注册闭包工厂，导出 apply 且不声明必需服务', () => {
    assertFreshDist();
    const registrations = loadRegistrations();
    expect(registrations).toHaveLength(1);
    const registration = registrations[0];
    expect(registration?.id).toBe(CLIENT_ID);

    const exported = registration?.factory((id) => {
      const stub = PLATFORM_STUBS[id];
      if (stub !== undefined) return stub;
      throw new Error(`产物请求了平台种子之外的模块：${id}`);
    });
    if (exported === undefined) throw new Error('产物工厂没有返回导出对象');
    expect(exported).not.toHaveProperty('inject');
    expect(typeof exported.apply).toBe('function');
  });

  it('apply 注册双语字典并等待 slots/locale/workspaces', () => {
    assertFreshDist();
    const registration = loadRegistrations()[0];
    const exported = registration?.factory((id) => {
      const stub = PLATFORM_STUBS[id];
      if (stub !== undefined) return stub;
      throw new Error(`产物请求了平台种子之外的模块：${id}`);
    });
    if (exported === undefined) throw new Error('产物工厂没有返回导出对象');
    const ctx = makeClientCtx();
    (exported.apply as (target: unknown) => void)(ctx);

    const dictionary = ctx._localeRegistrations.find(
      (entry) => entry.ns === 'dsh-plugin-practical-tool-bundle',
    );
    expect(dictionary).toBeDefined();
    expect(Object.keys(dictionary?.dicts.zh ?? {}).sort()).toEqual(
      Object.keys(dictionary?.dicts.en ?? {}).sort(),
    );
    expect(dictionary?.dicts.zh['action.label']).toBe('清理会话');
    expect(ctx._injectGroups).toContainEqual(['slots', 'locale', 'workspaces']);
  });
});

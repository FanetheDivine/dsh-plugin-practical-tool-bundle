// 手机样式前端挂载测试：本地页面用 link、远程页面用 fetch 注入 style、卸载清理标记。
import type { Context } from '@deepseek-ai/cordis';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMobile } from '../src/client/mobile.ts';

const FLAG = 'data-dsh-mobile-css';
const HREF = 'api/dsh-practical-tools/mobile.css';
const OWNER = 'dsh-plugin-practical-tool-bundle: mobile touch';

/** 最小 DOM 元素桩。 */
interface FakeElement {
  tagName: string;
  rel: string;
  href: string;
  media: string;
  textContent: string;
  attributes: Map<string, string>;
  setAttribute(name: string, value: string): void;
  remove(): void;
}

/** 最小 document 桩：只提供挂载样式表用到的接口。 */
function makeDocument() {
  const children: FakeElement[] = [];
  const head = {
    children,
    appendChild(element: FakeElement) {
      children.push(element);
    },
  };
  const documentElement = {
    attributes: new Map<string, string>(),
    setAttribute(name: string, value: string) {
      documentElement.attributes.set(name, value);
    },
    removeAttribute(name: string) {
      documentElement.attributes.delete(name);
    },
  };
  const createElement = (tagName: string): FakeElement => {
    const element: FakeElement = {
      tagName,
      rel: '',
      href: '',
      media: '',
      textContent: '',
      attributes: new Map(),
      setAttribute(name, value) {
        element.attributes.set(name, value);
      },
      remove() {
        const index = children.indexOf(element);
        if (index >= 0) children.splice(index, 1);
      },
    };
    return element;
  };
  return { head, documentElement, createElement };
}

/** 在给定页面来源下挂载；返回 document 桩与卸载函数。 */
function mount(protocol: string, hostname: string) {
  const doc = makeDocument();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { location: { protocol, hostname } });
  const disposers: Array<() => void> = [];
  const ctx = {
    effect(fn: () => unknown) {
      const disposer = fn();
      if (typeof disposer === 'function') disposers.push(disposer as () => void);
      return () => {};
    },
  };
  installMobile(ctx as unknown as Context);
  return {
    doc,
    dispose: () => {
      for (const disposer of disposers.splice(0)) disposer();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('本地页面', () => {
  it.each(['localhost', '127.0.0.1', '::1', '[::1]'])('主机 %s 用 link 注入', (hostname) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { doc, dispose } = mount('http:', hostname);

    const link = doc.head.children[0];
    expect(link?.tagName).toBe('link');
    expect(link?.rel).toBe('stylesheet');
    expect(link?.href).toBe(HREF);
    expect(link?.media).toBe('(max-width: 767px)');
    expect(link?.attributes.get('data-plugin-css')).toBe(OWNER);
    expect(doc.documentElement.attributes.get(FLAG)).toBe('link');
    expect(fetchMock).not.toHaveBeenCalled();

    dispose();
    expect(doc.head.children).toHaveLength(0);
    expect(doc.documentElement.attributes.has(FLAG)).toBe(false);
  });

  it('非 http(s) 页面也用 link', () => {
    const { doc, dispose } = mount('file:', '');
    expect(doc.head.children[0]?.tagName).toBe('link');
    expect(doc.documentElement.attributes.get(FLAG)).toBe('link');
    dispose();
    expect(doc.head.children).toHaveLength(0);
  });
});

describe('远程页面', () => {
  it('用带凭据的 fetch 取文本并注入 style', async () => {
    const fetchMock = vi.fn(async () => new Response('body { font-size: 16px; }'));
    vi.stubGlobal('fetch', fetchMock);
    const { doc, dispose } = mount('https:', '192.168.1.10');

    const style = doc.head.children[0];
    expect(style?.tagName).toBe('style');
    expect(style?.attributes.get('data-plugin-css')).toBe(OWNER);
    await vi.waitFor(() => expect(doc.documentElement.attributes.get(FLAG)).toBe('style'));
    expect(style?.textContent).toBe('body { font-size: 16px; }');
    expect(fetchMock).toHaveBeenCalledWith(
      HREF,
      expect.objectContaining({ credentials: 'same-origin' }),
    );

    dispose();
    expect(doc.head.children).toHaveLength(0);
    expect(doc.documentElement.attributes.has(FLAG)).toBe(false);
  });

  it('fetch 失败时标记 failed 并保留 style 元素直至卸载', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401 })),
    );
    const { doc, dispose } = mount('https:', 'example.com');

    await vi.waitFor(() => expect(doc.documentElement.attributes.get(FLAG)).toBe('failed'));
    expect(doc.head.children).toHaveLength(1);
    expect(warn).toHaveBeenCalled();

    dispose();
    expect(doc.head.children).toHaveLength(0);
    expect(doc.documentElement.attributes.has(FLAG)).toBe(false);
  });
});

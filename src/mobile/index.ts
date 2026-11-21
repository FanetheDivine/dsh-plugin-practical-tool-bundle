/**
 * 手机样式行：提供手机触控放大的样式表路由，抽屉宽度固定 328 并替换占位符。
 */
import { readFile } from 'node:fs/promises';

import { MOBILE_CSS_PATH, PLUGIN_NAME } from '../rows.ts';
import type { Context } from '../types.ts';

/** 行名，与 cordis.patch.yml 的 id 一致。 */
export const name = 'mobile-touch-ui';

/** 抽屉宽度，样式表里的占位符替换成这个值。 */
const DRAWER_WIDTH = 328;

/** 样式表里的抽屉宽度占位符。 */
const WIDTH_TOKEN = '__DRAWER_WIDTH__';

/** 样式表文件；产物在 dist/ 下，assets/ 在包根，相对路径以 import.meta.url 为基准。 */
const CSS_URL = new URL('../assets/mobile.css', import.meta.url);

/** 样式表响应头。 */
const CSS_HEADERS = {
  'content-type': 'text/css; charset=utf-8',
  'cache-control': 'no-store',
};

/** 宿主连接服务里本行用到的部分。 */
interface ConnectionLike {
  fetch: {
    register(route: {
      path: string;
      methods: string[];
      requestBody: 'buffered';
      fetch: () => Promise<Response>;
    }): () => void;
  };
}

/** 注入 connection 之后的上下文。 */
type WebContext = Context & { readonly connection: ConnectionLike };

/** 把未知错误转成可读文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 注册样式表路由。
 * 每次挂载只读一次文件并缓存，请求只做字符串替换。
 */
export function apply(ctx: Context): void {
  ctx.inject(['connection'], (webCtx) => {
    const web = webCtx as WebContext;
    web.effect(() => {
      let loaded: Promise<string> | undefined;
      /** 读取并缓存样式表；读取失败同样缓存，避免重复读盘。 */
      const stylesheet = (): Promise<string> => {
        loaded ??= readFile(CSS_URL, 'utf8');
        return loaded;
      };
      const dispose = web.connection.fetch.register({
        path: MOBILE_CSS_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async () => {
          try {
            const text = (await stylesheet()).split(WIDTH_TOKEN).join(String(DRAWER_WIDTH));
            return new Response(text, { headers: CSS_HEADERS });
          } catch (error) {
            return new Response(
              `/* ${PLUGIN_NAME}: mobile.css unavailable: ${messageOf(error)} */`,
              { status: 500, headers: CSS_HEADERS },
            );
          }
        },
      });
      return () => {
        dispose();
      };
    }, 'dsh-plugin-practical-tool-bundle: mobile stylesheet route');
  });
}

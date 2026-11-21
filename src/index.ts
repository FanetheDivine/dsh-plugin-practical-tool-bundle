/**
 * 根行：提供聚合状态路由，前端据此决定挂载哪些界面块。
 * 各功能分别是一个 loader 行，本行不实现它们。
 */

import { type LoaderLike, readRowStatus } from './row-status.ts';
import { STATUS_PATH } from './rows.ts';
import type { Context } from './types.ts';
import { jsonResponse } from './utils.ts';

/** 插件名，与 cordis.patch.yml 的根行 id 一致。 */
export const name = 'dsh-plugin-practical-tool-bundle';

/**
 * 宿主 `connection.fetch` 的最小结构：本行只用到 `register`。
 * 宿主包没有为 `connection` 提供 cordis 类型增强，这里按实际用法收窄。
 */
interface ConnectionLike {
  readonly fetch: {
    register(route: {
      path: string;
      methods: string[];
      requestBody: 'buffered';
      fetch: () => Response | Promise<Response>;
    }): () => void;
  };
}

/** 带 `connection` 的宿主上下文。 */
type WebContext = Context & { readonly connection: ConnectionLike };

/**
 * 插件启用时注册状态路由。
 * 路由每次请求时读取 loader 的当前状态，行开关无需重启。
 */
export function apply(ctx: Context): void {
  ctx.inject(['connection'], (injected) => {
    const webCtx = injected as WebContext;
    webCtx.effect(
      () =>
        webCtx.connection.fetch.register({
          path: STATUS_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: () => jsonResponse({ ok: true, rows: readRowStatus(loaderOf(webCtx)) }),
        }),
      'dsh-plugin-practical-tool-bundle: status route',
    );
  });
}

/** 取宿主 loader；缺失时返回 undefined，状态路由据此回答 `null`。 */
function loaderOf(ctx: Context): LoaderLike | undefined {
  const loader = ctx.get('loader') as LoaderLike | undefined;
  if (loader === undefined || typeof loader.entries !== 'function') return undefined;
  return loader;
}

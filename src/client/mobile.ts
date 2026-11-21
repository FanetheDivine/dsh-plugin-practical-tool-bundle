/**
 * 手机样式表挂载：本地页面用 link、远程页面用 fetch 注入 style，结果写到 html 标记。
 */
import type { Context } from '@deepseek-ai/cordis';

/** 样式表路由，相对页面基路径。 */
const MOBILE_CSS_HREF = 'api/dsh-practical-tools/mobile.css';

/** 标记页面用了哪条加载路径，便于在手机控制台排查。 */
const FLAG = 'data-dsh-mobile-css';

/** 样式只在手机断点以下生效。 */
const MEDIA = '(max-width: 767px)';

/** 注入元素的来源标记，站点上自行加的样式表据此区分。 */
const CSS_OWNER = 'dsh-plugin-practical-tool-bundle: mobile touch';

/** 本机主机名，浏览器持有认证 cookie，link 可在首屏生效。 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** 标记加载路径。 */
function stamp(value: 'link' | 'style' | 'failed'): void {
  document.documentElement.setAttribute(FLAG, value);
}

/** 清掉标记。 */
function unstamp(): void {
  document.documentElement.removeAttribute(FLAG);
}

/** 远程页面走已认证的 fetch 取文本，再注入 style。 */
function injectStyle(): () => void {
  const style = document.createElement('style');
  style.setAttribute('data-plugin-css', CSS_OWNER);
  const controller = new AbortController();

  const load = async (): Promise<void> => {
    try {
      const response = await fetch(MOBILE_CSS_HREF, {
        credentials: 'same-origin',
        headers: { accept: 'text/css' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (controller.signal.aborted) return;
      style.textContent = text;
      stamp('style');
    } catch (error) {
      if (controller.signal.aborted) return;
      stamp('failed');
      console.warn('[dsh-plugin-practical-tool-bundle] mobile stylesheet unavailable:', error);
    }
  };

  document.head.appendChild(style);
  void load();

  return () => {
    controller.abort();
    style.remove();
    unstamp();
  };
}

/** 本地页面用 link，浏览器在首屏前就套用放大尺寸。 */
function injectLink(): () => void {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = MOBILE_CSS_HREF;
  link.media = MEDIA;
  link.setAttribute('data-plugin-css', CSS_OWNER);

  document.head.appendChild(link);
  stamp('link');

  return () => {
    link.remove();
    unstamp();
  };
}

/**
 * 按页面来源选择加载路径。
 * 非 http(s) 页面与 loopback 页面用 link，其余页面用 fetch。
 */
export function installMobile(ctx: Context): void {
  ctx.effect(() => {
    const loopback = LOOPBACK_HOSTS.has(window.location.hostname);
    const httpish = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    return !httpish || loopback ? injectLink() : injectStyle();
  }, 'dsh-plugin-practical-tool-bundle: mobile touch stylesheet');
}

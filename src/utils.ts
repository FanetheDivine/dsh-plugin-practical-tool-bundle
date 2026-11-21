/**
 * 零依赖工具函数：对象收窄与 JSON 响应。
 */

/** 判断值是否是普通对象。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 本包路由统一使用的 JSON 响应头。 */
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

/** 生成一个不缓存的 JSON 响应。 */
export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

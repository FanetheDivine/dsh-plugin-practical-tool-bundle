# HTTP 契约

全部路由位于 `/api` 认证围栏内，同源相对路径访问，响应带 `cache-control: no-store`。

## GET /api/dsh-practical-tools/status

根行提供。回答五行当前是否可用。

响应 200：

```json
{
  "ok": true,
  "rows": {
    "sweeper": true,
    "restart": false,
    "mobile": true,
    "reasoningReset": true,
    "claudeSkills": null
  }
}
```

- 值为 `null` 表示 unavailable（loader 不可用），前端保持当前界面。
- 根行未启用时该路由不存在，前端产物不会加载。

## POST /api/dsh-practical-tools/sweep

清理会话行提供。

请求体：

```json
{ "ids": ["<session id>"], "keepIds": ["<session id>"] }
```

- `ids` 必须是数组，否则 400 `{ "ok": false, "error": "body must be {\"ids\": [...]}" }`。
- Workspace registry 未就绪时 503 `{ "ok": false, "error": "..." }`。

响应 200：

```json
{
  "ok": true,
  "archived": 3,
  "deleted": 2,
  "skipped": 1,
  "deferred": 0,
  "failed": 0,
  "reasons": {},
  "archivedIds": [],
  "deletedIds": [],
  "skippedIds": [],
  "failedIds": []
}
```

## GET /api/dsh-practical-tools/restart/info

重启行提供。响应 200：

```json
{ "pid": 1234, "startedAt": 1700000000000, "runtime": "web" }
```

## POST /api/dsh-practical-tools/restart

重启行提供。

- 已受理：200 `{ "ok": true, "pid": 1234, "startedAt": 1700000000000, "logPath": "...", "runtime": "web" }`。
- 重复请求：409 `{ "ok": false, "error": "a restart has already been requested" }`。
- 无法生成计划或拉起：500 `{ "ok": false, "error": "..." }`。
- 网页场景受理后约 600ms 退出当前进程；桌面场景由外部脚本关闭应用并重新启动。

## GET /api/dsh-practical-tools/mobile.css

手机样式行提供。响应 200 `text/css; charset=utf-8`，内容中的 `__DRAWER_WIDTH__` 替换为 328。读取失败时 500，正文为 CSS 注释。

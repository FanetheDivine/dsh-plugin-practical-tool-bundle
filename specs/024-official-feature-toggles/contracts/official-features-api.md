# 契约: 官方功能路由

路由位于本包既有命名空间 `/api/dsh-practical-tools/` 下，受宿主 `/api` 认证围栏保护。由 `official-features` 行注册，行停用时随 fiber 释放。

## GET /api/dsh-practical-tools/official-features

读取五个功能的当前状态。

响应 `200`：

```json
{
  "ok": true,
  "features": [
    { "id": "schedule", "on": true },
    { "id": "goal", "on": true },
    { "id": "task", "on": true },
    { "id": "plan", "on": true },
    { "id": "present", "on": true }
  ],
  "busy": false
}
```

| 字段 | 说明 |
| --- | --- |
| `features` | 固定顺序：schedule、goal、task、plan、present |
| `features[].on` | 有任一受管项启用即为 `true`，见 [data-model.md](../data-model.md) |
| `busy` | 有未完成的施加或撤销时为 `true`，面板据此显示处理中 |

loader 不可用时返回 `{ "ok": true, "features": null, "busy": false }`，面板保持当前显示。

## POST /api/dsh-practical-tools/official-features

打开或关闭一个功能。

请求体：

```json
{ "id": "goal", "enabled": false }
```

| 字段 | 规则 |
| --- | --- |
| `id` | 必须是五个功能 id 之一 |
| `enabled` | 布尔值 |

响应：

| 状态 | 条件 | 体 |
| --- | --- | --- |
| `200` | 已施加并等到真实状态与目标一致 | `{ "ok": true, "features": [...], "busy": false }` |
| `202` | 已施加但 2 秒内未到目标 | `{ "ok": true, "features": [...], "busy": true }` |
| `400` | `id` 未知或 `enabled` 不是布尔 | `{ "ok": false, "error": "invalid-request" }` |
| `409` | 记录无法写入存储域 | `{ "ok": false, "error": "store-failed" }` |
| `500` | `loader.update` 抛错 | `{ "ok": false, "error": "apply-failed", "message": "..." }` |

行为约定：

- 同一时刻只处理一个请求，后到的请求排队，最终状态等于最后一个请求。
- 先写记录再施加；施加失败时回滚记录并返回 `500`。
- `enabled: true` 只清除记录并撤销本包的施加，不对抗文件配置，见计划决策 P-004。
- 只修改受管行，不触碰其他行与其他 preset 的无关子行。

## 状态路由扩展

根行 `GET /api/dsh-practical-tools/status` 的 `rows` 增加一项：

```json
{ "rows": { "officialFeatures": true } }
```

取值规则与既有五项一致：`true` 可用、`false` 停用、`null` 宿主未给出结论。

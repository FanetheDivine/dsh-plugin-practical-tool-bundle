# 数据模型：清理会话的保护范围

## 会话行（客户端快照）

来源：`ctx.sessions.list.getSnapshot()`。

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `ids` | `string[]` | 宿主列表返回的会话；不含只存在于目录的 subagent |
| `byId[id].origin` | `'subagent'` 或空 | 区分普通会话与子代理会话 |
| `byId[id].parentId` | `string` 或空 | 子代理的父会话，用于祖先链 |
| `byId[id].retainedBy` | `Partial<Record<string, number>>` | 各视图来源的持有计数 |

## 保护集合

| 项 | 说明 |
| --- | --- |
| 打开会话 | `retainedBy` 中 `mainView`、`sidebarChat`、`sidebarView` 任一大于 0 |
| 祖先链 | 从打开会话沿 `parentId` 上溯的全部会话，带环保护 |
| 空集合 | `sessions` 服务不可用，或列表快照缺失 |

保护集合同时用于：

- `sweep()` 的 `keepIds` 与待归档 `ids` 过滤。
- `overview()` 的未置顶计数扣除。

## 清理请求

请求体：

```json
{ "ids": ["<会话 id>"], "keepIds": ["<会话 id>"] }
```

| 字段 | 含义 |
| --- | --- |
| `ids` | 待归档的未置顶会话，已排除 `keepIds` |
| `keepIds` | 打开会话与祖先；归档与删除两个阶段都跳过 |

响应字段不变：`archived`、`deleted`、`skipped`、`deferred`、`failed`，以及对应的 id 列表。

## 宿主侧状态

| 状态 | 判定 | 处理 |
| --- | --- | --- |
| 活跃 | registry 抛出 `WorkspaceActiveSessionError` | 跳过，计入 `skipped` |
| 请求开始时在内存 | 归档前 `sessions.get(id)` 非空 | 删除阶段按延后处理 |
| 删除时仍在内存 | 删除阶段 `sessions.get(id)` 非空 | 计入 `deferred` |
| 其余已归档 | 不在保护集合、不在内存 | 删除日志目录，计入 `deleted` |

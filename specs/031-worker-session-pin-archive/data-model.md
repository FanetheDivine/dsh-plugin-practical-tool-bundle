# Data Model: 调度会话置顶与归档工作会话

## 实体

### 工作会话

| 属性 | 来源 | 说明 |
| --- | --- | --- |
| `sessionId` | 宿主会话 | 新建时由 `session_create` 返回，复用时来自候选列表 |
| `pinned` | `workspaceRegistry.pinnedSessionIds` | 是否在置顶集合；集合顺序为最近置顶在前 |
| `archived` | `workspaceRegistry.archivedSessionIds` | 是否在归档集合 |
| `running` | 会话活动 | 归档默认拒绝运行中的会话 |
| `taskRefs` | 任务笔记 | 引用该会话的任务 id |

### 任务

| 属性 | 来源 | 说明 |
| --- | --- | --- |
| `id` | `message-task-status.json` | 任务标识 |
| `status` | 同上 | `in_progress`、`waiting_user`、`failed`、`completed` |
| `sessionIds` | 同上 | 任务使用的工作会话，可多个 |
| `archived` | `archive/<taskId>/task.json` | 任务完成时由程序归档 |

## 状态转换

### 新建工作会话

```text
created → pinned
```

- `session_create` 返回 `sessionId` 后立即调用 `session_pin`。
- 置顶先于发送任务要求。

### 复用候选会话

```text
pinned → pinned
unpinned → unpinned
```

- 不调用置顶或取消置顶。

### 任务完成

```text
task in_progress/waiting_user/failed → completed
选择任务会话：未被其他未完成任务引用
目标会话 pinned/unpinned → archived
目标会话的 pin 在同一次写入中移除
任务快照与上报 → archive/<taskId>/
```

- 先读取并记下会话 id，再标记完成，最后归档。
- 归档失败不回退任务完成状态。

### 恢复会话

```text
archived → unpinned
```

- 由用户在界面恢复，不属于调度会话的动作。

## 归档判定

| 其他未完成任务引用数 | 动作 |
| --- | --- |
| 0 | 归档 |
| 1 个及以上 | 保持未归档 |

## 失败处理

| 失败点 | 结果 |
| --- | --- |
| 置顶失败 | 派发继续；同一轮回复说明失败 |
| 单个会话归档失败 | 继续归档其余会话；同一轮回复说明失败 |
| 任务标记完成失败 | 任务保持原状态；不归档任何会话 |
| 会话未知或已删除 | 视为归档失败，继续其余会话 |

## 校验规则

- `session_pin` 要求会话存在且未归档。
- `session_archive` 要求会话存在；运行中且未传 `stop_activity: true` 时拒绝。
- `stop_activity: true` 先写归档集合，再请求停止运行工作。
- 归档不删除日志、目录与上报记录。
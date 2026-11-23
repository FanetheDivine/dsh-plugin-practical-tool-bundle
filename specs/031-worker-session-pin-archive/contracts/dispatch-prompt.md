# Contract: 调度提示词置顶与归档规则

## 位置

- 在 `SA_DISPATCH_PROMPT` 的 `## Dispatch work` 之后新增独立小节 `## Maintain the session list`。
- 其他小节内容保持原有职责。

## 提示词必须包含的规则

| id | 规则 |
| --- | --- |
| R1 | 新建工作会话成功后，先调用 `session_pin` 置顶，再向该会话发送任务要求 |
| R2 | 通过 `task_candidates` 复用的会话保持原置顶状态；不调用置顶或取消置顶 |
| R3 | 置顶失败时告知用户并继续派发 |
| R4 | 任务完成时先从未归档笔记取得会话 id，再调用 `task_update` 标记完成，最后逐个归档 |
| R5 | 归档前读取 `message-task-status.json`；仍被其他未完成任务引用的会话保持未归档 |
| R6 | 归档调用 `session_archive`，带 `stop_activity: true` |
| R7 | 单个会话归档失败时继续其余会话，并在同一轮回复说明失败；任务保持已完成 |
| R8 | 只归档任务记录的工作会话；不归档调度会话自身 |

## 工具契约

### session_pin

```json
{ "session_id": "<session id>", "remove": false }
```

- `session_id` 必填。
- 成功结果文本为 `session pinned`。
- 会话已归档时返回错误；会话不存在时返回错误。

### session_archive

```json
{ "session_id": "<session id>", "stop_activity": true }
```

- `session_id` 必填。
- `stop_activity: true` 时跳过活动检查，写入归档后请求停止运行工作。
- 成功结果文本为 `session archived`。
- 归档在同一次写入中移除置顶；已归档会话再次归档直接返回。

## 验收断言

- 提示词包含 `## Maintain the session list`。
- 提示词包含 `session_pin`、`session_archive` 与 `stop_activity`。
- 提示词包含复用会话不置顶的规则。
- 提示词包含置顶失败与归档失败的报告规则。
- 提示词包含先取得会话 id 再标记完成的顺序。
# 契约：模型可见工具

工具描述与参数说明用英文，与宿主及上游工具一致（计划 P-016）。数据结构见 [data-model.md](../data-model.md)。

失败统一以工具错误结果返回：参数错误抛 `ToolArgsError`，执行失败抛 `Error`，轮次继续。

## SA-任务会话

### `send_report`

```ts
send_report({ text?: string, files?: string[] })
```

| 参数 | 规则 |
| --- | --- |
| `text` | 给用户的话或提问；去掉首尾空白后可为空 |
| `files` | 已写好的 Markdown 文件路径，绝对路径或相对调用方工作目录 |

执行顺序：

1. `text` 为空且 `files` 为空或缺省：返回错误 `send_report needs text or files`。
2. 校验 `files`：任一项不存在或扩展名不是 `.md`，返回错误并列出不合格的路径。
3. 解析调度会话（[R-01](../research.md#r-01-桥接会话如何识别)）；不可用时返回错误，不写任何文件。
4. 生成 `reportId`，复制文件，写上报记录，更新所属任务的 `reportIds`。
5. 把注入块送进调度会话（[injection.md](./injection.md)）。
6. 提交 git。提交失败时投递照常成立，结果附带 `warning`。

结果：

```json
{ "reportId": "report-…", "taskId": "task-… | null", "delivered": true, "warning": "…?" }
```

## SA-调度会话

### `task_create`

```ts
task_create({ title: string, workspace_id: string, message: { text: string, message_id?: string } })
```

- `workspace_id` 未登记在 `workspaces.json`：返回错误，提示先登记。
- 结果：`{ "taskId": "task-…" }`。

### `task_update`

```ts
task_update({
  task_id: string,
  status?: 'in_progress' | 'waiting_user' | 'failed' | 'completed',
  add_session_ids?: string[],
  add_message?: { text: string, message_id?: string },
  title?: string
})
```

- 至少提供一个可选参数。
- `status: 'completed'` 时在同一次调用内自动归档，结果带 `archived: true`。
- 结果：`{ "taskId": "…", "status": "…", "archived": false }`。

### `workspace_note_set`

```ts
workspace_note_set({ workspace_id: string, summary: string, keywords: string[], notes?: string })
```

- `workspace_id` MUST 是已注册工作区；`path` 由程序从注册表读取。
- 已有笔记时整体替换。
- 结果：`{ "workspaceId": "…", "created": true }`。

### `workspace_note_remove`

```ts
workspace_note_remove({ workspace_id: string })
```

- 结果：`{ "workspaceId": "…", "removed": true }`；不存在时 `removed: false`。

### `task_candidates`

```ts
task_candidates({ workspace_id: string, task_id?: string })
```

只读，不提交 git。规则见计划 P-013。

结果：

```json
{
  "candidates": [
    { "sessionId": "…", "title": "…", "running": false, "tasks": ["task-…"], "lastActiveAt": "…" }
  ]
}
```

## 提交信息

| 操作 | 提交信息 |
| --- | --- |
| `task_create` | `lark-super-agent: create <taskId>` |
| `task_update` | `lark-super-agent: update <taskId>` |
| 自动归档 | `lark-super-agent: archive <taskId>` |
| `workspace_note_set` | `lark-super-agent: note <workspaceId>` |
| `workspace_note_remove` | `lark-super-agent: remove note <workspaceId>` |
| `send_report` | `lark-super-agent: report <reportId>` |

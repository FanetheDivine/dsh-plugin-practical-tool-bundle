# 数据模型：lark-super-agent

全部文件位于调度工作区，即 `dsh-plugin-lark-bridge` 的桥接工作区。目录布局见计划 P-002。

## 文件布局

| 路径 | 内容 | 写入者 |
| --- | --- | --- |
| `message-task-status.json` | 未归档的任务 | 笔记写工具 |
| `workspaces.json` | 工作区笔记 | 笔记写工具 |
| `reports/<taskId>/<reportId>.md` | 上报记录 | `send_report` |
| `reports/<taskId>/<reportId>-<n>-<文件名>.md` | 上报附带文件的副本 | `send_report` |
| `reports/_unassigned/…` | 找不到所属任务的上报 | `send_report` |
| `archive/<taskId>/task.json` | 已归档任务 | 自动归档 |
| `archive/<taskId>/reports/…` | 已归档任务的上报 | 自动归档 |
| `AGENTS.md` | 记忆 | 调度会话自行编写 |

## Task

`message-task-status.json` 的结构：

```json
{
  "version": 1,
  "tasks": [ Task ]
}
```

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `id` | string | 程序生成，格式见 P-011 |
| `title` | string | 非空，单行 |
| `status` | `in_progress` \| `waiting_user` \| `failed` \| `completed` | 新建为 `in_progress` |
| `workspaceId` | string | MUST 登记在 `workspaces.json` |
| `sessionIds` | string[] | 执行过该任务的会话，去重，保持加入顺序 |
| `reportIds` | string[] | 归入该任务的上报，按时间顺序 |
| `messages` | Message[] | 至少一条，第一条是发起消息 |
| `createdAt` | string | ISO 8601，本机时区偏移 |
| `updatedAt` | string | 每次修改更新 |

状态转换：

```text
in_progress ⇄ waiting_user
in_progress → failed → in_progress
任意未完成状态 → completed → 自动归档，从文件移除
```

## Message

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `messageId` | string? | 飞书消息的 `message_id`；Web GUI 输入没有该值 |
| `text` | string | 非空，调度会话摘录的原文 |
| `time` | string | ISO 8601 |

## Workspace note

`workspaces.json` 的结构：

```json
{
  "version": 1,
  "workspaces": [ WorkspaceNote ]
}
```

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `workspaceId` | string | MUST 是已注册工作区，唯一 |
| `path` | string | 写入时从注册表读取，Linux 风格 |
| `summary` | string | 非空 |
| `keywords` | string[] | 至少一个，去重 |
| `notes` | string | 可为空 |
| `updatedAt` | string | ISO 8601 |

## Report

`reports/<taskId>/<reportId>.md`：

```markdown
---
reportId: <reportId>
sessionId: <sessionId>
taskId: <taskId 或 null>
time: <ISO 8601>
files:
  - <副本相对路径>
---

<text 原文>
```

规则：

- `text` 与 `files` 至少有一个。
- `files` 中每一项 MUST 是存在的 `.md` 文件；任一项不合格时整次上报失败，不写任何文件。
- 所属任务：在未归档任务中找 `sessionIds` 包含调用方会话的任务，取 `updatedAt` 最新的一个；没有则写入 `reports/_unassigned/`。
- 归入任务的上报 MUST 把 `reportId` 追加到该任务的 `reportIds`。

## Archived task

`archive/<taskId>/task.json` 是归档时刻的 Task 全量快照，另加：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `archivedAt` | string | ISO 8601 |

`reportIds` 与 `sessionIds` 原样保留，满足规格 FR-049。上报目录从 `reports/<taskId>/` 移到 `archive/<taskId>/reports/`。

## 写入规则

- JSON 先写临时文件再重命名，避免半截文件。
- 同一调度工作区的全部写入与 git 操作串行执行。
- 读到无法解析的 JSON 时，写工具返回错误并保留原文件。

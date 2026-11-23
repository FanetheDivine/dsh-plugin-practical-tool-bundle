# Data Model: SA 会话区分远程消息与本机消息

本功能不新增持久化数据。以下实体只存在于会话上下文与提示词规则中。

## 用户状态

| 会话 | 取值 | 默认 | 进入「在电脑前」 | 回到「远程」 |
| --- | --- | --- | --- | --- |
| `SA-调度会话` | 远程、在电脑前 | 远程 | 收到本机消息 | 收到 `<lark-message>` |
| `SA-任务会话` | 远程模式、本机模式 | 远程模式 | 收到本机消息 | 收到 `<dispatch_session_message>` |

- 调度状态由程序按 `source.kind` 判定，记录在以会话为键的 `WeakMap` 中，切换时插入系统提醒，见 [contracts/dispatch-presence.md](./contracts/dispatch-presence.md)。
- 工作会话状态由模型按上下文中最近一条可判定消息推断，程序不保存。
- `<work_session_message>`、`<work_session_failure>` 与桥接提醒不改变状态。
- 工作会话无法判断时视为远程。

## 入站消息分类

| 会话 | 分类 | 判定 |
| --- | --- | --- |
| `SA-调度会话` | 飞书消息 | `source.kind === 'lark-bridge'` 且 `reminder !== true` |
| `SA-调度会话` | 工作会话消息 | `source.kind === 'lark-super-agent'` |
| `SA-调度会话` | 本机消息 | `source.kind === 'user'` |
| `SA-任务会话` | 调度会话消息 | 含 `<dispatch_session_message>` 块 |
| `SA-任务会话` | 本机消息 | 没有该块的用户消息 |

## 来源标记

- 形式见 [contracts/dispatch-session-message.md](./contracts/dispatch-session-message.md)。
- 由 `sa-worker` 子行在消息进入会话前加上，写入会话日志。

# Changelog

## Unreleased

### Changed

- `SA-调度会话` 的系统提示词要求新建工作会话后立即置顶
- `SA-调度会话` 的系统提示词要求任务完成后归档该任务的工作会话
- `SA-调度会话` 按消息来源插入用户状态提醒；用户在 Web GUI 直接对话时改为正文回复与转达
- `SA-任务会话` 把调度会话的消息包进 `<dispatch_session_message>`；用户直接发言时改为正文对话，影响任务的变化仍上报并注明用户在电脑前

### Removed

- 删除飞书任务与调度会话：`lark-super-agent` 行、`SA-调度会话` 与 `SA-任务会话` 两个预设，以及 `dsh-plugin-meta-tools` 依赖

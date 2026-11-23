# Contract: 两个 SA 预设的提示词规则

## `SA-调度会话`

在 `## Classify each user message first` 之前新增 `## Track where the user is`：

1. 程序会在用户状态切换时插入系统提醒：「at the computer」表示用户在 Web GUI 直接对话，「remote」表示用户经飞书对话。状态以最近的提醒为准，默认远程。
2. 入站消息分三类：`<lark-message>`、`<work_session_message>`/`<work_session_failure>`、本机消息。工作会话消息与上报首行的 `用户在电脑前` 不改变状态。
3. 远程状态：经 `lark_notify` 回复与转达。
4. 在电脑前：在正文回复用户，并在正文转达上报与失败，不调用 `lark_notify`；此时正文对用户可见。
5. 两种状态都按全部派发规则执行。

`## Handle worker communication` 中的转达要求改为按当前状态选择渠道。

## `SA-任务会话`

重写为两种模式：

1. 带 `<dispatch_session_message>` 的消息来自调度会话；块外有用户正文的消息来自电脑前的用户。
2. 默认远程模式：保持现有规则，全部交流经 `send_report`，正文不可见。
3. 收到本机消息进入本机模式：在正文直接回答与提问，普通问答不调用 `send_report`。
4. 本机模式下影响任务的变化仍调用 `send_report`，例如需求变更、完成与放弃；`text` 首行写 `用户在电脑前`。
5. 收到调度会话消息回到远程模式。
6. 不向调度会话告知模式变化本身。

## 验收断言

- 调度提示词包含状态提醒的含义、默认远程、两种渠道、工作会话消息不改变状态与全部派发不变。
- 任务提示词包含 `<dispatch_session_message>`、本机模式正文对话、本机模式上报范围与 `用户在电脑前` 首行、回到远程模式的条件。

# Research: SA 会话区分远程消息与本机消息

## R-1 模型能看到消息来源吗

- **Decision**：不能。区分只能依靠消息正文。
- **Rationale**：`dsh-llm` 的 `MessageBase.content` 是「Exact model-facing blocks」，`source` 只供宿主与插件判断。
- **Alternatives Considered**：让模型读取 `source`。宿主不提供该通道。

## R-2 两个会话的入站消息形态

| 会话 | 来源 | 正文形态 | `source.kind` |
| --- | --- | --- | --- |
| `SA-调度会话` | 飞书 | `<lark-message>` 块 | `lark-bridge` |
| `SA-调度会话` | 工作会话上报 | `<work_session_message>` 块 | `lark-super-agent` |
| `SA-调度会话` | 工作会话失败 | `<work_session_failure>` 块 | `lark-super-agent` |
| `SA-调度会话` | 本机用户 | 普通文本 | `user`（带 `rpcId`、`clientTimeZone`） |
| `SA-任务会话` | `session_create` 首条任务 | 普通文本 | `dsh-plugin-meta-tools` |
| `SA-任务会话` | `session_send` | `<system-reminder>` 包裹的文本 | `dsh-plugin-meta-tools` |
| `SA-任务会话` | 本机用户 | 普通文本 | 宿主 GUI |

- **Decision**：调度会话由程序按 `source.kind` 判定状态并插入系统提醒；工作会话需要补来源标记。
- **Rationale**：首条任务与本机输入同为普通文本。`<system-reminder>` 也会由宿主附加到其他消息，不能作为调度来源的依据。

## R-3 在工作会话加标记的位置

- **Decision**：`sa-worker` 子行监听 `agent/pre-step`，把 `source.kind === 'dsh-plugin-meta-tools'` 的消息替换为带 `<dispatch_session_message>` 包装的新消息。
- **Rationale**：
  - `agent/pre-step` 允许替换本步进入会话的消息，`dsh-plugin-lark-bridge` 用同一钩子插入提醒。
  - 预设子行注册的 agent 事件按作用域过滤，只作用于 `SA-任务会话`。
  - meta-tools 的 `session_create` 与 `session_send` 都以 `dsh-plugin-meta-tools` 为来源投递，一处覆盖两种入口。
- **Alternatives Considered**：
  - 调度提示词要求调度会话自包。模型漏写会导致误判。
  - 包装本机用户消息。会改变用户输入的显示，没有必要。
  - 消息投影只改模型可见历史。需要插件记录与投影两套机制，复杂度高于本需求。

## R-4 替换消息的构造

- **Decision**：保留原消息的 `id` 与 `source`，替换 `content`，用宿主的 `freezeMessage` 冻结。
- **Rationale**：`MessageBase.id` 要求跨表示保持稳定；`reasoning-reset` 已用 `freezeMessage` 构造替换消息。
- **Alternatives Considered**：`createUserMessage` 会生成新 `id`，与收件箱已认领的消息对不上。

## R-5 包装格式

- **Decision**：首个块前插入 `<dispatch_session_message>\n` 文本块，末尾追加 `\n</dispatch_session_message>` 文本块。文本块中的 `</dispatch_session_message>` 转义为 `<\/dispatch_session_message>`。首个文本块已以开标签开头时跳过。
- **Rationale**：保留原有图片等非文本块；转义规则与 `blocks.ts` 一致；跳过规则防止重试时重复包装。

## R-6 GUI 显示

- **Decision**：接受工作会话 GUI 显示包装标签。
- **Rationale**：替换后的消息即会话日志中的消息。标签也帮助本机用户分辨哪些消息来自调度会话。实机测试确认显示正常。

## R-7 本机模式上报注明状态

- **Decision**：工作会话在本机模式下调用 `send_report` 时，`text` 首行写 `用户在电脑前`。
- **Rationale**：调度会话只转达该上报，不改变自身状态；文字标记不改工具参数与上报块格式。

## R-8 调度会话的状态判断

- **Decision**：`sa-dispatch` 子行监听 `agent/pre-step`，按 `source.kind` 判定，状态切换时插入系统提醒。契约见 [contracts/dispatch-presence.md](./contracts/dispatch-presence.md)。
- **Rationale**：
  - 宿主会话日志证实 GUI 输入的 `source.kind` 为 `user`，飞书为 `lark-bridge`，其他注入各有独立 kind，例如 `time-context`、`runtime-context`、`skill-catalog`。
  - 程序判定避免模型漏读来源；提醒只在切换时插入，连续本机消息不会重复。
  - 桥接提醒带 `reminder: true`，不算用户消息。
- **Alternatives Considered**：包装本机消息为 `<local_user_message>`。用户自己的输入会显示标签，没有必要。


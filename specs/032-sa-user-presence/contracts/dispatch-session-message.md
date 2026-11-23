# Contract: `<dispatch_session_message>`

`sa-worker` 子行包装调度会话投递给 `SA-任务会话` 的消息。

## 触发

- 事件：`agent/pre-step`，从 `sa-worker` 预设子行注册。
- 对象：本步消息中 `role === 'user'` 且 `source.kind === 'dsh-plugin-meta-tools'` 的消息。
- 其他消息原样保留，顺序不变。
- `next()` 返回 `reject` 时原样返回。

## 输出

```text
<dispatch_session_message>
<原消息的全部块>
</dispatch_session_message>
```

- 开标签作为首个文本块 `<dispatch_session_message>\n`。
- 闭标签作为末尾文本块 `\n</dispatch_session_message>`。
- 原文本块中的 `</dispatch_session_message>` 替换为 `<\/dispatch_session_message>`。
- 非文本块原样保留。
- 新消息保留原 `id`、`role` 与 `source`，经 `freezeMessage` 冻结。
- 首个文本块已以 `<dispatch_session_message>` 开头时不再包装。

## 验收断言

1. meta-tools 来源的纯文本消息被包装，`id` 与 `source` 不变。
2. `session_send` 的 `<system-reminder>` 文本被整体包进标记块。
3. 本机来源与其他插件来源的消息不变。
4. 正文中的闭标签被转义。
5. 已包装的消息不重复包装。
6. `reject` 决策原样返回。

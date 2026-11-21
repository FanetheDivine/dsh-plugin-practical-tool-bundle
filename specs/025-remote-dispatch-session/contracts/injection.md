# 契约：注入调度会话的消息块

两种块都以 `user` 角色消息经 `agent.steer` 投递，`source.kind` 为 `lark-super-agent`。

## 上报块

```xml
<work_session_message sessionid="<sessionId>" reportid="<reportId>">
<text>
<text 原文>
</text>
<files>
<副本绝对路径，每行一个>
</files>
</work_session_message>
```

规则：

- `sessionid` 是调用 `send_report` 的会话，`reportid` 由程序生成。
- 是否增加 `taskid` 属性见计划 P-009。
- `text` 为空时 `<text>` 子块保留为空；没有文件时 `<files>` 子块保留为空。两个子块总是出现，便于模型解析。
- `<files>` 列出调度工作区内副本的绝对路径，调度会话直接读取它们。
- 正文中的 `</text>`、`</files>`、`</work_session_message>` 转义为 `<\/text>`、`<\/files>`、`<\/work_session_message>`。
- 属性值中的 `"`、`<`、`>`、`&` 按 XML 实体转义。

## 失败通知块

```xml
<work_session_failure sessionid="<sessionId>" taskid="<taskId 或空>">
<error>
<失败原因>
</error>
</work_session_failure>
```

规则：

- 触发条件：任务会话的 `turn/end` 事件 `reason.kind === 'error'`。
- `taskid` 按上报块的所属任务规则查找，找不到时为空字符串。
- 失败原因取 `reason.error.message`，截断到 2000 字符。
- 失败通知不写入上报存档，不提交 git。
- 调度会话不可用时只写日志。

# Contract: 调度会话的用户状态提醒

`sa-dispatch` 子行按消息来源判断用户状态，在状态切换时向调度会话插入系统提醒。

## 触发

- 事件：`agent/pre-step`，从 `sa-dispatch` 预设子行注册。
- 状态记录：以会话对象为键的 `WeakMap`，取值为 `local` 或 `remote`。
- `next()` 返回 `reject` 时原样返回，不更新状态。

## 来源判定

按每条消息的 `source.kind`：

| `source.kind` | 判定 |
| --- | --- |
| `user` | 本机消息，目标状态 `local` |
| `lark-bridge` 且 `reminder !== true` | 飞书消息，目标状态 `remote` |
| `lark-bridge` 且 `reminder === true` | 桥接提醒，忽略 |
| 其他 | 忽略，包括 `lark-super-agent` 上报与本插件插入的提醒 |

- 本批内多条可判定消息按顺序处理，以最后一条为准。
- 本批没有可判定消息时不插入提醒，状态不变。

## 提醒插入

- 目标状态与记录不同，或尚无记录时，插入一条提醒并更新记录。
- 目标状态与记录相同时不插入。
- 提醒作为新的用户角色消息插在本批第一条消息之前，原消息不变。
- 提醒来源为 `{ kind: 'sa-dispatch-presence', form: 'notice' }`，用 `createUserMessage` 构造。

## 提醒文本

`local`：

```text
<system-reminder>
User presence: the user is at the computer and is talking to you directly in the Web GUI. Reply in your response body and relay worker reports there. Do not call lark_notify until the presence changes back to remote.
</system-reminder>
```

`remote`：

```text
<system-reminder>
User presence: the user is remote and is talking to you through Lark. Reply and relay worker reports with lark_notify until the presence changes to local.
</system-reminder>
```

## 验收断言

1. 首次收到本机消息时插入 `local` 提醒。
2. 之后连续本机消息不重复插入。
3. 收到飞书消息后插入 `remote` 提醒，再收到飞书消息不重复插入。
4. 同批本机消息后接飞书消息时，按飞书插入 `remote` 提醒。
5. 只有上报、桥接提醒或其他注入时不插入提醒。
6. `reject` 决策原样返回，状态不更新。

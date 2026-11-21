# 契约：状态路由

## `GET /api/dsh-practical-tools/status`（根行，已有）

`rows` 增加一项：

```json
{ "ok": true, "rows": { "…": true, "larkSuperAgent": true } }
```

`larkSuperAgent` 的判定与其他行相同：行存在、未停用、fiber 处于 ACTIVE。前端没有对应界面，忽略该项。

## `GET /api/dsh-practical-tools/lark-super-agent/status`（lark-super-agent 行）

```json
{
  "ok": true,
  "bridge": {
    "row": "active | disabled | missing | unknown",
    "sessionId": "… | null",
    "workspaceRoot": "… | null",
    "preset": "sa-dispatch | <其他> | null",
    "presetMatches": true
  },
  "git": { "available": true, "repo": true },
  "issues": ["…"]
}
```

| 字段 | 来源 |
| --- | --- |
| `bridge.row` | loader 中 id 为 `dsh-plugin-lark-bridge` 的条目；loader 不可用时 `unknown` |
| `bridge.sessionId`、`bridge.workspaceRoot` | lark-bridge 的 `state.json` |
| `bridge.preset` | 桥接会话在线时由 `agentPresets.presetForSession` 读取，离线时为 `null` |
| `bridge.presetMatches` | `preset === 'sa-dispatch'`；`preset` 为 `null` 时为 `null` |
| `git.available` | `git --version` 成功 |
| `git.repo` | 调度工作区根目录就是 git 仓库顶层 |
| `issues` | 以上各项不满足时的可读说明，中文 |

`issues` 覆盖规格 FR-004 与 FR-013：lark-bridge 缺失或停用、桥接会话预设不是 `SA-调度会话`。

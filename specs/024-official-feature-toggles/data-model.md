# Data Model: 管理官方功能

## Feature

面板中的一行，由代码内的固定清单定义，不持久化。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `'schedule' \| 'goal' \| 'task' \| 'plan' \| 'present'` | 稳定标识，同时是路由与记录里的键 |
| `hostRows` | `string[]` | 受管宿主行 id，按行 id 或组路径末段匹配 |
| `presetModules` | `string[]` | 受管 preset 子行的模块名 |
| `uiRows` | `string[]` | 受管界面行 id，属于宿主行的一种，单列以便阅读 |

## FeatureState

由 loader 的当前状态推导，不持久化。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | Feature 的 `id` | |
| `on` | `boolean` | 有任一受管项启用即为 `true` |
| `pending` | `boolean` | 已施加或撤销但真实状态尚未与目标一致 |

判定规则：

- 宿主行：存在、`disabled` 为假、fiber 为 ACTIVE 或 LOADING，计为启用。
- preset 子行：任一 preset 声明的 `config.plugins` 递归包含该模块名，计为启用。
- 在 Web 面本来停用的宿主行不存在启用项，因此不影响结果。
- 没有任何受管项存在时 `on` 为 `false`。

## OffRecord

本包保存的关闭记录，存放在宿主存储域的 `global` 单例。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | `1` | 格式版本，每次写入都必须带上 |
| `off` | `FeatureId[]` | 被关闭的功能，去重，顺序无意义 |

- 域名 `practical_tool_official_features`，初始值 `{ version: 1, off: [] }`，存放位置见 [research.md](./research.md) R-008。
- 打开失败（`invalid-record`、`version-mismatch`、`backend-not-found` 等）时按空记录运行并记录警告，不覆盖原文件，也不施加任何关闭。
- 写入失败时本次切换返回 `409`，内存状态保持不变。

## Snapshot

只存在于内存，用于撤销。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `hostRows` | `Map<entryId, { disabled }>` | 施加前宿主行的 `disabled` 原值 |
| `presets` | `Map<entryId, rawConfig>` | 施加前 preset 声明的 raw `config` |

## 状态迁移

```text
启用（无记录） --关闭功能--> 已施加（记录含该功能）
已施加 --打开功能--> 启用
已施加 --config-reload--> 重新施加
任意 --本行停用--> 撤销全部，记录文件保留
```

- 本行停用时撤销但保留记录，重新启用时按记录再次施加；这与「停用即失效」不冲突，因为失效的是施加，不是记录。
- 记录文件只表示意图；用户想清除时逐个打开开关。

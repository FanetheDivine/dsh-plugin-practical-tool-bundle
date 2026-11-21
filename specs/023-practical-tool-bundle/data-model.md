# Data Model: dsh使用工具组合包

## 行状态（RowStatus）

根行状态路由返回的视图，只读。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ok` | `true` | 固定成功标记 |
| `rows.sweeper` | `boolean \| null` | 清理会话行；`null` 表示 loader 不可用，前端保留当前状态 |
| `rows.restart` | `boolean \| null` | 重启按钮行 |
| `rows.mobile` | `boolean \| null` | 手机触控放大行 |
| `rows.reasoningReset` | `boolean \| null` | 清理推理块行，仅用于排查 |
| `rows.claudeSkills` | `boolean \| null` | Claude 技能行，仅用于排查 |

判定：条目存在、未禁用、fiber 状态为 ACTIVE（数值 2）。

## 清理请求（SweepRequest）

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `ids` | `string[]` | 是 | 最多 5000 项；每项匹配 `^[A-Za-z0-9][A-Za-z0-9._-]*$` 且不含 `..` |
| `keepIds` | `string[]` | 否 | 主视图正在显示的会话，永不处理 |

## 清理结果（SweepResult）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ok` | `boolean` | 请求是否完成 |
| `archived` | `number` | 本次归档数 |
| `deleted` | `number` | 本次删除日志的会话数 |
| `skipped` | `number` | 被保留或活跃而跳过的数量 |
| `deferred` | `number` | 已归档但 Session store 仍持有、暂不删日志的数量 |
| `failed` | `number` | 校验失败或删除失败的数量 |
| `archivedIds` / `deletedIds` / `skippedIds` / `failedIds` | `string[]` | 对应明细 |
| `reasons` | `Record<string, string>` | 跳过与失败的逐条原因 |

## 重启信息（RestartInfo）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `pid` | `number` | 当前进程标识 |
| `startedAt` | `number` | 进程启动时间戳，用于判断代次 |
| `runtime` | `'web' \| 'desktop'` | 运行形态 |

## 重启受理（RestartAccepted）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ok` | `true` | 受理成功 |
| `pid` | `number` | 旧进程标识 |
| `startedAt` | `number` | 旧进程启动时间戳 |
| `logPath` | `string` | 启动日志路径 |
| `runtime` | `'web' \| 'desktop'` | 运行形态 |

拒绝时返回 `{ ok: false, error }`，重复请求返回 409。

## 技能条目（ProjectSkill）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | frontmatter 的 `name` 或文件名 |
| `description` | `string` | 必填，空描述视为无效 |
| `body` | `string` | frontmatter 之后的内容 |
| `provider` | `'claude'` | 固定来源名 |
| `rank` | `150` | 固定优先级 |
| `invocation.modelInvocable` | `boolean` | 由 `disable-model-invocation` 取反 |
| `invocation.userInvocable` | `boolean` | 由 `user-invocable` 决定 |
| `resourceBase` | `string` | 技能目录的绝对路径 |

## 状态与转换

| 状态 | 触发 | 结果 |
| --- | --- | --- |
| 行启用 | profile 配置启用该行 | 路由或 provider 生效，状态路由报告 `true` |
| 行停用 | profile 禁用该行 | 注册随 fiber 释放，状态路由报告 `false` |
| 行加载失败 | 模块导入抛错 | fiber 非 ACTIVE，状态路由报告 `false` |
| loader 不可用 | 宿主未提供 loader | 状态路由报告 `null`，前端保持当前界面 |

## 约束

- 清理只删除 `sessions/<cwd key>/<session id>` 目录，不触碰其他文件。
- 技能读取只读，不写回项目目录。
- 手机样式表只有抽屉宽度一个可替换标记。

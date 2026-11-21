# Data Model: 官方功能关闭跨重启生效

本次变更不改变持久化数据，只增加启动期的施加触发点。

## 关闭记录（OffRecord）

宿主存储域 `practical_tool_official_features` 的 global 单例，文件形如 `$DSH_HOME/storages/practical_tool_official_features.json`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | `1` | 记录格式版本，写入时必带 |
| `off` | `FeatureId[]` | 用户关闭的功能标识，取值 `schedule`、`goal`、`task`、`plan`、`present` |

规则：

- 写入前归一化：去重、丢弃未知标识。
- 读取失败或域不可用时按空记录运行，并拒绝切换。
- 记录不随重启清空。

## 功能状态（FeatureState）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `FeatureId` | 功能标识 |
| `on` | `boolean` | 任一受管行或 preset 子行启用即为 `true` |

## 施加快照（ApplySnapshot）

进程内状态，不落盘。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `hostRows` | `Map<string, boolean>` | 宿主行 id 到施加前的 `disabled` |
| `presets` | `Map<string, unknown>` | preset 声明 id 到施加前的 raw `config` |

进程重启后快照为空，由关闭记录重新施加。

## 启动完成信号（AppReady，宿主提供）

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `onReady` | `(listener: () => void) => () => void` | 启动成功提交后调用一次；返回取消函数 |

本包只读取、不提供该服务；缺失时只做启动施加。

## 状态迁移

| 时机 | 动作 |
| --- | --- |
| 行启动 | 按记录施加一次，最多 8 轮 |
| 启动完成提交 | 再按记录施加一次，最多 8 轮 |
| `app-boot/config-reload` | 丢弃 preset 基线后重新施加 |
| 切换开关 | 先写记录再施加；失败回滚记录 |
| 行停用 | 撤销全部施加并关闭存储域 |

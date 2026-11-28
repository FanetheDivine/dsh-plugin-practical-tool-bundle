# 实机验证报告：标准模式追加 Codex 行为提示词

**Feature**: `feat/034-standard-codex-prompt` | **Date**: 2026-11-29

## 环境

| 项 | 值 |
| --- | --- |
| 宿主版本 | `dsh` 0.2.2-rc.5（全局 CLI） |
| profile | `rdt-codex`，web 模板创建的一次性隔离 profile |
| 插件安装 | `dsh plugin add` 链接到本分支检出，产物与仓库 `dist` 一致 |
| 模型 | `rdt-mock`，固定回复，请求写入 `requests.jsonl` |
| 默认预设 | `agent-preset-registry` 的 `default` 为 `standard` |

## 用例

| 编号 | 操作 | 期望 | 结果 |
| --- | --- | --- | --- |
| A1 行装载 | 读 loader 条目 | `standard-codex` 启用，`fiber.state` 为 2 | 通过：`include:standard-codex` |
| A2 叠加生效 | 读 `preset-standard` 的 `config.plugins` | persona 前缀为空串，末尾有 `codex-behavior` | 通过：24 个子行，persona 在最前，`codex-behavior` 在最后 |
| A3 工具集合不变 | 停用 `standard-codex` 前后各取标准作用域工具 | 名称集合相同 | 通过：40 个工具，前后一致 |
| A4 提示词内容 | GUI 新建标准模式会话发一条消息，读请求系统提示词 | 三段各一次、顺序正确、无模型名身份句 | 通过：见下 |
| A5 与官方功能共存 | 单元测试：先叠加，再按关闭 `plan` 重算 preset | 空 persona 前缀与 `codex-behavior` 保留 | 通过：`tests/standard-codex.test.ts` |

## 系统提示词快照（A4）

- 长度 7627 字符，首句为宿主身份句 `You are an AI agent powered by DeepSeek Harness.`。
- 三段位置：响应性 50、进度更新 663、止损收敛 1014；之后的文件引用规则在 1641，read 工具规则在 2311。
- 三段各出现 1 次；顺序为响应性、进度更新、止损收敛。
- 不含 `You are a coding agent powered by`，不含 `{{` 插值，不含 `mock-model`。
- 不含草案里的 S1、S2、S5、S7 文本。
- plan 政策段只在会话进入计划模式时出现，本次普通会话不在提示词里，因此位置以上述文件引用与工具规则为参照。

请求中的工具名（31 个）为官方标准模式在当前 profile 下的子集：`ask_user_question`、`create_goal`、`edit`、`get_goal`、`glob`、`grep`、`job_kill`、`job_list`、`job_output`、`list_agents`、`list_subagent_models`、`plugin_manager`、`present`、`pwsh`、`read`、`read_image`、`schedule_*`、`send_message`、`skill`、`subagent`、`subagent_fork`、`todo_write`、`update_goal`、`wait_agent`、`web_fetch`、`workflow`、`working_directory`、`write`。

## 结论

- 官方 `standard` 预设声明文件未改动，叠加只在内存中进行；停用本行后配置与工具集合恢复官方状态。
- 三段英文提示词进入系统提示词，位置在 persona 之后、工具规则之前，无重复。
- 含模型名的身份句已移除，系统提示词不随模型切换变化。
- 与 `official-features` 的重算共存，功能开关不会抹掉三段与空 persona 前缀。
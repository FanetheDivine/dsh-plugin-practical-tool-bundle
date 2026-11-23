# 调研：SA-调度会话 的工具与插件行

**日期**：2026-11-21
**对象**：宿主 `@deepseek-ai/dsh-web-app` 的 `presets/standard.patch.yml`，宿主文档 `docs/tool-catalog.zh.md`，以及各工具包 README。
**问题**：调度会话只保留标准预设的 `pwsh`、`bash`、`edit`、`read`、`write`、`read_image`、`glob`、`grep`、`web_fetch`、`web_search`、`skill`。这些工具属于哪些插件？这些插件会不会带入其他工具？

## 结论

1. 需要的 11 个工具来自 6 个工具包，外加 1 个不注册工具的技能提供方。
2. 6 个包都不会带入额外工具。`dsh-tool-fs` 多出的 `apply_patch` 由配置关闭，标准预设已写 `applyPatch: false`。
3. 有 3 条副作用需要定夺，见「需要决定的事」。

## 工具到插件的映射

| 工具 | 插件包 | 标准预设行 id | 该包注册的全部工具 | 额外工具 |
| --- | --- | --- | --- | --- |
| `bash` | `@deepseek-ai/dsh-tool-bash` | `tool-bash` | `bash` | 无 |
| `pwsh` | `@deepseek-ai/dsh-tool-pwsh` | `tool-pwsh` | `pwsh` | 无 |
| `read`、`read_image`、`write`、`edit` | `@deepseek-ai/dsh-tool-fs` | `tool-fs` | 前四项 + `apply_patch` | `apply_patch`，`applyPatch: false` 时不注册 |
| `glob`、`grep` | `@deepseek-ai/dsh-tool-fs-search` | `tool-fs-search` | `glob`、`grep` | 无 |
| `web_fetch`、`web_search` | `@deepseek-ai/dsh-tool-web` | `tool-web` | `web_fetch`、`web_search` | 无 |
| `skill` | `@deepseek-ai/dsh-tool-skill` | `tool-skill` | `skill` | 无 |
| 无 | `@deepseek-ai/dsh-skill-filesystem` | `skill-filesystem` | 无 | 无。它为 `skill` 提供技能目录，缺少它时 `skill` 列不出技能 |

补充：

- `tool-fs` 的 `read`、`readImage`、`write`、`edit`、`applyPatch` 各有开关。`read_image` 还要求宿主挂载附件存储。
- `tool-web` 的 `search`、`fetch` 各有开关。
- `tool-bash` 与 `tool-pwsh` 在标准预设中按平台互斥：Windows 上 `tool-bash` 停用，`tool-pwsh` 启用；其他平台相反。

## 标准预设里不注册工具的行

| 行 id | 包 | 作用 | 建议 |
| --- | --- | --- | --- |
| `persona` | `@deepseek-ai/dsh-persona` | 系统提示词开头的身份句 | 保留，改写成调度会话的身份 |
| `agent-instructions` | `@deepseek-ai/dsh-agent-instructions` | 把用户全局与项目的 `AGENTS.md` 链载入系统提示词 | 保留。「把 AGENTS.md 当记忆」依赖这一行 |
| `time-context` | `@deepseek-ai/dsh-time-context` | 注入当前时间 | 保留。「每周一」与任务时间戳依赖它 |
| `skill-filesystem` | `@deepseek-ai/dsh-skill-filesystem` | 技能目录提供方 | 保留，`skill` 依赖它 |
| `compaction` 组 | `dsh-compaction-basic`、`dsh-command-compact`、`dsh-compaction-tool-result-pruner` | 上下文压缩与长结果修剪 | 保留。调度会话会连续运行一周 |
| `command-goal` | `@deepseek-ai/dsh-command-goal` | `/goal` 斜杠命令 | 去掉，配套的 `tool-goal` 已去掉 |

## 标准预设中将去掉的工具行

| 行 id | 带走的工具 |
| --- | --- |
| `tool-jobs` | `job_kill`、`job_list`、`job_output` |
| `tool-schedule` | `schedule_create`、`schedule_edit`、`schedule_list`、`schedule_view` |
| `tool-goal` | `create_goal`、`get_goal`、`update_goal` |
| `planning` 组 | `exit_plan_mode` |
| `delegation` 组 | `subagent`、`subagent_fork`、`list_subagent_models`、`interrupt_agent`、`list_agents`、`send_message`、`wait_agent`、`workflow` |
| `tool-ask-user` | `ask_user_question` |
| `tool-todo` | `todo_write` |
| `present` | `present` |
| `tool-office` | `office_convert`、`office_recalculate`、`office_render` |
| `tool-plugin-manager` | `plugin_manager` |
| `tool-plugin-market` | `plugin_market`，标准预设已停用 |

## 需要决定的事

### 1. 去掉 `tool-jobs` 会改变 shell 行为（已接受，D-037）

`bash` 与 `pwsh` 在组合里没有任务注册表时：

- 参数里不再有 `run_in_background`。
- 超时的命令被杀掉，不再转入后台。

调度会话主要读写笔记文件与提交 git，命令都很短，影响有限。

### 2. 其他组合包的全局行会叠加进来

全局行与预设行叠加可见。工具数量因此取决于用户 profile 里装了什么。以本机 desktop profile 为例，调度会话还会看到下表的工具。表中来源按包名与当前会话的工具清单推断，实机核对放到计划阶段。

| 来源 | 工具 |
| --- | --- |
| 用户安装的 `dsh-plugin-lark-bridge` | `lark_notify` |
| `dsh-gitbash-shell` | `bash`、`gitbash_native`、`gitbash_to_native_path` |
| `dsh-plugin-better-mcp` | `mcp_manage` 与 MCP 资源工具 |
| `dsh-plugin-skill-folder` | `skill_search` |

宿主提供 `ctx.tools.restrict(filter)`：对单个 agent 继承的全局工具施加允许或拒绝掩码，作用域内注册的工具保持可见。可以在调度会话上施加允许名单，把全局工具收窄到 `lark_notify` 与 shell。

决定：不收窄，全局工具照常叠加（规格 D-036）。

### 3. Windows 上的 `bash`

按标准预设的平台条件，Windows 上预设只提供 `pwsh`。本机的 `bash` 来自全局行 `dsh-gitbash-shell`。若要在 Windows 上同时有两者，需要放开 `tool-bash` 的平台条件，或依赖用户装了 `dsh-gitbash-shell`。

## SA-调度会话 的工具总量

| 来源 | 数量 |
| --- | --- |
| 标准预设保留部分 | 10（Windows 上 `pwsh`，其他平台 `bash`） |
| `dsh-plugin-meta-tools` | 11 |
| `lark_notify` | 1 |
| 本行新增的笔记写工具 | 覆盖两份 JSON 笔记，数量在计划阶段确定 |
| 其他组合包的全局行 | 取决于 profile |

---

# 计划阶段调研

**日期**：2026-11-21
**来源**：已安装的 `dsh-plugin-lark-bridge@0.1.5`、`dsh-plugin-meta-tools@0.1.7` 产物；宿主 `@deepseek-ai/dsh` 0.2.2-rc.5 文档（`docs/subsystems/core.zh.md`、`docs/subsystems/session.zh.md`、`dsh-agent`、`dsh-agent-preset-registry`、`dsh-system-prompt`、`dsh-client-ui-plugin-manager` README 与源码）。

## R-01 桥接会话如何识别

- **Decision**：读取 `$DSH_HOME/lark-bridge/state.json`（缺省 `~/.dsh/lark-bridge/state.json`）的 `sessionId` 与 `workspaceRoot`。
- **Rationale**：lark-bridge 只在这份文件里记录当前桥接会话，`lark_notify` 的可用性判断也读它。它不提供 cordis 服务或路由。
- **Alternatives**：按预设 `sa-dispatch` 搜索最近会话，会在用户手动新建同预设会话时误判。

## R-02 消息如何送进另一个会话

- **Decision**：`sessionController.resolveAgent(id)` 取得 agent，调用 `agent.steer(createUserMessage({ content, source: { kind } }))`。
- **Rationale**：`resolveAgent` 会恢复未加载的会话；`steer` 让运行中的会话在最近一步收到、空闲会话开启新轮次。meta-tools 的 `session_send` 用同一做法。lark-bridge 注入飞书消息用 `followup`，它只排队到下一轮。
- **Alternatives**：`agent.inject` 不唤醒驱动器，空闲的调度会话收不到上报。

## R-03 任务会话失败如何发现

- **Decision**：监听 `session/event`，取 `turn/end` 且 `reason.kind === 'error'` 的事件。
- **Rationale**：`turn/end` 是持久事件，`error` 表示轮次失败，`aborted` 是取消。`session/event` 按作用域过滤：从 `sa-worker` 预设子行注册的监听只收到该预设会话的事件。
- **Alternatives**：`agent/error` 也会在步骤级报告，可能一轮多次触发。

## R-04 预设内的插件行如何解析

- **Decision**：预设声明写在本包的 `cordis.patch.yml`；子行 `name: dsh-plugin-meta-tools` 与 `name: dsh-plugin-practical-tool-bundle/<入口>` 都从本包解析。
- **Rationale**：注册表记录每个预设的模块引用与解析基址，基址就是声明所在的补丁。`@deepseek-ai/*` 宿主包由宿主解析，profile 的 `node_modules` 里没有它们。
- **Risk**：标准预设 `skill-filesystem` 的 `customSkillDirs` 用 `createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')`，这是 Node 的模块解析，从本包出发找不到宿主包。

## R-05 全局行服务对预设子行可见

- **Decision**：全局行 `lark-super-agent` 提供 cordis 服务，预设子行用 `inject` 等待它。
- **Rationale**：注册表文档写明组外查找选择 Host realm，等待 Host 服务的预设行保持挂载并在 Host 树结算后重新审计。全局行停用时服务消失，子行的工具随之注销，满足规格 FR-015。

## R-06 系统提示词

- **Decision**：预设子行调用 `ctx.systemPrompt.section({ name, order, text })` 注册提示词段。
- **Rationale**：段带作用域，只影响该预设的会话；不改动 `persona` 行，标准预设的身份句保持原样。

## R-07 工具定义

- **Decision**：`defineTool` 来自 `@deepseek-ai/dsh-tools`，注册用 `ctx.tools.register(definition)`；调用方会话从 `exec.agent` 取得。
- **Rationale**：两个上游插件都用这个形式。参数校验失败抛 `ToolArgsError`，执行失败抛 `Error`，循环把它转成工具错误结果，不结束轮次。

## R-08 插件页的行配置键

- **Finding**：插件页按 `rowConfigKey(组合包名, 行 id)` 即 `<组合包名>#<行 id>` 查找配置页。上游把键写死为自身包名，因此 lark-bridge 只能作为独立组合包安装。规格 D-040 已据此定案。

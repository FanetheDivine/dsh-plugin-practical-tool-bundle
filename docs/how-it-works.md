# 工作机制

## 包结构

一个 npm 包承载一行根行、七行功能行与两行预设声明。宿主按 `cordis.patch.yml` 的 `name` 分别 import 各入口。

| 入口 | 行 id | 作用 |
| --- | --- | --- |
| `dist/index.mjs` | `dsh-plugin-practical-tool-bundle` | 根行：聚合状态路由，并拥有浏览器半部 |
| `dist/sweeper.mjs` | `session-sweeper` | 归档并删除已归档会话的日志 |
| `dist/reasoning-reset.mjs` | `reasoning-reset` | 去掉被拒绝的历史推理块并重试 |
| `dist/claude-skills.mjs` | `claude-skills` | 注册项目 `.claude/skills` 技能来源 |
| `dist/restart.mjs` | `restart-button` | 重启路由 |
| `dist/mobile.mjs` | `mobile-touch-ui` | 手机样式表路由 |
| `dist/official-features.mjs` | `official-features` | 官方功能状态路由与运行期开关 |
| `dist/lark-super-agent.mjs` | `lark-super-agent` | `larkSuperAgent` 服务与调度状态路由 |
| `dist/sa-dispatch.mjs` | `sa-dispatch` 预设子行 | 调度工具与系统提示词段 |
| `dist/sa-worker.mjs` | `sa-worker` 预设子行 | `send_report`、系统提示词段与失败监听 |
| `dist/client.js` | 随根行 | 浏览器半部：四块界面与状态轮询 |

`preset-sa-dispatch` 与 `preset-sa-worker` 是 `@deepseek-ai/dsh-agent-preset` 声明行。它们分别声明 `SA-调度会话` 与 `SA-任务会话`，并引用上表两个预设子行。

`assets/launcher.cjs` 由重启行以 detached 进程启动，`assets/mobile.css` 由手机样式行读取。两者用 `new URL('../assets/...', import.meta.url)` 定位，因此必须随包发布。

## 行与路由

全部路由在 `/api/dsh-practical-tools/` 下，位于宿主的 `/api` 认证围栏内。

| 路由 | 行 | 说明 |
| --- | --- | --- |
| `GET /status` | 根行 | 七行功能是否可用 |
| `POST /sweep` | `session-sweeper` | 归档未置顶会话并删除已归档日志 |
| `GET /restart/info` | `restart-button` | 当前进程标识与运行形态 |
| `POST /restart` | `restart-button` | 重启服务或应用 |
| `GET /mobile.css` | `mobile-touch-ui` | 手机样式表 |
| `GET /official-features` | `official-features` | 五项官方功能的开关状态 |
| `POST /official-features` | `official-features` | 打开或关闭一个官方功能 |
| `GET /lark-super-agent/status` | `lark-super-agent` | lark-bridge、桥接会话预设与 git 状态及问题列表 |

路由注册用 `ctx.inject(['connection'], ...)` 加 `ctx.effect`，行被停用时注册随 fiber 释放。启动器与代次判断另需 `webServer`。

调度状态路由读取 lark-bridge 的 `state.json`、loader 中的 lark-bridge 行、`agentPresets.presetForSession` 与 git 状态。`issues` 报告桥接缺失、预设不匹配等问题。

## 状态路由与前端装卸

前端产物属于根行：根行停用即整份浏览器半部下线，也不会再发出状态请求。

- `GET /status` 每次请求读取 `ctx.get('loader')`，用 `loader.entries()` 按行 id 找到条目，判断 `disabled` 与 fiber 是否处于 ACTIVE。
- 运行时条目 id 带组路径前缀，bundle 行是 `include:<行 id>`；查找先按完整 id，再按最后一段匹配。
- `FiberState` 在 cordis 中是 `const enum`，运行时没有值，代码按序号 2 比较。
- loader 不可用时七项都回答 `null`；前端对 `null` 保持当前界面。
- 前端每 3 秒轮询一次，且只在页面可见时轮询；`visibilitychange` 与 `focus` 会立即补一次。
- 每个界面块是一个子插件：启用时 `ctx.plugin()` 挂载，停用时 `fiber.dispose()` 卸载，槽位注册与样式随 fiber 回收，不需要刷新页面。
- `larkSuperAgent` 状态只供接口消费者使用，前端没有对应界面。

## 官方功能管理

官方能力在宿主里分散在三处：宿主配置中的行、每个 preset 声明里的子行、以及界面行。Web 面把多数宿主行停用，改由 preset 的 `config.plugins` 挂载，所以只改宿主行不影响会话能力。

### 受管行

| 功能 | 宿主行 | preset 子行模块名 |
| --- | --- | --- |
| `schedule` | `schedule`、`ui-schedule` | `@deepseek-ai/dsh-tool-schedule` |
| `goal` | `goal`、`goal-round-driver`、`ui-goal` | `@deepseek-ai/dsh-command-goal`、`@deepseek-ai/dsh-tool-goal` |
| `task` | `tool-todo` | `@deepseek-ai/dsh-tool-todo` |
| `plan` | `plan-mode`、`ui-plan` | `@deepseek-ai/dsh-plan-mode` |
| `present` | `deliverable-file-references` | `@deepseek-ai/dsh-tool-present` |

- `ui-user-questions` 同时是提问界面，不列入 `plan`。
- `ui-deliverables` 是变更文件卡片，不列入 `present`。
- preset 子行按模块名匹配，因此用户改过行 id 或新建 preset 时仍然有效。

### 施加

- 宿主行：`loader.update(entryId, { disabled: true })`，打开时按施加前保存的原值放回，本来就停用的行不强制启用。
- preset 声明：枚举 `options.name === '@deepseek-ai/dsh-agent-preset'` 的全部条目，按「当前关闭的功能」从基线重算 `config.plugins` 后整体 `loader.update`。只摘受管子行，空组一并移除。
- 过程不写 `cordis.yml`、`cordis.patch.yml` 与 `package.json`；这一点由真机实测确认。

### 撤销与重组

- 运行期改动是易失的：任何一次配置重组都会把树还原成文件状态。
- 因此订阅 `app-boot/config-reload`，事件后丢弃 preset 基线、按记录重新施加。本包自己的 `update` 不触发该事件，不会循环。
- 本行停用时执行 `ctx.effect` 的清理：宿主行按快照放回原值，preset 按基线还原，然后关闭存储域。
- 关闭记录留在存储域里，重新启用时据此再次施加。

### 启动与重启

- 宿主行与 preset 子行的运行期改动都不落盘，重启后行回到文件状态，关闭效果靠记录重新施加。
- 行启动时按记录施加一次，最多 8 轮，每轮间隔 250 毫秒。
- 宿主提供 `appReady` 服务时，`onReady` 在启动成功提交后再施加一次，同样最多 8 轮；宿主不提供该服务时只做启动那一次。
- 两次都没达成时写一条 warn，列出未达成的功能标识；面板照常显示真实状态。
- `appReady` 是宿主可选服务，用 `ctx.get('appReady')` 软读取；`ctx.inject` 只接受必填服务。

### 关闭记录

- 域名为 `practical_tool_official_features`，只用一个 `global` 单例，内容是 `{ version: 1, off: [...] }`。
- 落在 `$DSH_HOME/storages/practical_tool_official_features.json`，不触碰 profile。
- 存储域写入不在写入时校验，因此每次写入都会带上完整对象；读取端按 schema 校验，文件被改坏时按无记录运行并记录警告，不覆盖原文件。

### 状态判定

- 宿主行：存在、未停用、fiber 处于 ACTIVE 或 LOADING。
- preset 子行：任一 preset 声明的 `config.plugins` 递归包含该模块名，且该子行的 `disabled` 不是字面 `true`。
- 任一项启用即为开。这是因为 Web 面本来停用的宿主行不该把功能判成关。
- 切换后宿主行立即变化，preset 只影响之后新建的会话；面板在 2 秒内重读真实状态。

## 各功能机制

### 清理会话

- 面板从 Workspace 与 Session store 读取数量：未置顶且未归档的会话数、已归档且仍有日志的会话数。
- 清理分两阶段：`workspaceRegistry.archiveSession(id)` 逐个归档，然后遍历已归档集合并删除 `sessions/<cwd key>/<session id>` 目录。
- `keepIds` 是页面正在显示的会话，主机侧永不处理；Session store 仍持有的已归档会话计入 `deferred`，日志留到宿主释放后再删。
- 删除是永久的，所以按钮需要两次点击确认。

### 清理推理块

- 注册一条消息投影 `plugin:dsh-plugin-practical-tool-bundle/reasoning-reset`。
- `agent/request-error` 里识别两类 400：签名属于另一段对话、加密内容无法解密。命中后写入一条记录（列出要改写的 assistant 消息序号）并返回 `{ kind: 'retry' }`。
- 投影只改模型可见历史：去掉 reasoning 块，并丢弃 `source.replayState`。日志与用户看到的对话不变。
- 每个 turn/step 最多处理一次，避免与循环互相触发。

### Claude 技能

- 从会话 cwd 向上找含 `.git` 的目录作为项目根，扫描 `.claude/skills` 下的 `<name>/SKILL.md` 与扁平 `<name>.md`。
- frontmatter 提供名称、描述、路由文本、元数据与两个调用开关；缺描述或名称非法的技能被跳过。
- 注册为 rank 150 的只读 provider，来源名 `claude`；`fs.watch` 在文件变化后刷新技能目录。

### 重启

- 网页场景：写重启计划（入口、argv、cwd、端口、日志路径），detached 启动 `assets/launcher.cjs`，600ms 后退出当前进程；launcher 等旧进程释放端口再启动新进程。
- 桌面场景：生成 VBS 交给 `explorer.exe`，由它在应用进程树之外关闭应用并重新启动。
- 页面轮询 `/restart/info`，`pid` 或 `startedAt` 变化即刷新；超过阈值进入「较慢」提示并继续轮询。

### 手机触控放大

- 样式表在 767px 以下生效，抽屉宽度由 `__DRAWER_WIDTH__` 替换为 328。
- 本地页面用 `<link media="(max-width: 767px)">`，首屏即按放大尺寸绘制。
- 远程配对页面用带凭据的 `fetch` 取文本并注入 `<style>`：远程通道不改写 `<link href>`，直接引用会 401。
- `<html data-dsh-mobile-css>` 记录 `link` / `style` / `failed`，便于在手机上排查。

## 调度服务与预设叠加

`lark-super-agent` 全局行提供 `larkSuperAgent` 服务，组合调度会话解析、笔记、上报存档、git 队列与消息投递。`sa-dispatch` 与 `sa-worker` 预设子行声明 `larkSuperAgent`、`systemPrompt`、`tools` 三项依赖，并通过 `ctx.inject` 注册能力。三项缺一不可，否则 Cordis 拒绝读取未声明的服务。全局行停用时，两个子行的工具与监听随依赖下线。

| 预设 | 组成 |
| --- | --- |
| `SA-调度会话` | 标准预设中的 11 个基础工具、meta-tools 十一项能力、`task_create`、`task_update`、`workspace_note_set`、`workspace_note_remove`、`task_candidates` 与调度提示词段 |
| `SA-任务会话` | 标准预设去掉 `tool-ask-user`，加入 `send_report`、任务提示词段与失败监听 |

- meta-tools 是 `SA-调度会话` 的子行，十一项能力全部开启，`session_preset` 固定为 `sa-worker`。
- 两个预设子行用 `ctx.systemPrompt.section` 注册各自会话的提示词。
- 两个预设都不含 `ask_user_question`，也不修改新会话的默认预设。
- `SA-调度会话` 不含 `tool-jobs`，保留 `persona`、`agent-instructions`、`time-context`、`skill-filesystem` 与压缩组。
- 全局行与预设子行的工具叠加。`lark_notify` 来自用户安装的 lark-bridge 全局行，其他组合包的全局工具也照常可见。

## 调度工作区存储

调度工作区是 lark-bridge 的桥接工作区。全部笔记与上报都存放在该目录：

| 路径 | 内容与写入者 |
| --- | --- |
| `message-task-status.json` | 未归档任务；由任务写工具维护 |
| `workspaces.json` | 工作区笔记与派发白名单；由工作区写工具维护 |
| `reports/<taskId>/<reportId>.md` | 上报正文与元数据；由 `send_report` 写入 |
| `reports/<taskId>/<reportId>-<n>-<文件名>.md` | 上报附件副本；由 `send_report` 复制 |
| `reports/_unassigned/` | 无法关联任务的上报 |
| `archive/<taskId>/task.json` | 任务全量快照与归档时间 |
| `archive/<taskId>/reports/` | 已完成任务的全部上报与附件 |
| `AGENTS.md` | 长期记忆；由调度会话自行维护与提交 |

- JSON 先写临时文件再重命名，同一工作区的写入与 git 操作串行执行。
- 首次写笔记时，若调度工作区根目录不是 git 仓库顶层，程序执行 `git init`。
- 程序用路径限定的 `git add` 与 `git commit` 提交本次文件，提交作者沿用本机 git 配置。
- `task_update` 把状态改为 `completed` 时，程序在同一调用内移动任务快照与上报目录，并从 `message-task-status.json` 移除该任务。
- 程序不执行每周归档。

## 上报投递与失败监听

- 服务从 `$DSH_HOME/lark-bridge/state.json` 读取桥接会话 `sessionId` 与调度工作区 `workspaceRoot`；缺省 `$DSH_HOME` 为 `~/.dsh`。
- `send_report` 校验文本与 Markdown 附件，生成 `reportId`，复制附件并写入上报记录，再把 `<work_session_message>` 块投递到调度会话。
- 投递使用 `sessionController.resolveAgent(sessionId)` 取得 agent，再调用 `agent.steer`。消息采用 `user` 角色，`source.kind` 为 `lark-super-agent`；空闲会话因此被唤醒。
- 注入块含 `sessionid`、`reportid` 与 `taskid`，始终保留 `<text>` 与 `<files>`。闭合标签与属性值会转义，`<files>` 列出调度工作区内副本的绝对路径。
- 文件写入并投递后执行 git 提交。提交失败不撤回已投递上报，工具结果附带 `warning`。
- `sa-worker` 监听 `session/event` 中 `reason.kind === 'error'` 的 `turn/end`，每轮失败向调度会话投递一次 `<work_session_failure>`；取消不触发通知。
- 失败通知包含任务会话、任务标识与截断后的错误原因。它不进入上报存档，也不提交 git；调度会话不可用时只写日志。

## 依赖复用

| 归属 | 放在 | 打包 |
| --- | --- | --- |
| 宿主提供 | `devDependencies` 与 `peerDependencies` | `tsdown.config.ts` 的 `neverBundle` 保持 external |
| 插件自备 | `dependencies` | 需要内联的依赖列入 `alwaysBundle`；预设子行按包名解析 |

`yaml` 只打进 `dist/claude-skills.mjs`。`dsh-plugin-meta-tools` 随本包安装，由 `SA-调度会话` 的子行加载。`dsh-plugin-lark-bridge` 由用户独立安装。

## 打包与发布

- `files` 决定包内容：`dist`、`cordis.patch.yml`、`locale/*.json`、`rows`、`assets/*`、`icon.svg`、`README.md`。
- `pnpm run release` 依次运行 `pnpm check`、`pnpm format`、`npm version patch`、`scripts/release-archive.mjs`，然后 push 分支与 tag。
- CI 收到 tag 后用 npm trusted publishing 发布。

# DSH实用工具组合包

[![npm version](https://img.shields.io/npm/v/dsh-plugin-practical-tool-bundle)](https://www.npmjs.com/package/dsh-plugin-practical-tool-bundle)
[![npm downloads](https://img.shields.io/npm/dm/dsh-plugin-practical-tool-bundle)](https://www.npmjs.com/package/dsh-plugin-practical-tool-bundle)
[![license](https://img.shields.io/npm/l/dsh-plugin-practical-tool-bundle)](https://github.com/FanetheDivine/dsh-plugin-practical-tool-bundle/blob/main/License)

七个小工具，每个都可以在 Plugins 页单独开关。

## 一键清理会话

点侧栏底部的扫帚，再点「清理」并确认。

- 未置顶的会话会被归档，包括未分组的会话。
- 已归档的会话会被永久删除，删除后无法恢复。
- 运行中和打开着的会话会跳过。

## 推理报错自动重试

模型服务因历史推理内容报错时，自动去掉历史推理内容并重试一次。

- 你看到的对话记录保持原样。

## 加载项目 Claude 技能

会话自动加载项目里 `.claude/skills` 下的技能。

- 项目根是会话目录向上第一个含 `.git` 的目录。
- 只读取，不修改文件。

## 重启按钮

点侧栏底部的重启按钮并确认。

- 网页版重启服务，页面在服务恢复后自动刷新。
- 桌面版关闭应用并自动重新打开。
- 进行中的对话会中断。

## 手机大按钮

在手机上放大侧栏、会话列表、顶栏和输入框的按钮与文字。

- 屏幕宽度不超过 767px 时生效。

## 官方功能开关

在 Plugins 页打开本插件的「官方功能开关」行，进入配置页，逐项关闭以下功能：

| 功能 | 关闭后 |
| --- | --- |
| 自动化任务 | 定时任务停止运行，任务页面隐藏 |
| 目标 | 不能使用 `/goal`，目标条隐藏 |
| 任务清单 | 模型不再维护任务清单 |
| 计划模式 | 不能使用 `/plan` |
| 交付文件 | 模型不再以文件卡片交付成果 |

- 更改只影响之后新建的会话。
- 已有数据保留，包括已排定的任务。
- 停用本行后，全部官方功能恢复原状。

## 飞书任务与调度会话

`lark-super-agent` 通过独立安装的 lark-bridge 远程派发任务，协调 `SA-调度会话` 与 `SA-任务会话`，并维护任务笔记、双向消息、上报记录和完成任务的归档。新建的工作会话自动置顶，任务完成后随任务归档。

## 安装

```sh
dsh plugin add dsh-plugin-practical-tool-bundle
dsh plugin add dsh-plugin-lark-bridge
```

- `dsh-plugin-meta-tools` 随本包安装，其能力由 `SA-调度会话` 预设提供。
- `dsh-plugin-lark-bridge` 由用户另行安装。安装后按它的连接弹窗完成 `lark-cli` 安装、`config init` 与授权。
- 在 `dsh-plugin-lark-bridge` 配置页选择调度工作区，并把桥接会话的预设选为 `SA-调度会话`。
- 独立安装的 `dsh-plugin-meta-tools` 与本包预设子行同时启用时，会重复注册同名工具。用户应停用其中一处。
- 本机需要安装 git，并配置 `user.name` 与 `user.email`。

## 配置

- 官方功能在「官方功能开关」行的配置页管理。
- 技能目录为项目根下的 `.claude/skills`。
- 手机样式表的抽屉宽度为 328。
- 重启日志写在 `~/.dsh/logs`。
- 调度工作区、桥接会话与飞书授权由 `dsh-plugin-lark-bridge` 配置。

## 远程调度用法

1. 在飞书私聊或 Web GUI 的调度会话中说明工作区用途与关键词。调度会话把它写入工作区笔记；只有已登记的工作区可以接收任务。
2. 发送一项新任务。调度会话选择目标工作区，从候选会话中确认复用或新建 `SA-任务会话`；新建的会话立即置顶，再回执目标工作区与执行会话。
3. 任务会话通过 `send_report` 上报进展、提问与结果。调度会话转述给用户，并把用户的回答送回原任务会话。
4. 任务完成后，调度会话把状态改为完成，程序自动归档该任务，并归档该任务的工作会话。

- 调度会话始终把任务派给任务会话，查信息、读文件、改代码、跑构建都在任务会话里做。它自己只在调度工作区读写笔记与报告。
- 没有匹配的工作区时，调度会话先请你新增工作区，或给现有工作区补充说明与关键词。
- 多个工作区都匹配时，调度会话问清目标再派发。

### 两个预设

| 预设 | id | 能力 |
| --- | --- | --- |
| `SA-调度会话` | `sa-dispatch` | 11 个基础工具、`dsh-plugin-meta-tools` 的十一项能力、任务与工作区笔记工具、候选会话查询；`lark_notify` 由 lark-bridge 全局行叠加 |
| `SA-任务会话` | `sa-worker` | 标准预设去掉 `ask_user_question`，增加 `send_report` |

两个预设都不含 `ask_user_question`，也都不是新会话的默认预设。`dsh-plugin-meta-tools` 新建会话时使用 `sa-worker`。其他组合包的全局工具仍会叠加进会话。

### 上报与注入

```ts
send_report({ text?: string, files?: string[] })
```

- `text` 承载给用户的话或提问。
- `files` 承载已写好的 Markdown 文件路径，可以省略。
- `text` 与 `files` 至少提供一项。
- 任务会话的正文输出对用户不可见；交互与提问通过 `send_report` 完成。

每次上报以用户消息注入调度会话：

```xml
<work_session_message sessionid="<任务会话 id>" reportid="<上报 id>" taskid="<任务 id 或空>">
<text>
<上报原文>
</text>
<files>
<调度工作区内副本的绝对路径，每行一个>
</files>
</work_session_message>
```

`reportid` 由程序生成。`<text>` 与 `<files>` 始终保留；文件在上报时复制进调度工作区。

### 笔记、git 与归档

全部数据放在调度工作区：

| 路径 | 内容 |
| --- | --- |
| `message-task-status.json` | 未完成任务的笔记，保存状态、工作区、会话、上报与消息列表 |
| `workspaces.json` | 工作区说明、关键词与派发白名单 |
| `reports/<taskId>/` | 每份上报的 Markdown 记录与附件副本 |
| `archive/<taskId>/` | 已完成任务的快照、消息、会话、上报记录与附件 |
| `AGENTS.md` | 调度会话自行维护的工作区做法与长期记忆 |

- 首次写笔记时，程序按需初始化 git 仓库。
- 两份 JSON、上报与任务归档的每次变更由程序提交一次 git，只包含本次变更的文件。
- `AGENTS.md` 由调度会话用文件工具维护，并用 shell 自行提交。
- 任务改为完成时，程序把任务条目及其上报目录移入归档。
- 调度会话上下文由压缩机制控制。

## 路由

全部路由在 `/api/dsh-practical-tools/` 下，位于宿主的 `/api` 认证围栏内。

| 路由 | 行 | 说明 |
| --- | --- | --- |
| `GET /status` | 根行 | 七行功能是否可用 |
| `POST /sweep` | `session-sweeper` | 归档并删除会话 |
| `GET /restart/info` | `restart-button` | 当前进程标识与运行形态 |
| `POST /restart` | `restart-button` | 重启服务或应用 |
| `GET /mobile.css` | `mobile-touch-ui` | 手机样式表 |
| `GET /official-features` | `official-features` | 五项官方功能的开关状态 |
| `POST /official-features` | `official-features` | 打开或关闭一个官方功能 |
| `GET /lark-super-agent/status` | `lark-super-agent` | lark-bridge、桥接会话预设与 git 状态及问题列表 |

接口形状见 [HTTP 契约](specs/023-practical-tool-bundle/contracts/http-api.md)与[调度契约](specs/025-remote-dispatch-session/contracts/)。

## 开发

- 工作机制见 [how-it-works.md](./docs/how-it-works.md)。
- 开发与命令见 [development.md](./docs/development.md)。
- 已知风险见 [known-risks.md](./docs/known-risks.md)。

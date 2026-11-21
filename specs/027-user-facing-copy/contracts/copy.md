# 文案契约

本文件是全部用户可见文案的定稿。实现逐字使用，变更先改本文件。

## 插件 meta

| 字段 | 中文 | 英文 |
| --- | --- | --- |
| `meta.title` | DSH实用工具组合包 | DSH practical tool bundle |
| `meta.description` | 六个可以单独开关的小工具：一键清理会话、推理报错自动重试、加载项目 Claude 技能、重启按钮、手机大按钮、官方功能开关。 | Six tools you can turn on one by one: sweep sessions, retry on reasoning errors, project Claude skills, a restart button, larger touch targets on phones, and official feature switches. |

`package.json` 的 `description` 使用中文 `meta.description`。

## 行 meta

| 行 id | 中文标题 | 中文描述 | 英文标题 | 英文描述 |
| --- | --- | --- | --- | --- |
| `session-sweeper` | 一键清理会话 | 点侧栏底部的扫帚，归档全部未置顶会话，并永久删除已归档会话。运行中和打开着的会话会跳过。 | Sweep sessions | Click the broom at the bottom of the sidebar to archive unpinned sessions and permanently delete archived ones. Running and open sessions are skipped. |
| `reasoning-reset` | 推理报错自动重试 | 模型服务因历史推理内容报错时，去掉历史推理内容并自动重试。你看到的对话记录保持原样。 | Retry on reasoning errors | When the model provider rejects past reasoning, drops it and retries automatically. Your conversation history stays as it is. |
| `claude-skills` | 加载项目 Claude 技能 | 会话自动加载项目里 .claude/skills 下的技能。只读取，不修改文件。 | Project Claude skills | Sessions load the skills in the project's .claude/skills folder. Files are only read. |
| `restart-button` | 重启按钮 | 侧栏底部增加重启按钮。网页版重启服务，桌面版重启应用。 | Restart button | Adds a restart button at the bottom of the sidebar. Restarts the service on the web and the app on desktop. |
| `mobile-touch-ui` | 手机大按钮 | 在手机上放大侧栏、会话列表、顶栏和输入框的按钮与文字。 | Larger touch targets on phones | Enlarges buttons and text in the sidebar, session list, top bar, and composer on phones. |
| `official-features` | 官方功能开关 | 在本行的配置页逐项关闭自动化任务、目标、任务清单、计划模式和交付文件。只影响新会话。 | Official feature switches | Turn off schedule, goals, task lists, plan mode, or present files one by one on this row's configuration page. Only new sessions are affected. |

## 清理会话面板

| 键 | 中文 | 英文 |
| --- | --- | --- |
| `action.label` | 清理会话 | Sweep sessions |
| `panel.title` | 清理会话 | Sweep sessions |
| `scope.all` | 全部会话 | All sessions |
| `count` | 未置顶 {unpinned} 个 · 已归档 {archived} 个 | {unpinned} unpinned · {archived} archived |
| `count.waiting` | 正在读取会话… | Loading sessions… |
| `run` | 清理 | Sweep |
| `runConfirm` | 再点一次确认 | Click again to confirm |
| `busy` | 清理中… | Sweeping… |
| `close` | 关闭 | Close |
| `hint` | 未置顶的会话会被归档，已归档的会话会被永久删除。运行中和打开着的会话会跳过。删除后无法恢复。 | Unpinned sessions are archived and archived sessions are permanently deleted. Running and open sessions are skipped. Deleted sessions cannot be restored. |
| `result.archived` | 已归档 {n} 个 | Archived {n} |
| `result.deleted` | 已删除 {n} 个 | Deleted {n} |
| `result.skipped` | 跳过 {n} 个打开中的会话 | Skipped {n} open |
| `result.deferred` | {n} 个将在重启后删除 | {n} deleted after restart |
| `result.failed` | {n} 个失败 | {n} failed |
| `result.error` | 清理失败，请稍后重试 | Sweep failed. Try again later. |
| `result.empty` | 没有需要清理的会话 | Nothing to sweep |
| `result.notReady` | 会话还在加载，请稍后再试 | Sessions are still loading. Try again in a moment. |

## 重启

| 键 | 中文 | 英文 |
| --- | --- | --- |
| `restart.label` | 重启 DSH | Restart DSH |
| `restart.confirmTitle` | 重启 DSH？ | Restart DSH? |
| `restart.confirmText` | 进行中的对话会中断。服务恢复后页面自动刷新。 | Running conversations will stop. The page reloads when the service is back. |
| `restart.cancel` | 取消 | Cancel |
| `restart.ok` | 重启 | Restart |
| `restart.restarting` | 正在重启… | Restarting… |
| `restart.restartingHint` | 服务恢复后页面自动刷新，请保持此页打开。 | The page reloads when the service is back. Keep this page open. |
| `restart.slowTitle` | 重启比平时慢 | Restart is taking longer |
| `restart.slowText` | 已等待 {seconds} 秒。页面会继续等待，也可以手动刷新。 | Waited {seconds}s. The page keeps waiting, or you can reload now. |
| `restart.elapsed` | 已等待 {seconds} 秒 | Waited {seconds}s |
| `restart.reload` | 刷新页面 | Reload page |
| `restart.failedTitle` | 重启失败 | Restart failed |
| `restart.close` | 关闭 | Close |
| `restart.retry` | 重试 | Retry |
| `restart.log` | 日志：{path} | Log: {path} |
| `restart.error.duplicate` | 已经在重启中。 | A restart is already in progress. |
| `restart.error.helper` | 无法启动重启程序。 | Couldn't start the restart helper. |
| `restart.error.unknown` | 重启请求失败，请稍后重试。 | The restart request failed. Try again later. |
| `restart.desktopLabel` | 重启应用 | Restart app |
| `restart.desktopConfirmTitle` | 重启 DeepSeek Harness？ | Restart DeepSeek Harness? |
| `restart.desktopConfirmText` | 应用会关闭并自动重新打开。进行中的对话会中断。 | The app closes and opens again. Running conversations will stop. |
| `restart.desktopRestarting` | 正在重启应用… | Restarting the app… |
| `restart.desktopRestartingHint` | 应用会自动重新打开，请不要手动结束进程。 | The app opens again by itself. Don't end the process manually. |
| `restart.desktopSlowTitle` | 应用还没有重新打开 | The app hasn't reopened yet |
| `restart.desktopSlowText` | 已等待 {seconds} 秒。窗口没有出现时，请从开始菜单打开 DeepSeek Harness。 | Waited {seconds}s. If the window doesn't appear, open DeepSeek Harness from the Start menu. |
| `restart.desktopStale` | 重启按钮在下次启动后可用。请先手动退出并重新打开应用。 | The restart button works after the next launch. Quit and reopen the app once. |

`restart.error.*` 是新增键。失败弹窗按错误码选择文案，见 [错误码](#错误码)。

## 官方功能开关面板

| 键 | 中文 | 英文 |
| --- | --- | --- |
| `officialFeatures.title` | 官方功能开关 | Official feature switches |
| `officialFeatures.hint` | 更改只影响之后新建的会话，已有数据保留。 | Changes apply to new sessions. Existing data is kept. |
| `officialFeatures.summary` | 逐项开关五个官方功能 | Turn five official features on or off |
| `officialFeatures.loading` | 正在读取… | Loading… |
| `officialFeatures.loadFailed` | 读取功能状态失败 | Couldn't load feature status |
| `officialFeatures.busy` | 正在切换… | Switching… |
| `officialFeatures.retry` | 重试 | Retry |
| `officialFeatures.error.store` | 切换失败：设置没有保存。 | Switch failed: the setting wasn't saved. |
| `officialFeatures.error.apply` | 切换失败：DSH 没有接受这次更改。 | Switch failed: DSH didn't accept the change. |
| `officialFeatures.error.unknown` | 切换失败，请稍后重试。 | Switch failed. Try again later. |
| `officialFeatures.feature.schedule` | 自动化任务 | Schedule |
| `officialFeatures.feature.goal` | 目标 | Goal |
| `officialFeatures.feature.task` | 任务清单 | Task list |
| `officialFeatures.feature.plan` | 计划模式 | Plan mode |
| `officialFeatures.feature.present` | 交付文件 | Present files |
| `officialFeatures.detail.schedule` | 关闭后定时任务停止运行，任务页面隐藏。已有任务保留。 | When off, scheduled tasks stop running and the Schedule page is hidden. Existing tasks are kept. |
| `officialFeatures.detail.goal` | 关闭后不能使用 /goal，输入框上方的目标条隐藏。 | When off, /goal and the goal bar above the composer are gone. |
| `officialFeatures.detail.task` | 关闭后模型不再维护任务清单。 | When off, the model no longer keeps a task list. |
| `officialFeatures.detail.plan` | 关闭后不能使用 /plan 进入计划模式。 | When off, /plan and plan mode are gone. |
| `officialFeatures.detail.present` | 关闭后模型不再以文件卡片交付成果。变更文件卡片保留。 | When off, the model no longer hands over files as cards. Changed-file cards stay. |

删除键：`officialFeatures.failed`、`officialFeatures.unavailable`。

面板状态：

| 状态 | 显示 |
| --- | --- |
| 首次读取中 | `officialFeatures.loading` |
| 读取失败且没有已知状态 | `officialFeatures.loadFailed` 与重试按钮 |
| 已有状态 | 五行，每行功能名、说明与开关 |
| 切换中 | `officialFeatures.busy` |
| 切换失败 | 按错误码选择 `officialFeatures.error.*`，旁边是重试按钮；重试重新读取状态 |

## 错误码

界面按 `error` 字段选择文案。未知值与网络失败使用 `*.unknown`。

| 路由 | `error` | 文案键 |
| --- | --- | --- |
| `POST /restart` | `restart-pending` | `restart.error.duplicate` |
| `POST /restart` | `helper-failed` | `restart.error.helper` |
| `POST /restart` | `restart-failed` | `restart.error.unknown` |
| `POST /official-features` | `store-failed` | `officialFeatures.error.store` |
| `POST /official-features` | `apply-failed` | `officialFeatures.error.apply` |
| `POST /official-features` | `invalid-request` | `officialFeatures.error.unknown` |

路由的原始英文说明放在 `message` 字段，界面不显示。

## README

```markdown
# DSH实用工具组合包

[![npm version](https://img.shields.io/npm/v/dsh-plugin-practical-tool-bundle)](https://www.npmjs.com/package/dsh-plugin-practical-tool-bundle)
[![npm downloads](https://img.shields.io/npm/dm/dsh-plugin-practical-tool-bundle)](https://www.npmjs.com/package/dsh-plugin-practical-tool-bundle)
[![license](https://img.shields.io/npm/l/dsh-plugin-practical-tool-bundle)](https://github.com/FanetheDivine/dsh-plugin-practical-tool-bundle/blob/main/License)

六个小工具，每个都可以在 Plugins 页单独开关。

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
```

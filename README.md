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

## 标准模式增强

标准模式的提示词额外包含三段 Codex 风格的行为指引，并去掉含模型名的身份句。

- 三段是响应性、进度更新与止损收敛，原文为英文。
- 切换模型不再改变系统提示词。
- 工具集合与标准模式的其它提示词段保持官方状态。
- 停用 Plugins 页的 `standard-codex` 行后回到官方提示词。

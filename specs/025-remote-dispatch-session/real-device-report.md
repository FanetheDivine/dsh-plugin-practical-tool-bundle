# 实机测试报告：lark-super-agent

**日期**：2026-11-22
**宿主**：0.2.2-rc.5
**profile**：`rdt-025-lark-sa`
**浏览器**：本机 Chrome，无头模式

## 环境

- 使用独立 `DSH_HOME` 与隔离 profile。
- 模型使用 mock provider；宿主、插件、会话、git 与 lark-cli 均为真实实现。
- `dsh-plugin-lark-bridge@0.1.5` 安装到测试 profile。
- 测试工作区与调度工作区均为隔离目录。

## A 装载

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| A1 | 通过 | 根行与五个既有功能行激活 |
| A2 | 通过 | 链接安装版本与仓库 dist 哈希一致 |
| A4 | 通过 | `lark-super-agent`、两个预设行与 lark-bridge 激活；两个预设无诊断 |

## B 路由与 C 前端

| 用例 | 结果 |
| --- | --- |
| A3 聚合状态路由 | 通过，`larkSuperAgent: true` |
| B1～B4 清理、重启信息、手机样式 | 通过 |
| C1～C4 侧栏、悬停、手机触控、控制台 | 通过 |

## 调度功能

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| Q0 标准预设对照 | 通过 | 41 个工具，用于验证作用域读取方法 |
| Q1 调度工具 | 通过 | 32 个工具；含 meta-tools、笔记工具、`task_candidates`、`lark_notify`；无 `ask_user_question` |
| Q2 任务工具 | 通过 | 41 个工具；含 `send_report`；无 `ask_user_question` 与工作区管理工具 |
| Q3 工作区笔记 | 通过 | 写入 JSON、初始化 git 并提交 |
| Q4 新建任务会话 | 通过 | 任务写入笔记，会话使用 `sa-worker` |
| Q5 上报 | 通过 | 附件复制、Markdown 存档、`<work_session_message>` 注入 |
| Q6 候选与下行消息 | 通过 | 候选命中任务会话，`session_send` 的 steer 消息到达 |
| Q7 失败通知 | 通过 | 真实模型错误产生 `<work_session_failure>` 并送达 |
| Q8 自动归档 | 通过 | 任务从活动笔记移除，归档保存消息、reportIds、sessionIds 与上报目录 |
| Q9 停用调度行 | 通过 | 两个预设中的本包工具下线 |
| Q10 停用 lark-bridge | 通过 | 状态路由报告原因 |
| Q11 预设不匹配 | 通过 | 状态路由要求改用 `SA-调度会话` |
| S1 正常状态 | 通过 | 桥接行、预设与 git 均正常，问题列表为空 |

## 真实 lark-cli

| 用例 | 结果 |
| --- | --- |
| bot 鉴权 | 通过 |
| 直接 bot 通知 | 通过 |
| 调度会话调用 `lark_notify` | 通过 |
| 以用户身份发送入站消息 | 受阻：当前授权缺少 `im:message.send_as_user`，未扩大授权 |

入站权限受阻后，测试在真实宿主中创建桥接会话并写入桥接状态，以继续验证后续链路。飞书事件的 XML 格式化、去重与会话注入由上游 lark-bridge 实现，本包未改动。

## 自动检查

- `pnpm format && pnpm check`：28 个测试文件、214 项测试通过。
- `pnpm build`：9 个宿主入口与浏览器产物构建成功，4 项产物测试通过。

## 产物

- 聚合测试结果：`results.json`、`browser-results.json`。
- 调度测试结果：`super-agent-results.json`。
- 截图：隔离 profile 的 `shots/`。
- 测试驱动与报告原始输出不进入 git，避免写入本机路径、令牌或消息标识。

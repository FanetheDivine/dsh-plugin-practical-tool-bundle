# 验证指南：lark-super-agent

## 前置

- 本机已安装 git，并配置 `user.name` 与 `user.email`。
- 已安装 `lark-cli`，完成 `config init` 与授权，见 `dsh-plugin-lark-bridge` 的 README。
- profile 中安装 `dsh-plugin-lark-bridge` 与本包；没有独立安装的 `dsh-plugin-meta-tools`。
- 在 `dsh-plugin-lark-bridge` 配置页选定调度工作区，预设选 `SA-调度会话`。

## 自动检查

```sh
pnpm format && pnpm check
pnpm run build
```

单元测试覆盖：

| 范围 | 关键断言 |
| --- | --- |
| 笔记存储 | 任务新建、追加消息、状态流转、完成即归档、无效 JSON 不被覆盖 |
| git | 首次写入初始化仓库、每次只提交本次文件、提交失败返回原因且文件保留 |
| `send_report` | 空上报报错、非 `.md` 报错、复制附件、生成唯一 `reportId`、归入任务 |
| 注入块 | 两个子块总在、闭合标签转义、属性转义 |
| 失败监听 | 只对 `turn/end` 的 `error` 发通知，`aborted` 不发 |
| 候选会话 | 排序与过滤规则、已归档会话排除 |
| 补丁 | 预设工具行、无 `tool-ask-user`、不设默认 |
| 状态路由 | lark-bridge 缺失、预设不匹配时的 `issues` |

## 实机场景

用 `real-device-test` skill 在隔离 profile 中执行。

| 编号 | 操作 | 预期 |
| --- | --- | --- |
| Q-1 | 打开调度会话的工具列表 | 只有标准预设的 11 个工具、meta-tools 十一项、笔记写工具、`task_candidates`、`lark_notify`，以及 profile 中其他组合包的全局工具 |
| Q-2 | 新建 `SA-任务会话`，查看工具列表 | 标准预设去掉 `ask_user_question`，多出 `send_report` |
| Q-3 | 飞书发「B 工作区是 B 项目，关键词 b」 | `workspaces.json` 新增条目，git 多一次提交 |
| Q-4 | 飞书发「在 B 查一下 README 写了什么」 | 新任务登记；B 中出现 `SA-任务会话`；飞书收到回执 |
| Q-5 | 任务会话调用 `send_report` 并附 md 文件 | 调度会话收到 `<work_session_message>`；`reports/<taskId>/` 有记录与副本；飞书收到转述 |
| Q-6 | 飞书引用回执补充一句 | 任务消息列表加一条，补充送到同一任务会话 |
| Q-7 | 让任务会话的模型请求失败（例如临时改坏 provider 地址） | 调度会话收到 `<work_session_failure>`，飞书收到失败通知 |
| Q-8 | 任务完成 | `message-task-status.json` 中该任务消失；`archive/<taskId>/` 有快照与上报 |
| Q-9 | 停用 `lark-super-agent` 行 | 两个预设中本包的工具消失，lark-bridge 照常收消息 |
| Q-10 | 停用 `dsh-plugin-lark-bridge` | 状态路由 `issues` 报告缺失 |
| Q-11 | 桥接会话改用其他预设 | 状态路由报告预设不匹配 |

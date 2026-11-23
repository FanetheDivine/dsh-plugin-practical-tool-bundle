# Research: 调度会话置顶与归档工作会话

## 1. 置顶能力

- 决策：使用宿主 meta-tools 的 `session_pin`，参数 `session_id`，可选 `remove`。
- 依据：`dsh-plugin-meta-tools` 0.1.7 的 `session_pin` 调用 `workspaceRegistry.pinSession`；`SA-调度会话` 预设已开启 `session_pin`。
- 行为：
  - 新置顶会话排在其他置顶会话之前。
  - 重复置顶不改变顺序。
  - 已归档会话不能置顶。
- 备选：程序监听 `session/created` 自动置顶。被 D-002 否决，置顶与归档由提示词驱动。

## 2. 归档能力

- 决策：使用宿主 meta-tools 的 `session_archive`，参数 `session_id` 与 `stop_activity`。
- 依据：`session_archive` 调用 `workspaceRegistry.archiveSession`；`SA-调度会话` 预设已开启 `session_archive`。
- 行为：
  - 会话有运行中工作时默认拒绝归档，返回活动信息。
  - `stop_activity: true` 时先写入归档集合，再请求停止运行工作。
  - 归档在同一次持久化写入中移除置顶。
  - 已归档会话再次归档直接返回，不重复写入。
  - 归档不删除会话目录与日志。
- 备选：等会话空闲后再归档。任务完成时工作会话通常已结束，等待会在异常时阻塞；D-004 选择直接停止。

## 3. 任务与会话的关联

- `task_create` 创建任务时 `sessionIds` 为空；`task_update` 的 `add_session_ids` 追加会话。
- `task_update` 把状态改为 `completed` 时，任务快照与上报目录归档，任务从 `message-task-status.json` 移除。
- 因此完成前必须先取得会话 id，完成后再归档会话。D-102 采用此顺序。
- `task_candidates` 从活动与归档任务中收集候选，过滤已归档会话；归档后该会话不再出现在候选中。

## 4. 共用会话判定

- 未完成任务都在 `message-task-status.json`，每条记录有 `sessionIds`。
- 归档前读取该文件，任一未完成任务仍列出该会话就不归档。D-003 采用此判定。
- 备选：服务提供引用查询工具。用户选择只改提示词，不新增工具。

## 5. 提示词是唯一实现面

- `SA-调度会话` 的提示词在 `src/sa-dispatch/prompt.ts`，由 `sa-dispatch` 子行以 order 700 注册。
- 预设内的 meta-tools 子行同时提供置顶与归档工具，提示词可以直接引用工具名。
- 现有测试断言提示词包含派发、上报、记忆与卡住处理的关键句；新增断言沿用同一方式。

## 6. 验证

- 单元：`tests/sa-dispatch.test.ts` 断言新小节、工具名、参数、复用与失败处理。
- 构建：`pnpm build` 重新生成 `dist/sa-dispatch.mjs`，`test:dist` 校验产物新鲜。
- 真实链路：由用户在现有调度会话中手动验收。真实模型遵循提示词的程度无法用单元测试证明，记入已知风险。
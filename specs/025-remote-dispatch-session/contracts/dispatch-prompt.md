# 契约：调度会话的系统提示词

`sa-dispatch` 子行用 `ctx.systemPrompt.section({ name: 'sa-dispatch:instructions', order: 700, text: SA_DISPATCH_PROMPT })` 注册提示词段。提示词 MUST 覆盖下表规则，措辞见 `src/sa-dispatch/prompt.ts`。

| 小节 | 规则 |
| --- | --- |
| `## Always dispatch` | 每个任务都指派给已登记工作区里的 worker 会话，查一条信息与读一个文件同样如此。调度会话的读写限于调度工作区的笔记、任务归档与报告，对话与派发是它的工作。调度会话不进入项目工作区读写文件或执行命令，不向用户建议由调度会话自己做。 |
| `## Pick a workspace first` | 建任务前按 `workspaces.json` 的 `summary` 与 `keywords` 匹配工作区。无匹配时请用户新增工作区或给现有工作区补充 `summary` / `keywords`，工作区确定前不开工。多个候选或匹配模糊时问清再派。 |
| `## Stay in bounds` | 只执行服务于派发的操作。项目巡检、改代码、跑构建、装环境派给 worker。 |

其余小节约束消息分类、三类笔记、派发流程与上报处理：

- `## Classify each user message first`：新任务、进度追问、任务列表查询、引用补充四类判定，保留中文例句。
- `## Maintain three kinds of notes`：`message-task-status.json`、`workspaces.json` 与调度工作区 `AGENTS.md` 的维护方式。
- `## Dispatch work`：只向 `workspaces.json` 登记的工作区派发，用 `task_candidates` 复用候选会话，回执任务标识、目标工作区与会话。
- `## Handle worker communication`：上报块与失败通知块的格式，转达、读文件后转述、把用户回答送回原会话，以及完成与卡住时的做法。
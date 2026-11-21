# Implementation Plan: lark-super-agent

**Branch**: `feat/025-remote-dispatch-session` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/025-remote-dispatch-session/spec.md`

**Status**: Waived

## Open Decisions

- [x] [P-001] 架构：全局行 `lark-super-agent` 提供 `larkSuperAgent` 服务（笔记存储、git 队列、调度会话解析、状态路由），两个预设子行 `sa-dispatch`、`sa-worker` 注入该服务并注册工具、提示词段与失败监听。备选：全局行用 `when` 条件按会话预设注册全部工具，不设预设子行。推荐前者，理由是预设清单直接体现工具归属，停用全局行时子行随服务一起下线，满足 FR-015。 | Depends on: none | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-002] 调度工作区内的文件布局：根目录放 `message-task-status.json`、`workspaces.json`、`reports/`、`archive/`、`AGENTS.md`。备选：收进隐藏目录 `.lark-super-agent/`。推荐根目录，理由是调度工作区专用于调度，文件一目了然，用户可直接查看。 | Depends on: none | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-003] 笔记写工具清单：`task_create`、`task_update`、`workspace_note_set`、`workspace_note_remove`，另加只读的 `task_candidates`，共 5 个；读取笔记用 `read`。契约见 [tools.md](./contracts/tools.md)。推荐此清单，理由是按语义划分，程序侧能校验结构。 | Depends on: P-001 | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-004] 任务状态：`in_progress`、`waiting_user`、`failed`、`completed`；只有 `completed` 触发归档，`failed` 留在笔记中直到调度会话改为完成或重试。推荐此组，理由是与规格 FR-047 一致，失败任务仍可追问。 | Depends on: none | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-005] 调度会话解析：读 lark-bridge 的 `state.json` 取 `sessionId` 与 `workspaceRoot`（[R-01](./research.md#r-01-桥接会话如何识别)）。这依赖上游内部文件格式，上游改格式时本行失效，状态路由会报告。推荐接受，理由是上游没有其他公开接口。 | Depends on: none | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-006] 投递方式：`sessionController.resolveAgent` + `agent.steer`，`source.kind` 为 `lark-super-agent`（[R-02](./research.md#r-02-消息如何送进另一个会话)）。推荐此方式，理由是空闲的调度会话会被唤醒，与 meta-tools 的 `session_send` 一致。 | Depends on: none | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-007] 失败监听：`sa-worker` 子行监听 `session/event` 中 `reason.kind === 'error'` 的 `turn/end`；通知块格式见 [injection.md](./contracts/injection.md)。推荐此方式，理由是一轮只报一次，取消不报。 | Depends on: P-001 | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-008] `send_report` 的失败处理：附件不合格或调度会话不可用时整次失败，不写任何文件；文件写入并投递后 git 提交失败，只在结果里附 `warning`。推荐此顺序，理由是模型重试不会产生重复存档，已送达的上报不因提交失败而撤回。 | Depends on: none | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-009] 上报块是否增加 `taskid` 属性：你给的格式只有 `sessionid` 与 `reportid`。加上 `taskid` 后调度会话不必再查表即可知道上报属于哪个任务。推荐增加，找不到任务时为空字符串。 | Depends on: none | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-010] `<files>` 子块列出调度工作区内副本的绝对路径，每行一个。推荐副本路径，理由是任务会话目录里的原文件可能被改写或删除。 | Depends on: P-002 | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-011] 标识格式：任务 `task-<yyyyMMddHHmmss>-<4 位十六进制>`，上报 `report-<yyyyMMddHHmmss>-<6 位十六进制>`，时间取本机时区。推荐此格式，理由是按名称排序即按时间排序，便于在目录中查找。 | Depends on: none | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-012] git 实现：`node:child_process` 调用本机 `git`；同一工作区的写入与提交串行；调度工作区根目录不是仓库顶层时执行 `git init`；提交用 `git add -- <路径>` 加 `git commit -m <信息> -- <路径>`，只含本次文件。推荐此方式，理由是不引入新依赖，路径限定保证不带入用户改动。 | Depends on: P-002 | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-013] 候选会话规则（规格 D-006）：取 `message-task-status.json` 与 `archive/*/task.json` 中派往该工作区的任务的 `sessionIds`，排除已归档或已不存在的会话；指定 `task_id` 时该任务自己的会话排最前，其次空闲先于运行中，再按最近活动时间倒序；最多 5 个。推荐此规则，理由是候选只来自调度会话派发过的会话，不会误用用户自己的会话。 | Depends on: P-002, P-003 | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-014] 状态呈现：根行 `/status` 增加 `larkSuperAgent`；本行新增 `GET /api/dsh-practical-tools/lark-super-agent/status`，契约见 [status-route.md](./contracts/status-route.md)。不新增前端界面。推荐不做界面，理由是规格只要求状态路由报告。 | Depends on: P-005 | Status: answered（用户授权自主实现，采用推荐方案）
- [ ] [P-015] 预设组成，契约见 [presets.md](./contracts/presets.md)：
  - 复制宿主 0.2.2-rc.5 标准预设的行。
  - `bash`、`pwsh` 沿用标准预设的平台条件：Windows 只有 `pwsh`，其他平台只有 `bash`。Windows 上的 `bash` 来自其他组合包。
  - 两个预设的 `skill-filesystem` 都不写 `customSkillDirs`（[R-04](./research.md#r-04-预设内的插件行如何解析)），代价是看不到宿主随包的 `dsh-doc` 技能。
  推荐全部接受，理由是平台条件避免 Windows 上出现两个 shell 工具重复，`customSkillDirs` 从本包解析会失败。 | Depends on: P-001 | Status: not asked
- [x] [P-016] 工具描述与系统提示词的语言：推荐英文，消息分类示例保留你给的中文原句。理由是宿主与上游工具都用英文描述；中文示例让模型按原话判断。备选：全部中文。 | Depends on: none | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-017] 依赖：`dsh-plugin-meta-tools` 以确切版本 `0.1.7` 放进 `dependencies`；新增 `@deepseek-ai/dsh-tools@0.2.2-rc.5` 到 `devDependencies` 与 `peerDependencies`，并列入 `minimumReleaseAgeExclude`；宿主服务（`sessionController`、`workspaceRegistry`、`agentPresets`）用本地收窄的接口描述。推荐此组合，理由是满足宪章原则 I，运行时只引用宿主已提供的包。 | Depends on: none | Status: answered（用户授权自主实现，采用推荐方案）
- [x] [P-018] 测试策略：单元测试用 `tests/helpers.ts` 的模拟 `ctx`；git 相关测试在临时目录调用真实 `git`；补丁结构测试比对标准预设快照；最后用 `real-device-test` 跑 [quickstart.md](./quickstart.md) 的 Q-1 至 Q-11。推荐此策略，理由是 git 行为用模拟难以覆盖，预设能否加载只能实机确认。 | Depends on: none | Status: answered（用户授权自主实现，采用推荐方案）

## Clarifications

### Session 2026-11-21

- 用户授权后续完全自行实现、不再询问。P-001 至 P-018 全部采用各条推荐方案。
- P-009 的上报块增加 `taskid` 属性；其余格式与契约按已定稿文件执行。

## Review Record

- 2026-11-21 | Decision: Waived | Scope: current full plan | Open items: none | Risks: 预设内模块解析与宿主全局行可见性、meta-tools 工具重复注册、lark-bridge 状态文件格式依赖均需实机验证；用户要求不再询问并授权自主实现

## Summary

新增一行 `lark-super-agent` 与两个预设，让飞书上的用户通过 `dsh-plugin-lark-bridge` 的桥接会话远程派发任务。

- 桥接会话使用 `SA-调度会话` 预设，内含 `dsh-plugin-meta-tools` 的十一项能力、笔记写工具与候选会话查询。
- 任务会话使用 `SA-任务会话` 预设，经 `send_report` 把上报注入调度会话；失败由程序通知调度会话。
- 任务笔记、工作区笔记、上报存档与任务归档都是调度工作区内的文件，每次变更提交一次 git。
- 技术依据见 [research.md](./research.md) 的「计划阶段调研」。

## Technical Context

**Language/Version**: TypeScript 6，ESM，Node ≥ 24.9

**Primary Dependencies**:

- 宿主：`@deepseek-ai/cordis` ~4.1、`@deepseek-ai/dsh-*` 0.2.2-rc.5（`dsh-tools`、`dsh-llm`、`dsh-session`）。
- 插件自备：`dsh-plugin-meta-tools` 0.1.7、`yaml`。
- 用户自行安装：`dsh-plugin-lark-bridge`。

**Storage**: 调度工作区内的 JSON 与 Markdown 文件，git 版本管理

**Testing**: vitest（`code` 与 `dist` 两个项目）、真实宿主实机测试

**Target Platform**: DSH 宿主进程，Windows、macOS、Linux

**Project Type**: DSH 插件组合包

**Performance Goals**: 单次笔记写入加提交在 2 秒内完成；派发回执满足规格 SC-001 的 1 分钟

**Constraints**:

- 运行时不引入新的第三方依赖。
- 每次提交只含本次文件。
- 写入与提交在同一工作区内串行。

**Scale/Scope**: 单用户；任务笔记只保存未归档任务，规模在几十条以内

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 结论 | 依据 |
| --- | --- | --- |
| I. 宿主依赖版本 | 通过 | P-017：新增 `dsh-tools` 锁定 0.2.2-rc.5 并列入 `minimumReleaseAgeExclude`；`dsh-plugin-meta-tools` 不属于 `@deepseek-ai/*` |
| II. 测试同步 | 通过 | P-018：每个新模块配单元测试；package-pack 测试补充新入口；实机测试覆盖宿主装载 |
| III. 文档结构 | 通过 | README 写功能、安装、配置、路由与冲突说明；`docs/how-it-works.md` 写机制；`docs/known-risks.md` 写上游文件格式依赖与工具重复注册；CHANGELOG 在 push 时补充 |
| IV. 质量门禁 | 通过 | 每次文件变更后 `pnpm format && pnpm check` |
| V. 公开引用 | 通过 | 文档只用 `<repo>`、`$DSH_HOME` 等占位；测试使用临时目录 |

设计完成后复核：Phase 1 产物未引入新的违反项。

## Project Structure

### Documentation (this feature)

```text
specs/025-remote-dispatch-session/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── tools.md
│   ├── injection.md
│   ├── status-route.md
│   └── presets.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks 生成
```

### Source Code (repository root)

```text
src/
├── rows.ts                     # 新增 larkSuperAgent 行 id 与路由常量
├── row-status.ts               # 状态汇总加入 larkSuperAgent
├── lark-super-agent/
│   ├── index.ts                # 全局行：提供 larkSuperAgent 服务与状态路由
│   ├── service.ts              # 服务：调度会话解析、投递、笔记存储与 git 的组合
│   ├── bridge.ts               # 读取 lark-bridge state.json
│   ├── notes.ts                # 任务与工作区笔记的读写、校验与归档
│   ├── reports.ts              # 上报存档与附件复制
│   ├── git.ts                  # 串行 git 队列
│   ├── blocks.ts               # 注入块与转义
│   ├── ids.ts                  # 任务与上报标识
│   └── status.ts               # 状态路由的回答
├── sa-dispatch/
│   ├── index.ts                # 预设子行：注册笔记写工具、task_candidates 与提示词段
│   ├── tools.ts
│   └── prompt.ts
└── sa-worker/
    ├── index.ts                # 预设子行：注册 send_report、提示词段与失败监听
    ├── tools.ts
    └── prompt.ts

tests/
├── lark-super-agent-*.test.ts
├── sa-dispatch.test.ts
├── sa-worker.test.ts
├── presets-patch.test.ts
└── support/standard-preset.yml # 宿主 0.2.2-rc.5 标准预设快照
```

**Structure Decision**: 沿用现有「一行一个目录、一个 tsdown 入口」的结构，新增 `lark-super-agent`、`sa-dispatch`、`sa-worker` 三个入口并在 `package.json` 的 `exports` 中声明。

## Complexity Tracking

无违反项。

---
description: "lark-super-agent implementation tasks"
---

# Tasks: lark-super-agent

**Input**: Design documents from `specs/025-remote-dispatch-session/`

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)

**Tests**: 规格 FR-058 明确要求单元测试，且用户要求实机测试。

## Phase 1: Setup

**Purpose**: 新增入口、依赖与共享行常量。

- [X] T001 在 `package.json`、`tsdown.config.ts`、`pnpm-workspace.yaml` 声明三个新入口、meta-tools 0.1.7 与 dsh-tools 0.2.2-rc.5。
- [X] T002 [P] 在 `src/rows.ts`、`src/row-status.ts` 增加 `larkSuperAgent` 行、服务名与状态路由常量。

## Phase 2: Foundational

**Purpose**: 提供所有用户故事共用的存储、投递与服务。

- [X] T003 [P] 在 `tests/lark-super-agent-notes.test.ts` 覆盖 Task、Message、工作区笔记的结构校验与状态转换。
- [X] T004 [P] 在 `tests/lark-super-agent-git.test.ts` 用临时目录验证初始化、限定路径提交与失败保留。
- [X] T005 [P] 在 `src/lark-super-agent/ids.ts`、`src/lark-super-agent/blocks.ts` 实现时间有序标识与 XML 转义。
- [X] T006 在 `src/lark-super-agent/git.ts` 实现同工作区串行队列、真实 git 初始化与仅提交本次路径。
- [X] T007 在 `src/lark-super-agent/notes.ts` 实现任务（消息可多条）与工作区笔记（五字段）、原子写入及按任务归档。
- [X] T008 在 `src/lark-super-agent/bridge.ts`、`src/lark-super-agent/service.ts` 解析桥接状态并经 `resolveAgent + steer` 投递。
- [X] T009 在 `src/lark-super-agent/index.ts`、`src/lark-super-agent/status.ts` 提供 `larkSuperAgent` 服务与状态路由。

## Phase 3: User Story 1 - 远程派发 (P1) MVP

**Goal**: 桥接会话用调度预设，按工作区笔记派发任务。

**Independent Test**: quickstart Q-1、Q-3、Q-4。

- [X] T010 [P] [US1] 在 `tests/presets-patch.test.ts` 验证补丁行、预设组成与默认不变。
- [X] T011 [US1] 在 `cordis.patch.yml` 插入 `lark-super-agent`、`preset-sa-dispatch`、`preset-sa-worker`，组成见 `contracts/presets.md`。
- [X] T012 [P] [US1] 在 `src/sa-dispatch/prompt.ts` 编写调度提示词：分类、笔记、关键词派发、上报处理与 AGENTS.md 自提交。
- [X] T013 [US1] 在 `src/sa-dispatch/tools.ts`、`src/sa-dispatch/index.ts` 注册 `task_create`、`task_update`、`workspace_note_set`、`workspace_note_remove` 与提示词段。

## Phase 4: User Story 2 - 双向通信 (P1)

**Goal**: 任务会话上报、程序存档、失败通知与完成归档。

**Independent Test**: quickstart Q-5、Q-7、Q-8。

- [X] T014 [P] [US2] 在 `tests/sa-worker.test.ts` 覆盖空参数、非 Markdown、附件复制、注入与失败原因。
- [X] T015 [P] [US2] 在 `tests/lark-super-agent-reports.test.ts` 覆盖每任务目录、reportId 唯一、文件复制与自动归档。
- [X] T016 [US2] 在 `src/lark-super-agent/reports.ts` 实现上报存档、任务归属与任务完成时目录移动。
- [X] T017 [US2] 在 `src/sa-worker/tools.ts`、`src/sa-worker/index.ts` 实现 `send_report` 与 `session/event` 失败监听。
- [X] T018 [P] [US2] 在 `src/sa-worker/prompt.ts` 编写输出不可见、精简正文、send_report 交互与超时上报提示。

## Phase 5: User Story 3 - 记笔记 (P1)

**Goal**: 分类消息、维护任务与工作区笔记、AGENTS.md 记忆。

**Independent Test**: quickstart Q-3、Q-6、Q-8。

- [X] T019 [US3] 在 `tests/sa-dispatch.test.ts` 验证笔记工具参数、追加多条消息、只读笔记与完成归档。
- [X] T020 [US3] 在 `src/sa-dispatch/tools.ts` 实现任务消息追加、workspace 注册表校验与任务状态流转。
- [X] T021 [US3] 在 `src/sa-dispatch/prompt.ts` 固化新任务、追问、列表查询、引用补充与记忆写入规则。

## Phase 6: User Story 4 - 预设能力边界 (P2)

**Goal**: 两个预设的工具集与提示词符合规格。

**Independent Test**: quickstart Q-1、Q-2。

- [X] T022 [US4] 在 `tests/support/standard-preset.yml` 固定宿主 0.2.2-rc.5 标准预设快照。
- [X] T023 [US4] 在 `tests/presets-patch.test.ts` 逐项断言调度 11 个基础工具、无 ask_user_question、任务预设仅增加 send_report 行。

## Phase 7: User Story 5 - 复用会话 (P3)

**Goal**: 程序给候选，调度会话确认复用或新建。

**Independent Test**: quickstart Q-6 及候选排序单元测试。

- [X] T024 [US5] 在 `src/sa-dispatch/tools.ts` 实现只读 `task_candidates`，规则见计划 P-013。
- [X] T025 [US5] 在 `tests/sa-dispatch.test.ts` 覆盖当前任务优先、空闲优先、归档排除、最多 5 项。

## Phase 8: Polish & Cross-cutting

- [X] T026 [P] 更新 `README.md`、`docs/how-it-works.md`、`docs/known-risks.md`、`docs/development.md` 与 `docs/i18n.md`。
- [X] T027 [P] 更新 `locale/zh.json`、`locale/en.json`，新增行提供中英文说明。
- [X] T028 更新 `tests/metadata.test.ts`、`tests/package-pack.test.ts`、`tests/client-bundle.test.ts`、`tests/status-route.test.ts`。
- [X] T029 执行 `pnpm format && pnpm check && pnpm build` 并修复全部失败。
- [X] T030 按 `quickstart.md` 在隔离 profile 执行 Q-1 至 Q-11，并使用真实 lark-cli 验证鉴权与消息链路。
- [X] T031 复核差异、保存实机报告、补充 `CHANGELOG.md`，按仓库规则压缩提交并推送。

## Dependencies & Execution Order

- Phase 1 → Phase 2 → 各用户故事 → Phase 8。
- US1、US2、US3 依赖同一存储服务，完成后集成验证。
- US4 依赖预设补丁，US5 依赖任务笔记。
- 每个阶段形成一个 commit，交付前压缩。

## Parallel Opportunities

- T003、T004、T005 可并行。
- T012 与 T014、T015 可并行。
- T026、T027 可并行。

## Implementation Strategy

先完成 Setup 与 Foundational，再实现 P1 的派发、通信和笔记；随后补齐预设与候选会话；最后执行实机测试与交付。

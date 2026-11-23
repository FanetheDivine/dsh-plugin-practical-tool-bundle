# Tasks: 调度会话置顶与归档工作会话

**Input**: Design documents from `specs/031-worker-session-pin-archive/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/dispatch-prompt.md, quickstart.md

**Tests**: 宪章原则 II 要求代码变更同步测试，因此每个用户故事阶段都包含提示词断言。

**Organization**: 按用户故事分阶段。三个故事依次补充同一提示词小节，每个阶段独立可验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件，无未完成依赖）
- **[Story]**: 对应用户故事 US1、US2、US3
- 描述包含确切文件路径

## Path Conventions

单包结构：`src/`、`tests/`、`rows/`、`docs/` 位于仓库根目录。

---

## Phase 1: Setup（基线与小节骨架）

**Purpose**: 确认基线通过，建立三个故事共用的提示词小节。

- [X] T001 在仓库根按 `package.json` 的 `check` 脚本运行 `pnpm check`，确认改动前基线通过
- [X] T002 在 `src/sa-dispatch/prompt.ts` 的 `## Dispatch work` 之后新增 `## Maintain the session list` 小节标题与空列表

**Checkpoint**: 新小节位置确定，后续故事在同一小节内累加规则。

---

## Phase 2: Foundational（阻塞前置）

无独立基础设施。提示词小节由 T002 建立，三个用户故事按顺序补充规则。

**Checkpoint**: T002 完成即可开始 US1。

---

## Phase 3: User Story 1 - 新建工作会话自动置顶 (Priority: P1) 🎯 MVP

**Goal**: 调度会话新建工作会话后立即置顶，置顶失败不影响派发。

**Independent Test**: 发起需要新建会话的任务，确认新会话位于置顶区；原有置顶会话顺序不变。

### Implementation for User Story 1

- [X] T003 [US1] 在 `src/sa-dispatch/prompt.ts` 的 `## Maintain the session list` 写入规则: 新建会话先调用 `session_pin` 再发送任务要求；置顶失败告知用户并继续派发
- [X] T004 [US1] 在 `tests/sa-dispatch.test.ts` 增加断言: 小节标题、`session_pin`、置顶先于任务要求、置顶失败报告
- [X] T005 [US1] 运行 `pnpm test:code --reporter=minimal tests/sa-dispatch.test.ts` 验证 US1 断言通过

**Checkpoint**: 新建会话置顶规则可在提示词与单元测试中独立验证。

---

## Phase 4: User Story 2 - 任务完成后归档工作会话 (Priority: P2)

**Goal**: 任务完成时归档该任务的工作会话，归档失败不阻止任务完成。

**Independent Test**: 把任务改为完成，确认工作会话进入归档、可从归档恢复；失败时收到说明。

### Implementation for User Story 2

- [X] T006 [US2] 在 `src/sa-dispatch/prompt.ts` 的 `## Maintain the session list` 写入规则: 先取得会话 id，再 `task_update` 完成，最后用 `session_archive` 带 `stop_activity: true` 逐个归档；归档失败在同一轮回复说明，任务保持完成，其余会话继续归档
- [X] T007 [US2] 在 `tests/sa-dispatch.test.ts` 增加断言: `session_archive`、`stop_activity`、先取 id 再完成再归档的顺序、归档失败报告
- [X] T008 [US2] 运行 `pnpm test:code --reporter=minimal tests/sa-dispatch.test.ts` 验证 US2 断言通过

**Checkpoint**: 任务完成归档规则可独立验证，且与置顶规则同时成立。

---

## Phase 5: User Story 3 - 复用会话与共用会话的边界 (Priority: P3)

**Goal**: 复用候选会话不改变置顶状态；共用会话在仍有未完成任务引用时保持未归档。

**Independent Test**: 复用已置顶与未置顶会话各一次；两个任务共用一个会话，完成一个后会话仍可见。

### Implementation for User Story 3

- [X] T009 [US3] 在 `src/sa-dispatch/prompt.ts` 的 `## Maintain the session list` 写入规则: 复用的候选会话保持原置顶状态；归档前读取 `message-task-status.json`，仍被未完成任务引用时保持未归档
- [X] T010 [US3] 在 `tests/sa-dispatch.test.ts` 增加断言: 复用不置顶、`message-task-status.json` 共用检查
- [X] T011 [US3] 运行 `pnpm test:code --reporter=minimal tests/sa-dispatch.test.ts` 验证 US3 断言通过

**Checkpoint**: 三个用户故事的规则在同一小节内完整，互不冲突。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 同步用户文档、机制文档、已知风险与变更日志，完成质量门禁。

- [X] T012 [P] 更新 `README.md`: 功能简介补一句置顶与归档；远程调度用法第 2、4 步写明置顶与归档
- [X] T013 [P] 更新 `rows/sa-dispatch/locale/zh.json` 与 `rows/sa-dispatch/locale/en.json` 的行简介
- [X] T014 [P] 更新 `docs/how-it-works.md` 的调度提示词规则，增加置顶与归档两条
- [X] T015 [P] 更新 `docs/known-risks.md` 的 lark-super-agent 段，记录提示词遵循度风险
- [X] T016 [P] 更新 `CHANGELOG.md` 的 Unreleased Changed 列表
- [X] T017 按 `package.json` 的脚本运行 `pnpm format && pnpm check`
- [X] T018 运行 `pnpm build`，重新生成 `dist/sa-dispatch.mjs` 并通过产物测试

**Checkpoint**: 质量门禁通过，用户文档、机制文档、风险与变更日志同步完成。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖，立即开始
- **Foundational (Phase 2)**: 无独立任务
- **User Stories (Phase 3-5)**: 依次执行。US1 补齐置顶规则，US2 补齐归档规则，US3 补齐复用与共用规则
- **Polish (Phase 6)**: 依赖三个用户故事的规则定稿

### User Story Dependencies

- **US1 (P1)**: T002 完成后开始
- **US2 (P2)**: US1 完成后开始，追加规则到同一小节
- **US3 (P3)**: US2 完成后开始，追加边界规则

### Within Each User Story

- 先写提示词规则，再补测试断言，最后运行局部测试
- 局部测试通过后再进入下一个故事

### Parallel Opportunities

- Polish 阶段的 T012 至 T016 修改不同文件，可以并行
- T017 与 T018 依次执行

---

## Parallel Example: Polish

```text
T012 更新 README.md
T013 更新 rows/sa-dispatch/locale/zh.json 与 en.json
T014 更新 docs/how-it-works.md
T015 更新 docs/known-risks.md
T016 更新 changelogs/CHANGE.1.1.0.md
```

---

## Implementation Strategy

### MVP First

1. 完成 Phase 1 与 Phase 3，交付新建会话置顶。
2. 完成 Phase 4，交付任务完成归档。
3. 完成 Phase 5，交付复用与共用边界。
4. 完成 Phase 6，交付文档与质量门禁。

### Commit 规则

每个阶段对应一个 commit：

| 阶段 | 内容 |
| --- | --- |
| Phase 1 | 提示词小节骨架 |
| Phase 3 | 置顶规则与断言 |
| Phase 4 | 归档规则与断言 |
| Phase 5 | 复用与共用规则及断言 |
| Phase 6 | 文档、格式、检查与构建 |

## Notes

- 手动验收由用户按 quickstart.md 执行，不属于本任务清单。
- 全部路径相对仓库根目录。
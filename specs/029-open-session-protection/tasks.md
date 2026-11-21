# Tasks: 清理会话的保护范围

**Input**: Design documents from `/specs/029-open-session-protection/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: 宪章原则 II 要求代码变更同步测试，因此每个实现阶段都包含测试任务。

**Organization**: 按用户故事分阶段，每个阶段独立可验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件，无未完成依赖）
- **[Story]**: 对应用户故事 US1、US2
- 描述包含确切文件路径

## Path Conventions

单包结构：`src/`、`tests/`、`docs/` 位于仓库根目录。

---

## Phase 1: Setup（复现与基线）

**Purpose**: 在真实宿主复现缺陷，记录保护集合的实际值，作为修复基线。

- [X] T001 用 `.dsh/skills/real-device-test/scripts/setup-env.sh` 创建一次性 profile，安装当前检出
- [X] T002 在一次性 profile 打开一个普通会话，执行清理，记录清理请求体的 `keepIds` 与该会话是否被归档、日志目录是否被删
- [X] T003 在一次性 profile 打开一个 subagent 会话，执行清理，记录 subagent 与父会话的日志目录状态
- [X] T004 把 T002 与 T003 的观察写入 `specs/029-open-session-protection/research.md` 的 R1、R4 条目

**Checkpoint**: 缺陷触发条件与保护集合缺失项已确认。

---

## Phase 2: Foundational（前端保护集合）

**Purpose**: 前端构造保护集合，同时供归档过滤与面板计数使用。此阶段阻塞两个用户故事。

**⚠️ CRITICAL**: T005 至 T011 完成前，用户故事阶段不能开始。

- [X] T005 [P] 在 `tests/client-sweeper.test.ts` 增加用例：`byId` 中 `retainedBy.mainView > 0` 的会话未出现在 `ids` 时仍进入 `keepIds`
- [X] T006 [P] 在 `tests/client-sweeper.test.ts` 增加用例：`retainedBy.sidebarChat > 0` 与 `retainedBy.sidebarView > 0` 同样进入 `keepIds`
- [X] T007 [P] 在 `tests/client-sweeper.test.ts` 增加用例：`sessions` 服务缺失时 `keepIds` 为空，清理照常提交
- [X] T008 在 `src/client/sweeper.tsx` 为 `SessionSummaryLike` 增加 `parentId?: string` 字段
- [X] T009 在 `src/client/sweeper.tsx` 增加 `PROTECTED_SOURCES = ['mainView', 'sidebarChat', 'sidebarView']` 常量与 `protectedIds()` 函数：遍历 `byId` 收集持有计数大于 0 的会话，再沿 `parentId` 上溯并集，用已收集集合防环
- [X] T010 在 `src/client/sweeper.tsx` 的 `sweep()` 中用 `protectedIds()` 生成 `keepIds`，并把保护会话从待归档 `ids` 中排除
- [X] T011 在 `src/client/sweeper.tsx` 的 `overview()` 未置顶计数中扣除保护集合
- [X] T012 在 `tests/client-sweeper.test.ts` 增加用例：`overview()` 的 `unpinned` 扣除打开的会话

**Checkpoint**: 前端保护集合可独立测试：打开会话不被提交归档，计数同步扣除。

---

## Phase 3: User Story 1 - 打开中的会话不被清理 (Priority: P1) 🎯 MVP

**Goal**: 主对话区（含轨迹、插件页签）与子代理聊天面板显示的会话不归档、不删除。

**Independent Test**: 打开一个普通会话执行清理，检查该会话未被归档、日志目录存在、主视图仍停留在该会话。

### Implementation for User Story 1

- [X] T013 [US1] 在 `src/client/sweeper.tsx` 的注释中写明保护来源与 `parentId` 上溯规则，保持文件顶部职责描述一致
- [X] T014 [US1] 用 `pnpm check` 验证 T005 至 T012 的用例通过
- [X] T015 [US1] 用 quickstart 场景 1 在一次性 profile 验证：主对话区打开的会话未被归档，切到轨迹页签后结果相同

**Checkpoint**: 普通会话被打开时不再被清理。

---

## Phase 4: User Story 2 - 打开 subagent 时保护祖先会话 (Priority: P2)

**Goal**: 打开 subagent 时，整条祖先链不归档、不删除。

**Independent Test**: 打开 subagent 执行清理，检查每个祖先日志目录存在。

### Tests for User Story 2

- [X] T016 [P] [US2] 在 `tests/client-sweeper.test.ts` 增加用例：打开的子代理在 `byId` 中且不在 `ids` 时，它与父会话都进入 `keepIds`
- [X] T017 [P] [US2] 在 `tests/client-sweeper.test.ts` 增加用例：三层祖先链全部进入 `keepIds`，自引用父级不死循环
- [X] T018 [P] [US2] 在 `tests/sweeper.test.ts` 增加用例：归档成功、会话随后从内存消失时，删除阶段计入 `deferred` 且日志目录保留

### Implementation for User Story 2

- [X] T019 [US2] 在 `src/sweeper/index.ts` 归档循环前记录 `liveAtStart`：对 `requested` 中 `isLive` 为真的 id 建档
- [X] T020 [US2] 在 `src/sweeper/index.ts` 删除阶段把 `liveAtStart` 命中的 id 计入 `deferred`，继续前移判断顺序
- [X] T021 [US2] 用 quickstart 场景 2 在一次性 profile 验证：子代理与祖先日志保留
- [X] T022 [US2] 用 quickstart 场景 3 在一次性 profile 验证：仅列表中的会话仍被归档并删除

**Checkpoint**: 两个用户故事都独立通过。

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 文档、风险与门禁。

- [X] T023 [P] 更新 `docs/how-it-works.md` 的「清理会话」小节：保护来源、祖先链、宿主同请求延后
- [X] T024 [P] 在 `docs/known-risks.md` 的「删除会话」小节补充：跨客户端打开不保护、视图信息缺失时继续清理
- [X] T025 [P] 在 `changelogs/CHANGE.1.0.1.md` 的 Unreleased → Fixed 下增加本次修复条目
- [X] T026 运行 `pnpm format && pnpm check && pnpm build`
- [X] T027 用 quickstart 场景 4 在一次性 profile 核对面板计数与结果跳过数
- [X] T028 清理一次性 profile 与测试日志目录

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**: 无依赖，先于全部实现
- **Foundational（Phase 2）**: 依赖 Phase 1 的复现结论，阻塞两个用户故事
- **User Story 1（Phase 3）**: 依赖 Phase 2
- **User Story 2（Phase 4）**: 依赖 Phase 2；T016 至 T018 可与 Phase 3 并行
- **Polish（Phase 5）**: 依赖 Phase 3 与 Phase 4

### Within Each User Story

- 测试任务先写，确认失败后实现
- 前端逻辑（T008-T011）集中在一个文件，按顺序执行
- 宿主逻辑（T019-T020）集中在一个文件，按顺序执行

### Parallel Opportunities

- T005、T006、T007 三个测试用例写在同一文件，按顺序追加即可并行起草
- T016、T017、T018 分属两个测试文件，可并行
- T023、T024、T025 分属不同文档，可并行

---

## Parallel Example: User Story 2

```bash
# 两个测试文件互不影响：
Task: "T016 [US2] 客户端子代理保护用例 in tests/client-sweeper.test.ts"
Task: "T018 [US2] 宿主同请求延后用例 in tests/sweeper.test.ts"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 复现，确认缺陷触发条件
2. Phase 2 前端保护集合
3. Phase 3 验证普通会话保护
4. 阶段 1 至 3 即覆盖本次缺陷的主要损失

### Incremental Delivery

1. Phase 1 + Phase 2 → 保护集合可用
2. Phase 3 → 普通会话不再被清理
3. Phase 4 → 子代理祖先与宿主竞态兜底
4. Phase 5 → 文档与门禁

---

## Notes

- 每个阶段对应一个 commit，交付前压缩为一个 commit 再 push
- `[P]` 任务不共享文件
- 阶段内的测试必须先于实现任务完成
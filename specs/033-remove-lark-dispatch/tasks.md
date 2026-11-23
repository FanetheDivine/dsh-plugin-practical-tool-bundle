# Tasks: 移除飞书任务与调度会话

**Input**: Design documents from `/specs/033-remove-lark-dispatch/`

**Prerequisites**: plan.md、spec.md、research.md、contracts/status-route.md、quickstart.md

**Tests**: 宪章原则 II 要求同步测试，阶段 1 与阶段 5 含测试任务。

**Organization**: 本功能是删除，撤销与冲突处理覆盖三个用户故事，阶段按计划顺序划分。每个阶段对应一个 commit。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成任务依赖）
- **[Story]**: 对应用户故事（US1 行与预设消失、US2 升级无残留、US3 包与依赖收缩、US4 文档与测试同步）
- 任务描述含精确文件路径

---

## Phase 1: 撤销功能提交与解冲突

**Goal**: 撤销 4 个功能提交，解 4 处冲突，仓库回到「只有六行功能」的状态。

**Independent Test**: `pnpm typecheck && pnpm test:code` 通过；`cordis.patch.yml` 只声明根行与六个功能行。

- [ ] T001 在 worktree 执行 `pnpm install --frozen-lockfile`，准备检查与构建环境
- [ ] T002 [US1] 执行 `git revert --no-commit cc3c25d abc173b 3456418 f989513`，记录冲突文件清单
- [ ] T003 [US1] 解 `cordis.patch.yml` 冲突：取撤销结果，核对 `insert` 只含根行与六个功能行
- [ ] T004 [US4] 解 `docs/how-it-works.md` 冲突：删除本功能段落，保留 `eed7426` 的 `keepIds` 段落与 `4ac5848` 的启动重新施加载荷段落
- [ ] T005 [US1] 删除撤销意图为删除的两个文件：`specs/025-remote-dispatch-session/contracts/presets.md`、`tests/presets-patch.test.ts`
- [ ] T006 [US1] 核对撤销已覆盖 `src/rows.ts`、`src/row-status.ts`、`tsdown.config.ts`、`package.json`、`locale/` 与 `README.md` 中的功能内容
- [ ] T007 [US2] 运行 `pnpm typecheck && pnpm test:code`，确认测试期望随撤销同步
- [ ] T008 [US1] 提交「refactor: 撤销飞书任务与调度会话功能」

**Checkpoint**: 插件页只剩六行，测试通过。

---

## Phase 2: 还原历史记录与 CHANGELOG

**Goal**: 保留三份规格与归档，按 FR-014 追加 `Removed` 条目。

**Independent Test**: `specs/025`、`specs/031`、`specs/032` 与 `changelogs/` 文件数与基点一致；`CHANGELOG.md` 的 `Unreleased` 含一条 `Removed`。

- [ ] T009 [US4] 执行 `git checkout cc3c25d -- specs/ changelogs/ CHANGELOG.md` 还原历史记录
- [ ] T010 [US4] 在 `CHANGELOG.md` 的 `Unreleased` 增加 `### Removed`，写明删除该功能、两个预设与 `dsh-plugin-meta-tools` 依赖
- [ ] T011 [US4] 提交「docs: 保留历史记录并记录功能删除」

**Checkpoint**: 历史记录完整，仓库只描述现有能力。

---

## Phase 3: 移除依赖与锁文件

**Goal**: 本包不再依赖 `dsh-plugin-meta-tools`。

**Independent Test**: `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` 无该包命中；`pnpm install --frozen-lockfile` 通过。

- [ ] T012 [US3] 删除 `package.json` 的 `dsh-plugin-meta-tools` 与 `pnpm-workspace.yaml` 的排除项，运行 `pnpm install`
- [ ] T013 [US3] 核对 `pnpm-lock.yaml` 只删除该包相关条目，`yaml` 依赖保持
- [ ] T014 [US3] 提交「chore: 移除 dsh-plugin-meta-tools 依赖」

**Checkpoint**: 安装不再引入该依赖。

---

## Phase 4: 残留清理与文档核对

**Goal**: 历史记录之外无功能标识，文档计数与现状一致。

**Independent Test**: quickstart 的 Q-4 至 Q-6 命中符合预期。

- [ ] T015 [US4] 全仓检索 `lark`、`飞书`、`sa-dispatch`、`sa-worker`、`meta-tools`，处理 `specs/`、`changelogs/`、`CHANGELOG.md` 之外的命中
- [ ] T016 [US4] 核对 `README.md`、`AGENTS.md`、`docs/` 的行数与工具数表述为六，`docs/development.md` 不再指向已删除功能的验证指南
- [ ] T017 [US4] 运行 `pnpm format`
- [ ] T018 [US4] 提交「docs: 清理功能删除后的残留引用」

**Checkpoint**: 检索只剩历史记录命中。

---

## Phase 5: 构建与验证

**Goal**: 产物、自动化检查与实机装载全部通过。

**Independent Test**: quickstart 的 Q-1 至 Q-12 全部符合预期。

- [ ] T019 [US1] 运行 `pnpm check`
- [ ] T020 [US1] 运行 `pnpm build`，核对 `dist` 不含三个已删除入口
- [ ] T021 [US2] 用 `pnpm pack` 产物在隔离 profile 安装并重启宿主，按 `real-device-test` skill 核对六行、无预设与调度状态路由 404
- [ ] T022 [US2] 把实机结果写入 PR 描述；仅在产生受跟踪改动时提交

**Checkpoint**: 用户验收。

---

## Dependencies & Execution Order

- 阶段 1 必须在阶段 2 之前：还原历史依赖撤销结果。
- 阶段 2 先于阶段 3：锁文件变更建立在代码删除之后。
- 阶段 4 依赖阶段 1 至 3 完成。
- 阶段 5 依赖全部前置阶段。
- 阶段内 T005 与 T006 可并行；其余按编号顺序执行。

## Parallel Example

```text
阶段 1：T005 删除两个冲突文件 | T006 核对撤销覆盖范围
阶段 4：T015 检索残留 | T016 核对文档计数
```

## Implementation Strategy

- 阶段 1 完成即用户可见结果：插件页与预设列表只剩现有能力。
- 阶段 2 至 4 保证历史、依赖与文档一致。
- 阶段 5 是发布前门禁，实机验证通过后进入验收。

## Notes

- `dist/` 不跟踪，阶段 5 只重建不提交。
- 冲突处理以 `research.md` 的 R-001 至 R-003 为准。
- `pnpm install` 需要网络；失败时保留锁文件并在报告中说明。
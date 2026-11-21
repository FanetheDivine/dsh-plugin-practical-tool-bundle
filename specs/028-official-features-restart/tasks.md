# Tasks: 官方功能关闭跨重启生效

**Input**: Design documents from `specs/028-official-features-restart/`

**Prerequisites**: spec.md、plan.md、research.md、data-model.md

## Phase 1: 启动完成信号接线

**Purpose**: 让重新施加在启动完成后再执行一次。

- [x] T001 [US1] 在 `src/official-features/index.ts` 新增 `AppReadyLike` 与 `readAppReady(ctx)`，用 `ctx.get('appReady')` 软读取并校验 `onReady` 是函数
- [x] T002 [US2] 在行接线的 effect 内注册 `appReady.onReady(() => void created.reapply())`，与路由、`config-reload` 一起进入 `offs`；`appReady` 缺失时跳过
- [x] T003 [US1] 让 `createFeatureService` 接受可选 `warn` 依赖；`reapply` 用尽轮数且未达成时写一条含未达成功能 id 的 warn；行接线传入 `scoped.logger.warn`

## Phase 2: 测试

**Purpose**: 固定接线与失败诊断行为。

- [x] T004 [US2] 扩展 `tests/official-features-lifecycle.test.ts`：`appReady` 存在时 `store.read` 被调用两次；缺失时只调用一次；模板清理时调用 `onReady` 返回的取消函数
- [x] T005 [US1] 扩展 `tests/official-features-reapply.test.ts`：`loader.update` 持续失败、轮数用尽时 `warn` 收到一条含功能 id 的记录

## Phase 3: 文档

**Purpose**: 机制与风险各归一处。

- [x] T006 [P] 更新 `docs/how-it-works.md`：官方功能一节写明启动施加与启动完成后的补施加
- [x] T007 [P] 更新 `docs/known-risks.md`：`appReady` 是宿主可选服务，缺失时只有启动那次施加
- [x] T008 更新 `CHANGELOG.md`：加一条修复条目

## Phase 4: 验证

- [x] T009 运行 `pnpm format && pnpm check`
- [x] T010 真实宿主：写入五项关闭记录，连续启动 3 次，确认每次启动后五项保持关闭
- [x] T011 真实宿主：面板显示关闭，切换一项为开启后重启，确认该项保持开启

## Phase 5: 交付

- [ ] T012 把各阶段提交压缩为一个 commit，推送分支

## Dependencies

- T002、T003 依赖 T001。
- T004、T005 依赖 T001 至 T003。
- T010、T011 依赖 T009 与 `pnpm build`。
- T012 依赖全部验证通过。

## 执行约束

- 每个阶段一个 commit；阶段内 `[P]` 任务可并行。
- 推送前压缩为一个 commit。

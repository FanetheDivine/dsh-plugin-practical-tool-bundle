# Tasks: 标准模式追加 Codex 行为提示词

**Input**: `/specs/034-standard-codex-prompt/`

**Tests**: 规格 FR-014 要求单元测试，包含测试任务。

## Phase 1: 插件与行（commit 1）

- [ ] T001 [P] 新增 `src/codex-behavior/prompts.ts`，写入 S3、S4、S6 三段英文原文常量
- [ ] T002 新增 `src/codex-behavior/index.ts`，注册三个 `systemPrompt.section`，段序 100、110、120
- [ ] T003 新增 `src/standard-codex/index.ts`：查找 `preset-standard`，清空 persona 前缀，追加 `codex-behavior` 子行，幂等，`app-boot/config-reload` 重施加，停用恢复
- [ ] T004 `cordis.patch.yml` 插入 `standard-codex` 行，排在 `official-features` 之后
- [ ] T005 `tsdown.config.ts` 与 `package.json` 的 `exports` 登记两个入口

## Phase 2: 测试（commit 2）

- [ ] T006 [P] `tests/codex-behavior.test.ts`：三段段名、段序与逐字文本；无模型名与插值
- [ ] T007 [P] `tests/standard-codex.test.ts`：变换、幂等、保留其它子行、恢复、重载、无目标与 loader 缺失
- [ ] T008 [P] `tests/standard-codex-prompt.test.ts`：补丁声明与模块清单、与 `official-features` 的顺序
- [ ] T009 更新 `tests/metadata.test.ts` 的非界面行清单、`tests/support/dist-freshness.ts`、`tests/dist-freshness.test.ts`、`tests/package-pack.test.ts`
- [ ] T010 运行 `pnpm format && pnpm check`

## Phase 3: 文档与元数据（commit 3）

- [ ] T011 README 增加「标准模式增强」一节
- [ ] T012 `docs/how-it-works.md` 写叠加机制、段序与官方功能开关共存
- [ ] T013 `docs/development.md` 构建表与文件地图
- [ ] T014 `docs/known-risks.md` 记录 `loader.update` 契约
- [ ] T015 `locale/zh.json`、`locale/en.json`、`package.json` 描述与 `CHANGELOG.md`
- [ ] T016 `AGENTS.md` 补一句标准模式增强

## Phase 4: 构建、真机与发布（commit 4 与发布）

- [ ] T017 `pnpm build`
- [ ] T018 隔离 profile 真机验证三段、顺序、无模型名、工具集合不变
- [ ] T019 填写 `real-device-report.md`，清理 profile
- [ ] T020 推 PR、等 CI、合并
- [ ] T021 在 `main` 运行 `pnpm release`，记录版本号与 tag

## Dependencies

- Phase 2 依赖 Phase 1。
- Phase 3 依赖 Phase 1 的最终名称。
- Phase 4 依赖前三阶段。
- 发布依赖 PR 合并。

## Parallel Execution Examples

- T001 与 T003 可并行（不同文件）。
- T006、T007、T008 可并行。
- T011 至 T015 可并行。

## Implementation Strategy

先完成 Phase 1 并跑类型检查；再一次性完成测试并跑 `pnpm check`。文档独立提交。最后构建、真机验证、PR 与发布。
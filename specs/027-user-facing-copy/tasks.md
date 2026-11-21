---

description: "Task list for 027 优化用户可见内容"
---

# Tasks: 优化用户可见内容

**Input**: Design documents from `specs/027-user-facing-copy/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/copy.md、quickstart.md

**Tests**: 宪章原则 II 要求代码变更同步测试。

**文案来源**：全部文案逐字取自 [copy.md](./contracts/copy.md)。

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 修订 `.specify/memory/constitution.md` 原则 III：README 读者「插件用户」，归属内容改为「功能简介与 npm 徽章」；删掉「README.md 省略实现细节」一条；「用户可见行为变化 MUST 更新 README.md」改为同时更新 README 与 meta；版本 2.1.0 → 2.2.0，Last Amended 2026-11-21，更新 Sync Impact Report

## Phase 2: User Story 1 - 在插件列表里认出每个功能 (P1)

**Goal**: Plugins 页 7 行都显示用户可读的标题、描述与图标。

**Independent Test**: `pnpm vitest run tests/metadata.test.ts tests/package-pack.test.ts`；实机核对见 quickstart 第 1、2 步。

- [x] T002 [P] [US1] 按 copy.md「插件 meta」改写 `locale/zh.json` 与 `locale/en.json`
- [x] T003 [P] [US1] 按 copy.md「行 meta」新建 `rows/{sweeper,reasoning-reset,claude-skills,restart,mobile,official-features}/locale/{zh,en}.json`，只含 `meta.title` 与 `meta.description`
- [x] T004 [P] [US1] 从本地插件复制五个图标到 `rows/{sweeper,reasoning-reset,claude-skills,restart,mobile}/icon.svg`；新画 `rows/official-features/icon.svg`：24×24 viewBox、描边 `#4c6ef5`、宽 1.8、圆角端点，图形为两条开关滑轨
- [x] T005 [US1] `package.json`：`description` 改为中文 meta 描述；`exports` 为每个子路径增加 `./<子路径>/locale/*.json` 与 `./<子路径>/icon` 映射到 `rows/`；`files` 增加 `rows`
- [x] T006 [US1] `tests/metadata.test.ts`：对六个行目录断言 meta 结构、键集一致、标题单行、无禁用字符；断言 `exports` 两条映射存在且目标文件存在；断言图标是以 `<svg` 开头的合法 SVG 且不超过 256 KiB
- [x] T007 [US1] `tests/package-pack.test.ts` 的 `REQUIRED` 增加 12 个行 locale 与 6 个行图标

## Phase 3: User Story 3 - 在开关旁边看懂后果 (P2)

**Goal**: 面板每行有说明，区分加载中与读取失败，错误本地化。

**Independent Test**: `pnpm vitest run tests/client-official-features.test.ts tests/client-restart.test.ts tests/restart.test.ts tests/client-bundle.test.ts`

- [x] T008 [US3] `src/client/locales.ts`：按 copy.md 改写全部中英文值；新增 `restart.error.*`、`officialFeatures.loading`、`officialFeatures.loadFailed`、`officialFeatures.error.*`、`officialFeatures.detail.*`；删除 `officialFeatures.failed`、`officialFeatures.unavailable`
- [x] T009 [US3] `src/client/official-features.tsx`：去掉面板标题；每行在功能名下显示 `officialFeatures.detail.<id>`；按 data-model「面板状态」显示 `loading`、`failed` 加重试、`ready`；切换失败时保存错误码，按 copy.md「错误码」选文案；`request` 抛出的错误携带 `error` 字段
- [x] T010 [US3] `src/restart/index.ts`：`error` 改为 `restart-pending`、`helper-failed`、`restart-failed`，原始说明放 `message`
- [x] T011 [US3] `src/client/restart.tsx`：`restartRequest` 抛出的错误携带错误码；失败弹窗按错误码显示 `restart.error.*`，未知值与网络失败用 `restart.error.unknown`
- [x] T012 [US3] 更新测试：`tests/client-official-features.test.ts` 覆盖加载中、读取失败与重试、每行说明、三种错误码与未知值；`tests/restart.test.ts` 断言错误码；`tests/client-restart.test.ts` 覆盖错误码到文案键的映射

## Phase 4: User Story 2 + User Story 4 - README 与文档 (P1、P3)

**Goal**: README 只有徽章与功能简介；开发者内容只在 `docs/`。US4 的文字已在 T008 完成。

**Independent Test**: 通读 README，确认路由、行 id、存储域、安装步骤出现 0 次。

- [x] T013 [P] [US2] 按 copy.md「README」重写 `README.md`
- [x] T014 [P] [US2] `docs/i18n.md` 增加「行元数据」一节：路径 `rows/<子路径>/`、两条 `exports` 映射、`files`；更新官方功能文案前缀说明与功能名；`docs/how-it-works.md` 的包结构与打包一节增加 `rows/`；`docs/development.md` 文件地图增加 `rows/`；`AGENTS.md` 的项目说明改用新标题与新功能名
- [x] T015 [P] [US2] `specs/023-practical-tool-bundle/contracts/http-api.md` 的重启错误改为错误码；`cordis.patch.yml` 注释改用新功能名
- [x] T016 [US2] `CHANGELOG.md` 的 Unreleased 增加 Changed 条目

## Phase 5: Polish

- [x] T017 `pnpm format && pnpm check && pnpm build`
- [x] T018 按 quickstart 实机核对，记录远程徽章是否加载。结果：A1–A3、B1–B4、C1–C4 全部通过；七行标题、描述与图标中英文正确；配置页无重复标题，390px 无横向溢出；宿主详情页渲染远程徽章 `<img>`，测试环境的无头 Chrome 未在 8 秒内加载完成

## Dependencies

- Phase 1 无依赖。
- Phase 2、3 互不依赖。
- Phase 4 的 T014 依赖 T005 的 `rows/` 布局。
- Phase 5 依赖全部阶段。

## Parallel Example

```text
T002、T003、T004 同时进行。
T013、T014、T015 同时进行。
```

## Implementation Strategy

每个阶段一次提交，阶段末运行 `pnpm format && pnpm check`。交付前压缩为一个提交。

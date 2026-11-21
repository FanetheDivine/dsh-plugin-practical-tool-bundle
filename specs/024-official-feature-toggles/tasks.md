---

description: "管理官方功能：任务清单"
---

# Tasks: 管理官方功能

**Input**: Design documents from `/specs/024-official-feature-toggles/`

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/official-features-api.md](./contracts/official-features-api.md)、[quickstart.md](./quickstart.md)

**Tests**: 宪章原则 II 要求代码变更同步更新 `tests/`，因此每个阶段都含测试任务。测试验证真实行为，不复述默认值或文案。

**Organization**: 按用户故事分阶段；每个阶段对应一个 commit，交付前压缩为一个 commit。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件，无未完成依赖）
- **[Story]**: 所属用户故事，对应 spec.md
- 每条任务带确切文件路径

## 实现约束（全阶段适用）

- 功能 id 固定为 `schedule`、`goal`、`task`、`plan`、`present`，顺序固定，不提供扩展（FR-003）。
- 受管行清单与匹配规则以 [research.md](./research.md) R-005、R-006 为准：宿主行按 id 或组路径末段匹配，preset 子行按模块名匹配。
- 不写 profile 的 `cordis.yml`、`cordis.patch.yml`、`package.json`，不改宿主安装内容（FR-014、FR-015）。
- 开关状态二值：有任一受管项启用即为开（FR-006）。
- `plan` 不包含 `ui-user-questions`（D-007）；`present` 不包含 `ui-deliverables`（D-008）。
- 类型导入保持 type-only，宿主依赖保持 external（`tsdown.config.ts` 的 `neverBundle`）。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 新增行与依赖的骨架，让后续任务有可构建、可装载的落点。

- [X] T001 在 `package.json` 增加 `peerDependencies` 的 `@deepseek-ai/dsh-storage-domain@0.2.2-rc.5` 与 `zod@4.6.6`，`devDependencies` 的 `@deepseek-ai/dsh-storage@0.2.2-rc.5`、`@deepseek-ai/dsh-client-ui-plugin-manager@0.2.2-rc.5`、`zod@4.6.6`；`exports` 增加 `./official-features`（`types` 指向 `./dist/official-features.d.ts`，`import` 指向 `./dist/official-features.mjs`）；`description` 与 `keywords` 同步新增一行
- [X] T002 [P] 在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 追加 `'@deepseek-ai/dsh-storage-domain@0.2.2-rc.5'`、`'@deepseek-ai/dsh-storage@0.2.2-rc.5'`、`'@deepseek-ai/dsh-client-ui-plugin-manager@0.2.2-rc.5'`
- [X] T003 运行 `pnpm install`，确认 `pnpm-lock.yaml` 更新且 `tests/dependency-versions.test.ts` 的版本一致性断言仍然成立
- [X] T004 [P] 在 `tsdown.config.ts` 的宿主入口增加 `'official-features': 'src/official-features/index.ts'`，同步更新文件顶部「六个宿主入口」注释为「七个」
- [X] T005 [P] 在 `src/rows.ts` 增加 `ROW_IDS.officialFeatures = 'official-features'`、常量 `OFFICIAL_FEATURES_PATH = ${API_BASE}/official-features`，`RowName` 与 `ROW_NAME_TO_ID` 增加 `officialFeatures`
- [X] T006 在 `cordis.patch.yml` 增加行 `- id: official-features`、`name: dsh-plugin-practical-tool-bundle/official-features`，并更新文件头注释的「五行」为「六行」
- [X] T007 [P] 创建 `src/official-features/catalog.ts`：导出 `FEATURE_IDS`（`['schedule','goal','task','plan','present']`）、类型 `FeatureId`、接口 `FeatureSpec { id; hostRows: readonly string[]; presetModules: readonly string[] }`，以及按 [research.md](./research.md) R-006 填好的 `FEATURES` 常量；文件顶部写职责，每个常量写一句用途

**Checkpoint**: `pnpm install` 与 `pnpm typecheck` 通过。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有用户故事共用的存储、状态读取与串行执行基础。

- [X] T008 创建 `src/official-features/store.ts`：用 `ctx.storageDomain.open(defineDomain({ name: 'practical_tool_official_features', version: 1, tables: {}, global: { schema, initial } }))` 打开域，`schema` 为 zod `z.object({ version: z.literal(1), off: z.array(z.enum(FEATURE_IDS)) })`，`initial` 为 `{ version: 1, off: [] }`；导出 `openStore(ctx)` 返回 `{ read(): FeatureId[]; write(off: FeatureId[]): Promise<void>; close(): Promise<void> }`，`open` 失败时本阶段直接抛出，降级见 T044。`write` 前去重并保证对象含 `version: 1`；域名必须匹配 `/^[a-z][a-z0-9_]*$/`；`global` 的 schema 不得接受 `null`
- [X] T009 [P] 创建 `tests/official-features-store.test.ts`：覆盖读取初始值、写入后读回、去重、写入失败时抛出并保持内存不变、`close` 释放域且同名域可再次打开
- [X] T010 创建 `src/official-features/loader.ts`：定义 `LoaderLike`（`entries()`、`update(id, options)`、`await()`）、`LoaderEntryLike`（`id`、`disabled`、`fiber?.state`、`options?.name`、`options?.config`）、`readLoader(ctx)`，并导出 `findEntry(loader, id)`（先按完整 id，再按末段 `:${id}` 匹配，与 `src/row-status.ts` 同规则）与 `FIBER_ACTIVE = 2`、`FIBER_LOADING = 1`（`FiberState` 在 cordis 中是 const enum，按序号比较）
- [X] T011 [P] 在 `tests/helpers.ts` 增加 `makeLoader(entries)`：返回带 `entries()`、`update()`（记录调用并更新条目）、`await()` 的假 loader；条目含 `id`、`disabled`、`fiber`、`options`
- [X] T012 创建 `src/official-features/queue.ts`：导出 `createSerialQueue()`，保证同一时刻只执行一个任务、后到任务排队、返回各自结果；任务抛错不阻断后续任务
- [X] T013 [P] 创建 `tests/official-features-queue.test.ts`：覆盖顺序执行、并发提交的最终状态等于最后一次、前一个任务失败后下一个仍执行

**Checkpoint**: 基础模块单测通过；`pnpm check` 通过。

---

## Phase 3: User Story 1 - 用开关关闭一个官方功能 (Priority: P1) 🎯 MVP

**Goal**: 用户在配置面板里用开关停用和恢复宿主行与界面行，无需编辑配置文件。

**Independent Test**: 装载本包后在面板关闭「schedule」，宿主 `schedule` 与 `ui-schedule` 行停用，界面消失；再打开，二者恢复；`cordis.yml`、`cordis.patch.yml`、`package.json` 内容不变。

### Tests for User Story 1

- [X] T014 [P] [US1] 创建 `tests/official-features-apply.test.ts`：对 `schedule` 关闭后断言 `schedule`、`ui-schedule` 的 `update` 被以 `{ disabled: true }` 调用且只调用这两行；打开后以 `{ disabled: false }` 调用；`goal` 关闭时 `goal`、`goal-round-driver`、`ui-goal` 三行都被停用；条目缺失时跳过且不抛错；不修改受管行之外的任何条目（FR-017）
- [X] T015 [P] [US1] 创建 `tests/official-features-route.test.ts`：覆盖 GET 返回五项固定顺序与 `busy`；POST 非法 `id` 返回 `400 invalid-request`；`enabled` 非布尔返回 `400`；成功返回 `200` 且带最新 `features`；存储写入失败返回 `409 store-failed` 且不施加；`loader.update` 抛错返回 `500 apply-failed` 并回滚记录；loader 不可用时 GET 返回 `features: null`
- [X] T016 [P] [US1] 创建 `tests/client-official-features.test.tsx`：用 `makeClientCtx` 渲染面板，断言列出五个功能行与各自开关；切换发出 POST；失败时显示错误并回到真实状态；处理中禁用该行开关；文案经字典取得，键集在 `zh`、`en` 一致

### Implementation for User Story 1

- [X] T017 [US1] 创建 `src/official-features/apply.ts`：导出 `applyHostRows(loader, feature, off: boolean, snapshot)`。关闭时记录该行施加前的 `disabled` 原值到 `snapshot.hostRows`，再 `loader.update(entry.id, { disabled: true })`；打开时按快照原值放回并删除快照项；每次 `update` 后 `await loader.await()`；条目缺失跳过
- [X] T018 [US1] 创建 `src/official-features/state.ts`：导出 `readFeatureStates(loader)`，本阶段先实现宿主行判定（存在、`disabled` 为假、fiber 为 ACTIVE 或 LOADING 计为启用），返回 `{ id, on }[]`；没有任何受管项存在时 `on` 为 `false`
- [X] T019 [US1] 创建 `src/official-features/index.ts`：导出 `name = 'official-features'` 与 `apply(ctx)`。`ctx.inject(['connection'], …)` 内用 `ctx.effect` 注册 `GET`、`POST` `OFFICIAL_FEATURES_PATH`，响应与错误码按 [contracts/official-features-api.md](./contracts/official-features-api.md)；POST 经 `createSerialQueue` 串行，先写记录后施加，施加失败回滚记录；等待真实状态与目标一致，最多 2 秒，超时返回 `202`
- [X] T020 [US1] 更新 `src/row-status.ts` 与 `src/index.ts`：`RowName` 增加 `officialFeatures`，`readRowStatus` 与 loader 缺失分支都回答该项；根行状态路由随之返回该项
- [X] T021 [P] [US1] 创建 `src/client/official-features.tsx`：导出 `installOfficialFeatures(ctx)` 与面板组件 `OfficialFeaturesPanel`。面板列出五个功能行，每行一个开关；切换调用 POST 并显示处理中，成功后以返回的 `features` 更新；失败显示错误文案并回到真实状态；通过 `ctx.slots.inject('plugins.row.config', …)` 注册，`key` 为 `dsh-plugin-practical-tool-bundle#official-features`，`locale: NS`
- [X] T022 [P] [US1] 更新 `src/client/locales.ts`：`zh` 与 `en` 同时增加面板标题、五个功能名（中文「自动化任务（schedule）」「目标（goal）」「任务清单（task）」「计划模式（plan）」「交付文件（present）」，英文 `Schedule`、`Goal`、`Task list`、`Plan mode`、`Present files`）、处理中、失败与重试文案；键名并入 `LocaleNamespaceMap`，两份键集一致
- [X] T023 [US1] 更新 `src/client/status.ts`：`ChunkKey` 增加 `officialFeatures`，`CHUNKS` 增加 `{ key: 'officialFeatures', install: installOfficialFeatures }`；`dsh.client.inject` 在 `package.json` 增加 `@deepseek-ai/dsh-client-ui-plugin-manager`（若槽位类型需要）
- [X] T024 [P] [US1] 更新 `locale/zh.json` 与 `locale/en.json`：`meta.description` 的行数与清单加入「管理官方功能」，保持两份 `meta` 键集一致，不含 U+200B 与 U+FEFF
- [X] T025 [US1] 更新 `tests/row-status.test.ts`、`tests/status-route.test.ts`、`tests/client-status.test.ts`、`tests/metadata.test.ts`、`tests/client-bundle.test.ts`：把「五行」断言改为包含 `officialFeatures` 的六行
- [X] T026 [US1] 运行 `pnpm format && pnpm check`，修复后 commit 本阶段

**Checkpoint**: 面板可用；关闭与恢复 `schedule` 的宿主行与界面行；US1 独立可演示。

---

## Phase 4: User Story 2 - 开关反映真实状态 (Priority: P1)

**Goal**: 开关始终等于功能当前真实状态，包括外部改动与配置重组之后。

**Independent Test**: 在 profile 里手工停用某行后打开面板，开关显示关闭；恢复后下一次刷新显示开启；触碰 profile 补丁触发重组后，被关闭的功能在 2 秒内重新关闭。

### Tests for User Story 2

- [X] T027 [P] [US2] 创建 `tests/official-features-state.test.ts`：宿主行启用、停用、fiber 非 ACTIVE 的组合；preset 声明的 `config.plugins` 含与不含受管模块（含嵌套于 `cordis:group` 内）；任一项启用即为开；全部关闭为关；Web 面本来停用的宿主行（`tool-todo`、`plan-mode`、`tool-goal`、`command-goal`）不影响结果；没有任何受管项存在为关；`minimal` 不含受管子行
- [X] T028 [P] [US2] 在 `tests/official-features-route.test.ts` 增加：外部把某受管行改回启用后，再次 GET 反映新状态；`busy` 在施加未完成时为 `true`
- [X] T029 [P] [US2] 创建 `tests/official-features-reapply.test.ts`：触发 `app-boot/config-reload` 后，对记录中的功能重新施加；本包自己的 `update` 不触发重复施加；重新施加失败时记录警告且不抛出

### Implementation for User Story 2

- [X] T030 [US2] 扩展 `src/official-features/state.ts`：枚举 `options.name === '@deepseek-ai/dsh-agent-preset'` 的全部条目，递归读取 `options.config.plugins`（含 `group: true` 子列表），按模块名判断受管子行是否仍在；`readFeatureStates` 汇总宿主行与 preset 子行，二者任一启用即为开
- [X] T031 [US2] 在 `src/official-features/index.ts` 用 `ctx.on('app-boot/config-reload', …)` 订阅重组事件，事件后对 `store.read()` 中的功能重新施加；施加期间置 `busy`，并经 `createSerialQueue` 与 POST 互斥；订阅随 fiber 释放
- [X] T032 [US2] 更新 `src/client/official-features.tsx`：面板打开时读取 GET，按 3 秒周期且页面可见时刷新，`visibilitychange` 与 `focus` 立即补一次；POST 后在 2 秒内每 300 毫秒重读，直到状态与目标一致或超时，期间显示处理中（FR-009b）
- [X] T033 [US2] 更新 `tests/client-official-features.test.tsx`：外部状态变化在下一次刷新后显示；POST 后重试到一致才结束处理中；超时后以真实状态显示并提示
- [X] T034 [US2] 运行 `pnpm format && pnpm check`，修复后 commit 本阶段

**Checkpoint**: 状态判定覆盖宿主行与 preset；重组后重新施加；面板刷新规则生效。

---

## Phase 5: User Story 3 - 一个开关管理多行 (Priority: P2)

**Goal**: 一个开关同时作用于宿主行、界面行与全部 preset 声明里的对应子行。

**Independent Test**: 关闭 `goal` 后，宿主三行停用，且所有 preset 声明（`standard`、`ptc`、`cordis` 与用户新建的）的 `config.plugins` 都不再含 `command-goal`、`tool-goal`；打开后全部恢复，`!!js` 表达式保持原样。

### Tests for User Story 3

- [X] T035 [P] [US3] 在 `tests/official-features-apply.test.ts` 增加 preset 用例：关闭时每个 preset 条目的 `config.plugins` 去掉受管模块，其余子行顺序与内容不变；`!!js` 表达式对象（`{ __jsExpr }`）原样保留；`planning` 组去掉 `plan-mode` 后若组内已空则整组移除；`minimal` 不含受管子行时不调用 `update`；用户新建 preset 同样被覆盖；打开时放回保存的原始 `config` 且深度相等
- [X] T036 [P] [US3] 在 `tests/official-features-apply.test.ts` 增加：同一 preset 声明内多个功能先后关闭再逐个打开，最终等于原始；已被外部移除的子行在撤销时不被重新加回；撤销期间 preset 被外部改动时，只撤销本包摘掉的子行，不覆盖其他修改

### Implementation for User Story 3

- [X] T037 [US3] 扩展 `src/official-features/apply.ts`：新增 `applyPresetRows(loader, feature, off, snapshot)`。枚举全部 preset 条目，`structuredClone` 其 `options.config`，递归移除 `presetModules` 命中的子行并清理变空的 `group`，再 `loader.update(entry.id, { config })`；关闭前把原始 `config` 存入 `snapshot.presets`；打开时先比较当前 `config`，只放回本包摘掉的子行（保持与原始相同的相对位置），而不整体覆盖
- [X] T038 [US3] 更新 `applyFeature` 入口：同时调用 `applyHostRows` 与 `applyPresetRows`，宿主行与 preset 行各自失败时汇总为一次 `apply-failed`，已成功的部分保持并在响应里列出未生效项
- [X] T039 [US3] 更新 `src/official-features/index.ts` 的施加路径使用 `applyFeature`；`tests/official-features-route.test.ts` 增加 preset 参与后的状态与错误码断言
- [X] T040 [US3] 运行 `pnpm format && pnpm check`，修复后 commit 本阶段

**Checkpoint**: 一个开关覆盖全部受管行；撤销不覆盖用户对 preset 的其他编辑。

---

## Phase 6: User Story 4 - 关闭本插件后配置全部失效 (Priority: P2)

**Goal**: 本行停用或卸载后，所有关闭动作撤销，功能回到宿主默认；重启后本行启用时按记录重新施加。

**Independent Test**: 关闭若干功能后停用本行，所有功能恢复；profile 与 preset 声明内容与关闭前一致；重新启用本行后按记录再次施加。

### Tests for User Story 4

- [X] T041 [P] [US4] 创建 `tests/official-features-lifecycle.test.ts`：行启用时按 `store.read()` 施加；行停用（fiber 释放）时撤销全部施加，宿主行回到快照原值，preset 回到原始 `config`；重新启用再次按记录施加；记录读取失败时按无记录运行并记录警告，不施加任何关闭；`close()` 在停用时被调用且域名可再次打开
- [X] T042 [P] [US4] 在 `tests/official-features-route.test.ts` 增加：记录损坏时 POST 返回 `409 store-failed`，GET 仍返回真实状态，原存储文件内容不变

### Implementation for User Story 4

- [X] T043 [US4] 更新 `src/official-features/index.ts`：`apply` 启动时 `openStore`，按记录施加；把「撤销全部施加并 `store.close()`」注册为 `ctx.effect` 的清理函数，保证 fiber 停用、HMR 替换与宿主关闭时都会执行；清理时只撤销快照中的项，保持记录不变
- [X] T044 [US4] 更新 `src/official-features/store.ts`：`open` 失败（`invalid-record`、`version-mismatch`、`backend-not-found` 等）时记录警告并返回只读空记录，`write` 在该状态下抛出 `store-failed`；不覆盖原文件
- [X] T045 [US4] 运行 `pnpm format && pnpm check`，修复后 commit 本阶段

**Checkpoint**: 停用即还原；重启后按记录重新施加；记录损坏时安全降级。

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 文档、打包回归、真机验证与交付。

- [X] T046 [P] 更新 `README.md`：功能清单加入「管理官方功能」，说明面板入口（Plugins 页本包的「管理官方功能」行页 → Configure）、五个功能与各自范围、关闭记录位置与停用即还原、路由表增加 `GET`/`POST /official-features`
- [X] T047 [P] 更新 `docs/how-it-works.md`：包结构表增加 `dist/official-features.mjs`；路由表增加新路由；新增「官方功能管理」小节，写施加、撤销、重组后重新施加与记录存放，引用 [research.md](./research.md) 不复述实测过程
- [X] T048 [P] 更新 `docs/known-risks.md`：运行期覆写属宿主内部契约；重组会冲掉施加；preset 撤销依赖保存的原始配置；存储域写入不在写入时校验；`zod` 实例是否与宿主同一份
- [X] T049 [P] 更新 `docs/i18n.md` 与 `docs/development.md`：新增文案的归属、文件地图增加 `src/official-features/`、`tsdown` 入口数量
- [X] T050 [P] 更新 `AGENTS.md` 首段与 `package.json` 的 `description`：由「五行」改为「六行」并加入「管理官方功能」；同步 `src/index.ts`、`src/row-status.ts`、`cordis.patch.yml` 内「五行」注释与 `tests/*.test.ts` 顶部注释
- [X] T051 [P] 在 `CHANGELOG.md` 与 `changelogs/` 增加本次条目，分支规则按宪章原则 III
- [X] T052 更新 `tests/package-pack.test.ts`：`REQUIRED` 加入 `dist/official-features.mjs`，顶部注释「六个」改为「七个」；确认 `src`、`tests`、`scripts` 仍不进包
- [X] T053 运行 `pnpm format && pnpm full-check`，确认 `pnpm check` 与 `pnpm build` 全部通过
- [X] T054 按 [quickstart.md](./quickstart.md) 在临时 profile 做真机验证：覆盖关闭、打开、外部状态、多行、默认停用行、重组、重启、本行停用、不写文件、记录损坏十个场景；同时核对 `zod` 在已安装插件中是否与宿主同一份实例，结果写回 [research.md](./research.md) R-008
- [X] T055 清理真机验证产生的临时 profile 与 `$DSH_HOME/storages/practical_tool_official_features.json`
- [X] T056 提醒用户：本变更依赖 `loader.update`、`agentPresets.inspectCompositions`、`app-boot/config-reload` 三项宿主内部契约，宿主版本变更后需重新实机验证（宪章原则 II）
- [X] T057 将各阶段提交压缩为一个 commit（`762c813`）；push 与 PR 由用户验收后的 `speckit-worktree-finish` 执行

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: 无依赖，首先执行。
- **Phase 2 Foundational**: 依赖 Phase 1；阻塞全部用户故事。
- **Phase 3 US1**: 依赖 Phase 2；是 MVP。
- **Phase 4 US2**: 依赖 US1 的路由与面板；扩展状态判定与刷新。
- **Phase 5 US3**: 依赖 US1 的施加入口与 US2 的状态判定。
- **Phase 6 US4**: 依赖 US1、US3 的施加与快照；US2 的重组订阅与其共用清理。
- **Phase 7 Polish**: 依赖全部用户故事完成。

### Within Each Phase

- 测试任务先写并确认失败，再写实现。
- `store.ts`、`loader.ts`、`queue.ts` 先于 `apply.ts`、`state.ts`、`index.ts`。
- `src/official-features/index.ts` 在 US1、US2、US3、US4 四个阶段依次扩展，同一文件任务不并行。

### Parallel Opportunities

- Phase 1：T002、T004、T005、T007 可并行；T001 先行，T003 随后，T006 依赖 T005。
- Phase 2：T009、T011、T013 与各自实现并行。
- US1：T014、T015、T016 三个测试文件并行；T021、T022、T024 并行。
- US2：T027、T028、T029 并行。
- US3：T035、T036 同一文件，顺序执行。
- Polish：T046 至 T051 并行。

---

## Parallel Example: User Story 1

```text
# 测试一起写：
Task: "T014 tests/official-features-apply.test.ts"
Task: "T015 tests/official-features-route.test.ts"
Task: "T016 tests/client-official-features.test.tsx"

# 界面与文案一起写：
Task: "T021 src/client/official-features.tsx"
Task: "T022 src/client/locales.ts"
Task: "T024 locale/zh.json、locale/en.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1 Setup 与 Phase 2 Foundational。
2. 完成 Phase 3 US1：面板可用，能停用与恢复宿主行与界面行。
3. 停下验证：在临时 profile 关闭 `schedule`，确认界面消失、配置文件不变。
4. 此时 preset 子行尚未处理，模型侧能力仍可用；这是已知的阶段性限制，由 US3 补齐。

### Incremental Delivery

1. Setup + Foundational 完成。
2. US1：宿主行与界面行可开关。
3. US2：状态反映真实情况，重组后重新施加。
4. US3：覆盖全部 preset，模型侧能力随之开关。
5. US4：停用即还原，重启后重新施加，记录损坏降级。
6. Polish：文档、打包回归、真机验证。

### Notes

- 每个阶段结束运行 `pnpm format && pnpm check`（宪章原则 IV）。
- 提交前确认全部跟踪文件不含本机路径（宪章原则 V）。
- 真机验证产生的临时 profile 与存储文件必须清理。

# Tasks: dsh使用工具组合包

**Input**: Design documents from `/specs/023-practical-tool-bundle/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md

**Tests**: 宪章原则 II 要求代码变更同步测试，故每个阶段都含测试任务。

**Organization**: 按用户故事分阶段，每个阶段对应一个 commit（交付前压缩为一个）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: 所属用户故事
- 描述包含准确文件路径

## Path Conventions

单包插件：`src/`、`tests/`、`assets/`、`locale/` 均在仓库根下。

## Phase 1: Setup（仓库标识与模板清理）

**目标**：把模板改成新插件仓库，移除模板示例，清空历史。

- [X] T001 改 `package.json`：name `dsh-plugin-practical-tool-bundle`、version `1.0.0`、description、keywords、license、packageManager，删除 demo 相关字段
- [X] T002 [P] 重写 `cordis.patch.yml`：根行与五个功能行（`session-sweeper`、`reasoning-reset`、`claude-skills`、`restart-button`、`mobile-touch-ui`）
- [X] T003 [P] 复制源插件图标到 `icon.svg`，删除 `src/client/demo-dock.tsx`、`src/client/config-page.tsx`、`src/client/config-form.ts`、`src/demo-tool.ts`、`src/events.ts`、`src/config.ts`、`src/constants.ts`
- [X] T004 [P] 重写 `locale/zh.json` 与 `locale/en.json`：标题「dsh使用工具组合包」/ `DSH Practical Tool Bundle` 与描述
- [X] T005 删除 `specs/` 下 22 个历史 spec 目录与 `changelogs/` 内容
- [X] T006 更新 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 为升级后的 dsh 子包版本（与 Phase 2 同一次提交）

## Phase 2: 依赖升级与构建骨架

**目标**：依赖对齐 0.2.2-rc.5，多入口构建可用。

- [X] T007 升级 `package.json` 全部 `@deepseek-ai/dsh-*` 到 `0.2.2-rc.5`，`@deepseek-ai/cordis` 保持 `~4.1.0`，新增 `yaml` 依赖；`devDependencies` 补齐 dsh-home-paths、dsh-llm、dsh-session、dsh-skill
- [X] T008 改 `tsdown.config.ts`：宿主构建用对象 entry（`index`、`sweeper`、`reasoning-reset`、`claude-skills`、`restart`、`mobile`），`alwaysBundle: ['yaml']`；前端 `CLIENT_ID` 改为新包名
- [X] T009 改 `package.json` 的 `exports` 与 `files`：六个宿主入口、`./client`、`./locale/*.json`、`assets/*`、`icon.svg`、`dsh.client.inject` 改为 `@deepseek-ai/dsh-client-ui-workspace` 与 `@deepseek-ai/dsh-client-locale`
- [X] T010 新增 `src/rows.ts`：行 id、路由常量 `/api/dsh-practical-tools`、loader 行 id 映射
- [X] T011 重写 `src/types.ts`：再导出宿主类型（Context、Agent、Session、Skill 相关）
- [X] T012 重写 `tests/dependency-versions.test.ts` 断言新版本；更新 `tests/package-pack.test.ts` 与 `tests/client-bundle.test.ts` 的产物清单与注册 id
- [X] T013 运行 `pnpm install`、`pnpm build`，确认六个入口与前端产物生成

## Phase 3: Foundational（根行与状态）

**目标**：根行状态路由可用，前端入口骨架就位。

- [X] T014 实现 `src/row-status.ts`：读 `ctx.get('loader')` 的 entries，按 `disabled` 与 fiber 状态（ACTIVE=2）判定，loader 不可用时返回 `null`
- [X] T015 实现 `src/index.ts`：注册 `GET /api/dsh-practical-tools/status`，导出 `apply`
- [X] T016 新增 `src/client/index.ts` 与 `src/client/locales.ts`：注册字典命名空间，导出 `apply`
- [X] T017 新增 `tests/row-status.test.ts`：行启用、禁用、fiber 非 ACTIVE、loader 缺失四种情况
- [X] T018 新增 `tests/status-route.test.ts`：路由注册与响应形状符合 contracts/http-api.md

## Phase 4: US1 - 模板转化为可安装插件

**目标**：文档与发布设置完成，安装后插件页显示新标题。

- [X] T019 [US1] 重写 `README.md`：五项功能、安装、无配置说明、路由
- [X] T020 [US1] 重写 `AGENTS.md`：删除模板说明与模板索引，保留开发流程与写作规范
- [X] T021 [P] [US1] 修订 `.specify/memory/constitution.md`：项目名、去掉模板定位相关表述、版本号递增并记录理由
- [X] T022 [P] [US1] 重写 `docs/how-it-works.md`、`docs/development.md`、`docs/known-risks.md`、`docs/template-conversion.md`（后者删除）
- [X] T023 [US1] 恢复 `.github/workflows/ci.yml` 的 publish 触发条件，删除 `if: false`
- [X] T024 [US1] 更新 `tests/metadata.test.ts` 的标题与描述断言
- [X] T025 [US1] 运行 `pnpm format && pnpm check`

## Phase 5: US2 - 在侧栏清理会话

**目标**：扫帚按钮与面板可用，悬停样式与重启按钮一致。

- [X] T026 [US2] 实现 `src/sweeper/index.ts`：`POST /api/dsh-practical-tools/sweep`，两阶段归档与删除，`keepIds` 跳过，Session store 持有则延后
- [X] T027 [US2] 实现 `src/client/sweeper.tsx`：扫帚图标、hover 用自身强调色 12% 混合、计数面板、两次点击确认、结果行
- [X] T028 [US2] 新增 `tests/sweeper.test.ts`：临时目录下归档与删除、非法 id 拒绝、keepIds 跳过、失败计数
- [X] T029 [US2] 新增 `tests/client-sweeper.test.ts`：悬停样式与重启按钮同结构（背景混合比例、尺寸、圆角）、两次点击、未就绪提示

## Phase 6: US3 - 从侧栏重启服务

**目标**：重启按钮、确认对话框、进度遮罩、重复请求拒绝。

- [X] T030 [US3] 实现 `src/restart/index.ts`：`GET /restart/info`、`POST /restart`，网页与桌面两种形态，重复请求 409
- [X] T031 [US3] 移植 `assets/launcher.cjs`：等待旧进程退出、按原 argv 启动新进程
- [X] T032 [US3] 实现 `src/client/restart.tsx`：按钮、确认对话框、遮罩、轮询代次与自动刷新
- [X] T033 [US3] 新增 `tests/restart.test.ts`：info 形状、首次受理、重复 409、失败 500
- [X] T034 [US3] 新增 `tests/client-restart.test.ts`：确认流程、取消不重启、轮询代次变化后刷新

## Phase 7: US4 - 自动清理不被接受的推理块

- [X] T035 [US4] 实现 `src/reasoning-reset/index.ts`：投影注册、两类 400 识别、记录与 `{ kind: 'retry' }`、每步一次
- [X] T036 [US4] 新增 `tests/reasoning-reset.test.ts`：两类失败识别、无关错误不触发、投影去推理块并丢 replayState、每步一次

## Phase 8: US5 - 使用项目内的 Claude 技能

- [X] T037 [US5] 移植 `src/claude-skills/provider.ts`：项目根查找、frontmatter 解析、目录与扁平扫描、监听刷新、只读
- [X] T038 [US5] 实现 `src/claude-skills/index.ts`：`ctx.skills.registerProvider` 与 `fs/observed` 监听
- [X] T039 [US5] 新增 `tests/claude-skills.test.ts`：项目根查找、frontmatter 与开关解析、无效技能跳过、rank 与 provider 名

## Phase 9: US6 - 手机端放大控件

- [X] T040 [US6] 移植 `assets/mobile.css`，保留 `__DRAWER_WIDTH__` 标记
- [X] T041 [US6] 实现 `src/mobile/index.ts`：`GET /api/dsh-practical-tools/mobile.css`，宽度替换为 328
- [X] T042 [US6] 实现 `src/client/mobile.ts`：本地 link、远程 fetch 注入 style、`data-dsh-mobile-css` 标记
- [X] T043 [US6] 新增 `tests/mobile.test.ts`：宽度替换、读取失败 500、CSS 头
- [X] T044 [US6] 新增 `tests/client-mobile.test.ts`：loopback 用 link、远程用 fetch、卸载移除

## Phase 10: US7 - 单独开关各项功能

- [X] T045 [US7] 实现 `src/client/status.ts`：状态轮询（3 秒、仅可见时）、子插件装卸、失败保留当前状态
- [X] T046 [US7] 接入 `src/client/index.ts`：按状态装卸扫帚、重启、手机三个块
- [X] T047 [US7] 新增 `tests/client-status.test.ts`：启用挂载、停用卸载、失败保留、页面隐藏时不轮询

## Phase 11: Polish & 交付

- [X] T048 更新 `tests/client-bundle.test.ts` 与 `tests/package-pack.test.ts`：六个入口、assets、图标进包；`src`/`tests`/`scripts` 不进包
- [X] T049 运行 `pnpm format && pnpm check && pnpm build`
- [X] T050 按 `quickstart.md` 在桌面宿主实机验证一轮（五项功能与行开关）
- [X] T051 调用 subagent 审查全部代码与文档，确认不含本机绝对路径、用户名、主机名、profile 名、密钥、个人邮箱与内网地址（发现提交身份邮箱、spec 本机 SSH 描述与私有插件名，已修复）
- [X] T052 修正审查发现的问题并重新审查
- [X] T053 把全部阶段提交压缩为一个 commit，使用公开提交身份，确认提交信息与内容不含本机信息后 push

## Dependencies

- Phase 1 → Phase 2 → Phase 3 必须依次完成。
- US1 依赖 Phase 3；US2、US3、US6 依赖 Phase 3；US4、US5 只依赖 Phase 3 的 `src/rows.ts` 与类型。
- US7 依赖 US2、US3、US6 的前端块。
- Polish 依赖全部用户故事。

## Parallel Execution Examples

- T002 与 T004 可同时改 `cordis.patch.yml` 与 `locale/*.json`。
- T035 与 T037 可并行：清理推理块与 Claude 技能互不依赖。
- T026、T030、T041 三个宿主行可并行实现。

## Implementation Strategy

1. 先完成 Phase 1–3，得到可构建、可加载的空壳。
2. 按 US2 → US3 → US6 → US4 → US5 → US7 顺序交付，每个阶段一个 commit。
3. 最后统一压缩为一个 commit 并做本机信息审查。

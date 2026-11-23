# Research: 移除飞书任务与调度会话

## R-001 删除基底

**Decision**: 依次 `git revert --no-commit` 撤销 `cc3c25d`、`abc173b`、`3456418`、`f989513`。

**Rationale**: 实测在 `HEAD=cc3c25d` 上，前三个提交撤销干净；`f989513` 报 4 处冲突。撤销能证明删除完整：撤销后全仓只剩已归档 changelog 命中该功能标识。

**Alternatives**: 逐文件删除无法证明无遗漏，需另做一轮全仓比对。仅删声明会留下源码、测试与依赖。

## R-002 冲突处理

**Decision**:

- `cordis.patch.yml`：取撤销结果。该文件在 `f989513` 之后只有 `24ec6cc` 改动，而改动位于待删预设内。
- `docs/how-it-works.md`：手工合并。保留 `eed7426`（#7 清理会话保护）与 `4ac5848`（#5 官方功能重新施加）写入的段落，删除本功能段落。
- `specs/025-remote-dispatch-session/contracts/presets.md`：撤销意图是删除，随后按 R-003 还原。
- `tests/presets-patch.test.ts`：删除。该文件随功能新增，只断言两个预设。

**Rationale**: 直接取文件旧版本会连带删除 `sweeper` 与 `official-features` 的后续文档，已验证。

## R-003 历史保留

**Decision**: 撤销后执行 `git checkout cc3c25d -- specs/ changelogs/ CHANGELOG.md`，`cc3c25d` 为撤销前的基点提交。

**Rationale**: 规格 D-002 要求保留三份规格与归档；D-008 要求 `Unreleased` 保持原样。撤销会删除 `specs/031`、`specs/032`、`specs/025` 与 `CHANGELOG.md` 的相关行，需要还原。

## R-004 依赖与锁文件

**Decision**: 从 `package.json` 删除 `dsh-plugin-meta-tools`，从 `pnpm-workspace.yaml` 删除对应排除项，运行 `pnpm install` 重生成 `pnpm-lock.yaml`。

**Rationale**: 全仓检索确认只有 `SA-调度会话` 预设与 `sa-worker` 的来源标记使用它。`yaml` 仍由 `claude-skills` 使用，保留。

## R-005 构建配置

**Decision**: `tsdown.config.ts` 删除 `lark-super-agent`、`sa-dispatch`、`sa-worker` 三个入口，注释「十个宿主入口」改为「七个宿主入口」。`dist/` 不跟踪，改动后重新 `pnpm build`。

**Rationale**: `package.json` 的 `main`、`exports` 引用 `dist/`；产物测试读取 `dist`。

## R-006 状态路由

**Decision**: `src/rows.ts` 删除 `SUPER_AGENT_STATUS_PATH`、`ROW_IDS.larkSuperAgent`、`RowName` 的成员与映射项；`src/row-status.ts` 删除该行的 `null` 兜底与 `at()` 项。

**Rationale**: 状态路由只回答现存行；前端不读该键，删除不影响界面装卸。

## R-007 测试面

**Decision**:

- 删除 `tests/lark-super-agent-*.test.ts`（7 个）、`tests/sa-dispatch.test.ts`、`tests/sa-worker.test.ts`、`tests/presets-patch.test.ts`。
- 删除 `tests/support/standard-preset.yml`：仅被 `presets-patch.test.ts` 读取。
- 更新 `tests/metadata.test.ts` 的行子路径、`tests/status-route.test.ts` 的两次期望、`tests/row-status.test.ts`、`tests/dist-freshness.test.ts`、`tests/support/dist-freshness.ts`、`tests/package-pack.test.ts` 的产物与行清单。

**Rationale**: 宪章原则 II 要求测试同步；期望值必须与新产物清单一致。

## R-008 文档面

**Decision**:

- `README.md`：删除「飞书任务与调度会话」一节、安装步骤中的 lark-bridge、配置与远程调度用法、两个预设、上报与注入、笔记与归档段落；路由表删除调度状态行；「七个小工具」改「六个」；删除对 `specs/025` 契约的引用。
- `AGENTS.md`：行清单改为六行，删除两个预设说明。
- `docs/how-it-works.md`：入口表、预设段落、路由表、状态路由计数与调度服务章节。
- `docs/known-risks.md`：删除 `lark-super-agent` 章节。
- `docs/development.md`：构建表、测试表、实机验证、文件地图与 `cordis.patch.yml` 注释。
- `locale/zh.json`、`locale/en.json`：描述只保留六行。
- `CHANGELOG.md`：按 P-001 决定。

**Rationale**: 宪章原则 III 要求用户可见变化同步 README 与元数据，机制变化同步归属文档。

## R-009 升级路径

**Decision**: 不做迁移代码。profile 由 bundle 补丁合成，删除声明即从既有 profile 消失。

**Rationale**: `~/.dsh/profiles/default/cordis.yml` 为空条目列表，行由补丁组合。

## R-010 版本

**Decision**: 见 P-003。

**Rationale**: `pnpm release` 执行 `npm version patch`，与 2.0.0 不一致，需要单独决定。
# Implementation Plan: 移除飞书任务与调度会话

**Branch**: `refactor/033-remove-lark-dispatch` | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/033-remove-lark-dispatch/spec.md`

**Status**: Approved

## Open Decisions

无。实施决策记录见 Clarifications。

## Clarifications

### Session 2026-11-23

- [P-001] Q: 宪章要求分支合入前增加 CHANGELOG 条目，D-008 要求 `Unreleased` 保持原样，执行哪一条？ -> A: 在 `Unreleased` 追加一条 `Removed`；D-008 记录随之修订，规格增加 FR-014。
- [P-002] Q: 删除影响宿主装载，是否做实机端到端验证？ -> A: 做。用打包产物在隔离 profile 验证。
- [P-003] Q: `2.0.0` 版本号在哪里写入？ -> A: 本分支不改 `package.json` 版本；发布时手动 `npm version major`。

## Review Record

- 2026-11-23 | Decision: Approved | Scope: current full document | Open items: none | Risks: 撤销冲突解错会误删其他功能文档；`pnpm release` 的 patch 自增与 `2.0.0` 不一致

## Summary

删除「飞书任务与调度会话」：撤销 4 个功能提交得到删除基底，手工合并 2 处内容冲突，还原三份规格与归档历史，清理依赖与残留引用，重建产物并做自动化与实机验证。删除后本包只剩根行与六行功能行。

## Technical Context

**Language/Version**: TypeScript 6，Node.js ≥ 24.9，pnpm 11

**Primary Dependencies**: `@deepseek-ai/*` 由宿主提供；本包 `yaml`（`claude-skills` 使用）；删除 `dsh-plugin-meta-tools`

**Storage**: 不涉及。用户调度工作区数据留在磁盘

**Testing**: vitest，`code` 与 `dist` 两个 project；`pnpm check`、`pnpm build`

**Target Platform**: DSH 宿主行与浏览器产物

**Project Type**: DSH 插件包

**Constraints**: 宪章五条原则；`dist/` 不跟踪；profile 由 bundle 补丁合成

**Scale/Scope**: 删除 3 个宿主入口、3 个 `rows/` 目录、11 个测试文件；修改 16 个共享文件

## Constitution Check

*GATE: 通过后再进入研究；设计完成后再核对一次。*

| 原则 | 结论 | 依据 |
| --- | --- | --- |
| I 宿主依赖版本 | 通过 | 不新增 `@deepseek-ai/*` 依赖；删除 `dsh-plugin-meta-tools` 不改变版本对齐要求 |
| II 测试同步 | 通过 | 删除功能测试，更新元数据、打包、状态路由与产物新鲜度期望；quickstart 覆盖实机验证 |
| III 文档结构 | 通过 | README、AGENTS.md、`docs/`、`locale/` 同步；`CHANGELOG.md` 追加一条 `Removed`（P-001） |
| IV 质量门禁 | 通过 | 每个阶段收尾运行 `pnpm format && pnpm check`；交付前运行 `pnpm build` |
| V 公开引用 | 通过 | 只保留仓库内相对路径；不引入本机路径 |

**设计后复核**: 通过。删除 `docs/development.md` 中对 `specs/025` quickstart 的验证指引后，文档不再把已删除功能描述为现行流程。

**Complexity Tracking**: 无偏离。`pnpm release` 的 `npm version patch` 与 `2.0.0` 的差异按 P-003 在发布时手工处理，属操作事项。

## Project Structure

### Documentation (this feature)

```text
specs/033-remove-lark-dispatch/
├── plan.md              # 本文件
├── research.md          # 删除基底、冲突、依赖与文档面
├── contracts/
│   └── status-route.md  # 状态路由回答的删除前后形状
├── quickstart.md        # 验证命令与实机步骤
└── tasks.md             # /speckit-tasks 产出
```

### Source (repository)

```text
删除
├── src/lark-super-agent/            # 10 个文件
├── src/sa-dispatch/                 # 4 个文件
├── src/sa-worker/                   # 5 个文件
├── rows/lark-super-agent/           # 图标与行元数据
├── rows/sa-dispatch/
├── rows/sa-worker/
├── tests/lark-super-agent-*.test.ts # 7 个
├── tests/sa-dispatch.test.ts
├── tests/sa-worker.test.ts
├── tests/presets-patch.test.ts
└── tests/support/standard-preset.yml

修改
├── cordis.patch.yml                 # 行与预设声明
├── package.json                     # description、keywords、exports、dependencies
├── pnpm-workspace.yaml              # meta-tools 排除项
├── pnpm-lock.yaml                   # pnpm install 重生成
├── tsdown.config.ts                 # 宿主入口
├── src/rows.ts                      # 路由常量与行名
├── src/row-status.ts                # 行状态映射
├── locale/en.json、locale/zh.json   # 插件描述
├── README.md
├── AGENTS.md
├── docs/how-it-works.md
├── docs/known-risks.md
├── docs/development.md
├── CHANGELOG.md                     # 追加 Removed
├── tests/metadata.test.ts
├── tests/status-route.test.ts
├── tests/row-status.test.ts
├── tests/dist-freshness.test.ts
├── tests/support/dist-freshness.ts
└── tests/package-pack.test.ts

还原
├── specs/025-remote-dispatch-session/
├── specs/031-worker-session-pin-archive/
├── specs/032-sa-user-presence/
└── changelogs/
```

## Implementation Order

每个阶段对应一个 commit，顺序如下。

1. **撤销功能提交**：`git revert --no-commit cc3c25d abc173b 3456418 f989513`。解 4 处冲突：
   - `cordis.patch.yml` 取撤销结果。
   - `docs/how-it-works.md` 手工合并，保留 `eed7426` 与 `4ac5848` 的段落。
   - `specs/025.../presets.md` 与 `tests/presets-patch.test.ts` 按删除处理。
   收尾：提交「refactor: 撤销飞书任务与调度会话功能」。
2. **还原历史并维护 CHANGELOG**：从撤销前的基点 `cc3c25d` 取回 `specs/`、`changelogs/` 与 `CHANGELOG.md`，在 `Unreleased` 追加 `Removed` 条目。收尾：提交文档变更。
3. **移除依赖**：删除 `package.json` 的 `dsh-plugin-meta-tools` 与 `pnpm-workspace.yaml` 的排除项，运行 `pnpm install`，核对锁文件只删除该包相关行。收尾：提交。
4. **清理残留与期望值**：全仓检索 `lark`、`飞书`、`sa-dispatch`、`sa-worker`、`meta-tools`，处理历史记录之外的命中；更新 6 个测试文件的期望值。收尾：提交。
5. **重建产物与验证**：`pnpm format && pnpm check && pnpm build`；按 quickstart 做隔离 profile 实机验证。收尾：提交。

## Verification

- `pnpm check`：类型、lint、`code` project。
- `pnpm build`：`tsdown`、类型声明与 `dist` project。
- 全仓检索残留，排除 `specs/`、`changelogs/` 与 `CHANGELOG.md`。
- 隔离 profile 安装产物：六行可见，两个预设与调度状态路由消失。

## Risks

- `docs/how-it-works.md` 冲突解错会连带删除 `sweeper` 与 `official-features` 的段落。缓解：阶段 1 后逐段核对本文件 diff。
- 撤销后的残留检索会把历史记录算作命中。缓解：按 SC-002 的排除范围判定。
- `pnpm install` 需要网络。失败时保留锁文件现状并在阶段 4 报告。
- `pnpm release` 执行 `npm version patch`，与 `2.0.0` 不一致。发布时先手动 `npm version major`，再按发布流程处理。
# Implementation Plan: 管理官方功能

**Branch**: `feat/024-official-feature-toggles` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-official-feature-toggles/spec.md`

**Status**: Approved

## Open Decisions

- 无。全部实现决策已确认。

## Clarifications

### Session 2026-11-21

- [P-001] Q: plan 是否包含 `ui-user-questions`？ -> A: 不包含。该行同时是 `ask_user_question` 的提问界面。规格 D-007 随之收窄，见规格 D-023。
- [P-002] Q: 关闭记录存在哪里？ -> A: 宿主存储域 `ctx.storageDomain`。`dsh-settings` 会通过 profile 补丁持久化，违反 FR-014，因此不用。规格 FR-014 随之更新，见规格 D-024。
- [P-003] Q: 面板注册到哪个槽位？ -> A: `plugins.row.config`，作为该行的独立配置页。
- [P-004] Q: 受管行被文件配置停用时，打开开关做什么？ -> A: 只撤销本包的施加，不强制开启。
- [P-006] Q: 存储域要求 zod schema，本包怎么提供？ -> A: 声明为 peer，锁定 `4.6.6`。
- [P-007] Q: 存储域文件被手工改坏时本行怎么办？ -> A: 按无记录运行，不覆盖原文件，记录警告；面板切换返回 `store-failed`。
- [P-005] Q: 面板里五个功能怎么命名？ -> A: 中文名加英文术语；自动化任务沿用 DSH 的说法 `schedule`。

## Review Record

- 2026-11-21 | Decision: Approved | Scope: current full document | Open items: 无 | Risks: 运行期覆写属宿主内部契约，升级可能变化；`zod` 实例与宿主是否同一份待真机验证；存储域写入不在写入时校验，实现须在写入前保证对象合法；撤销依赖内存中的原始 raw config，外部同时改动 preset 声明时会被覆盖

## Summary

本包新增第七个宿主行 `official-features`。它在运行期用 `loader.update` 停用官方功能对应的宿主行，并改写全部 preset 声明的 `config.plugins` 去掉对应子行。操作不写任何文件；关闭记录存在本包数据目录，行启用时据此施加，行停用时全部撤销。浏览器侧新增一个面板块，通过根行状态路由装卸，注册到 Plugins 页的行配置槽位。

技术路线已由实测确认：[research.md](./research.md)。

## Technical Context

**Language/Version**: TypeScript 6，Node 24.9 及以上，ESM

**Primary Dependencies**:

- 现有 peer：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-home-paths`、`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-session`、`@deepseek-ai/dsh-skill`。
- 新增 peer：`@deepseek-ai/dsh-storage-domain@0.2.2-rc.5` 与 `zod@4.6.6`，二者由宿主提供，保持 external。
- 新增开发依赖：`@deepseek-ai/dsh-storage@0.2.2-rc.5`（storage-domain 的类型依赖）与 `@deepseek-ai/dsh-client-ui-plugin-manager@0.2.2-rc.5`（槽位类型）。
- 三个 `@deepseek-ai/dsh-*` 新依赖都要列入 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`。

**Storage**: 宿主存储域 `practical_tool_official_features`，一个 `global` 单例，落在 `$DSH_HOME/storages/practical_tool_official_features.json`

**Testing**: vitest，模拟 `ctx` 见 `tests/helpers.ts`；真机验证用临时 profile

**Target Platform**: DSH Web 与 Desktop，Windows、macOS、Linux

**Project Type**: DSH 插件包，宿主半部加浏览器半部

**Performance Goals**: 切换到面板显示新状态不超过 2 秒；面板轮询周期 3 秒

**Constraints**: 不写 profile 与 preset 文件；不修改宿主安装内容；路由位于 `/api/dsh-practical-tools/` 下

**Scale/Scope**: 5 个功能，宿主行 9 个，每个 preset 声明至多 6 个子行；面板里的功能名见下表

### 面板功能名

| 功能 id | 中文 | 英文 |
| --- | --- | --- |
| `schedule` | 自动化任务（schedule） | Schedule |
| `goal` | 目标（goal） | Goal |
| `task` | 任务清单（task） | Task list |
| `plan` | 计划模式（plan） | Plan mode |
| `present` | 交付文件（present） | Present files |

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 检查 | 结果 |
| --- | --- | --- |
| I 宿主依赖版本 | 三个新增 `@deepseek-ai/dsh-*` 依赖锁定 `0.2.2-rc.5` 并列入 `minimumReleaseAgeExclude`；`zod` 锁定为宿主声明的 `4.6.6` | 通过 |
| II 测试同步 | 宿主行、状态推导、施加与撤销、路由、浏览器块、包内容各有测试；真机验证覆盖装载 | 通过 |
| III 文档结构 | README 写功能与路由；how-it-works 写机制；known-risks 写易失与内部契约；i18n 写新增文案；CHANGELOG 随提交维护 | 通过 |
| IV 质量门禁 | 每个阶段提交前运行 `pnpm format && pnpm check` | 通过 |
| V 公开引用 | 文档与代码不含本机路径；研究记录只写包名与宿主文档引用 | 通过 |

Phase 1 设计完成后复核：通过，见 [data-model.md](./data-model.md) 与 [contracts/official-features-api.md](./contracts/official-features-api.md)。

## Project Structure

### Documentation (this feature)

```text
specs/024-official-feature-toggles/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── official-features-api.md
└── tasks.md             # /speckit-tasks 生成
```

### Source Code (repository root)

```text
src/
├── official-features/
│   ├── index.ts         # 行入口：路由、施加、撤销
│   ├── catalog.ts       # 五个功能与受管行清单
│   ├── apply.ts         # 对 loader 的施加与撤销
│   ├── state.ts         # 由 loader 状态推导功能开关
│   └── store.ts         # 关闭记录：打开存储域并读写 global
├── client/
│   ├── official-features.tsx   # 面板块与注册
│   └── status.ts        # 新增一个块键
├── rows.ts              # 新增行 id 与路由常量
└── row-status.ts        # 新增 officialFeatures 一项

tests/
├── official-features.test.ts
├── official-features-state.test.ts
├── client-official-features.test.tsx
└── (既有测试同步更新)

locale/                  # 标题与描述更新
cordis.patch.yml         # 新增行声明
package.json             # exports、files、peerDependencies、dsh.client.inject、开发依赖
pnpm-workspace.yaml      # 三个新依赖列入 minimumReleaseAgeExclude
tsdown.config.ts         # 新增宿主入口
```

**Structure Decision**: 新行与既有五行同构，放在 `src/official-features/`；浏览器块沿用状态路由装卸机制，不新增前端产物。

## Complexity Tracking

无违反项。

# Implementation Plan: 官方功能关闭跨重启生效

**Branch**: `fix/028-official-features-restart` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-official-features-restart/spec.md`

**Status**: Waived

## Open Decisions

- [x] [D-001] 重新施加的触发点与次数 -> 启动一次 + `appReady.onReady` 一次，各 8 轮 | Depends on: none | Status: answered
- [x] [D-002] 未生效时面板是否提示 -> 不提示，保持真实状态 | Depends on: none | Status: skipped
- [x] [D-003] 失败是否写日志 -> 写 warn | Depends on: none | Status: answered
- [x] [D-004] 开关显示依据 -> 保持受管行真实状态 | Depends on: none | Status: skipped
- [x] [D-005] appReady 缺失时的行为 -> 只做启动那一次 | Depends on: D-001 | Status: answered
- [x] [D-006] warn 的记录位置 -> 服务内注入 logger，`reapply` 用尽轮数且未达成时写一条 | Depends on: D-003 | Status: answered
- [x] [D-007] 文档归属 -> 机制写 `docs/how-it-works.md`，风险写 `docs/known-risks.md` | Depends on: none | Status: answered

## Clarifications

### Session 2026-11-22

- [D-001] Q: 重启后怎么重新施加？ -> A: 启动时施加一次，`onReady` 后一次；`onReady` 缺失就不处理；两次均重试 8 次。
- [D-002] Q: 未生效时面板是否提示？ -> A: 用户跳过，不做。
- [D-003] Q: 失败是否写日志？ -> A: 写 warn。
- [D-004] Q: 开关显示依据是否改变？ -> A: 用户跳过，保持现状。
- [D-005] Q: `appReady` 缺失时？ -> A: 只做启动那一次施加，不报错。
- [D-006] Q: warn 由谁写？ -> A: 服务依赖注入 `warn` 回调，行接线时传入 `ctx.logger.warn`。
- [D-007] Q: 文档写哪里？ -> A: 机制进 `docs/how-it-works.md` 的官方功能一节，风险进 `docs/known-risks.md`。

## Review Record

- 2026-11-22 | Decision: Waived | Scope: current full document | Open items: 无 | Risks: 仅修施加时机，不新增面板提示；依赖宿主 `appReady` 服务，宿主未提供时只保留启动那一次

## Summary

关闭记录本身跨重启保留，缺陷在启动期：首次重新施加的 2 秒窗口在宿主装载完成前用完，之后没有补偿动作。修复是在启动完成信号 `appReady.onReady` 之后再施加一次，两次各重试 8 轮；宿主不提供该服务时只保留启动那一次。施加彻底失败时写一条 warn。

## Technical Context

**Language/Version**: TypeScript ESM，Node.js 24，tsdown 构建

**Primary Dependencies**: `@deepseek-ai/cordis` 插件运行时、`@deepseek-ai/dsh-storage-domain` 记录存储、宿主 loader（`entries`/`update`/`await`）

**Storage**: 宿主存储域 `practical_tool_official_features` 的 global 单例，落在 `$DSH_HOME/storages/*.json`

**Testing**: vitest 单元测试（`tests/helpers.ts` 的模拟 ctx）；真实宿主端到端按 `.dsh/skills/real-device-test`

**Target Platform**: DSH `0.2.2-rc.5`，Web 与桌面宿主

**Project Type**: DSH 插件（本包内一行 `official-features`）

**Performance Goals**: 每次施加最多 8 轮 × 250 毫秒；启动完成后 30 秒内状态与记录一致

**Constraints**: 不写 profile 配置与 preset 文件；`ctx.inject` 只接受必填服务，`appReady` 必须用 `ctx.get` 软读取

**Scale/Scope**: 五个功能、约 10 条受管宿主行、全部 preset 声明

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 结论 | 说明 |
| --- | --- | --- |
| I. 宿主依赖版本 | 通过 | 不改 `@deepseek-ai/*` 版本，继续用 `0.2.2-rc.5` |
| II. 测试同步 | 通过 | 新增 `appReady` 接线与 warn 的单元测试，并在真实宿主重启验证 |
| III. 文档结构 | 通过 | 机制写 `docs/how-it-works.md`，风险写 `docs/known-risks.md`，CHANGELOG 加条目 |
| IV. 质量门禁 | 通过 | 变更后运行 `pnpm format && pnpm check` |
| V. 公开引用 | 通过 | 规格与文档只用仓库内路径与占位符 |

## Project Structure

### Documentation (this feature)

```text
specs/028-official-features-restart/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code

```text
src/official-features/index.ts      # 行接线：启动施加 + appReady 补施加 + warn 注入
src/official-features/apply.ts      # 施加与撤销，不改
tests/official-features-lifecycle.test.ts  # 行接线的 appReady 行为
tests/official-features-reapply.test.ts    # 用尽轮数时的 warn
docs/how-it-works.md                # 官方功能管理机制
docs/known-risks.md                 # appReady 依赖与启动期风险
CHANGELOG.md
```

## 实现步骤

1. `src/official-features/index.ts`
   - 新增 `AppReadyLike` 与 `readAppReady(ctx)`：`ctx.get('appReady')`，带 `onReady` 函数才算可用。
   - `createFeatureService` 增加可选 `warn` 依赖；`reapply` 用尽轮数且 `appliedOff` 为假时调用 `warn`，内容含未达成的功能 id。
   - 行接线：注册路由与 `config-reload` 后，先注册 `appReady.onReady(() => void created.reapply())`，再 `await created.reapply()`；`appReady` 缺失时跳过注册。
   - 两个订阅都进 `offs`，随 effect 释放。
2. 测试
   - 行接线：`appReady` 存在时 `store.read` 被调用两次；缺失时只调用一次；清理时调用取消函数。
   - 服务：`update` 一直被拒、轮数用尽时 `warn` 收到一条含功能 id 的记录。
3. 文档与变更记录
   - `docs/how-it-works.md`：补充启动完成信号后补施加一次。
   - `docs/known-risks.md`：补充 `appReady` 为宿主可选服务。
   - `CHANGELOG.md`：加一条修复条目。
4. 验证
   - `pnpm format && pnpm check`。
   - 真实宿主：写入五项关闭记录，连续 3 次启动，确认启动后五项保持关闭；再跑一次受管行晚出现的场景。

## Complexity Tracking

不适用：无跨原则偏离。

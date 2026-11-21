# Implementation Plan: 清理会话的保护范围

**Branch**: `fix/029-open-session-protection` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/029-open-session-protection/spec.md`

**Status**: Approved

## Open Decisions

无。全部实现决策已确认。

## Clarifications

### Session 2026-11-22

- [P-001] Q: 保护集合读取哪些视图持有来源？ -> A: mainView、sidebarChat、sidebarView 三种视图来源，忽略临时引用。
- [P-002] Q: 祖先链在哪一侧解析？ -> A: 客户端按 parentId 上溯，宿主只接 keepIds。
- [P-003] Q: 宿主删除阶段是否增加请求开始时的内存会话保护？ -> A: 增加。
- [P-004] Q: 修复前是否在一次性 profile 复现？ -> A: 是，先复现普通会话与 subagent 两种触发。
- [P-005] Q: 是否做端到端验证？ -> A: 是。

## Review Record

- 2026-11-22 | Decision: Approved | Scope: current full document | Open items: none | Risks: 跨客户端打开状态不保护；视图信息不可用时继续清理

## Summary

清理会话的两阶段流程保持不变：先归档未置顶会话，再删除已归档会话的日志。变更集中在保护集合的构造与宿主删除前的校验。

- 前端从会话存储的 `byId` 读取全部会话行，收集被任意内容视图持有的会话，并沿 `parentId` 收集全部祖先。
- 前端把保护集合作为 `keepIds` 发送，同时用同一集合扣除面板的未置顶计数。
- 宿主在归档前记录仍在内存的会话，删除阶段把这些会话当作延后处理，避免同一请求内先归档、再因前端释放而删除。
- 结果行「跳过 {n} 个打开中的会话」沿用，受保护会话计入其中。

## Technical Context

**Language/Version**: TypeScript 6，React 18 前端，Node.js 24

**Primary Dependencies**: `@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-ui-workspace`、`@deepseek-ai/dsh-session`、`@deepseek-ai/dsh-home-paths`；不新增依赖

**Storage**: 会话日志位于 `<DSH home>/sessions/<目录键>/<会话 id>`，由宿主写入

**Testing**: vitest（`code` 与 `dist` 两个 project）、`tests/helpers.ts` 的模拟 ctx、一次性 profile 的实机验证

**Target Platform**: DSH 0.2.2-rc.5 宿主与 Web 前端

**Project Type**: DSH 插件包，宿主行与前端行同一仓库

**Performance Goals**: 单次清理的保护集合计算在毫秒级完成；会话数量以千计

**Constraints**: 宿主路由只接收 `ids` 与 `keepIds`；前端持有信息来源限于 `sessions.list` 快照

**Scale/Scope**: 单个 profile 的会话数量与祖先链深度都很小，递归上溯有环保护

## Constitution Check

| 原则 | 结论 | 说明 |
| --- | --- | --- |
| I 宿主依赖版本 | 通过 | 不新增或变更 `@deepseek-ai/*` 依赖 |
| II 测试同步 | 通过 | 更新客户端与宿主测试；在一次性 profile 做真实宿主验证 |
| III 文档结构 | 通过 | 机制写入 `docs/how-it-works.md`，风险写入 `docs/known-risks.md`；用户可见文案不变 |
| IV 质量门禁 | 通过 | 交付前运行 `pnpm format && pnpm check` |
| V 公开引用 | 通过 | 文档与规格只用占位符路径与仓库内路径 |

## Project Structure

### Documentation (this feature)

```text
specs/029-open-session-protection/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── spec.md
```

### Source Code (repository root)

```text
src/
├── client/
│   ├── sweeper.tsx        # 清理面板、保护集合与计数
│   └── status.ts          # 行开关，按状态装卸界面块
└── sweeper/
    └── index.ts           # 清理路由：归档与删除两阶段

tests/
├── client-sweeper.test.ts # 前端保护集合、计数与请求体
├── sweeper.test.ts        # 宿主归档、删除、keepIds 与延后删除
└── dist-freshness.test.ts # 产物与源码一致

docs/
├── how-it-works.md        # 清理机制
└── known-risks.md         # 跨客户端与失败策略
```

**Structure Decision**: 单包结构，前端逻辑在 `src/client/sweeper.tsx`，宿主逻辑在 `src/sweeper/index.ts`，测试按前端与宿主分文件。

## Complexity Tracking

无违规项。

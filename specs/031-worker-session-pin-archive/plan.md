# Implementation Plan: 调度会话置顶与归档工作会话

**Branch**: `feat/031-worker-session-pin-archive` | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/031-worker-session-pin-archive/spec.md`

**Status**: Approved

## Open Decisions

无。全部实现决策已确认，记录见 Clarifications。

## Clarifications

### Session 2026-11-23

- [D-101] Q: 置顶与归档规则放在调度提示词的哪里？ -> A: 新增独立小节 `## Maintain the session list`，放在 `## Dispatch work` 之后。
- [D-102] Q: 任务完成时，归档会话与标记完成谁先执行？ -> A: 先收集会话 id，再 `task_update` 标记完成，最后归档会话。
- [D-103] Q: 提示词如何引用置顶与归档能力？ -> A: 写明工具名与参数，并明确复用会话不置顶。
- [D-104] Q: 本次交付的验证范围？ -> A: 提供手动验收步骤，不在本次触发真实调度任务。

## Review Record

- 2026-11-23 | Decision: Approved | Scope: current full document | Open items: none | Risks: 真实模型遵循度、共用会话检查竞态、stop_activity 终止收尾工作、任务会话记录不完整。

## Summary

只改 `SA-调度会话` 的提示词，新增会话列表维护规则：新建工作会话后立即置顶；任务完成后按任务记录归档工作会话。置顶与归档使用预设内已启用的 meta-tools `session_pin` 与 `session_archive`。同步更新提示词测试、行元数据、README、机制文档、已知风险与变更日志。

## Technical Context

**Language/Version**: TypeScript 6.0，Node.js 24.9+

**Primary Dependencies**: `@deepseek-ai/dsh-tools` 0.2.2-rc.5，`dsh-plugin-meta-tools` 0.1.7 的 `session_pin` 与 `session_archive`

**Storage**: 调度工作区 `message-task-status.json`；会话置顶与归档集合由宿主 `workspaceRegistry` 持久化

**Testing**: vitest；`pnpm check` 覆盖类型检查、lint 与源码测试，`pnpm build` 覆盖产物测试

**Target Platform**: DSH 插件，桌面与 Web 宿主

**Project Type**: 单仓库插件包

**Performance Goals**: 不适用；只改提示词与文档

**Constraints**: 置顶与归档由调度会话按提示词执行；不新增会话状态管理代码；不改预设组成与依赖版本

**Scale/Scope**: 一个提示词文件、一个测试文件、两处行元数据、三份文档与一份变更日志

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. 宿主依赖版本**: 通过。不新增 `@deepseek-ai/*` 依赖；`dsh-plugin-meta-tools` 保持 0.1.7；宿主与依赖同为 0.2.2-rc.5。
- **II. 测试同步**: 通过。`tests/sa-dispatch.test.ts` 增加提示词规则断言；`pnpm build` 重新生成产物并由 `test:dist` 校验。
- **III. 文档结构**: 通过。用户可见行为写入 README 与行元数据，机制写入 `docs/how-it-works.md`，风险写入 `docs/known-risks.md`，变更写入 `changelogs/CHANGE.1.1.0.md`。
- **IV. 质量门禁**: 通过。变更后运行 `pnpm format && pnpm check`；合并前通过 `pnpm check`。
- **V. 公开引用**: 通过。新增内容只使用仓库内相对路径与公网 URL。

设计完成后的复核：以上五项仍通过，无新增依赖、存储或接口。

## Project Structure

### Documentation (this feature)

```text
specs/031-worker-session-pin-archive/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── dispatch-prompt.md
└── tasks.md
```

### Source Code (repository root)

```text
src/sa-dispatch/
├── prompt.ts            # 新增 ## Maintain the session list 小节
├── tools.ts             # 不变
└── index.ts             # 不变

tests/
└── sa-dispatch.test.ts  # 新增提示词规则断言

rows/sa-dispatch/locale/
├── zh.json              # 行简介加入置顶与归档
└── en.json

README.md                # 功能简介与远程调度用法
docs/how-it-works.md     # 调度提示词规则
docs/known-risks.md      # 提示词执行依赖模型
changelogs/CHANGE.1.1.0.md
```

**Structure Decision**: 沿用单包结构。实现面只有调度提示词，配套测试、元数据与文档。

## Implementation Approach

### 1. 提示词

在 `src/sa-dispatch/prompt.ts` 的 `## Dispatch work` 之后新增 `## Maintain the session list`，内容包括：

- 新建会话先 `session_pin`，再发任务要求。
- 复用会话保持原置顶状态。
- 置顶失败告知用户并继续派发。
- 任务完成先取得会话 id，再 `task_update`，最后 `session_archive`。
- 归档前读 `message-task-status.json`，跳过仍被未完成任务引用的会话。
- 归档带 `stop_activity: true`；归档会移除置顶。
- 归档失败在同一轮回复说明，任务保持完成，其余会话继续归档。
- 只归档任务记录的工作会话。

规则与工具契约见 [contracts/dispatch-prompt.md](./contracts/dispatch-prompt.md)。

### 2. 测试

在 `tests/sa-dispatch.test.ts` 现有的提示词断言之外新增：

- 小节标题与规则顺序。
- `session_pin`、`session_archive`、`stop_activity`。
- 复用不置顶。
- 置顶与归档失败的报告规则。
- 先取得会话 id 再标记完成。

### 3. 元数据与文档

| 文件 | 更新 |
| --- | --- |
| `rows/sa-dispatch/locale/zh.json` | 简介加入新会话置顶与完成归档 |
| `rows/sa-dispatch/locale/en.json` | 同步英文简介 |
| `README.md` | 功能简介补一句；远程调度用法第 2、4 步写明置顶与归档 |
| `docs/how-it-works.md` | 调度提示词规则增加置顶与归档两条 |
| `docs/known-risks.md` | 在 lark-super-agent 下记录提示词遵循度风险 |
| `changelogs/CHANGE.1.1.0.md` | 在 Unreleased 的 Changed 下记录提示词变化 |

## Verification

1. `pnpm format && pnpm check` 通过。
2. `pnpm build` 通过，`dist/sa-dispatch.mjs` 包含新规则。
3. 单元测试覆盖 [contracts/dispatch-prompt.md](./contracts/dispatch-prompt.md) 的验收断言。
4. 手动验收按 [quickstart.md](./quickstart.md) 执行，由用户在真实调度会话确认。

## Risks & Mitigations

| 风险 | 处理 |
| --- | --- |
| 真实模型未遵循提示词 | 写明工具名与参数；记入 `docs/known-risks.md`；手动验收覆盖 |
| 共用会话检查与归档之间的竞态 | 检查后立即归档；竞态窗口记入 quickstart 已知限制 |
| `stop_activity` 终止收尾中的工作 | 任务完成发生在最终上报之后；归档前会话通常空闲 |
| 任务未记录全部会话 id | 现有提示词要求记录每个使用过的会话；未记录时归档遗漏记入风险 |

## Complexity Tracking

无偏离。
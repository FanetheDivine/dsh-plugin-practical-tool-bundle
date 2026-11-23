# Implementation Plan: SA 会话区分远程消息与本机消息

**Branch**: `feat/032-sa-user-presence` | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/032-sa-user-presence/spec.md`

**Status**: Approved

## Open Decisions

无。全部实现决策已确认，记录见 Clarifications。

## Clarifications

### Session 2026-11-23

- [P-001] Q: 调度消息的来源标记由谁加？ -> A: 程序自动包装。`sa-worker` 子行监听 `agent/pre-step`，包装 `source.kind === 'dsh-plugin-meta-tools'` 的消息。
- [P-002] Q: 标记块采用什么形式？ -> A: `<dispatch_session_message>`，无属性；正文中的闭标签转义；已包装的消息不重复包装。
- [P-003] Q: 工作会话本机模式下的上报怎样注明用户在电脑前？ -> A: 提示词要求 `send_report` 的 `text` 首行写 `用户在电脑前`，不改工具参数与上报块格式。
- [P-004] Q: 验证范围？ -> A: 单元测试加 `real-device-test` 实机验证。
- [P-005] Q: `SA-调度会话` 除提示词外是否加程序兜底？ -> A: 加。`sa-dispatch` 子行监听 `agent/pre-step`，在用户状态切换时插入系统提醒，写明用户当前在电脑前还是已回到远程。

## Review Record

- 2026-11-23 | Decision: Approved | Scope: current full document | Open items: none | Risks: 模型忽略提醒、GUI 显示标记、其他插件以 `user` 来源注入、宿主升级改变来源标识或 `agent/pre-step`

## Summary

两个会话各按收到的消息判断用户在电脑前还是远程。入站消息的来源由程序识别：调度会话按 `source.kind` 区分本机消息（`user`）、飞书消息（`lark-bridge`）与工作会话消息（`lark-super-agent`），在状态切换时插入系统提醒；工作会话由 `sa-worker` 子行把 meta-tools 投递的消息包进 `<dispatch_session_message>`，解决首条任务与本机输入同为普通文本的问题。两份提示词按「远程」与「在电脑前」两种状态选择回复渠道。调研见 [research.md](./research.md)。

## Technical Context

**Language/Version**: TypeScript 6.0，Node.js 24.9+

**Primary Dependencies**: `@deepseek-ai/dsh-llm` 0.2.2-rc.5 的 `freezeMessage` 与 `createUserMessage`；`agent/pre-step` 事件来自宿主 0.2.2-rc.5；`dsh-plugin-meta-tools` 0.1.7 的来源标识 `dsh-plugin-meta-tools`

**Storage**: 无新增

**Testing**: vitest；`pnpm check` 覆盖类型检查、lint 与源码测试，`pnpm build` 覆盖产物测试；`real-device-test` 实机验证

**Target Platform**: DSH 插件，桌面与 Web 宿主

**Project Type**: 单仓库插件包

**Performance Goals**: 不适用；包装只遍历本步消息

**Constraints**: 回复渠道由模型按提示词与系统提醒执行；不改预设组成、工具参数与依赖版本

**Scale/Scope**: `sa-dispatch` 与 `sa-worker` 各新增一个模块与一个 `agent/pre-step` 监听；两份提示词；两个测试文件；行元数据、README、两份文档与变更日志

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. 宿主依赖版本**: 通过。`freezeMessage` 来自已声明的 `@deepseek-ai/dsh-llm` 0.2.2-rc.5，不新增依赖。
- **II. 测试同步**: 通过。`tests/sa-dispatch.test.ts` 覆盖状态提醒逻辑与提示词；`tests/sa-worker.test.ts` 覆盖包装逻辑与提示词；改动涉及真实对话链路，按 P-004 执行实机验证。
- **III. 文档结构**: 通过。用户可见行为写入 README 与 `rows/*/locale`；机制写入 `docs/how-it-works.md`；风险写入 `docs/known-risks.md`；变更写入 `CHANGELOG.md`。新增文件带职责注释。
- **IV. 质量门禁**: 通过。变更后运行 `pnpm format && pnpm check`。
- **V. 公开引用**: 通过。新增内容只使用仓库内相对路径。

设计完成后的复核：以上五项仍通过。

## Project Structure

### Documentation (this feature)

```text
specs/032-sa-user-presence/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── dispatch-session-message.md
│   ├── dispatch-presence.md
│   └── prompts.md
└── tasks.md
```

### Source Code (repository root)

```text
src/sa-dispatch/
├── presence.ts           # 新增：按来源判定并插入状态提醒
├── index.ts              # 注册 agent/pre-step 监听
└── prompt.ts             # 新增 ## Track where the user is，调整转达渠道

src/sa-worker/
├── dispatch-message.ts   # 新增：包装 meta-tools 来源消息
├── host.ts               # 新增：再出口 freezeMessage，供测试替换
├── index.ts              # 注册 agent/pre-step 监听
└── prompt.ts             # 远程模式与本机模式

tests/
├── sa-dispatch.test.ts   # 状态提醒逻辑、监听注册与提示词断言
└── sa-worker.test.ts     # 包装逻辑、监听注册与提示词断言

rows/sa-worker/locale/{zh,en}.json
rows/sa-dispatch/locale/{zh,en}.json
README.md
docs/how-it-works.md
docs/known-risks.md
CHANGELOG.md
```

**Structure Decision**: 沿用单包结构。包装逻辑独立成 `src/sa-worker/dispatch-message.ts`，便于单测。

## Implementation Approach

### 1. 来源识别

宿主消息的 `source.kind` 决定来源：

| `source.kind` | 来源 |
| --- | --- |
| `user` | 用户在 Web GUI 直接输入 |
| `lark-bridge` | 飞书消息与桥接提醒 |
| `lark-super-agent` | 工作会话上报与失败通知 |
| `dsh-plugin-meta-tools` | 调度会话发给工作会话的消息 |
| 其他 | 宿主与插件的上下文注入，例如 `time-context`、`runtime-context`、`skill-catalog` |

### 2. 调度会话的状态提醒

- `presence.ts` 导出 `presenceReminder(messages, previous)`：返回本批判定结果与需要插入的提醒文本。
- `index.ts` 在 `ctx.inject` 回调中注册 `agent/pre-step`：先 `await next()`，`reject` 原样返回，否则按 [contracts/dispatch-presence.md](./contracts/dispatch-presence.md) 插入提醒。
- 状态存在以会话对象为键的 `WeakMap` 中。没有记录时视为首次，插入提醒并记录。

### 3. 工作会话的来源标记

- `dispatch-message.ts` 导出纯函数 `wrapDispatchMessages(messages)`，按 [contracts/dispatch-session-message.md](./contracts/dispatch-session-message.md) 包装。
- `index.ts` 在 `ctx.inject` 回调中注册 `agent/pre-step`：先 `await next()`，`reject` 原样返回，否则替换 `messages`。
- 无需包装时返回原决策对象。

### 4. 提示词

按 [contracts/prompts.md](./contracts/prompts.md) 修改：

- `SA_DISPATCH_PROMPT` 新增 `## Track where the user is`，并让 `## Handle worker communication` 按状态选择渠道。
- `SA_WORKER_PROMPT` 改为远程模式与本机模式两部分。

### 5. 测试

| 文件 | 覆盖 |
| --- | --- |
| `tests/sa-dispatch.test.ts` | 状态提醒契约的验收断言；`agent/pre-step` 监听注册；提示词状态规则与渠道 |
| `tests/sa-worker.test.ts` | 包装契约验收断言 1–6；`agent/pre-step` 监听注册；提示词两种模式；原有远程规则断言改为远程模式下成立 |

### 6. 元数据与文档

| 文件 | 更新 |
| --- | --- |
| `rows/sa-dispatch/locale/zh.json`、`en.json` | 简介加入本机消息改为正文回复 |
| `rows/sa-worker/locale/zh.json`、`en.json` | 简介加入调度消息标记与本机直接对话 |
| `README.md` | 功能简介补一句；远程调度用法补本机介入说明 |
| `docs/how-it-works.md` | 调度服务与预设叠加：两种状态规则、`<dispatch_session_message>` 包装与状态提醒 |
| `docs/known-risks.md` | 状态切换依赖模型遵守提醒；包装改变工作会话 GUI 显示；来源标识依赖宿主 |
| `CHANGELOG.md` | Unreleased 的 Changed 记录两项提示词变化与来源标记 |

## Verification

1. `pnpm format && pnpm check` 通过。
2. `pnpm build` 通过，`dist/sa-dispatch.mjs` 与 `dist/sa-worker.mjs` 包含新逻辑与提示词。
3. 用 `real-device-test` 按 [quickstart.md](./quickstart.md) 场景 1–8 实机验证。

## Risks & Mitigations

| 风险 | 处理 |
| --- | --- |
| 模型忽略状态提醒 | 提示词写明两种状态的渠道；提醒写明当前状态；实机覆盖切换场景 |
| 状态提醒只在切换时出现，模型可能按旧状态回复 | 首次进入会话也插入提醒；提醒写明当前状态，无需模型回溯历史 |
| 会话恢复或压缩后状态丢失 | 提醒只依赖 `WeakMap`，丢失时下一次提醒重建；重复提醒不影响正确性 |
| 替换消息与收件箱认领不一致 | 保留原 `id`；实机确认 GUI 无重复消息 |
| 来源标识依赖宿主与插件版本 | 单测固定来源值；记入已知风险 |
| 其他会话经 meta-tools 向工作会话发消息也被标为调度消息 | meta-tools 只在 `SA-调度会话` 内启用；记入已知风险 |

## Complexity Tracking

无偏离。

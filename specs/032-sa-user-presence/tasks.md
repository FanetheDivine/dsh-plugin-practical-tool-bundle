# Tasks: SA 会话区分远程消息与本机消息

**Input**: Design documents from `specs/032-sa-user-presence/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md

**Tests**: 计划已要求单元测试与 `real-device-test` 实机验证。

**Organization**: 按用户故事分组。US1 是调度会话的状态提醒与回复渠道，US2 是工作会话的来源标记与本机对话。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 不同文件、无未完成依赖，可并行
- **[Story]**: US1、US2；Setup、Foundational、Polish 阶段不带标签

## Phase 1: Setup

无。沿用现有插件包结构与依赖。

## Phase 2: Foundational

无。两个故事分别落在 `sa-dispatch` 与 `sa-worker` 子行，互不依赖。

## Phase 3: User Story 1 - 调度会话识别用户回到电脑前 (P1)

**Goal**: 调度会话按消息来源判断用户状态，切换时插入系统提醒；在电脑前时正文回复与转达，远程时经 `lark_notify`。

**Independent Test**: 单元测试覆盖 [contracts/dispatch-presence.md](./contracts/dispatch-presence.md) 验收断言 1–6 与提示词规则；实机执行 quickstart 场景 1–3、8。

- [x] T001 [US1] 在 `src/sa-dispatch/presence.ts` 实现 `presenceReminder(messages, previous)`：按 `source.kind` 判定本批目标状态（`user` 为 local，`lark-bridge` 且 `reminder !== true` 为 remote，其余忽略），同批以最后一条为准；状态变化或首次时返回提醒文本，否则返回空
- [x] T002 [US1] 在 `src/sa-dispatch/index.ts` 注册 `agent/pre-step`：先 `await next()`，`reject` 原样返回；否则用 `presenceReminder` 计算提醒，需要时用 `createUserMessage` 构造 `{ kind: 'sa-dispatch-presence', form: 'notice' }` 的提醒消息插到本批第一条之前，并用以会话为键的 `WeakMap` 更新状态
- [x] T003 [US1] 按 [contracts/prompts.md](./contracts/prompts.md) 修改 `src/sa-dispatch/prompt.ts`：新增 `## Track where the user is`，写明系统提醒含义、默认远程、两种状态的回复与转达渠道、工作会话消息不改变状态；调整 `## Handle worker communication` 的转达要求按状态选择渠道
- [x] T004 [US1] 在 `tests/sa-dispatch.test.ts` 增加状态提醒契约验收断言 1–6、`agent/pre-step` 监听注册与提示词规则断言
- [x] T005 [US1] 运行 `pnpm vitest run tests/sa-dispatch.test.ts` 并提交本阶段

## Phase 4: User Story 2 - 工作会话识别用户直接介入 (P2)

**Goal**: 工作会话能区分调度消息与本机消息；本机模式下正文对话，影响任务的变化仍上报并注明用户在电脑前。

**Independent Test**: 单元测试覆盖 [contracts/dispatch-session-message.md](./contracts/dispatch-session-message.md) 验收断言 1–6 与提示词规则；实机执行 quickstart 场景 4–7。

- [x] T006 [US2] 新建 `src/sa-worker/host.ts` 再出口 `freezeMessage`，供测试替换
- [x] T007 [US2] 在 `src/sa-worker/dispatch-message.ts` 实现 `wrapDispatchMessages(messages)`：包装 `source.kind === 'dsh-plugin-meta-tools'` 的用户消息为 `<dispatch_session_message>`，开标签为首个文本块 `<dispatch_session_message>\n`、闭标签为末尾文本块 `\n</dispatch_session_message>`，文本中的 `</dispatch_session_message>` 转义为 `<\/dispatch_session_message>`，非文本块保留，保留原 `id` 与 `source`，已包装的消息跳过
- [x] T008 [US2] 在 `src/sa-worker/index.ts` 注册 `agent/pre-step`：先 `await next()`，`reject` 原样返回，否则用 `wrapDispatchMessages` 替换 `messages`，无需包装时返回原决策
- [x] T009 [US2] 按 [contracts/prompts.md](./contracts/prompts.md) 重写 `src/sa-worker/prompt.ts`：远程模式保持 `send_report` 交流；本机消息进入本机模式，正文直接对话，普通问答不上报；需求变更、完成与放弃仍 `send_report` 且 `text` 首行写 `用户在电脑前`；收到调度消息回到远程模式；不告知调度会话模式变化
- [x] T010 [US2] 在 `tests/sa-worker.test.ts` 增加包装契约验收断言 1–6、`agent/pre-step` 监听注册与两种模式提示词断言；原有「全部交流走 send_report」断言改为只在远程模式成立
- [x] T011 [US2] 运行 `pnpm vitest run tests/sa-worker.test.ts` 并提交本阶段

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T012 [P] 更新 `rows/sa-dispatch/locale/zh.json` 与 `rows/sa-dispatch/locale/en.json`：简介加入本机消息改为正文回复
- [x] T012 [P] 更新 `rows/sa-worker/locale/zh.json` 与 `rows/sa-worker/locale/en.json`：简介加入调度消息标记与本机直接对话
- [x] T012 更新 `README.md`：功能简介补一句，远程调度用法补本机介入说明
- [x] T012 更新 `docs/how-it-works.md`：调度服务与预设叠加一节写两种状态规则、`<dispatch_session_message>` 包装与状态提醒；`docs/development.md` 文件地图补新增模块
- [x] T012 更新 `docs/known-risks.md`：模型忽略提醒、GUI 显示标记、其他插件以 `user` 来源注入、宿主升级改变来源标识或 `agent/pre-step`
- [x] T012 更新 `CHANGELOG.md` 的 Unreleased：记录两项提示词变化、调度状态提醒与工作会话来源标记
- [x] T012 运行 `pnpm format && pnpm check` 与 `pnpm build`，确认 `dist/sa-dispatch.mjs`、`dist/sa-worker.mjs` 包含新逻辑并提交本阶段
- [ ] T019 用 `real-device-test` 按 `specs/032-sa-user-presence/quickstart.md` 场景 1–8 实机验证，记录结果

## Dependencies

- US1 与 US2 互不依赖，可分别交付。
- US1 内部：T001 → T002；T003、T004 依赖对应实现。
- US2 内部：T006 → T007 → T008；T009、T010 依赖对应实现。
- Polish 依赖两个故事完成。

## Parallel Execution Examples

- US1 与 US2 可由两个代理并行，文件不重叠。
- T012 与 T013 可并行。

## Implementation Strategy

1. 先交付 US1：调度会话的状态提醒与渠道切换，即可解决主要入口的回复渠道问题。
2. 再交付 US2：工作会话来源标记与本机对话。
3. 最后统一元数据、文档、质量门禁与实机验证。

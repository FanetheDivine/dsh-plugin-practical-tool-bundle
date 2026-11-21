# Feature Specification: 官方功能关闭跨重启生效

**Feature Branch**: `fix/028-official-features-restart`

**Created**: 2026-11-22

**Status**: Approved

**Input**: User description: "关闭官方功能的行有bug 设置好的关闭 重启之后就没了"

**变更类别**: 缺陷修复

## 探索结论

- 关闭记录存在于宿主存储域文件 `practical_tool_official_features.json`，实测记录含五项全部关闭。记录本身跨重启保留，丢失的是运行期施加。
- 面板开关显示受管行的真实装载状态，不读关闭记录；记录只在启动与 `app-boot/config-reload` 之后用于重新施加。
- 启动时的重新施加有固定上限：8 轮，每轮间隔 250 毫秒，合计约 2 秒。宿主实测启动耗时 9 到 12 秒，行装载完成前窗口已经用完，之后没有补偿动作。
- 复现：同一份「五项全关」记录连续启动 4 次，1 次启动后五项全开，3 次正常。缺陷是启动期竞态。
- 宿主提供 `appReady` 服务（`onReady(listener)`），启动成功提交时调用；行全部装载完成后才提交。它是服务而非事件，`provideCmdline` 在 launcher 未提供时省略。
- `ctx.inject` 只接受必填服务，因此 `appReady` 用 `ctx.get('appReady')` 软读取。

## Open Decisions

- [x] [D-001] 重启后重新施加的触发点：启动时施加一次，`onReady` 后补施加一次，两次各自重试 8 轮；`appReady` 缺失时只做启动那一次。 | Depends on: none | Status: answered
- [x] [D-002] 记录存在但未生效时的面板提示：不做，保持现状。 | Depends on: none | Status: skipped
- [x] [D-003] 施加失败日志：写一条 warn，含功能标识与原因。 | Depends on: none | Status: answered
- [x] [D-004] 面板开关显示依据：保持「受管行真实状态」。 | Depends on: none | Status: skipped
- [x] [D-005] 验收口径：重启完成后 30 秒内五项保持关闭，连续三次重启一致。 | Depends on: none | Status: answered

## Clarifications

### Session 2026-11-22

- [D-001] Q: 重启后怎么重新施加？ -> A: 启动时施加一次，`onReady` 后一次；`onReady` 缺失就不处理；两次均重试 8 次。
- [D-002] Q: 未生效时面板是否提示？ -> A: 用户跳过，不做。
- [D-003] Q: 失败是否写日志？ -> A: 写 warn，含功能标识与原因。
- [D-004] Q: 开关显示依据是否改变？ -> A: 用户跳过，保持受管行真实状态。
- [D-005] Q: 验收时间口径？ -> A: 重启完成后 30 秒内生效，连续三次重启一致。

## Review Record

- 2026-11-22 | Decision: Waived | Scope: current full document | Open items: 无 | Risks: D-002 与 D-004 由用户跳过，按现状执行；修复依赖宿主 `appReady` 服务，宿主未提供时只保留启动那一次施加

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 重启后关闭仍然生效 (Priority: P1)

用户用面板关闭若干官方功能，随后重启宿主。重启完成后，这些功能仍处于关闭状态，面板也显示为关闭，用户不需要重新操作。

**Why this priority**: 这是缺陷本身。关闭记录已经存在，重启后却不生效，用户会认为面板的设置不可信。

**Independent Test**: 关闭全部五项功能，重启宿主，在面板与会话中确认五项仍关闭；连续重启三次结果一致。

**Acceptance Scenarios**:

1. **Given** 用户关闭了五项官方功能，**When** 重启宿主，**Then** 重启完成后五项仍为关闭，面板显示与之一致。
2. **Given** 用户只关闭其中两项，**When** 重启宿主，**Then** 只有这两项保持关闭，其余三项可用。
3. **Given** 宿主启动耗时超过 2 秒，**When** 启动期间受管行尚未装载完成，**Then** 启动完成后仍补施加一次，功能保持关闭。

---

### User Story 2 - 启动期间行出现较晚仍能关闭 (Priority: P2)

宿主启动较慢时，受管行在首次施加之后才装载完成。启动完成信号到来后再施加一次，关闭仍会生效。

**Why this priority**: 缺陷就来自这个时序；只修首次施加无法覆盖晚装载。

**Independent Test**: 让首次施加在行出现前跑完，触发启动完成信号，确认五项被关闭。

**Acceptance Scenarios**:

1. **Given** 首次施加时受管行还不存在，**When** 宿主提交启动完成，**Then** 补施加生效，五项全部关闭。
2. **Given** 宿主没有提供启动完成信号，**When** 启动结束，**Then** 只做一次启动施加，不报错。

---

### User Story 3 - 配置重组后关闭仍然生效 (Priority: P3)

用户改动 profile 配置触发重组，已被关闭的功能自动恢复关闭状态。

**Why this priority**: 重组会还原运行期改动；这条行为已在上一版规格中要求，本次作为回归项验证。

**Independent Test**: 关闭若干功能后改动 profile 补丁文件触发重组，确认功能仍为关闭。

**Acceptance Scenarios**:

1. **Given** 用户关闭了若干功能，**When** 改动 profile 触发配置重组，**Then** 这些功能仍为关闭。

---

### Edge Cases

- 宿主不提供 `appReady`：只做一次启动施加，不等待、不报错。
- 两次施加都没到目标状态：写一条 warn，面板按真实状态显示。
- 存储域打不开：面板可读，切换被拒绝，记录读不到时按空记录运行并写 warn。
- 记录中的功能在本版本宿主里没有对应行：跳过该功能，其余功能照常施加。
- 停用本包后重启：关闭记录不生效，功能回到宿主默认。
- 连续多次重启：每次重启后状态与记录一致。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 宿主重启后，关闭记录中的每个功能 MUST 恢复为关闭，且不依赖用户再次操作。
- **FR-002**: 启动时 MUST 按记录重新施加一次；宿主提交启动完成后 MUST 再施加一次。
- **FR-003**: 每次重新施加 MUST 各自重试最多 8 轮，重试间隔 250 毫秒。
- **FR-004**: 宿主未提供 `appReady` 时 MUST 只做启动的那一次施加，MUST NOT 报错或阻塞面板。
- **FR-005**: 重新施加 MUST 覆盖宿主行与全部 preset 声明中的受管子行；已存在的会话不做回填。
- **FR-006**: 两次施加后仍未生效时 MUST 写一条 warn，包含功能标识与失败原因。
- **FR-007**: 配置重组后 MUST 仍然按记录重新施加，行为与重启一致。
- **FR-008**: 存储域不可用时 MUST 保持面板可读并拒绝切换，MUST NOT 把「读不到记录」当作空记录静默处理。
- **FR-009**: 连续重启 MUST 收敛到同一结果，不出现记录被清空或状态逐次衰减。
- **FR-010**: 本次变更 MUST 同步补充测试，覆盖启动施加、`onReady` 补施加、`appReady` 缺失与施加失败。
- **FR-011**: 机制与风险变化 MUST 更新对应文档；用户可见行为变化 MUST 更新 `README.md` 与文案。

### Key Entities *(include if feature involves data)*

- **关闭记录**：本包保存的「用户关掉了哪些功能」，跨宿主重启保留，仅在本包启用期间施加。
- **受管行**：功能在宿主中对应的装载单位，分布在宿主配置、preset 声明与界面。
- **启动完成信号**：宿主在全部行装载完成后提供的 `appReady` 服务，本包用它触发第二次施加。
- **重新施加**：按关闭记录停用受管行的过程，在启动、启动完成与配置重组后执行。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 关闭五项功能后重启，重启完成后 30 秒内五项全部为关闭，面板显示一致；连续三次重启结果相同。
- **SC-002**: 关闭任一项后重启，重启完成后该功能在新建会话中不可用。
- **SC-003**: 宿主启动耗时 10 秒左右时，重启后关闭不丢失；连续 5 次启动全部保持关闭。
- **SC-004**: 改动 profile 触发重组后，已关闭功能仍为关闭，面板状态与之一致。
- **SC-005**: 重启过程不写 profile 配置与 preset 文件。
- **SC-006**: `pnpm check` 与 `pnpm build` 全部通过，发布包只含运行所需文件。

## Assumptions

- 用户使用带本包的 Web 或桌面宿主，宿主提供 `loader.entries()`、`loader.update()` 与配置重组事件。
- 桌面与 web 宿主都由 `runProfile` 启动并注入 `appReady`；嵌入宿主可能不提供。
- 关闭记录写在宿主存储域，不写 profile 配置与 preset 文件。
- 关闭本包后记录失效优先于跨重启保留；每次启动都要按记录重新施加。
- preset 子行的变化只影响之后新建的会话。

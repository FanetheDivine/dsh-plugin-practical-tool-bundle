# Feature Specification: 标准模式追加 Codex 行为提示词

**Feature Branch**: `feat/034-standard-codex-prompt`

**Created**: 2026-11-29

**Status**: Approved

**Input**: User description: "在标准模式提示词的基础上 增加 codex 的 s346 即可。英文" 补充输入 1: "1) 基座=官方标准模式（工具面与其提示词段不动）；2) 追加 S3 响应性、S4 进度更新、S6 止损收敛三段英文（用你草案里的英文原文）；3) 删掉提示词中含模型名的身份句（`You are a coding agent powered by the {{model}} model.` 这类 `{{model}}` 插值），保证切换模型时系统提示词不变；新增段里也不得出现模型名。机制选对官方声明零侵入/最小惊讶的方案并在报告说明。"

## Open Decisions

无。全部决策已确认，记录见 Clarifications。

## Clarifications

### Session 2026-11-29

- [D-001] Q: 基座与工具面？ -> A: 官方 `standard` 预设，工具集合与其提示词段保持官方状态。
- [D-002] Q: 追加哪些段？ -> A: 只追加 S3 响应性、S4 进度更新、S6 止损收敛，英文原文，逐字一致。
- [D-003] Q: S1、S2、S5、S7 是否包含？ -> A: 不包含。
- [D-004] Q: 含 `{{model}}` 的身份句如何处理？ -> A: 删除该身份句，使切换模型时系统提示词不变；新增段不出现模型名。
- [D-005] Q: 修改官方声明的机制？ -> A: 运行期叠加 `preset-standard` 的行配置，只在内存中改 persona 前缀并追加一个子行，不编辑官方声明文件，不新增预设 id。先例是本包的 `official-features` 行。
- [D-006] Q: 新子行的提示词段位置？ -> A: 三个 `systemPrompt.section`，段序 100、110、120，位于 persona 之后、plan 政策（500）与工具规则（900 起）之前。
- [D-007] Q: 发布方式？ -> A: 验收后推 PR、等 CI、合并、按仓库惯例 release。

## Review Record

- 2026-11-29 | Decision: Approved | Scope: current full document | Open items: none | Risks: 运行期改写 preset 配置依赖宿主内部契约；与 official-features 的重算需要共存
- 2026-11-29 | 依据: 用户在本轮指令中确认基座、三段文本、身份句删除与自行发布授权

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 标准模式多出三段行为提示（Priority: P1）

用户选择标准模式的会话里，模型在收到工具规则之前先读到响应性、进度更新与止损收敛三段英文提示，行为更接近 Codex。

**Why this priority**: 这是本功能的全部价值。

**Independent Test**: 新建标准模式会话并发送一条消息，读取实际请求的系统提示词。

**Acceptance Scenarios**:

1. **Given** 已安装本包，**When** 新建标准模式会话，**Then** 系统提示词含 S3、S4、S6 三段原文，各出现一次。
2. **Given** 同上，**When** 检查段序，**Then** 三段位于 persona 之后、plan 政策与工具规则之前。
3. **Given** 同上，**When** 汇总模型工具，**Then** 与未启用本功能时完全相同。

---

### User Story 2 - 切换模型时提示词不变（Priority: P2）

标准模式的系统提示词不再包含模型名插值，切换模型只改变模型路由。

**Why this priority**: 固定前缀才能稳定命中请求缓存，也避免模型名出现在身份句里。

**Independent Test**: 用两个不同模型各发一条消息，对比系统提示词。

**Acceptance Scenarios**:

1. **Given** 标准模式会话，**When** 读取系统提示词，**Then** 不含 `You are a coding agent powered by` 与任何 `{{model}}` 插值结果。
2. **Given** 新增的三段，**When** 检索模型名，**Then** 没有命中。

---

### User Story 3 - 与官方功能开关共存 (Priority: P2)

用户开关官方功能后，标准模式仍保留三段行为提示，其它子行按开关与官方状态变化。

**Why this priority**: 本包已有 `official-features` 行会在运行期重算 preset 声明，两者叠加不能互相抹掉。

**Independent Test**: 在同一进程开关官方功能，再新建标准模式会话，检查三段仍在、受管子行按开关变化。

**Acceptance Scenarios**:

1. **Given** `official-features` 已启用，**When** 关闭或打开任一官方功能，**Then** 标准模式的子行列表保留 `codex-behavior` 与空 persona 前缀。
2. **Given** 停用本功能行，**When** 新建会话，**Then** 标准模式回到官方提示词，三段消失。

### Edge Cases

- 组合里没有 `standard` 预设声明（headless 或其它 profile）时，本行不做任何改写。
- loader 服务不可用时本行等待，不影响其它行。
- 用户在 Web 编辑器改过标准模式后，运行期基线以当前配置为准；下一次配置重组会重新施加。
- 停用本行时恢复首次施加前的配置，可能包含 `official-features` 已经产生的改动。
- 预设改动只影响新建会话，已有会话保持启动时的组合。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 本包 MUST 新增宿主行 `standard-codex`，模块为 `dsh-plugin-practical-tool-bundle/standard-codex`。
- **FR-002**: 该行 MUST 找到 `name` 为 `@deepseek-ai/dsh-agent-preset` 且 `config.id` 为 `standard` 的 Loader 条目。
- **FR-003**: 变换 MUST 把该声明里 persona 子行的 `config.prefix` 设为空串，并在 `plugins` 末尾追加子行 `{ id: codex-behavior, name: dsh-plugin-practical-tool-bundle/codex-behavior }`。
- **FR-004**: 其余子行 MUST 原样保留，顺序不变；同一子行只追加一次。
- **FR-005**: 变换 MUST 幂等：目标状态已满足时不写回。
- **FR-006**: `app-boot/config-reload` 事件后 MUST 重新施加；行停用 MUST 恢复首次施加前保存的配置。
- **FR-007**: 官方声明文件、`@deepseek-ai/dsh-web-app` 与本仓库其它行 MUST 不改动；不新增预设 id。
- **FR-008**: 本包 MUST 新增预设子行插件 `codex-behavior`，只注册三个系统提示词段，名称为 `codex:responsiveness`、`codex:progress-updates`、`codex:stop-loss`，段序分别为 100、110、120。
- **FR-009**: 三段文本 MUST 与确认的英文原文逐字一致，且不含模型名与 `{{...}}` 插值。
- **FR-010**: 标准模式的工具集合与其余提示词段 MUST 保持不变。
- **FR-011**: 与 `official-features` 共存时，其后一次重算 MUST 保留空 persona 前缀与 `codex-behavior` 子行。
- **FR-012**: 构建入口、`package.json` 的 `exports`、产物清单、打包清单与顶层行名断言 MUST 同步。
- **FR-013**: `README.md` MUST 说明标准模式新增的三段与身份句变化；`docs/how-it-works.md` MUST 说明运行期叠加机制与和官方功能开关的关系；`docs/development.md` MUST 列出新入口；`locale/` 与 `CHANGELOG.md` MUST 同步。
- **FR-014**: 单元测试 MUST 覆盖变换结果、幂等、恢复、重载、缺失预设、loader 缺失、三段注册与文本。
- **FR-015**: 真机验证 MUST 覆盖：三段进入系统提示词且各一次、顺序正确、无模型名身份句、工具集合与停用本行时一致。

### Key Entities

- **宿主行 `standard-codex`**：运行期叠加标准预设配置的行。
- **`codex-behavior` 子行**：只注册三个提示词段的预设子插件。
- **标准预设声明**：官方 `preset-standard` 条目，其 `config.plugins` 在内存中被改写。
- **三段提示词**：响应性、进度更新、止损收敛。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 真机标准模式会话的系统提示词含 S3、S4、S6 原文，各出现一次，且顺序为响应性、进度、止损。
- **SC-002**: 系统提示词不含 `You are a coding agent powered by`，不含插值后的模型名；三段内无模型名。
- **SC-003**: 启用与停用 `standard-codex` 时，标准模式的工具名集合完全相同。
- **SC-004**: `pnpm check` 与 `pnpm build` 通过，新入口进入发布包。

## Assumptions

- 宿主为 `0.2.2-rc.5`，`loader` 条目的 `options.config` 可读可写，`official-features` 已在同类改写中验证。
- 运行期写入不落盘；重启后回到文件状态，本行再次施加。
- 预设改动的生效边界是新会话。
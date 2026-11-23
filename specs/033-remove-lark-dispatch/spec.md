# Feature Specification: 移除飞书任务与调度会话

**Feature Branch**: `refactor/033-remove-lark-dispatch`

**Created**: 2026-11-23

**Status**: Approved

**Input**: User description: "我希望完全删除「飞书任务与调度会话」功能。" 补充输入 1: "检查spec和git记录。此处是不是直接revert就行了" 补充输入 2: "检查spec和git记录。"

## Open Decisions

无。全部决策已确认，记录见 Clarifications。

## Clarifications

### Session 2026-11-23

- [D-001] Q: 「完全删除」是否包含 `SA-调度会话`、`SA-任务会话` 两个预设，以及 `sa-dispatch`、`sa-worker` 两个子行？ -> A: 包含。预设与子行只为该功能存在，一起删除。
- [D-002] Q: `specs/025`、`specs/031`、`specs/032` 与已归档 `changelogs/` 如何处理？ -> A: 全部保留为历史记录。
- [D-003] Q: `dsh-plugin-meta-tools` 是否从 `dependencies`、`pnpm-workspace.yaml` 与锁文件移除？ -> A: 移除。只有 `SA-调度会话` 使用它。
- [D-004] Q: 已把桥接会话预设选为 `SA-调度会话` 的 lark-bridge 用户，升级提示写在哪里？ -> A: 不写说明。
- [D-005] Q: 删除功能按哪种版本发布？ -> A: `2.0.0`。
- [D-006] Q: 采用哪种删除方式？ -> A: 撤销功能提交，再把 `specs/`、`changelogs/` 与 `CHANGELOG.md` 还原到删除前状态，最后按残留检索校对。
- [D-007] Q: 未合并的 `worktrees/030-lark-dispatch-config` 如何处理？ -> A: 本规格不涉及，用户自行处理。
- [D-008] Q: `CHANGELOG.md` 的 `Unreleased` 段落如何处理？ -> A: 保持已有记录，并追加一条 `Removed` 条目说明删除功能。（P-001 修订）
- [D-009] Q: 宿主入口数量？ -> A: 七个，即根行加六个功能行。原文「六个宿主入口」按此更正。

## Review Record

- 2026-11-23 | Decision: Approved | Scope: current full document | Open items: none | Risks: 删除后 bridge 侧配置指向不存在的预设；撤销提交时冲突解错会误删其他功能的文档段落
- 2026-11-23 | Decision: Approved | Scope: D-008 与 FR-014：`Unreleased` 追加一条 `Removed` | Open items: none | Risks: 同上

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 插件页与预设列表只剩现存能力 (Priority: P1)

用户在插件页只看到根行与六行功能行。新建会话的预设列表里没有 `SA-调度会话` 与 `SA-任务会话`。

**Why this priority**: 这是「完全删除」对用户的直接可见结果。

**Independent Test**: 全新 profile 安装本包，查看插件页与预设列表。

**Acceptance Scenarios**:

1. **Given** 全新 profile 安装本包，**When** 打开 Plugins 页，**Then** 只列出根行与六行功能行，其中没有 `lark-super-agent`。
2. **Given** 同上，**When** 新建会话选择预设，**Then** 列表中无 `SA-调度会话` 与 `SA-任务会话`。

---

### User Story 2 - 既有安装升级后无残留 (Priority: P1)

已安装旧版本的用户升级本包后，profile 中该行与两个预设不再出现，用户无需手工编辑文件。

**Why this priority**: 残留行会按缺失模块加载失败，阻塞整个插件页。

**Independent Test**: 在装有旧版本的 profile 升级到新版本，重启宿主后检查 profile 行列表与插件页。

**Acceptance Scenarios**:

1. **Given** 旧版本已安装的 profile，**When** 升级并重启宿主，**Then** 该行与两个预设不在 profile 中，插件页正常显示六行。
2. **Given** 同上，**When** 读取 `GET /api/dsh-practical-tools/status`，**Then** 回答中只含六行，不再有 `larkSuperAgent` 键。

---

### User Story 3 - 包与依赖收缩 (Priority: P2)

本包的发布内容与依赖里不再出现该功能的入口、行目录、预设声明与 `dsh-plugin-meta-tools`。

**Why this priority**: 移除依赖才能让安装体积与重复工具风险同步下降。

**Independent Test**: 打包后检查包内文件清单与 `package.json`。

**Acceptance Scenarios**:

1. **Given** 新版本被打包，**When** 检查包内文件，**Then** 无 `lark-super-agent.mjs`、`sa-dispatch.mjs`、`sa-worker.mjs`，也无三者的 `rows/` 目录。
2. **Given** 同上，**When** 检查 `package.json`，**Then** `exports`、`keywords`、`description` 与该功能无关，`dependencies` 无 `dsh-plugin-meta-tools`。

---

### User Story 4 - 文档与测试只描述现存能力 (Priority: P3)

README、AGENTS.md 与 `docs/` 只描述六行功能与现存路由，数量表述与现状一致。测试与检查全部通过。

**Why this priority**: 文档准确决定后续维护与用户操作路径。

**Independent Test**: 通读文档并运行 `pnpm check` 与 `pnpm build`。

**Acceptance Scenarios**:

1. **Given** 新版本，**When** 检索该功能的标识与「七个」，**Then** 除保留的历史记录外无命中。
2. **Given** 同上，**When** 运行 `pnpm check` 与 `pnpm build`，**Then** 全部通过，`dist` 只含七个宿主入口与 `client.js`。

### Edge Cases

- 旧版本用 `SA-调度会话` 或 `SA-任务会话` 启动的会话在升级并重启后失去该预设，用户需要改选其他预设再继续。
- lark-bridge 的桥接会话预设仍指向 `sa-dispatch` 时，桥接侧找不到该预设。
- 调度工作区的笔记、上报与归档留在磁盘，本包不再读写。
- 外部接口消费者读取 `larkSuperAgent` 键时，升级后取不到值。
- 本地 `dist` 留有旧版三个入口文件时，构建结果需要与新的入口清单一致。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `cordis.patch.yml` MUST NOT 声明 `lark-super-agent` 行、`sa-dispatch` 与 `sa-worker` 子行、`preset-sa-dispatch` 与 `preset-sa-worker` 预设行，以及 `SA-调度会话` 内的 `meta-tools` 子行。
- **FR-002**: 聚合状态路由 MUST 只报告六行功能，回答中不含 `larkSuperAgent` 键。
- **FR-003**: 本包 MUST NOT 注册 `GET /api/dsh-practical-tools/lark-super-agent/status`。
- **FR-004**: 构建 MUST 产出七个宿主入口与 `client.js`，不含三个已删除入口。
- **FR-005**: `package.json` MUST 只描述现存能力：`exports`、`keywords`、`description`、`files` 与该功能无关，`dependencies` 不含 `dsh-plugin-meta-tools`，`pnpm-workspace.yaml` 与 `pnpm-lock.yaml` 同步。
- **FR-006**: 该功能的宿主源码、行目录、图标、行本地化与测试文件 MUST 从仓库删除。
- **FR-007**: `README.md`、`AGENTS.md` 与 `docs/` MUST 只描述六行功能、现存路由与现存配置；行数与工具数表述为六。
- **FR-008**: 既有 profile MUST 在升级后不含该行与两个预设，用户无需手工编辑 profile 文件。
- **FR-009**: 本包 MUST NOT 删除或改写用户在调度工作区的笔记、上报与归档。
- **FR-010**: 其余六行功能、前端界面、官方功能管理与清理会话的保护逻辑 MUST 保持现有行为。
- **FR-011**: `locale/zh.json` 与 `locale/en.json` 的插件描述 MUST 只描述现存六行，与 `package.json` 的 `description` 一致。
- **FR-012**: 测试 MUST 只断言现存六行：行元数据、打包清单、`dist` 新鲜度与状态路由的期望值同步更新。
- **FR-013**: `specs/025-remote-dispatch-session`、`specs/031-worker-session-pin-archive`、`specs/032-sa-user-presence`、`changelogs/` 与 `CHANGELOG.md` 的已有记录 MUST 原样保留。
- **FR-014**: `CHANGELOG.md` 的 `Unreleased` MUST 追加一条 `Removed` 条目，说明删除该功能与两个预设。

### Key Entities

- **功能行 `lark-super-agent`**：提供 `larkSuperAgent` 服务与调度状态路由，删除对象。
- **子行 `sa-dispatch`、`sa-worker`**：`SA-调度会话` 与 `SA-任务会话` 的工具与提示词，删除对象。
- **预设声明 `preset-sa-dispatch`、`preset-sa-worker`**：两个预设的声明行，删除对象。
- **聚合状态回答**：行名到可用性的映射，删除后为六项。
- **调度工作区数据**：笔记 JSON、上报存档与归档，留在磁盘，不参与迁移。
- **历史记录**：三份功能规格、`changelogs/` 归档与 `CHANGELOG.md`，保留为过去版本的记录。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 全新 profile 安装后，loader 条目中该行与两个预设的数量为 0。
- **SC-002**: 仓库全文检索 `lark`、`飞书`、`sa-dispatch`、`sa-worker` 时，除 `specs/`、`changelogs/` 与 `CHANGELOG.md` 的历史记录外命中数为 0。
- **SC-003**: `pnpm check` 与 `pnpm build` 通过，`dist` 中三个已删除入口的文件数为 0。
- **SC-004**: `GET /status` 返回六项；`GET /lark-super-agent/status` 返回 404。

## Assumptions

- 其余六行不依赖该功能。已核对 `src/sweeper`、`src/client`、`src/official-features` 与 `src/row-status.ts`。
- profile 由 bundle 补丁合成，删除声明即在既有 profile 生效。
- 历史规格、归档与 `CHANGELOG.md` 保留，仓库检索会继续命中它们。
- 用户数据留在磁盘，删除不涉及迁移与清理。
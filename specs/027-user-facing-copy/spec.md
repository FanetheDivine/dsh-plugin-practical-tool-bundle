# Feature Specification: 优化用户可见内容

**Feature Branch**: `docs/027-user-facing-copy`

**Created**: 2026-11-21

**Status**: Approved

**Input**: User description: "优化readme 插件和行的meta数据 配置页面ui 等一切用户可见部分。尤其是各类文本 不够简洁 不够"站在用户视角""

**变更类别**: 文案与界面优化

## 探索结论

用户可见内容共六处：

| 位置 | 文件 | 当前问题 |
| --- | --- | --- |
| 插件详情页 | `README.md` | 按开发者视角组织：行 id、路由、存储域、实现机制混在功能说明里 |
| 插件列表的标题与描述 | `locale/zh.json`、`locale/en.json` | 描述是一长句罗列六行；中文把 present 误写成 preset；英文标题不是 sentence case |
| 各功能行的标题、描述与图标 | 无 | 六个功能行没有 meta，插件列表只显示模块名，例如 `dsh-plugin-practical-tool-bundle/sweeper` |
| 侧栏清理面板、重启弹窗 | `src/client/locales.ts` | 提示文字偏长，一句讲多件事 |
| 管理官方功能面板 | `src/client/official-features.tsx`、`src/client/locales.ts` | 面板只有功能名和开关，关闭的后果写在一段总提示里；读取中与读取失败显示同一句「宿主没有提供功能状态」 |
| 路由返回的错误 | `src/official-features/index.ts`、`src/sweeper/index.ts` | 失败时界面直接显示英文原始信息，例如 `loader unavailable` |

宿主行为：

- 插件列表与详情页从 `locale/<语言>.json` 的 `meta.title`、`meta.description` 读取标题与描述，插件停用时照常读取。
- 子路径行从 `./<子路径>/locale/*.json` 与 `./<子路径>/icon` 读取自己的 meta 与图标；缺失时使用模块名与通用图标。
- 详情页显示 `meta.detail` 指向的文档，未声明时显示 `README.md`。
- 英文标题与界面文字要求 sentence case。

参考实现：本插件由本地插件 `@local/local-plugins` 演化而来。该插件为每个子路径行提供 `locale/zh.json`、`locale/en.json` 与 `icon.svg`，并在 `exports` 中声明 `./<子路径>/locale/*.json` 与 `./<子路径>/icon`。其中清理会话、清理推理块、Claude 技能、重启按钮、手机触控放大五行的图标可复用。

## Open Decisions

（无）

## Clarifications

### Session 2026-11-21

- [D-001] Q: 六个功能行是否各自提供标题与描述？图标如何处理？ -> A: 参考本地插件 `@local/local-plugins`，每行提供中英文标题、描述与图标。
- [D-001a] Q: 行图标来源？ -> A: 复用本地插件的 5 个图标；为官方功能开关新画 1 个同风格图标。
- [D-002] Q: 插件标题改成什么？ -> A: 中文「DSH实用工具组合包」。
- [D-002a] Q: 英文标题？ -> A: `DSH practical tool bundle`。
- [D-003] Q: 六个功能行的用户可见名称？ -> A: 采用推荐名称，见 FR-003 表格。
- [D-004] Q: README 的读者与开发者内容的去向？ -> A: README 只写功能简介与 npm 徽章；安装由 DSH 自行完成，不写安装一节。路由、行 id、存储域、本地开发加载方式移到 `docs/`。
- [D-004a] Q: 与宪章原则 III 冲突如何处理？ -> A: 同步修订宪章原则 III，README 归属改为「功能简介与 npm 徽章」。
- [D-005] Q: 管理官方功能面板的界面改动范围？ -> A: 每个功能名下加关闭后果说明；总提示缩为一句；区分加载中与读取失败，读取失败给重试按钮。
- [D-006] Q: 错误信息是否改为本地化文案？ -> A: 前端按错误码显示中英文本地化文案，未知错误码显示通用文案。
- [D-007] Q: 侧栏清理面板与重启弹窗是否只改文字？ -> A: 只改文字，交互与布局不变。
- [D-008] Q: `package.json` 的 `description` 与 `keywords`？ -> A: `description` 与中文 meta 描述一致；`keywords` 不变。
- [D-009] Q: 英文用户在详情页看到什么？ -> A: README 保持中文；英文用户依赖英文 meta 描述。

## Review Record

- 2026-11-21 | Decision: Approved | Scope: current full document | Open items: none | Risks: none

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 在插件列表里认出每个功能 (Priority: P1)

用户打开侧栏 Plugins 页，看到本插件与六个功能行。每行有图标，标题说明它做什么，描述告诉用户在哪里使用它。

**Why this priority**: 插件列表是用户启用或停用某个功能的入口，当前只显示模块名，用户无法判断。

**Independent Test**: 安装插件后打开 Plugins 页，在中英文下逐行核对标题、描述与图标。

**Acceptance Scenarios**:

1. **Given** 插件已安装，**When** 用户打开 Plugins 页，**Then** 每个功能行显示自己的图标、标题与描述。
2. **Given** 界面语言为英文，**When** 用户打开 Plugins 页，**Then** 标题与描述为英文，标题为 sentence case。
3. **Given** 某功能行已停用，**When** 用户查看该行，**Then** 标题、描述与图标照常显示。

---

### User Story 2 - 读 README 就知道插件能做什么 (Priority: P1)

用户打开插件详情页，读到每个功能的一段简介：它做什么、在哪里用、要注意什么。

**Why this priority**: 详情页是用户了解插件的主要文档。

**Independent Test**: 只读 README，能说出每个功能的入口位置与主要风险。

**Acceptance Scenarios**:

1. **Given** 用户打开详情页，**When** 阅读全文，**Then** 只看到 npm 徽章与六个功能的简介。
2. **Given** 用户想了解删除会话的后果，**When** 阅读清理会话的简介，**Then** 能读到「删除不可恢复」。

---

### User Story 3 - 在开关旁边看懂后果 (Priority: P2)

用户在官方功能开关面板里，看着每个功能名下的一句说明决定是否关闭它。

**Why this priority**: 关闭官方功能会改变新会话的能力，用户需要在操作前知道后果。

**Independent Test**: 打开面板，核对每个功能都有说明；模拟读取失败与切换失败，核对提示与重试。

**Acceptance Scenarios**:

1. **Given** 面板已打开，**When** 用户查看任一功能，**Then** 功能名下有一句关闭后果说明。
2. **Given** 面板正在读取状态，**When** 尚未返回，**Then** 显示加载中。
3. **Given** 状态读取失败，**When** 面板渲染，**Then** 显示读取失败与重试按钮。
4. **Given** 切换失败，**When** 面板显示错误，**Then** 错误为本地化文案。

---

### User Story 4 - 清理与重启的提示一眼读完 (Priority: P3)

用户点开侧栏扫帚或重启按钮，提示文字短到一眼读完，关键风险仍然可见。

**Why this priority**: 两处功能已可用，优化只降低阅读负担。

**Independent Test**: 打开清理面板与重启确认框，核对每句提示只讲一件事，风险提示保留。

**Acceptance Scenarios**:

1. **Given** 用户打开清理面板，**When** 阅读提示，**Then** 能读到归档范围、删除范围、跳过规则与不可恢复四点。
2. **Given** 用户点击重启，**When** 确认框出现，**Then** 文字说明对话会中断、页面会自动刷新。
3. **Given** 清理请求失败，**When** 面板显示结果，**Then** 显示本地化文案。

### Edge Cases

- 宿主读不到某语言的 meta 时回落英文；英文文件与中文同步。
- 功能名或说明在窄屏面板中换行时，开关保持右对齐。
- 宿主返回未知错误码时，显示通用失败文案。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 插件 meta 标题 MUST 为中文「DSH实用工具组合包」、英文 `DSH practical tool bundle`；描述 MUST 说明插件给用户带来什么。
- **FR-002**: 六个功能行 MUST 各自提供中英文标题、描述与图标，Plugins 页显示它们。
- **FR-003**: 六个功能的用户可见名称 MUST 在 meta、README、界面文案中一致：

  | 行 id | 中文 | 英文 |
  | --- | --- | --- |
  | `session-sweeper` | 一键清理会话 | Sweep sessions |
  | `reasoning-reset` | 推理报错自动重试 | Retry on reasoning errors |
  | `claude-skills` | 加载项目 Claude 技能 | Project Claude skills |
  | `restart-button` | 重启按钮 | Restart button |
  | `mobile-touch-ui` | 手机大按钮 | Larger touch targets on phones |
  | `official-features` | 官方功能开关 | Official feature switches |

- **FR-004**: 五个功能行的图标 MUST 复用本地插件的对应图标；官方功能开关 MUST 使用新画的同风格图标。
- **FR-005**: README MUST 只包含 npm 徽章与六个功能的简介；每段简介写明做什么、在哪里用、要注意什么。
- **FR-006**: 路由、行 id、存储域与本地开发加载方式 MUST 移到 `docs/` 的对应归属文档。
- **FR-007**: 宪章原则 III 的 README 归属 MUST 改为「功能简介与 npm 徽章」。
- **FR-008**: 官方功能开关面板 MUST 为每个功能显示关闭后果说明；总提示 MUST 为一句；面板 MUST 区分加载中与读取失败，读取失败时提供重试按钮。
- **FR-009**: 界面显示的错误 MUST 按错误码显示本地化文案；未知错误码 MUST 显示通用失败文案。
- **FR-010**: 清理面板与重启弹窗 MUST 只改文字；每句只讲一件事；删除不可恢复与对话中断两项风险 MUST 保留。
- **FR-011**: `package.json` 的 `description` MUST 与中文 meta 描述一致；`keywords` 保持不变。
- **FR-012**: 中英文字典与 meta 的键集 MUST 一致；英文标题与界面文字 MUST 使用 sentence case。
- **FR-013**: 文案 MUST 遵守 `AGENTS.md` 写作规范。
- **FR-014**: 变更 MUST 同步测试、`docs/` 与 CHANGELOG，并通过 `pnpm format && pnpm check`。

### Key Entities

- **插件 meta**：包级标题与描述，显示在 Plugins 页与详情页顶部。
- **行 meta**：功能行的标题、描述与图标，显示在 Plugins 页的行列表中。
- **前端字典**：界面文案，中英文两份，键集一致。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Plugins 页中 7 行全部显示用户可读的标题与图标，模块名不作为标题出现。
- **SC-002**: README 中路由、行 id、存储域、安装步骤出现 0 次；六个功能各有一段简介。
- **SC-003**: 官方功能面板 5 个功能全部带说明；读取失败与切换失败都显示本地化文案与重试入口。
- **SC-004**: 界面中直接显示的英文原始错误信息为 0；中英文键集差异为 0。

## Assumptions

- 只改用户可见内容；功能行为、路由形状与行 id 保持不变。
- 中文与英文是全部基线语言，不新增语言。
- 包级图标 `icon.svg` 保持不变。
- npm 徽章使用公网徽章服务的 URL，符合宪章原则 V。

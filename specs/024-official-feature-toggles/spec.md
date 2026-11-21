# Feature Specification: 管理官方功能

**Feature Branch**: `feat/024-official-feature-toggles`

**Created**: 2026-11-21

**Status**: Approved

**Input**: User description: "增加一个包 名称“管理官方功能” 作用是关闭dsh的某些包 例如“自动化任务”。需要一个配置面板 每个功能对应一行+switch 可以管理一个或多个dsh&preset中的行 switch的开关和当前包的状况保持一致。此插件关闭后 之前的配置全都不生效。需要管理的功能除了“自动化任务” 还有 goal task plan present"

**变更类别**: 新增功能

## 探索结论

- 官方五项能力各自对应的行（`0.2.2-rc.5` 安装内容）：
  - 自动化任务：宿主行 `schedule`、preset 子行 `tool-schedule`、界面行 `ui-schedule`。
  - goal：宿主行 `goal`、`goal-round-driver`、preset 子行 `command-goal`、`tool-goal`、界面行 `ui-goal`。
  - task：base 宿主行 `tool-todo`；Web 面停用它，由 preset 子行 `tool-todo` 承担。
  - plan：`plan-mode`（行内含 `/plan` 命令、模式状态与 `exit_plan_mode` 工具）、preset 子行 `planning` 组、界面行 `ui-plan`。计划审核卡由 `ui-user-questions` 渲染，该行同时是 `ask_user_question` 的提问界面，不属于 plan。
  - present：preset 子行 `present`（`dsh-tool-present`）、宿主行 `deliverable-file-references`、界面行 `ui-deliverables`。
- Web 面把上表多数宿主行停用，改由 preset 声明的 `config.plugins` 挂载；只改宿主行不影响会话能力。
- preset 子行是 `agent-preset` 行 `config.plugins` 里的条目，不是 Loader 的 `group` 子行。
  - 同 id 的宿主行与 preset 子行是两棵不同的树，两条插件都会挂载；空包顶替不成立。
  - 影响 preset 能力的合法途径只有两条：覆写该 preset 声明的 `config.plugins`，或改用另一份 preset 声明。
- 当前 profile 的 `scheduled-tasks` 属于第三方本地包 `@local/local-plugins` 的 `cron` 行，不是官方 `schedule`；官方自动化任务在该 profile 中仍可用。
- Loader 支持 `loader.update(id, { disabled })`；Include 会把这类改动写回 profile 配置，写入即持久。
- Web 端插件可注册配置页：向 `settings.plugins.tab` 注册标签页，或在侧栏 Plugins 页注册自己的详情页。
- 本包根行已提供聚合状态路由与前端轮询机制，可作为开关状态的读取通道。

### 路线 A 实测结果

环境：临时 profile 只装 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app`，`patchReload: live`，探针行经 `--patch` 覆盖层插入。

| 验证项 | 结果 |
| --- | --- |
| 运行期停用宿主行 `ui-goal` | `loader.update('include:ui-goal', { disabled: true })` 生效，行 fiber 进入 DISPOSED |
| 运行期摘掉 preset 子行 `tool-goal` | `loader.update('include:preset-standard', { config })` 生效，preset revision 由 27 个模块变为 26 个，只少 `dsh-tool-goal` |
| 撤销 | 把原始 config 放回后模块数回到 27，正向反向可重复 |
| 写盘 | 变更前后 `cordis.yml`、`cordis.patch.yml`、`package.json` 内容哈希一致，无新增文件 |
| `!!js` 表达式 | raw config 中保存为 `{ __jsExpr: "..." }`，克隆重写后仍由 Loader 求值（Windows 上 `tool-bash` 仍缺席、`tool-pwsh` 仍在） |
| HMR 重组 | 触碰 profile 补丁文件后 `app-boot/config-reload` 触发 1 次，运行期改动全部还原为文件配置 |
| 重新施加 | 重组后再次执行同一 update 可再次生效；本包自身的 update 不触发 `config-reload`，不会形成循环 |
| 生效延迟 | 撤销后 1.2 秒读取仍看到旧 revision，1.5 秒后一致，面板读回状态需要等待或重试 |

## Open Decisions

- 无。全部决策已在澄清阶段确认。

## Clarifications

### Session 2026-11-21

- [D-001] Q: 交付形态取本包新增一行，还是新建独立 npm 包？ -> A: 本包内新增一行，配一个前端块。
- [D-003] Q: 切换开关后能力何时变化？ -> A: 立即生效；preset 子行只影响之后新建的会话。
- [D-005] Q: 开关显示什么状态？ -> A: 显示受管行的真实装载状态。
- [D-006] Q: task 指哪一个官方能力？ -> A: 会话任务清单 `todo_write`（`tool-todo`）。
- [D-008] Q: present 包含哪些？ -> A: 只关 `present` 工具与文件引用指引，保留变更文件卡片（`ui-deliverables`）。
- [D-009] Q: 自动化任务管官方那个还是本机第三方那个？ -> A: 官方 `schedule` + `tool-schedule` + `ui-schedule`。
- [D-011] Q: 改哪些行？ -> A: 宿主行 + 全部 preset 的对应子行。
- [D-002] Q: 配置面板放在哪里？ -> A: 侧栏 Plugins 页中本包的详情页。
- [D-004] Q: 开关状态是否跨宿主重启保留？ -> A: 保留；停用本包时撤销全部施加。
- [D-007] Q: 「plan」具体关哪些？ -> A: 计划模式本体（`/plan` 与 `exit_plan_mode`）+ 计划界面（`ui-plan`）。审核卡所在的 `ui-user-questions` 同时承担 `ask_user_question`，不关闭。
- [D-010] Q: 一个功能的多行状态不一致时开关怎么显示？ -> A: 有任一行启用即显示为开。
- [D-012] Q: 是否提供一键恢复官方默认？ -> A: 不提供，逐个开关恢复。
- [D-013] Q: 已存在的会话如何处理？ -> A: 不作为需求项，不额外处理。
- [D-014] Q: 用户手工停用某行时面板怎么做？ -> A: 与配置保持一致，不标注来源、不覆盖。
- [D-015] Q: 宿主缺少某个受管行时怎么表现？ -> A: 不作为需求项，不额外处理。
- [D-016] Q: 面板与标题要英文文案吗？ -> A: 中文 + 英文两套。
- [D-017] Q: 关闭期间已排定的定时任务与已存在的 goal 怎么处理？ -> A: 保留，不删除任何数据；重新开启后继续。
- [D-018] Q: 切换开关需要二次确认吗？ -> A: 不需要，直接生效。
- [D-019] Q: 面板要展示受管行明细吗？ -> A: 不展示，只看功能开关。
- [D-020] Q: 功能清单是否固定为五项？ -> A: 固定五项，不提供自定义扩展。
- [D-021] Q: 用户改 profile 触发重组后，之前关掉的功能怎么办？ -> A: 按关闭记录自动重新施加。
- [D-022] Q: 切换开关后面板如何显示新状态？ -> A: 等待生效后显示，最多重试 2 秒。
- [D-023] Q: 计划阶段发现 `ui-user-questions` 同时是 `ask_user_question` 的提问界面，plan 要不要关它？ -> A: 不关。D-007 已据此收窄。
- [D-024] Q: 关闭记录存放在哪里？ -> A: 宿主存储域，落在 `$DSH_HOME/storages`，不写 profile。FR-014 已据此更新。
- [D-012 追问] Q: 能否在宿主行引入同 id 的空包顶替 preset 中的行？ -> A: 不能。同 id 的宿主行与 preset 子行属于不同的树，两条都会挂载；影响 preset 能力只能覆写该 preset 声明的 `config.plugins`，或改用另一份声明。

## Review Record

- 2026-11-21 | Decision: Approved | Scope: current full document | Open items: 无 | Risks: 运行期改动易失，依赖 `app-boot/config-reload` 重新施加；preset revision 切换只影响新建会话；`loader.update`、`agentPresets.inspectCompositions`、`app-boot/config-reload` 属宿主内部契约，升级可能变化；撤销依赖保存的原始 raw config，外部同时改动 preset 声明时会被撤销覆盖
- 2026-11-21 | Decision: Changes requested (由计划阶段 D-023、D-024 触发) | Scope: D-007 范围收窄、FR-014 存放位置 | Open items: 无 | Risks: 审批失效，需对更新后的完整规格重新审查
- 2026-11-21 | Decision: Approved | Scope: current full document（含 D-007 收窄、FR-014 改用宿主存储域、五项功能命名） | Open items: 无 | Risks: 同上一次批准；另增：存储域写入不在写入时校验，实现必须在写入前保证对象合法；`zod` 实例与宿主是否同一份待真机验证

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 用开关关闭一个官方功能 (Priority: P1)

用户在配置面板看到「管理官方功能」的功能列表，每行是一个官方功能与一个开关。用户把「自动化任务」的开关关掉，该功能的模型侧能力与界面随即消失；再把开关打开，能力回来。整个过程不需要用户编辑任何配置文件。

**Why this priority**: 这是本功能存在的理由；没有可用的开关，其余要求都没有意义。

**Independent Test**: 在装了本包的宿主上关掉「自动化任务」，新建会话中看不到定时任务相关工具与界面；打开开关后这些能力恢复。

**Acceptance Scenarios**:

1. **Given** 面板列出五个功能且都处于开启状态，**When** 用户关闭「自动化任务」，**Then** 该功能在会话中的模型侧能力与界面失效，其余四个功能不受影响。
2. **Given** 「自动化任务」已被关闭，**When** 用户重新打开开关，**Then** 该功能恢复，且不需要用户手工修改任何配置。
3. **Given** 面板已打开，**When** 用户切换任一开关，**Then** 面板立即显示该行的新状态与生效结果，无需刷新页面。

---

### User Story 2 - 开关反映真实状态 (Priority: P1)

用户此前手工在 profile 里停用过某个功能，打开面板时对应开关就显示为关闭；用户从外部把该功能改回启用后，面板在下一次读取时也显示为开启。开关就是该功能当前状态的展示，不因配置来自哪里而不同。

**Why this priority**: 开关与真实状态不一致会让用户做出错误判断，这比缺少某个功能更有害。

**Independent Test**: 在 profile 中手工停用「自动化任务」对应行后打开面板，开关显示关闭；恢复该行后重新读取面板，开关显示开启。

**Acceptance Scenarios**:

1. **Given** 某功能对应的行已被外部停用，**When** 打开面板，**Then** 该功能的开关显示关闭。
2. **Given** 面板显示某功能为关闭，**When** 该功能对应的行被外部启用，**Then** 面板在下一次状态刷新时显示开启。
3. **Given** 面板显示某功能为开启，**When** 用户关闭该功能，**Then** 面板、会话实际能力与行状态三者一致。

---

### User Story 3 - 一个开关管理多行 (Priority: P2)

一个官方功能由宿主配置中的行、全部 preset 声明中的子行、以及界面中的行共同组成。用户只看到一个开关，关闭它时这些行一起被停用，打开时一起恢复。只要还有一行在启用，开关就显示为开。

**Why this priority**: 用户按「功能」思考，宿主按「行」组织；不把多行收成一个开关，关闭动作会不完整。

**Independent Test**: 关闭「自动化任务」后逐项确认宿主服务行、preset 子行与界面行都被停用；打开后全部恢复。

**Acceptance Scenarios**:

1. **Given** 「自动化任务」由多行组成，**When** 用户关闭该开关，**Then** 该功能受管的每一行都被停用。
2. **Given** 该功能的若干受管行已关闭、其余仍开启，**When** 打开面板，**Then** 开关显示为开，用户再次关闭可关掉剩余行。
3. **Given** 该功能的受管行全部已关闭，**When** 用户打开开关，**Then** 全部受管行恢复启用。

---

### User Story 4 - 关闭本插件后配置全部失效 (Priority: P2)

用户停用或卸载本包后，之前通过面板做过的所有关闭动作都不再生效，五个官方功能回到宿主默认状态；本包不留下让功能保持关闭的记录。

**Why this priority**: 用户需要一条确定的退路；本包被停用后宿主行为必须可预期。

**Independent Test**: 用面板关闭若干功能，然后停用本包，所有功能恢复官方默认；重启后仍为默认。

**Acceptance Scenarios**:

1. **Given** 用户用面板关闭了若干功能，**When** 停用本包，**Then** 被关闭的功能恢复可用。
2. **Given** 用户关闭若干功能后卸载本包，**When** 重启宿主，**Then** 宿主行为与从未安装本包一致。
3. **Given** 本包在配置保留的情况下重新启用，**When** 面板打开，**Then** 显示各功能当前真实状态，开关与之一致。

---

### Edge Cases

- 宿主环境里没有某个功能对应的行（旧版本或精简 profile）：不作为需求项，实现不额外处理。
- 某个 preset 声明不含该功能的子行：面板照常显示开关，关闭动作不产生该 preset 的变更。
- 关闭某功能后，已打开的会话仍在运行：不作为需求项，不额外处理。
- 用户在一处保留旧配置的情况下改动面板开关：以真实状态为准，面板显示该状态，不提示来源。
- 本包的根行被停用：面板不再出现，之前施加的关闭动作全部失效。
- 用户连续快速切换同一开关：最终状态与最后一次操作一致，不出现相互覆盖的中间态。
- 某功能的受管行加载失败：面板按该功能当前实际状态显示；加载诊断留给宿主自身的插件页面。
- 关闭「plan」时会话正处在计划模式：计划模式本体被停用，会话回到普通模式；`ask_user_question` 的提问界面不受影响。

## Requirements *(mandatory)*

### Functional Requirements

**交付与身份**

- **FR-001**: 本功能 MUST 作为本包新增的一行交付，中文标题为「管理官方功能」，并带英文标题与描述。
- **FR-002**: 本功能 MUST 提供配置面板，面板 MUST 以「每个功能一行 + 一个开关」的形态呈现功能列表；入口 MUST 位于侧栏 Plugins 页中本包的详情页。
- **FR-003**: 面板 MUST 固定包含五个功能：自动化任务、goal、task、plan、present，不提供自定义扩展。
- **FR-004**: 面板文案 MUST 遵循仓库 i18n 规范，中文与英文宿主各自显示对应文案。

**开关与状态一致性**

- **FR-005**: 每行的开关 MUST 反映该功能受管行当前真实的装载状态。
- **FR-006**: 功能由多行组成时，开关 MUST 在「有任一行启用」时显示为开，「全部关闭」时显示为关。
- **FR-007**: 用户在外部改动受管行后，面板 MUST 在下一次状态读取时反映该改动。
- **FR-008**: 面板 MUST NOT 区分关闭来源，配置状态即显示状态。
- **FR-009**: 开关操作失败时 MUST 显示失败原因，面板状态 MUST 回到真实状态。
- **FR-009a**: 切换开关 MUST NOT 需要二次确认。
- **FR-009b**: 切换后 MUST 在生效后再显示新状态，最多重试 2 秒；等待期间 MUST 显示处理中。

**生效范围与回退**

- **FR-010**: 关闭一个功能 MUST 使该功能全部受管行失效：宿主行与界面行即时停用，preset 子行对之后新建的会话不再生效；打开开关 MUST 使其恢复。
- **FR-011**: 受管范围 MUST 覆盖宿主配置中的对应行与全部 preset 声明中的对应子行。
- **FR-012**: 开关操作 MUST NOT 要求用户手工编辑 profile 或 preset 文件。
- **FR-013**: 停用或卸载本包后，本包做过的全部关闭动作 MUST 不再生效，相关功能 MUST 回到宿主默认状态。
- **FR-014**: 本包 MUST NOT 在 profile 配置、preset 声明或宿主安装目录留下使功能保持关闭的内容；关闭记录只存在宿主存储域中本包自己的域。
- **FR-015**: 本包 MUST NOT 修改宿主官方包的安装内容。
- **FR-016**: 开关施加后 MUST 立即生效于宿主行与界面行；preset 子行的变化 MUST 对之后新建的会话生效。
- **FR-016a**: 开关状态 MUST 跨宿主重启保留，并在本包启动时重新施加。
- **FR-016c**: 每次配置重组后 MUST 按关闭记录重新施加，使宿主行与 preset 子行回到面板显示的状态。
- **FR-016d**: 撤销一个关闭动作（停用本包、重新打开开关）MUST 把保存的原始行状态放回，使功能即时恢复。
- **FR-016b**: 关闭功能 MUST NOT 删除该功能已产生的数据，包括已排定的任务与已存在的 goal。

**受管范围**

- **FR-017**: 关闭某个功能 MUST NOT 改动受管行之外的其他行或其他 preset 中无关的行。
- **FR-018**: 面板 MUST NOT 展示受管行明细，只展示功能级开关。

**质量与文档**

- **FR-021**: 代码变更 MUST 同步更新 `tests/`，发布内容 MUST 由包内容测试回归。
- **FR-022**: 用户可见行为 MUST 记录在 `README.md`；机制与风险变化 MUST 更新对应文档。
- **FR-023**: 本功能新增的 HTTP 路由 MUST 位于本包既有路由命名空间内，MUST NOT 与其他插件冲突。

### Key Entities

- **功能（Feature）**：面板中的一行，代表一个官方能力，例如「自动化任务」；具有名称、说明与开关状态。
- **受管行（Managed Row）**：功能在宿主中对应的一个装载单位，具有行标识、承载位置（宿主配置或某个 preset）与当前状态；只在实现内部使用，界面不展示。
- **开关状态**：二值结果，有任一行启用即为开，全部关闭即为关。
- **关闭记录**：本包保存的「用户关掉了哪些功能」，跨宿主重启保留，仅在本包启用期间施加。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 面板一次加载即列出五个功能行，每行带开关与当前状态，用户在 3 次点击内可关闭任一功能。
- **SC-002**: 关闭一个功能后，该功能在新建会话中不可用；重新打开后可用，两次操作均无需刷新页面或手工改配置。
- **SC-003**: 面板显示的状态与逐项核查受管行真实状态的结果在 100% 情况下一致，包括用户手工停用某行后的首次加载。
- **SC-004**: 一个功能由 N 个受管行组成时，一次开关操作覆盖全部 N 行。
- **SC-005**: 停用本包后，被关闭的功能全部恢复可用，profile 中不残留本包写入的关闭记录；重启后仍为官方默认。
- **SC-006**: 关闭一个功能后，profile 的 `cordis.yml`、`cordis.patch.yml`、`package.json` 内容与操作前完全一致。
- **SC-007**: 关闭后编辑 profile 配置触发重组，面板显示的功能状态在一个刷新周期内保持一致。
- **SC-008**: `pnpm check` 与 `pnpm build` 全部通过，发布包只含运行所需文件。

## Assumptions

- 用户使用 Web 或桌面宿主的当前版本，宿主提供读取行装载状态的接口。
- 官方功能以「行」为装载单位；一个功能可能对应多行，分布在宿主配置、preset 与界面三处。
- 用户可以切换默认 preset；受管范围覆盖全部 preset 声明。
- 面板只管理官方功能；第三方插件的行为不在范围内。
- 本包停用后配置失效优先于跨重启保留，因此每次启动都要按关闭记录重新施加，且停用时撤销。
- 宿主提供 `loader.entries()`、`loader.update()` 与 `agentPresets.inspectCompositions()`，实测 `0.2.2-rc.5` 可用。

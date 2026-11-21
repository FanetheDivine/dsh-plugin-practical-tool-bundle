# Feature Specification: lark-super-agent

**Feature Branch**: `feat/025-remote-dispatch-session`

**Created**: 2026-11-21

**Status**: Approved

**Input**: User description: "dsh-plugin-meta-tools 这个插件可以让 Agent 操作工作区和其他会话；dsh-plugin-lark-bridge 这个插件可以让 Agent 和用户远程通信。我想新增一行，复用这两个插件的能力，让用户可以远程地和调度会话通信；调度会话接到用户的消息后，将任务派发给其他工作区的会话，或者复用之前的会话；调度会话和 work 会话要能互相通信；用户还可以给工作区写简介，帮助调度会话识别；调度会话每周一归档，避免过往日志累计过多；类似 DeepSeek 提出的 super agent。"

**补充输入 1**: "你对预期结构理解错误。我希望将这两个插件作为依赖 用户不直接安装 但是新包可以使用它们的行"

**补充输入 2**: "1. 本次增加的行叫『lark-super-agent』 基于飞书的任务与调度会话 2. 新增两个 preset：SA-调度会话 里面有两个插件的全部 tool；SA-任务会话 以及 send_report 向调度会话反馈信息；两个 preset 都没有 ask_user_question 3. meta-tools 的行放在 SA-调度会话里，lark-bridge 的行则放到全局，并说明这个行和 npm 的包是一样的"

**补充输入 3**: "1. 可见 全局和 preset 配置会叠加 2. 以现在标准模式为参考 不要 ask_user_question 的行 3. send_report({ text?: string, files?: string[] }) 工作会话系统提示词说明当前的输出用户都不可见，减少输出的 text，用 send_report 和用户交互/提问，file 是写好的 md 文件，可以没有；调度会话系统提示词则增加关于 report 的内容"

**补充输入 4**: "1. 工作会话 send_report 后以 `<work_session_message sessionid="" reportid="">` 的形式注入调度会话中，里面有 `<text>` 和 `<files>` 两个子块，files 是路径，reportid 程序生成。2. 调度会话要『记笔记』：维护一个 message-task-status json，例如用户说『查一下 xxx』是一个新 task，而『之前那个 xxx 做完了吗』『现在有哪些任务』『<引用消息>要注意 xxx』则不是任务；还要维护用户关于 workspace 的 json，例如 xxx 工作区是 xxx 项目、关键词 xxx；维护工作会话的 report，全部都要存下来，这一点由程序自动完成；任务完成后要对 report 进行归档；把 AGENTS.md 当作『记忆』用，例如用户说『xxx 工作区的 xxx 要如何做』。3. 关于 2，这几个 json 还有 report 都以文件的形式直接放在工作区里，还要提供 tool 便于操作；如果没有 git 则要进行 git 初始化，每次变更都以 commit 形式进行。4. 调度会话需要的自定义 tool 太多了，来自标准模式的 tool 预期只留 pwsh、bash、edit、read、write、read_image、glob、grep、web_fetch、web_search、skill。调研一下这些 tool 所属哪些插件，这些插件是否会引入新的 tool。"

**补充输入 5**: "D-036 无需处理；D-037、D-038 都接受；D-034 笔记写在调度工作区，简单来说这是给工作区设置关键词，便于模型确定在哪个工作区，或者让模型只在特定的几个工作区发起会话；D-035 确定；D-030、D-031 确定，但注意归档的时候 json 要移除这些内容，以及 message 可能不止一个；D-033 记忆让模型自己写自己提交，json 需要写工具。"

**补充输入 6**: "D-032 程序自动归档；归档按照任务进行，对应的 report、sessionid 都要记录。"

**补充输入 7**: "D-002 就是 lark-bridge 的桥接会话；D-009、D-010、D-012 这里的预期功能是归档会话，现在我放弃这个功能；D-006 第三种；D-015 只处理失败的情形，告知调度会话，对于超时/卡住在系统提示词进行约束即可；D-008 接受推荐；D-027 调度会话转述；D-028 toolresult 返回错误；D-029 复制；D-023/24 接受推荐；D-005 确定；D-026 可以，只是普通对话；D-039 调度会话判断；D-019/20 我想修改下加载方式，将这个插件的行加入本插件的行中，id 和原来插件的行不同，弹窗由它自己处理。"

**补充输入 8**: "那就不换 id 了，插件冲突的问题在 README 里说一下，让用户处理。D-022 全部开启。D-040 插件让用户自行安装即可。"

**变更类别**: 新增一行 + 两个预设

**调研**: [research.md](./research.md)

## Open Decisions

- 无。42 项决策中 38 项已定案，4 项随功能放弃，记录见 Clarifications。

## Clarifications

### Session 2026-11-21

#### 决策记录

- [D-001] Q: 两个依赖插件如何进入本包的安装？ -> A: `dsh-plugin-meta-tools` 是本包的包依赖，作为 `SA-调度会话` 预设的子行。`dsh-plugin-lark-bridge` 由用户自行安装，本包不插入它的行。
- [D-002] Q: 调度会话的工作区由谁指定？ -> A: 调度会话就是 `dsh-plugin-lark-bridge` 的桥接会话，调度工作区就是桥接配置的工作区。
- [D-003] Q: 工作区简介的存放位置？ -> A: 存为调度工作区内的一份 JSON 文件，由专用工具维护，变更以 git 提交记录。
- [D-004] Q: 工作区简介的写入者与入口？ -> A: 用户经飞书或调度会话对话告诉调度会话，调度会话写入工作区笔记。
- [D-005] Q: 工作区笔记的字段？ -> A: `workspaceId`、`path`、`summary`、`keywords`、`notes`。登记在笔记中即允许派发，未登记即不派发。
- [D-006] Q: 派发时「新建会话」与「复用已有会话」的判定权？ -> A: 程序按规则给出候选会话，调度会话从候选中确认，或决定新建。
- [D-007] Q: `send_report` 的形态与寻址？ -> A: 签名为 `send_report({ text?: string, files?: string[] })`。上报以 `<work_session_message sessionid="…" reportid="…">` 块注入调度会话，块内含 `<text>` 与 `<files>` 两个子块；`reportid` 由程序生成。
- [D-008] Q: 调度会话向用户推送的时机与粒度？ -> A: 任务开始、结束与提问必推；进展类上报由调度会话自行合并。
- [D-009] Q: 每周一归档的范围？ -> A: 放弃调度会话归档功能，本次不实现。（放弃）
- [D-010] Q: 归档的执行时点与判定基准？ -> A: 随 D-009 放弃。（放弃）
- [D-011] Q: 归档后如何续接上下文？ -> A: 随 D-009 放弃。笔记文件与 AGENTS.md 仍承载跨会话信息。（放弃）
- [D-012] Q: 归档后的旧调度会话日志如何处理？ -> A: 随 D-009 放弃。（放弃）
- [D-013] Q: 是否存在任务台账？ -> A: 有，即 message-task-status JSON。
- [D-014] Q: 可派发的任务会话落在哪些工作区？ -> A: 只在工作区笔记登记过的工作区。工作区笔记为工作区设置关键词，帮助模型确定目标工作区。
- [D-015] Q: 失败、超时与卡住的处理？ -> A: 程序只处理失败：任务会话运行失败时告知调度会话。超时与卡住由两个预设的系统提示词约束。
- [D-016] Q: 本行的 id 与插件页标题？ -> A: 行 id 为 `lark-super-agent`，描述「基于飞书的任务与调度会话」。
- [D-017] Q: 依赖行的可见性与可停性？ -> A: `dsh-plugin-lark-bridge` 是用户独立安装的组合包，插件页条目、配置控件与停用开关保持原样；`dsh-plugin-meta-tools` 不作为 profile 行出现。
- [D-018] Q: 两个依赖插件自带能力的暴露范围？ -> A: `dsh-plugin-lark-bridge` 的能力由用户安装的组合包原样提供；`dsh-plugin-meta-tools` 的十一项能力由 `SA-调度会话` 预设固定配置。
- [D-019] Q: `lark-cli` 前置步骤的提示？ -> A: 由用户安装的 `dsh-plugin-lark-bridge` 自带的连接弹窗处理，本包不另做提示。
- [D-020] Q: 已单独安装过这两个插件的 profile 如何迁移？ -> A: 本包不插入 lark-bridge 的行，已安装的 `dsh-plugin-lark-bridge` 照常使用。`dsh-plugin-meta-tools` 独立安装的行与本包预设内的子行同时启用时，相同工具会注册两次；README 说明冲突现象，由用户停用独立安装的版本。
- [D-021] Q: 两个预设的工具集合？ -> A: `SA-调度会话` 从标准预设只保留 `pwsh`、`bash`、`edit`、`read`、`write`、`read_image`、`glob`、`grep`、`web_fetch`、`web_search`、`skill`，再加入 `dsh-plugin-meta-tools` 与笔记写工具。`SA-任务会话` 以标准预设为基准，去掉 `tool-ask-user` 行，再加入 `send_report`。
- [D-022] Q: `dsh-plugin-meta-tools` 的能力开关与默认值如何维护？ -> A: 十一项能力全部开启，由本包的预设固定写出。新建会话的默认预设固定为 `sa-worker`。
- [D-023] Q: 两个预设的标识、展示名称与排序？ -> A: `config.id` 为 `sa-dispatch` 与 `sa-worker`，展示名称为 `SA-调度会话` 与 `SA-任务会话`，都不设为新会话默认。
- [D-024] Q: 预设随本包的补丁插入，还是由用户自建？ -> A: 随本包的补丁插入。
- [D-025] Q: 全局行的工具在预设会话中是否可见？ -> A: 可见，全局行与预设子行的工具叠加。
- [D-026] Q: 用户能否在 Web GUI 里直接打开调度会话对话？ -> A: 可以，按普通对话处理。
- [D-027] Q: `files` 如何交到用户手里？ -> A: 调度会话读文件后转述。
- [D-028] Q: `text` 与 `files` 同时省略时如何处理？ -> A: 工具结果返回错误。
- [D-029] Q: `files` 的存档方式？ -> A: 上报时把文件复制进上报存档。
- [D-030] Q: message-task-status JSON 的结构？ -> A: 以任务为主键，每个任务挂一个消息列表；发起消息与之后针对该任务的补充、追问都进入列表。不针对任何任务的消息不进入笔记。
- [D-031] Q: 上报存档的目录结构与文件格式？ -> A: 按任务分目录，每份上报一个 Markdown 文件，文件名含 `reportid`。
- [D-032] Q: 任务上报归档的触发与去向？ -> A: 任务状态改为完成时由程序自动归档。归档以任务为单位：任务条目与消息列表从 message-task-status 移除并写入归档；归档记录该任务的全部 `reportid` 与参与过的 `sessionid`；上报目录一并进入归档。
- [D-033] Q: 笔记工具的清单与粒度？ -> A: 两份 JSON 由专用写工具维护。AGENTS.md 由调度会话用 `write`、`edit` 自行编写，用 shell 自行提交。上报存档由程序自动写入。
- [D-034] Q: 「AGENTS.md 当作记忆」用哪一份？ -> A: 调度工作区根目录的 AGENTS.md。
- [D-035] Q: git 提交的范围与身份？ -> A: 笔记与上报存档由工具提交，提交信息由工具生成，作者沿用本机 git 配置；每次提交只包含本次变更的文件。AGENTS.md 由调度会话自行提交。
- [D-036] Q: 调度会话的全局工具收窄？ -> A: 不处理。
- [D-037] Q: 去掉 `tool-jobs` 后 shell 不再支持后台运行，是否接受？ -> A: 接受。
- [D-038] Q: 调度会话保留哪些非工具行？ -> A: 保留 `persona`、`agent-instructions`、`time-context`、`skill-filesystem` 与压缩组，去掉 `command-goal`。
- [D-039] Q: 消息分类由谁完成？ -> A: 调度会话判断。
- [D-040] Q: lark-bridge 行的配置入口？ -> A: `dsh-plugin-lark-bridge` 由用户自行安装，配置页保持在它自己的行上。用户在其中把桥接会话的预设选为 `SA-调度会话`。
- [D-041] Q: 连接弹窗的「去设置」跳转？ -> A: 随 D-040 消解，跳转目标就是用户安装的 `dsh-plugin-lark-bridge` 组合包。
- [D-042] Q: 与独立安装的 `dsh-plugin-lark-bridge` 并存？ -> A: 随 D-040 消解，本包不再加载第二份 lark-bridge。

#### 输入与核查经过

- 第二轮：`dsh-plugin-meta-tools` 与 `dsh-plugin-lark-bridge` 作为本包的包依赖提供，用户的安装单位只有本包。
- [D-001] 行配置页机制：宿主把行配置页的键定为 `<包名>#<行 id>`，两个上游按自身包名硬编码。浏览器半部只挂在说明符恰为包名的那一行上。
- 第三轮：新行定名 `lark-super-agent`；新增 `SA-调度会话` 与 `SA-任务会话`；两个预设都不含 `ask_user_question`。
- 第四轮：全局行与预设子行的工具叠加可见；`send_report` 签名与两份系统提示词的要求定案。
- 核查：`dsh-plugin-lark-bridge` 的通知工具名为 `lark_notify`，只接受 `text` 与 `reply_to`，只在桥接会话中可用。
- 第五轮：上报注入格式、三类笔记、调度工作区 git、调度会话的 11 个基础工具定案。调研见 [research.md](./research.md)。
- 第六轮：D-030、D-031、D-033 至 D-038 定案；工作区笔记兼作派发白名单。
- 第七轮：D-032 定案，任务完成时程序自动归档，按任务记录 `reportid` 与 `sessionid`。
- 第八轮：
  - D-002：调度会话就是桥接会话。
  - D-009 至 D-012：放弃每周一归档调度会话，相关用户故事、需求与成功标准移除。
  - D-005、D-006、D-008、D-015、D-023、D-024、D-026 至 D-029、D-039 定案。
  - D-019、D-020：lark-bridge 行改为本包的一行，id 与上游包名不同，连接弹窗由 lark-bridge 自己处理。
  - 核查：上游客户端写死行配置页键、「去设置」跳转的组合包名与状态文件路径。由此新增 D-040 至 D-042。
- 第九轮：
  - 宿主把行配置页的键按「组合包名#行 id」拼接；lark-bridge 行放进本包后，行 id 不变也对不上上游注册的键。
  - D-040：`dsh-plugin-lark-bridge` 改由用户自行安装，本包不插入它的行；D-041、D-042 随之消解。
  - D-022：`dsh-plugin-meta-tools` 十一项能力全部开启。
  - 插件冲突由 README 说明、用户处理。

## Review Record

- 2026-11-21 | Decision: Approved | Scope: current full document | Open items: none | Risks: 独立安装的 `dsh-plugin-meta-tools` 与预设子行同时启用时工具重复注册的实际表现待实机验证；桥接会话预设依赖用户手动选择 `SA-调度会话`，选错时只在状态路由提示；其他组合包的全局工具照常叠加进调度会话；分支与目录名 `025-remote-dispatch-session` 与行名 `lark-super-agent` 不一致

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 远程与调度会话对话并派发任务 (Priority: P1)

用户在飞书私聊里给调度会话发一条任务。调度会话判断这是一个新任务，登记进任务笔记，按工作区笔记的关键词选出目标工作区，从程序给出的候选会话中确认复用或新建，用 `SA-任务会话` 预设把任务交出去，并在飞书回执任务落在哪个工作区、由哪个会话执行。用户全程不打开 Web GUI。

**Why this priority**: 这是整行的入口；没有远程派发，其余能力都无从触发。

**Independent Test**: 安装本包与 `dsh-plugin-lark-bridge`，把桥接会话预设选为 `SA-调度会话`，登记两个工作区，从飞书发一条任务，目标工作区出现一个使用 `SA-任务会话` 预设的会话，任务笔记多出一条任务，飞书收到回执。

**Acceptance Scenarios**:

1. **Given** 调度会话已配置且飞书鉴权有效，**When** 用户私聊发一条任务，**Then** 飞书收到回执，内容包含目标工作区与执行会话。
2. **Given** 目标工作区没有候选会话，**When** 派发，**Then** 在该工作区新建使用 `SA-任务会话` 预设的会话，并把任务作为第一条消息。
3. **Given** 用户在一分钟内连发多条消息，**When** 调度会话处理，**Then** 消息按到达顺序处理，任务不丢失、不重复派发。
4. **Given** 飞书鉴权失效或桥接工作区为空，**When** 用户发消息，**Then** 消息不进入调度会话，`dsh-plugin-lark-bridge` 的连接弹窗提示原因。
5. **Given** 调度会话正在等待某个任务会话的结果，**When** 用户在飞书补充要求，**Then** 补充要求转给同一个任务会话，不另开会话。
6. **Given** 用户安装了本包与 `dsh-plugin-lark-bridge`，**When** 打开插件页，**Then** 本包下出现 `lark-super-agent` 行，`dsh-plugin-lark-bridge` 保持独立条目；无需另行安装 `dsh-plugin-meta-tools`。
7. **Given** 用户在 Web GUI 打开调度会话，**When** 直接输入一条任务，**Then** 调度会话按普通对话处理并照常派发。

---

### User Story 2 - 调度会话与任务会话双向通信 (Priority: P1)

调度会话把任务交给任务会话之后，双方能继续对话：调度会话可以追问、补充要求或叫停；任务会话用 `send_report` 上报进展、提问、交付结果。每份上报以 `<work_session_message>` 块注入调度会话，同时由程序存档。任务会话运行失败时，程序告知调度会话。

**Why this priority**: 单向派发只能算留言；双向通信才能让调度会话对结果负责。

**Independent Test**: 派发一个会中途提问的任务，任务会话用 `send_report` 发出提问，调度会话收到块后转达用户，用户回答后调度会话把答案送回任务会话，任务完成；上报存档中有这两份上报。

**Acceptance Scenarios**:

1. **Given** 任务会话正在执行派发的任务，**When** 它调用 `send_report`，**Then** 调度会话收到一个 `<work_session_message sessionid="…" reportid="…">` 块，`sessionid` 是该任务会话，`reportid` 由程序生成且不重复。
2. **Given** 上报带 `text` 与 `files`，**When** 注入，**Then** 块内 `<text>` 子块是原文，`<files>` 子块列出文件路径。
3. **Given** 任一上报，**When** 注入完成，**Then** 上报存档中出现一份与 `reportid` 对应的记录，`files` 指向的文件已复制进存档，并已提交 git。
4. **Given** 任务会话调用 `send_report` 时 `text` 与 `files` 都省略，**When** 工具执行，**Then** 工具结果返回错误，调度会话收不到上报。
5. **Given** 调度会话收到带文件的上报，**When** 转达用户，**Then** 调度会话读文件后在飞书转述内容。
6. **Given** 调度会话收到需要用户决定的上报，**When** 转达，**Then** 用户通过飞书作答，回答送回原任务会话。
7. **Given** 用户要求停止某个任务，**When** 调度会话执行，**Then** 对应任务会话被停止，飞书回执停止结果。
8. **Given** 任务会话运行失败，**When** 失败发生，**Then** 程序把失败告知调度会话，调度会话通过飞书告知用户。
9. **Given** 任务会话已完成任务，**When** 它上报完成，**Then** 调度会话把任务改为完成，程序自动归档该任务，结果通过飞书交付给用户。

---

### User Story 3 - 调度会话记笔记 (Priority: P1)

调度会话对每条用户消息先判断它是不是新任务：「查一下 xxx」是新任务；「之前那个 xxx 做完了吗」「现在有哪些任务」「<引用消息>要注意 xxx」都不是。判断结果与任务状态写进 message-task-status 笔记。用户讲到工作区的身份时，例如「xxx 工作区是 xxx 项目，关键词 xxx」，调度会话写进工作区笔记。用户讲到某个工作区的做法时，例如「xxx 工作区的 xxx 要如何做」，调度会话写进调度工作区的 AGENTS.md 当记忆，自行编写、自行提交。两份 JSON 笔记经专用写工具修改，每次变更由工具提交一次 git。

**Why this priority**: 笔记是调度会话保持判断一致的依据；会话上下文被压缩后，笔记仍保留全部任务与工作区信息。

**Independent Test**: 依次发「查一下 A」「A 做完了吗」「B 工作区是 B 项目，关键词 b」「B 工作区的发布要先跑测试」，检查三份文件的变化与 git 历史。

**Acceptance Scenarios**:

1. **Given** 用户发「查一下 xxx」，**When** 调度会话处理，**Then** message-task-status 新增一个任务，状态为进行中，并关联这条消息。
2. **Given** 用户发「之前那个 xxx 做完了吗」或「现在有哪些任务」，**When** 调度会话处理，**Then** 不新增任务；针对某个任务的追问进入该任务的消息列表，「现在有哪些任务」不进入笔记；调度会话按笔记回答。
3. **Given** 用户引用一条消息并补充「要注意 xxx」，**When** 调度会话处理，**Then** 不新增任务，补充要求转给被引消息关联的任务会话。
4. **Given** 用户说「xxx 工作区是 xxx 项目，关键词 xxx」，**When** 调度会话处理，**Then** 工作区笔记中该工作区的说明与关键词被更新。
5. **Given** 用户说「xxx 工作区的 xxx 要如何做」，**When** 调度会话处理，**Then** 调度会话把这条做法写进调度工作区的 AGENTS.md 并自行提交，之后的调度会话能读到。
6. **Given** 两份 JSON 笔记的任一变更，**When** 写入完成，**Then** git 历史多出一次提交，工作区没有未提交的笔记改动。
7. **Given** 调度工作区不是 git 仓库，**When** 第一次写笔记，**Then** 程序先初始化 git，再提交。
8. **Given** 一个任务已经有两条关联消息，**When** 用户再引用该任务补充一句，**Then** 该任务的消息列表变为三条，任务数不变。
9. **Given** 某任务被改为完成，**When** 程序自动归档，**Then** message-task-status 中该任务及其消息已移除；归档中有该任务的条目、消息列表、全部 `reportid` 与参与过的 `sessionid`，其上报目录一并进入归档，并已提交 git。
10. **Given** 任务命中一个已注册但未登记进工作区笔记的工作区，**When** 派发，**Then** 调度会话请用户先登记，不在该工作区发起会话。

---

### User Story 4 - 用预设划定两个会话的能力边界 (Priority: P2)

`SA-调度会话` 与 `SA-任务会话` 是两个预设，工具集各不相同。调度会话只保留标准预设中的 11 个基础工具，加上工作区与会话管理、笔记写工具和远程通知；任务会话拿到标准预设的执行工具加一个上报工具。两者都没有 `ask_user_question`，因为提问要走飞书，不能卡在本机无人回答。

**Why this priority**: 能力边界决定调度会话能派发而不越权动手、任务会话能干活而不越权操作其他会话。

**Independent Test**: 分别用两个预设新建会话，查看工具列表，与规格列出的清单逐项比对。

**Acceptance Scenarios**:

1. **Given** 用 `SA-调度会话` 新建会话，**When** 查看可用工具，**Then** 标准预设部分只有 `pwsh`、`bash`、`edit`、`read`、`write`、`read_image`、`glob`、`grep`、`web_fetch`、`web_search`、`skill`，另含 `dsh-plugin-meta-tools` 的十一项能力、笔记写工具与 `lark_notify`。
2. **Given** 用 `SA-任务会话` 新建会话，**When** 查看可用工具，**Then** 与标准预设相同，另含 `send_report`，且不含工作区与会话管理能力。
3. **Given** 任一预设的会话，**When** 查看可用工具，**Then** 都没有 `ask_user_question`。
4. **Given** 用户在插件页停用 `dsh-plugin-lark-bridge`，**When** 调度会话尝试通知用户，**Then** 通知失败并给出可读原因，调度会话的其余能力不受影响。
5. **Given** `SA-任务会话` 的会话，**When** 读取其系统提示词，**Then** 提示词说明正文输出用户不可见，要求经 `send_report` 交互与提问，并约束超时与卡住时的做法。
6. **Given** `SA-调度会话` 的会话，**When** 读取其系统提示词，**Then** 提示词说明 `<work_session_message>` 块的格式、上报的处理方式、消息分类规则、三类笔记的用法与任务卡住时的做法。
7. **Given** `SA-调度会话` 的会话，**When** 读取其系统提示词，**Then** 提示词要求每个任务都派给 worker 会话，调度会话只在调度工作区内读写，匹配不到工作区时先请用户新增工作区或补充 summary / keywords。
8. **Given** 新建一个普通会话，**When** 查看预设选择，**Then** 两个预设都可选，默认预设保持不变。

---

### User Story 5 - 复用已有会话而不是重复开工 (Priority: P3)

同一件事需要多轮推进时，程序按规则给出候选会话，调度会话从候选中确认复用，保留之前的上下文；候选都不合适时才新建。

**Why this priority**: 复用能省下重复交代的成本；没有它功能仍可用，只是每次都要从零开始。

**Independent Test**: 在一个已有任务会话的工作区派发同主题的后续任务，工作区不新增会话，原会话收到新消息。

**Acceptance Scenarios**:

1. **Given** 任务笔记里有同主题的任务会话，**When** 派发，**Then** 程序把它列为候选，调度会话确认后消息进入该会话，不新建会话。
2. **Given** 程序给出多个候选会话，**When** 派发，**Then** 调度会话选出最相关的一个，并在回执中说明选择。
3. **Given** 候选会话正在运行其他任务，**When** 派发，**Then** 调度会话要么排队等待，要么新建会话，并把选择结果告知用户。
4. **Given** 候选都不合适，**When** 调度会话决定新建，**Then** 新会话使用 `SA-任务会话` 预设。

---

### Edge Cases

- 桥接工作区被移除或目录被删除时，远程消息如何处置。
- 用户把任务发给调度会话，而目标任务会话正在等待用户输入时，两条输入如何合并。
- 两个任务同时命中同一个工作区且都要求复用同一个运行中会话时，先后顺序如何确定。
- 用户要求把进行中的任务转给另一个工作区时，原会话如何收尾。
- 任务会话被用户在 Web GUI 手动归档或停止时，调度会话如何得知。
- 用户手动归档或删除调度会话后，下一条飞书消息落入哪个会话。
- 任务会话被用户改用其他预设重建后，`send_report` 工具不存在。
- 不是由调度会话派发的会话调用 `send_report`。
- `files` 中的路径不存在、不是 Markdown，或在复制前被删除。
- `<text>` 中含有 `</work_session_message>` 等闭合标签。
- 单份报告文件超过飞书单条消息的长度上限。
- 笔记 JSON 被用户手工改坏，或与 git 历史冲突。
- 调度会话改了 AGENTS.md 却没有提交。
- 调度工作区已是 git 仓库且有用户自己的未提交改动。
- 本机没有安装 git，或 git 未配置用户名与邮箱。
- git 提交失败时，笔记文件已写入但未提交。
- 用户把同一件事先说成任务、又说成补充要求，分类前后矛盾。
- 用户在插件页停用 `dsh-plugin-lark-bridge` 时，正在等待回复的任务会话如何收场。
- 用户没有安装 `dsh-plugin-lark-bridge`，或桥接会话没有选 `SA-调度会话` 预设。
- 同一 profile 里同时启用了独立安装的 `dsh-plugin-meta-tools`。
- 用户在新会话里选不到两个预设时，如何确认补丁已生效。

## Requirements *(mandatory)*

### Functional Requirements

**行与预设**

- **FR-001**: 本包 MUST 新增一行 `lark-super-agent`，描述为「基于飞书的任务与调度会话」，可在插件页与其他行分别启停。
- **FR-002**: 本包 MUST 以包依赖声明 `dsh-plugin-meta-tools`，安装本包即提供它；用户 MUST NOT 被要求单独安装它。
- **FR-003**: `dsh-plugin-lark-bridge` MUST 由用户自行安装；本包 MUST NOT 插入它的行。
- **FR-004**: `dsh-plugin-lark-bridge` 未安装或已停用时，`lark-super-agent` 行 MUST 在状态路由中报告远程通信不可用及原因，其余能力照常。
- **FR-005**: `lark-cli` 的前置检查与命令提示 MUST 由 `dsh-plugin-lark-bridge` 自带的连接弹窗提供，本包 MUST NOT 另做一套。
- **FR-006**: `dsh-plugin-meta-tools` MUST NOT 作为 profile 行出现；它的能力只出现在 `SA-调度会话` 预设的会话中，十一项能力 MUST 全部开启，新建会话的默认预设 MUST 为 `sa-worker`。
- **FR-007**: 本包 MUST 随补丁提供两个预设：`config.id` 为 `sa-dispatch`、展示名称 `SA-调度会话`；`config.id` 为 `sa-worker`、展示名称 `SA-任务会话`。两个预设 MUST NOT 成为新会话默认。
- **FR-008**: `SA-调度会话` 从标准预设 MUST 只保留 `pwsh`、`bash`、`edit`、`read`、`write`、`read_image`、`glob`、`grep`、`web_fetch`、`web_search`、`skill` 这 11 个工具，再加入 `dsh-plugin-meta-tools` 的全部能力与笔记写工具；`lark_notify` 经用户安装的 `dsh-plugin-lark-bridge` 全局行叠加可见。
- **FR-009**: `SA-调度会话` 引入的标准预设插件 MUST NOT 带入 FR-008 以外的工具；`apply_patch` MUST 保持关闭。
- **FR-010**: `SA-调度会话` MUST 保留 `persona`、`agent-instructions`、`time-context`、`skill-filesystem` 与压缩组，MUST NOT 包含 `command-goal` 与 `tool-jobs`。
- **FR-011**: `SA-任务会话` MUST 以宿主标准预设为基准，去掉 `tool-ask-user` 行，再加入 `send_report`。
- **FR-012**: 两个预设 MUST NOT 包含 `ask_user_question`；会话需要用户决定时 MUST 经调度会话转达。
- **FR-013**: 调度会话即 `dsh-plugin-lark-bridge` 的桥接会话；用户 MUST 在其配置页把桥接会话的预设选为 `SA-调度会话`。桥接会话使用其他预设时，`lark-super-agent` 行 MUST 在状态路由中提示。
- **FR-014**: 本行 MUST NOT 重新实现飞书收发、会话控制或工作区管理。
- **FR-015**: 停用 `lark-super-agent` 行 MUST 只停止上报注入、失败通知、笔记写工具与自动归档；`dsh-plugin-lark-bridge` 的行为 MUST 保持原样。

**远程通信**

- **FR-016**: 用户 MUST 能通过飞书私聊向调度会话发送消息，并收到调度会话的回复。
- **FR-017**: 调度会话 MUST 只接受已授权用户的私聊消息。
- **FR-018**: 远程消息 MUST 按到达顺序进入调度会话，并去重。
- **FR-019**: 用户 MUST 能在 Web GUI 打开调度会话，按普通对话与之交流。
- **FR-020**: 调度会话 MUST 在任务开始、任务结束与任务会话提问时通过飞书告知用户；进展类上报由调度会话自行决定合并或推送。

**派发**

- **FR-021**: 调度会话 MUST 能列出已注册工作区及其路径、会话数与可用状态。
- **FR-022**: 调度会话 MUST 根据任务内容与工作区笔记的关键词选择一个目标工作区。
- **FR-023**: 调度会话 MUST 只在工作区笔记登记过的工作区发起任务会话；未登记的工作区 MUST 先请用户登记。
- **FR-024**: 程序 MUST 按规则为派发给出候选会话；调度会话 MUST 从候选中确认复用，或决定新建。
- **FR-025**: 新建的任务会话 MUST 使用 `SA-任务会话` 预设，并把任务作为第一条消息。
- **FR-026**: 派发完成 MUST 向用户回执目标工作区、执行会话与任务标识。
- **FR-027**: 无法确定目标工作区时，调度会话 MUST 请用户选择，MUST NOT 自行选择后开工。
- **FR-028**: 用户 MUST 能要求停止某个已派发的任务，调度会话 MUST 停止对应任务会话并回执。
- **FR-029**: 工作区目录失效时 MUST 标记为不可用并从派发候选中排除。

**双向通信**

- **FR-030**: 调度会话 MUST 能向任务会话发送消息，消息在对方下一步送达。
- **FR-031**: `SA-任务会话` MUST 提供上报工具 `send_report({ text?: string, files?: string[] })`，把进展、提问与结果送达调度会话。
- **FR-032**: `text` MUST 承载给用户的话或提问；`files` MUST 承载任务会话已写好的 Markdown 文件路径，MAY 省略。
- **FR-033**: `text` 与 `files` 同时省略时，`send_report` MUST 在工具结果中返回错误，MUST NOT 注入调度会话。
- **FR-034**: 每次上报 MUST 以如下块注入调度会话：外层 `<work_session_message sessionid="…" reportid="…">`，内含 `<text>` 与 `<files>` 两个子块；`<files>` 列出文件路径。
- **FR-035**: `sessionid` MUST 是发起上报的任务会话标识；`reportid` MUST 由程序生成，且在全部上报中唯一。
- **FR-036**: 注入块 MUST 转义上报内容中的闭合标签，块结构 MUST NOT 被上报内容破坏。
- **FR-037**: 任务会话运行失败时，程序 MUST 告知调度会话，内容包含失败的会话与原因。
- **FR-038**: 超时与卡住 MUST 由两个预设的系统提示词约束，程序 MUST NOT 另设超时检测。
- **FR-039**: `SA-任务会话` 的系统提示词 MUST 说明：会话的正文输出用户看不到；正文 SHOULD 精简；与用户交互、向用户提问 MUST 通过 `send_report`；长篇结果 SHOULD 写成 Markdown 文件并经 `files` 交付；长时间无进展时 SHOULD 上报现状。
- **FR-040**: `SA-调度会话` 的系统提示词 MUST 说明 `<work_session_message>` 块与失败通知的格式、如何转达给用户、如何读文件后转述、如何把用户的回答送回原任务会话，以及任务长时间无上报时的做法。
- **FR-041**: 调度会话收到带文件的上报时 MUST 读文件后在飞书转述，MUST NOT 只转发路径。

**笔记**

- **FR-042**: 调度会话 MUST 维护 message-task-status 笔记。笔记以任务为主键，每个任务记录状态、目标工作区、执行会话、关联上报与消息列表；发起任务的消息与之后针对该任务的补充、追问都进入该任务的消息列表，一个任务 MAY 关联多条用户消息。
- **FR-043**: 调度会话 MUST 判断每条用户消息的类别：「要求做一件新的事」判为新任务；追问进度、查询任务列表、对已有任务的补充要求判为非任务。
- **FR-044**: 调度会话 MUST 维护工作区笔记，每个工作区记录 `workspaceId`、`path`、`summary`、`keywords`、`notes`。
- **FR-045**: 用户的说明 MUST 随写入立即生效，调度会话的下一次派发即使用新内容。
- **FR-046**: 程序 MUST 自动存档每一份上报：按任务分目录，每份上报一个 Markdown 文件，文件名含 `reportid`；文件 MUST 包含 `reportid`、`sessionid`、时间与 `text`；`files` 指向的文件 MUST 复制进同一目录。
- **FR-047**: 任务状态改为完成时，程序 MUST 自动归档该任务，调度会话 MUST NOT 需要另外调用归档。
- **FR-048**: 归档 MUST 以任务为单位：该任务的条目与消息列表 MUST 从 message-task-status 移除并写入归档；该任务的上报目录 MUST 一并进入归档。
- **FR-049**: 每个归档的任务 MUST 记录其全部 `reportid` 与参与过的全部 `sessionid`。
- **FR-050**: 调度会话 MUST 把用户关于工作区做法的说明写进调度工作区根目录的 AGENTS.md，用 `write`、`edit` 编写，并用 shell 自行提交 git。
- **FR-051**: 笔记、上报存档与任务归档 MUST 以文件形式存放在调度工作区内。
- **FR-052**: 本行 MUST 为 message-task-status 与工作区笔记提供专用写工具；工具 MUST 校验写入内容的结构，MUST NOT 写出无法解析的笔记文件。
- **FR-053**: 调度工作区不是 git 仓库时，程序 MUST 在首次写笔记前初始化 git。
- **FR-054**: 两份 JSON 笔记、上报存档与任务归档的每次变更 MUST 由程序以一次 git 提交记录，提交信息由程序生成，作者沿用本机 git 配置。
- **FR-055**: `SA-调度会话` 的系统提示词 MUST 要求调度会话在修改 AGENTS.md 后自行提交 git。
- **FR-056**: git 提交 MUST 只包含本次变更的文件，MUST NOT 带入调度工作区里用户的其他改动。
- **FR-057**: git 初始化或提交失败时，工具 MUST 返回可读的失败原因，已写入的文件 MUST 保留。

**质量与文档**

- **FR-058**: 代码变更 MUST 同步更新 `tests/`，两个新行、两个预设、`send_report`、失败通知、笔记写工具与自动归档 MUST 有对应的单元测试。
- **FR-059**: 用户可见行为 MUST 记录在 `README.md`；机制、风险与文件结构变化 MUST 更新对应归属文档。
- **FR-060**: `README.md` MUST 说明需要另行安装 `dsh-plugin-lark-bridge`，并说明在其配置页选择调度工作区与 `SA-调度会话` 预设。
- **FR-061**: `README.md` MUST 说明插件冲突：独立安装的 `dsh-plugin-meta-tools` 与本包预设中的子行同时启用时，同名工具注册两次；处理方式由用户决定，例如停用独立安装的版本。

**调度边界**

- **FR-062**: `SA-调度会话` 的系统提示词 MUST 要求每个任务都指派给已登记工作区里的 worker 会话，查一条信息与读一个文件同样如此；调度会话的读写 MUST 限于调度工作区的笔记、任务归档与报告，MUST NOT 在项目工作区读写文件或执行命令，MUST NOT 建议用户由调度会话自己做。
- **FR-063**: `SA-调度会话` 的系统提示词 MUST 要求建任务前按 `workspaces.json` 的 `summary` 与 `keywords` 匹配工作区；无匹配时 MUST 请用户新增工作区或给现有工作区补充 `summary` / `keywords`，工作区确定前 MUST NOT 开工；多个候选或匹配模糊时 MUST 问清后再派。
- **FR-064**: `SA-调度会话` 的系统提示词 MUST 把项目巡检、改代码、跑构建、装环境等操作派给 worker，调度会话只执行服务于派发的操作。

### Key Entities

- **lark-super-agent 行**：本包新增的行，承载上报注入、失败通知、笔记写工具与自动归档。
- **调度会话**：即 `dsh-plugin-lark-bridge` 的桥接会话，使用 `SA-调度会话` 预设，是用户远程对话的唯一落点。
- **调度工作区**：桥接配置的工作区，存放笔记、上报存档、任务归档与 AGENTS.md，是一个 git 仓库。
- **任务会话**：工作区内执行派发任务的会话，按 `SA-任务会话` 预设创建。
- **预设**：一行子插件清单，决定该会话能看到哪些工具；本包提供 `sa-dispatch` 与 `sa-worker`。
- **候选会话**：程序按规则为一次派发列出的可复用会话。
- **上报**：任务会话经 `send_report` 送给调度会话的消息，由 `reportid` 标识，包含可选的文本与可选的 Markdown 文件列表。
- **失败通知**：任务会话运行失败时，程序发给调度会话的消息。
- **message-task-status 笔记**：以任务为主键、挂消息列表的 JSON 文件，只保存未归档的任务。
- **任务**：一件由用户发起的事，具有状态、目标工作区、执行会话、关联上报与消息列表。
- **工作区笔记**：记录工作区说明与关键词的 JSON 文件；登记其中的工作区才可派发。
- **上报存档**：全部上报的文件记录，按任务分目录，含复制进来的报告文件。
- **任务归档**：已完成任务的记录，包含任务条目、消息列表、全部 `reportid`、参与过的 `sessionid` 与上报目录。
- **记忆**：写进调度工作区 AGENTS.md 的工作区做法说明，由调度会话自行维护与提交。
- **远程消息**：用户通过飞书发来的私聊消息，以及调度会话回复的消息。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 用户从飞书发出一条任务到收到派发回执，在 10 个已登记工作区的环境下不超过 1 分钟。
- **SC-002**: 用户在 3 个工作区、10 个任务的测试集上完成「发任务、查进展、收结果、叫停」全流程，全程不打开 Web GUI。
- **SC-003**: 在 10 个工作区各有笔记的测试集上，10 条带明确主题的任务中至少 9 条派发到用户预期的那个工作区。
- **SC-004**: 在包含 20 条消息的分类测试集上（新任务、追问、查询列表、引用补充各 5 条），至少 18 条分类正确。
- **SC-005**: 每一次成功的 `send_report` 都在上报存档中有且只有一份对应记录，`reportid` 无重复。
- **SC-006**: 每一次笔记、存档或归档变更后，调度工作区的 git 状态中没有未提交的笔记文件。
- **SC-007**: 每个完成的任务归档后，message-task-status 中不再有该任务；归档记录的 `reportid` 与该任务在上报存档中的记录一一对应。
- **SC-008**: 任务会话运行失败后，调度会话在下一步收到失败通知。
- **SC-009**: 用户在新 profile 中安装本包与 `dsh-plugin-lark-bridge`，按 README 完成两项配置后即可获得远程派发能力，无需单独安装 `dsh-plugin-meta-tools`。
- **SC-010**: 两个预设的会话工具清单与 FR-008、FR-011 逐项一致，两者都没有 `ask_user_question`。

## Assumptions

- 用户是单人使用，飞书侧只有一位已授权用户，与 `dsh-plugin-lark-bridge` 的授权模型一致。
- `dsh-plugin-meta-tools` 作为本包的依赖随包安装；`dsh-plugin-lark-bridge` 由用户自行安装与配置。
- `lark-cli` 的安装、`config init` 与授权由用户在本机完成，本包只使用它当前生效的配置。
- 本机已安装 git；git 的用户名与邮箱由用户配置。
- 调度会话不做定期归档；会话上下文的长度由压缩组控制，跨会话信息由笔记与 AGENTS.md 保存。
- 其他组合包的全局工具照常叠加进调度会话，本行不做收窄。
- 远程消息只承载文本；图片与附件不在本次范围内。
- 本行只服务当前这一个 DSH 实例。
- 组合包保持一行根行加若干功能行的结构，本次新增 `lark-super-agent` 一行。

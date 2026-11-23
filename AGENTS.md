# 项目说明

DSH 插件 `dsh-plugin-practical-tool-bundle`（中文标题「DSH实用工具组合包」）。一个包内的六行：一键清理会话、推理报错自动重试、加载项目 Claude 技能、重启按钮、手机大按钮、官方功能开关。

- 常用 pnpm 脚本：`dev`、`build`、`check`、`full-check`、`release`、`test:code`、`test:dist`、`lint`、`lint:fix`、`format`。
- 命令说明见 [development.md](./docs/development.md#命令)。

# 文档索引

- [README.md](./README.md)：面向用户的功能简介。
- [how-it-works.md](./docs/how-it-works.md)：行结构、路由与前端装卸。
- [known-risks.md](./docs/known-risks.md)：已知风险与宿主限制。
- [development.md](./docs/development.md)：本地开发、命令、测试与文件地图。
- [i18n.md](./docs/i18n.md)：插件与行元数据、前端字典的国际化规范。

# 主工作区

主工作区指仓库根目录的检出，即 `git worktree list` 的第一项。

- 主工作区 MUST 位于 `main` 分支，并保持干净：`git status --porcelain` 输出为空。
- 状态不满足上述约束时，先恢复再继续：未提交变更存入 stash，其他分支切回 `main`，未推送的提交保存在临时分支。
- 在主工作区只运行 `git fetch`、`git pull` 与可恢复的操作。可恢复的操作指不丢失已提交内容与未提交变更的操作：
  - `git stash`
  - `git switch`
  - `git branch`
  - `git reset --hard`，只在目标提交已保存到临时分支时使用
  - `git worktree remove`
  - `git branch -D`
- 任何变更 MUST 在 worktree 中进行，文档、配置、spec 与代码同样适用。

# 开发流程

在用户给出需求、缺陷或其他变更要求时，**立刻**获取 skill `speckit-specify` 的内容，并按流程推进。

| 步骤 | skill | 执行条件与要求 |
| --- | --- | --- |
| 1 | `speckit-specify` | 必做。生成规格草稿与待确认决策，固定进入 clarify |
| 2 | `speckit-clarify` | 必做。先完成代码库与文档探索，再按依赖分批确认全部需求；每批提出当前全部独立问题。写回后由用户审查完整规格，获得 `Approved` 或 `Waived` 才能计划 |
| 3 | `speckit-plan` | 必做。先核验规格门禁，再完成技术探索并按依赖分批确认全部实现细节；用户审查完整计划并获得 `Approved` 或 `Waived` 才能生成任务。Constitution Check MUST 逐条通过 |
| 4 | `speckit-tasks` | 必做。先核验规格与计划状态，以及全部待确认决策 |
| 5 | `speckit-analyze` | 按需 |
| 6 | `speckit-implement` | 必做。实现前复核门禁；出现新未决项时暂停受影响工作，返回对应探索、访谈与审查 |
| 7 | `speckit-worktree-finish` | 用户验收或放弃后执行 |

实施：

- `tasks.md` 的每个阶段 MUST 对应一个 commit。
- 阶段内标记 `[P]` 的任务可交给子代理并行。

# 发布前检查

- 全部跟踪文件只包含公网 URL 与仓库内路径，规则见[宪章](./.specify/memory/constitution.md)原则 V。
- 密码、令牌、私钥与本机专属路径不得进入提交，包含提交历史。

# 写作规范

适用于所有由 AI 产出的文档、注释、spec、plan、提交说明与回复。

- 简洁优先。只写必要信息，删除铺垫、重复和流水账。
- 用读者熟悉的词。沿用代码、宿主文档和业界的现有名称，不自造术语。
- 一句话只讲一件事。内容超过一行时拆成有序列表、无序列表或表格。
- 直接写结论。少用括号和破折号补充解释，需要补充时另起一句。
- 用肯定句描述应该怎样做。
- 禁用两类句式：
  - 堆叠否定，例如「A，不 B，不 C」。仅写A。
  - 「不是 A，而是 B」。直接写 B。
- 只描述当前状态，不写新旧对比或变更过程。

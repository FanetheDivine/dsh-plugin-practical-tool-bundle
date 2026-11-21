# Research: 管理官方功能

所有结论来自 `0.2.2-rc.5` 的安装内容与临时 profile 上的实测。临时 profile 只装 `dsh-base` 与 `dsh-web-app`，`patchReload: live`，探针行经 `--patch` 覆盖层插入，用完即删。

## R-001 运行期改 Loader 行是否可行

- **Decision**: 用 `loader.update(id, { disabled })` 停用宿主行，用 `loader.update(id, { config })` 改写 preset 声明。
- **Rationale**: 两者都生效，且不写 `cordis.yml`、`cordis.patch.yml`、`package.json`，内容哈希前后一致。
- **Alternatives**:
  - 写 profile 补丁：卸载后清理不可靠，违反 FR-014。
  - 新建 preset 声明并切换默认：宿主行仍要单独处理，且用户看到另一个 preset。

## R-002 preset 声明的改写

- **Decision**: 枚举 `options.name === '@deepseek-ai/dsh-agent-preset'` 的全部条目，对每个条目的 `options.config.plugins` 递归移除受管子行，再整体 `update` 回去。
- **Rationale**:
  - 实测枚举到 `standard`、`ptc`、`minimal`、`cordis` 四个声明，用户新建的 preset 也会被同一规则覆盖。
  - 摘掉 `tool-goal` 后 `standard` 的模块数 27 → 26，只少 `dsh-tool-goal`。
  - 把保存的原始 `config` 放回后回到 27，正反两个来回可重复。
  - raw config 里的 `!!js` 表达式保存为 `{ __jsExpr }` 对象，`structuredClone` 后仍由 Loader 求值，Windows 上 `tool-bash` 仍缺席、`tool-pwsh` 仍在。
- **Alternatives**: 按子行 id 匹配会漏掉用户改过 id 的行，因此按模块名匹配，id 只作为展示。

## R-003 重组会冲掉运行期改动

- **Decision**: 订阅 `app-boot/config-reload`，每次触发后重新施加。
- **Rationale**: 触碰 profile 补丁文件后事件触发 1 次，宿主行与 preset 配置全部回到文件状态。本包自己的 `update` 不触发该事件，不会循环。
- **Alternatives**: 只在启动时施加，则任何一次配置编辑都会让面板与真实能力再次不一致。

## R-004 生效延迟

- **Decision**: 面板在操作后轮询真实状态，最多 2 秒。
- **Rationale**: 撤销后 1.2 秒读到旧 revision，1.5 秒一致。
- **Alternatives**: 立即读回会显示旧状态；乐观显示在失败时要回滚，已在 D-022 排除。

## R-005 停用宿主行的波及范围

对九个宿主行逐个停用并比较全部条目状态：

| 行 | 结果 |
| --- | --- |
| `schedule`、`ui-schedule`、`ui-goal`、`ui-plan`、`deliverable-file-references` | 只有自己变化 |
| `goal` | `goal-round-driver` 同时由 ACTIVE 回到 PENDING，因为它依赖 `goal` 服务 |
| `goal-round-driver` | 只有自己变化 |
| `tool-todo`、`plan-mode` | Web 面本来已停用，无变化 |

- **Decision**: goal 的受管宿主行为 `goal`、`goal-round-driver`、`ui-goal`；全部还原后与基线一致。
- **Rationale**: 全部停用再还原后，全部条目状态与基线一致，没有残留。

## R-006 受管行清单

| 功能 | 宿主行 | preset 子行（按模块名） |
| --- | --- | --- |
| 自动化任务 | `schedule`、`ui-schedule` | `@deepseek-ai/dsh-tool-schedule` |
| goal | `goal`、`goal-round-driver`、`ui-goal` | `@deepseek-ai/dsh-command-goal`、`@deepseek-ai/dsh-tool-goal` |
| task | `tool-todo` | `@deepseek-ai/dsh-tool-todo` |
| plan | `plan-mode`、`ui-plan` | `@deepseek-ai/dsh-plan-mode`（位于 `planning` 组内，组变空时一并移除） |
| present | `deliverable-file-references` | `@deepseek-ai/dsh-tool-present` |

- `tool-todo`、`plan-mode`、`tool-goal`、`command-goal` 在 Web 面的宿主行本来停用；其状态不计入开关，只有宿主行真正处于启用时才计入。
- `ui-user-questions` 同时承担 `ask_user_question` 的提问界面，见 P-001。
- `minimal` preset 不含任何受管子行，改写对它是空操作。

## R-007 开关状态推导

- **Decision**: 对每个功能收集「当前存在且未被其自身配置停用」的受管行：宿主行看 `disabled` 与 fiber，preset 子行看各声明 `config.plugins` 中是否仍含该模块。有任一项启用即为开。
- **Rationale**: 与 D-010 一致；在 Web 面本来停用的宿主行不参与，否则功能永远显示为关。
- **Alternatives**: 只看宿主行，会让 preset 能力被外部加回时开关显示不准。

## R-008 关闭记录的存放

- **Decision**: 用 `ctx.storageDomain` 打开域 `practical_tool_official_features`，只用一个 `global` 单例，内容 `{ version: 1, off: string[] }`。
- **Rationale**:
  - 实测数据落在 `$DSH_HOME/storages/practical_tool_official_features.json`，profile 三个文件哈希不变。
  - `dsh-settings` 的文档写明变更「通过 active profile 的 Cordis 补丁持久化」，会写 profile，违反 FR-014。
  - 域名必须匹配 `/^[a-z][a-z0-9_]*$/`，包名不合规，所以单独取名。
  - `global` 声明为 `{ schema, initial }`；schema 不得接受 `null`。
  - 每次 `set` 必须写出满足 schema 的完整对象。探针漏写 `version` 后重开得到 `invalid-record`，说明校验确实在持久化边界生效。
  - `zod` 从 profile 祖先 `node_modules` 可解析，探针取得的是 storage-domain 同一份。
  - 真机验证（见 R-011）里本行完成写入与读取，schema 校验在持久化边界生效，`zod` 在已安装插件中可用；两份实例是否同一对象仍未单独证明。
- **Alternatives**:
  - 行自身 config 经 `configEditor` 保存：写 profile 补丁，违反 FR-014。
  - `$DSH_HOME/plugin-data` 下自管 JSON：需要自己处理原子写与格式校验，已被用户在 P-002 否决。
- **Notes**:
  - 同名域未关闭时再次 `open` 返回 `already-open`；行停用时必须在 `ctx.effect` 清理里 `close()`。
  - 记录校验失败时 `open` 会整体拒绝，行按「无记录」继续运行并记录警告，不覆盖原文件。

## R-009 面板挂载位置

- **Decision**: 在 `plugins.row.config` 槽位注册，键 `dsh-plugin-practical-tool-bundle#official-features`，该行页自带 Configure 入口。
- **Rationale**: 行页只在该槽位有登记时存在，行停用时入口消失，符合「本插件关闭后配置不生效」。
- **Alternatives**: `plugins.bundle.config` 会把面板放到整个包页，与其他五行混在一起。

## R-010 浏览器块的装卸

- **Decision**: 沿用根行状态路由，新增 `officialFeatures` 一项；块在该行启用时挂载，停用时卸载。
- **Rationale**: 既有机制已覆盖三个块，不新增前端产物。

## R-011 真机验证

临时 profile 只装 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app`，本包以 `link:` 安装，`patchReload: live`。

| 场景 | 结果 |
| --- | --- |
| 五个开关关闭 | 状态全部为关；`schedule`、`ui-schedule`、`goal`、`goal-round-driver`、`ui-goal`、`ui-plan`、`deliverable-file-references` 行停用；四个 preset 声明里的受管模块全部消失 |
| 关闭后写文件 | profile 的 `cordis.yml`、`cordis.patch.yml` 哈希不变 |
| 重启 | 记录保留在 `$DSH_HOME/storages/practical_tool_official_features.json`，启动时按记录重新施加 |
| 重新打开 | 宿主行按原值恢复（`tool-todo`、`plan-mode` 仍保持 Web 面的默认停用），四个 preset 的受管模块回到原位置 |
| 停用本行 | 记录仍有五项关闭，但宿主行与 preset 全部回到官方默认 |
| 面板 | Plugins 页本包行的「配置」进入面板，五个开关显示真实状态；点击后 2 秒内状态翻转 |

过程中修正了两处实现问题：

- 一条路径只能注册一次：`GET` 与 `POST` 必须合成一条注册并在处理器内按方法分发，否则 `POST` 返回 404。
- 启动早期 hub 条目还没列全：`reapply` 首轮会漏掉排在前面的行，改为施加后按真实状态校验并重试。

# 已知风险

## 宿主版本

- `@deepseek-ai/dsh-*` 处于 rc 阶段，接口可能在版本间变化。
- 插件依赖的 `dsh-*` 版本应与运行它的 DSH 版本一致。
- 实机测试按 `@deepseek-ai/dsh-agent` 的版本选择宿主，版本不一致时安装到 `~/.dsh-local/dsh-<版本>`，全局安装保持不变。

## 安装 rc 依赖

pnpm 的 minimum release age 策略会拒绝发布时间过短的包。

- `@deepseek-ai/dsh-*` 依赖未列入 `minimumReleaseAgeExclude` 时 `pnpm install` 失败。
- 列入规则见[宪章](../.specify/memory/constitution.md)原则 I。

## loader 内部 API

- 聚合状态路由读取 `loader.entries()` 的 `disabled` 与 fiber 状态；这两项属于 loader 内部结构。
- 宿主升级后字段可能变化，表现是状态路由判断错误：界面该出现时没有出现，或该消失时没有消失。
- 条目 id 的组路径前缀由 loader 决定，当前是 `include:<行 id>`；前缀风格变化时按最后一段匹配仍然有效，同名行会取第一个匹配。
- `FiberState` 在运行时不存在，代码按序号 2 判断，改动需要同步核对 cordis 的枚举顺序。

## 官方功能管理

- 运行期覆写属宿主内部契约：`loader.update`、`agentPresets.inspectCompositions` 的替代物（本包直接读 preset 声明的 `config.plugins`）与 `app-boot/config-reload` 都可能随宿主升级变化。
- 覆写是易失的：任何一次配置重组都会还原，本包订阅事件后重新施加；事件未触发或施加失败时，面板会显示真实状态，功能可能回到开启。
- 启动期重新施加依赖宿主 `appReady` 可选服务。宿主不提供该服务时只有启动那次施加，受管行晚于 2 秒装载完成时，该次启动后功能可能仍为开启。
- 两次施加的轮数用尽后只写一条 warn，面板不额外提示；用户只能从开关的真实状态判断关闭未生效。
- 撤销依赖内存里的基线，进程重启后基线丢失，改由记录重新施加；基线只在本次进程内有效。
- 宿主存储域写入不在写入时校验：写出的对象必须自带格式版本。文件被手工改坏时按无记录运行，切换返回 `store-failed`。
- `zod` 作为 peer 由宿主提供，与 storage-domain 声明的版本一致；已安装插件是否取得同一份实例需要实机核对。
- preset 变化只影响之后新建的会话；已存在的会话保持它启动时的组合。
- 关闭功能不删除数据：已排定的任务在重新开启后继续，`goal` 记录保留。

## 共享宿主实例

- 插件运行时使用宿主提供的 cordis、dsh-session、dsh-llm 与 dsh-skill。
- 这些包被打进 bundle 时会产生第二份实例，`appendPluginRecord` 的品牌检查随之失败。
- 保持 external 的规则见 [how-it-works.md](./how-it-works.md#依赖复用)。

## lark-super-agent

### 上游状态文件

- 调度服务读取 `$DSH_HOME/lark-bridge/state.json` 的 `sessionId` 与 `workspaceRoot`。这是 `dsh-plugin-lark-bridge` 的内部存储格式。
- 上游修改路径或字段后，调度会话解析与上报投递会失效；状态路由报告能识别的问题。

### 全局工具叠加

- 全局行与预设子行的工具叠加，`SA-调度会话` 的实际工具集取决于整个 profile。
- 其他组合包可能增加工具或引入同名工具，本行不收窄全局工具。

### 独立 meta-tools 重复

- 独立安装的 `dsh-plugin-meta-tools` 与本包预设子行同时启用时，同名工具会注册两次。
- 用户应停用独立安装的行或预设内的 `meta-tools` 子行。

### 预设手动选择

- 用户必须在 lark-bridge 配置页手动把桥接会话预设选为 `SA-调度会话`。
- 选错预设时，桥接会话缺少调度工具与提示词；`GET /api/dsh-practical-tools/lark-super-agent/status` 的 `issues` 报告该问题。

### shell 后台任务

- `SA-调度会话` 不含 `tool-jobs`，shell 工具没有 `run_in_background` 参数。
- 命令超时后会被终止，不会转入后台任务。

## 删除会话

- 清理会永久删除会话日志目录，无法撤销。
- 主视图正在显示的会话与运行中的会话会被跳过或延后。
- 已归档集合中仍有条目但日志已消失的会话不再出现在计数里。

## 重启

- 桌面重启依赖 Windows 的 `explorer.exe` 与 Windows Script Host；两者不可用时返回失败原因与日志路径。
- 网页场景在受理后退出当前进程；端口被其他进程占用时新进程可能启动失败，日志在 `~/.dsh/logs`。
- 页面在重启期间需要持续轮询，浏览器休眠会推迟刷新。

## 前端产物

- 前端产物是宿主约定的闭包工厂格式，格式变化时表现为界面不出现。
- `PLATFORM_MODULES` 是宿主冻结模块表的副本，宿主升级后需要核对。
- 前端服务可选：`slots`、`locale`、`workspaces` 缺失时对应功能静默跳过。
- 状态路由请求失败时保留当前界面，因此行停用后最多延迟一个轮询周期才消失。

## 技能监听

- 技能目录不存在时按 5 秒间隔探测，目录创建前不会报错。
- 同时监听的项目数上限为 64，超出后淘汰最久未使用的项目。
- 单个技能文件超过 256KB 时跳过。

## 手机样式

- 远程页面走 `fetch` 注入样式，注入前页面按原尺寸绘制，可能出现一次尺寸跳变。
- 样式依赖宿主既有的 767px 断点与手机侧栏结构；宿主改版后选择器可能失效。

## Windows 长路径

`node_modules` 嵌套很深，路径可能超过 Windows 的 260 字符上限。

- `git worktree remove` 此时报错 `Filename too long`。
- `finish-worktree.sh` 遇到该错误时用 Node.js `rmSync` 删除目录，再运行 `git worktree prune`。

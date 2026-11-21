# 工作机制

## 包结构

一个 npm 包承载六行。宿主按 `cordis.patch.yml` 的 `name` 分别 import 各入口。

| 入口 | 行 id | 作用 |
| --- | --- | --- |
| `dist/index.mjs` | `dsh-plugin-practical-tool-bundle` | 根行：聚合状态路由，并拥有浏览器半部 |
| `dist/sweeper.mjs` | `session-sweeper` | 归档并删除已归档会话的日志 |
| `dist/reasoning-reset.mjs` | `reasoning-reset` | 去掉被拒绝的历史推理块并重试 |
| `dist/claude-skills.mjs` | `claude-skills` | 注册项目 `.claude/skills` 技能来源 |
| `dist/restart.mjs` | `restart-button` | 重启路由 |
| `dist/mobile.mjs` | `mobile-touch-ui` | 手机样式表路由 |
| `dist/official-features.mjs` | `official-features` | 官方功能状态路由与运行期开关 |
| `dist/client.js` | 随根行 | 浏览器半部：四块界面与状态轮询 |

`assets/launcher.cjs` 由重启行以 detached 进程启动，`assets/mobile.css` 由手机样式行读取。两者用 `new URL('../assets/...', import.meta.url)` 定位，因此必须随包发布。

## 行与路由

全部路由在 `/api/dsh-practical-tools/` 下，位于宿主的 `/api` 认证围栏内。

| 路由 | 行 | 说明 |
| --- | --- | --- |
| `GET /status` | 根行 | 六行是否可用 |
| `POST /sweep` | `session-sweeper` | 归档未置顶会话并删除已归档日志 |
| `GET /restart/info` | `restart-button` | 当前进程标识与运行形态 |
| `POST /restart` | `restart-button` | 重启服务或应用 |
| `GET /mobile.css` | `mobile-touch-ui` | 手机样式表 |
| `GET /official-features` | `official-features` | 五项官方功能的开关状态 |
| `POST /official-features` | `official-features` | 打开或关闭一个官方功能 |

路由注册用 `ctx.inject(['connection'], ...)` 加 `ctx.effect`，行被停用时注册随 fiber 释放。启动器与代次判断另需 `webServer`。

## 状态路由与前端装卸

前端产物属于根行：根行停用即整份浏览器半部下线，也不会再发出状态请求。

- `GET /status` 每次请求读取 `ctx.get('loader')`，用 `loader.entries()` 按行 id 找到条目，判断 `disabled` 与 fiber 是否处于 ACTIVE。
- 运行时条目 id 带组路径前缀，bundle 行是 `include:<行 id>`；查找先按完整 id，再按最后一段匹配。
- `FiberState` 在 cordis 中是 `const enum`，运行时没有值，代码按序号 2 比较。
- loader 不可用时六项都回答 `null`；前端对 `null` 保持当前界面。
- 前端每 3 秒轮询一次，且只在页面可见时轮询；`visibilitychange` 与 `focus` 会立即补一次。
- 每个界面块是一个子插件：启用时 `ctx.plugin()` 挂载，停用时 `fiber.dispose()` 卸载，槽位注册与样式随 fiber 回收，不需要刷新页面。

## 官方功能管理

官方能力在宿主里分散在三处：宿主配置中的行、每个 preset 声明里的子行、以及界面行。Web 面把多数宿主行停用，改由 preset 的 `config.plugins` 挂载，所以只改宿主行不影响会话能力。

### 受管行

| 功能 | 宿主行 | preset 子行模块名 |
| --- | --- | --- |
| `schedule` | `schedule`、`ui-schedule` | `@deepseek-ai/dsh-tool-schedule` |
| `goal` | `goal`、`goal-round-driver`、`ui-goal` | `@deepseek-ai/dsh-command-goal`、`@deepseek-ai/dsh-tool-goal` |
| `task` | `tool-todo` | `@deepseek-ai/dsh-tool-todo` |
| `plan` | `plan-mode`、`ui-plan` | `@deepseek-ai/dsh-plan-mode` |
| `present` | `deliverable-file-references` | `@deepseek-ai/dsh-tool-present` |

- `ui-user-questions` 同时是提问界面，不列入 `plan`。
- `ui-deliverables` 是变更文件卡片，不列入 `present`。
- preset 子行按模块名匹配，因此用户改过行 id 或新建 preset 时仍然有效。

### 施加

- 宿主行：`loader.update(entryId, { disabled: true })`，打开时按施加前保存的原值放回，本来就停用的行不强制启用。
- preset 声明：枚举 `options.name === '@deepseek-ai/dsh-agent-preset'` 的全部条目，按「当前关闭的功能」从基线重算 `config.plugins` 后整体 `loader.update`。只摘受管子行，空组一并移除。
- 过程不写 `cordis.yml`、`cordis.patch.yml` 与 `package.json`；这一点由真机实测确认。

### 撤销与重组

- 运行期改动是易失的：任何一次配置重组都会把树还原成文件状态。
- 因此订阅 `app-boot/config-reload`，事件后丢弃 preset 基线、按记录重新施加。本包自己的 `update` 不触发该事件，不会循环。
- 本行停用时执行 `ctx.effect` 的清理：宿主行按快照放回原值，preset 按基线还原，然后关闭存储域。
- 关闭记录留在存储域里，重新启用时据此再次施加。

### 关闭记录

- 域名为 `practical_tool_official_features`，只用一个 `global` 单例，内容是 `{ version: 1, off: [...] }`。
- 落在 `$DSH_HOME/storages/practical_tool_official_features.json`，不触碰 profile。
- 存储域写入不在写入时校验，因此每次写入都会带上完整对象；读取端按 schema 校验，文件被改坏时按无记录运行并记录警告，不覆盖原文件。

### 状态判定

- 宿主行：存在、未停用、fiber 处于 ACTIVE 或 LOADING。
- preset 子行：任一 preset 声明的 `config.plugins` 递归包含该模块名，且该子行的 `disabled` 不是字面 `true`。
- 任一项启用即为开。这是因为 Web 面本来停用的宿主行不该把功能判成关。
- 切换后宿主行立即变化，preset 只影响之后新建的会话；面板在 2 秒内重读真实状态。

## 各功能机制

### 清理会话

- 面板从 Workspace 与会话列表读取数量：未置顶、未归档且未受保护的会话数，已归档且仍有日志的会话数。
- 会话列表读自 `ctx.sessions.list`；`ctx.sessions` 是服务本身，列表挂在它的 `list` 上。
- 清理分两阶段：`workspaceRegistry.archiveSession(id)` 逐个归档，然后遍历已归档集合并删除 `sessions/<cwd key>/<session id>` 目录。
- `keepIds` 是受保护的会话，主机侧永不处理：`retainedBy` 中 `mainView`、`sidebarChat`、`sidebarView` 任一大于 0 即为打开，再沿 `parentId` 并入全部祖先。
- 归档会通知前端释放会话，所以宿主在归档前记录仍在内存的会话，删除阶段把这些会话计入 `deferred`。Session store 在删除时仍持有的会话同样计入 `deferred`，日志留到宿主释放后再删。
- 删除是永久的，所以按钮需要两次点击确认。

### 清理推理块

- 注册一条消息投影 `plugin:dsh-plugin-practical-tool-bundle/reasoning-reset`。
- `agent/request-error` 里识别两类 400：签名属于另一段对话、加密内容无法解密。命中后写入一条记录（列出要改写的 assistant 消息序号）并返回 `{ kind: 'retry' }`。
- 投影只改模型可见历史：去掉 reasoning 块，并丢弃 `source.replayState`。日志与用户看到的对话不变。
- 每个 turn/step 最多处理一次，避免与循环互相触发。

### Claude 技能

- 从会话 cwd 向上找含 `.git` 的目录作为项目根，扫描 `.claude/skills` 下的 `<name>/SKILL.md` 与扁平 `<name>.md`。
- frontmatter 提供名称、描述、路由文本、元数据与两个调用开关；缺描述或名称非法的技能被跳过。
- 注册为 rank 150 的只读 provider，来源名 `claude`；`fs.watch` 在文件变化后刷新技能目录。

### 重启

- 网页场景：写重启计划（入口、argv、cwd、端口、日志路径），detached 启动 `assets/launcher.cjs`，600ms 后退出当前进程；launcher 等旧进程释放端口再启动新进程。
- 桌面场景：生成 VBS 交给 `explorer.exe`，由它在应用进程树之外关闭应用并重新启动。
- 页面轮询 `/restart/info`，`pid` 或 `startedAt` 变化即刷新；超过阈值进入「较慢」提示并继续轮询。

### 手机触控放大

- 样式表在 767px 以下生效，抽屉宽度由 `__DRAWER_WIDTH__` 替换为 328。
- 本地页面用 `<link media="(max-width: 767px)">`，首屏即按放大尺寸绘制。
- 远程配对页面用带凭据的 `fetch` 取文本并注入 `<style>`：远程通道不改写 `<link href>`，直接引用会 401。
- `<html data-dsh-mobile-css>` 记录 `link` / `style` / `failed`，便于在手机上排查。

## 依赖复用

| 归属 | 放在 | 打包 |
| --- | --- | --- |
| 宿主提供 | `devDependencies` 与 `peerDependencies` | `tsdown.config.ts` 的 `neverBundle` 保持 external |
| 插件自备 | `dependencies` | 列入 `alwaysBundle`，打进对应入口 |

`yaml` 属于插件自备，只打进 `dist/claude-skills.mjs`。

## 打包与发布

- `files` 决定包内容：`dist`、`cordis.patch.yml`、`locale/*.json`、`rows`、`assets/*`、`icon.svg`、`README.md`。
- `pnpm run release` 依次运行 `pnpm check`、`pnpm format`、`npm version patch`、`scripts/release-archive.mjs`，然后 push 分支与 tag。
- CI 收到 tag 后用 npm trusted publishing 发布。

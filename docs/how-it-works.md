# 工作机制

## 包结构

一个 npm 包承载五行。宿主按 `cordis.patch.yml` 的 `name` 分别 import 各入口。

| 入口 | 行 id | 作用 |
| --- | --- | --- |
| `dist/index.mjs` | `dsh-plugin-practical-tool-bundle` | 根行：聚合状态路由，并拥有浏览器半部 |
| `dist/sweeper.mjs` | `session-sweeper` | 归档并删除已归档会话的日志 |
| `dist/reasoning-reset.mjs` | `reasoning-reset` | 去掉被拒绝的历史推理块并重试 |
| `dist/claude-skills.mjs` | `claude-skills` | 注册项目 `.claude/skills` 技能来源 |
| `dist/restart.mjs` | `restart-button` | 重启路由 |
| `dist/mobile.mjs` | `mobile-touch-ui` | 手机样式表路由 |
| `dist/client.js` | 随根行 | 浏览器半部：三块界面与状态轮询 |

`assets/launcher.cjs` 由重启行以 detached 进程启动，`assets/mobile.css` 由手机样式行读取。两者用 `new URL('../assets/...', import.meta.url)` 定位，因此必须随包发布。

## 行与路由

全部路由在 `/api/dsh-practical-tools/` 下，位于宿主的 `/api` 认证围栏内。

| 路由 | 行 | 说明 |
| --- | --- | --- |
| `GET /status` | 根行 | 五行是否可用 |
| `POST /sweep` | `session-sweeper` | 归档未置顶会话并删除已归档日志 |
| `GET /restart/info` | `restart-button` | 当前进程标识与运行形态 |
| `POST /restart` | `restart-button` | 重启服务或应用 |
| `GET /mobile.css` | `mobile-touch-ui` | 手机样式表 |

路由注册用 `ctx.inject(['connection'], ...)` 加 `ctx.effect`，行被停用时注册随 fiber 释放。启动器与代次判断另需 `webServer`。

## 状态路由与前端装卸

前端产物属于根行：根行停用即整份浏览器半部下线，也不会再发出状态请求。

- `GET /status` 每次请求读取 `ctx.get('loader')`，用 `loader.entries()` 按行 id 找到条目，判断 `disabled` 与 fiber 是否处于 ACTIVE。
- 运行时条目 id 带组路径前缀，bundle 行是 `include:<行 id>`；查找先按完整 id，再按最后一段匹配。
- `FiberState` 在 cordis 中是 `const enum`，运行时没有值，代码按序号 2 比较。
- loader 不可用时五项都回答 `null`；前端对 `null` 保持当前界面。
- 前端每 3 秒轮询一次，且只在页面可见时轮询；`visibilitychange` 与 `focus` 会立即补一次。
- 每个界面块是一个子插件：启用时 `ctx.plugin()` 挂载，停用时 `fiber.dispose()` 卸载，槽位注册与样式随 fiber 回收，不需要刷新页面。

## 各功能机制

### 清理会话

- 面板从 Workspace 与 Session store 读取数量：未置顶且未归档的会话数、已归档且仍有日志的会话数。
- 清理分两阶段：`workspaceRegistry.archiveSession(id)` 逐个归档，然后遍历已归档集合并删除 `sessions/<cwd key>/<session id>` 目录。
- `keepIds` 是页面正在显示的会话，主机侧永不处理；Session store 仍持有的已归档会话计入 `deferred`，日志留到宿主释放后再删。
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

- `files` 决定包内容：`dist`、`cordis.patch.yml`、`locale/*.json`、`assets/*`、`icon.svg`、`README.md`。
- `pnpm run release` 依次运行 `pnpm check`、`pnpm format`、`npm version patch`、`scripts/release-archive.mjs`，然后 push 分支与 tag。
- CI 收到 tag 后用 npm trusted publishing 发布。

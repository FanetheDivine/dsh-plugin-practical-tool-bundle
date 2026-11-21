# Research: dsh使用工具组合包

## 1. 行状态的来源

**Decision**: 根行在请求到来时调用 `ctx.get('loader')`，用 `loader.entries()` 找到五个功能行的条目，按 `entry.disabled` 与 `entry.fiber` 状态判断可用性。

**Rationale**: 用户选定读 loader 内部状态。条目是 profile 配置的事实源，`Entry.disabled` 已合并父级禁用与 `!!js` 表达式结果，不需要行自己上报。

**Alternatives considered**:

- 每个功能行用 `ctx.provide` 发布存在性：不依赖内部 API，但启用与注册之间有时间窗，且需要在五个入口间分发同一套服务名。
- 前端继续逐行探测路由：已确认会产生反复 404，用户明确要求消除。

## 2. 判定细节

**Decision**: 行可用 = 条目存在、`entry.disabled === false`、`entry.fiber !== undefined`、`entry.fiber.state === 2`。

**Rationale**: `FiberState.ACTIVE` 在 `@deepseek-ai/cordis` 中是 `const enum`，编译产物里没有运行时值，只能按数值比较；2 是 `ACTIVE` 的序号。条目存在但 fiber 缺失表示尚未加载或加载失败，按不可用处理。

**Alternatives considered**: 用 `entry.moduleNamespace !== undefined` 判存在，会把加载失败的行也当作可用。

## 3. 多入口构建

**Decision**: `tsdown.config.ts` 的宿主构建用对象形式 `entry`（`index`、`sweeper`、`reasoning-reset`、`claude-skills`、`restart`、`mobile`），输出 `dist/<name>.mjs`；`package.json` 的 `exports` 为每个子路径声明对应文件。

**Rationale**: Loader 行名是包子路径，必须能 `import('dsh-plugin-practical-tool-bundle/sweeper')`。对象形式让产物文件名与行名一一对应，避免 `dist/sweeper/index.mjs` 这类深层路径。

**Alternatives considered**: 单入口加运行时动态注册多个行：Loader 只加载一个模块，无法单独开关某一行。

## 4. 静态资源

**Decision**: `assets/launcher.cjs`、`assets/mobile.css`、`icon.svg` 不进构建，随包发布；运行期用 `new URL('../assets/launcher.cjs', import.meta.url)` 与 `new URL('../assets/mobile.css', import.meta.url)` 定位。

**Rationale**: 启动器必须是独立文件交给 Node 执行；样式表由宿主路由读取，不参与前端打包。`dist/*.mjs` 与 `assets/` 同级，相对路径稳定。

**Alternatives considered**: 把 CSS 内联为字符串常量（体积与可读性都差）；用构建插件复制资源（模板没有该依赖）。

## 5. yaml 依赖

**Decision**: `yaml` 放进 `dependencies`，宿主构建 `alwaysBundle: ['yaml']`，打进 `dist/claude-skills.mjs`。

**Rationale**: 插件自带依赖，不依赖 profile 的传递安装；其余 `@deepseek-ai/*` 仍是宿主提供。

**Alternatives considered**: 声明为 peer 依赖从宿主解析（宿主的 `yaml` 是传递安装，pnpm 严格布局下不保证可解析）。

## 6. 前端块装卸

**Decision**: 前端入口注册字典与状态循环；三个界面块各自是一个子插件对象，按状态用 `ctx.plugin()` 启动、`fiber.dispose()` 卸载。

**Rationale**: 子插件有自己的 fiber，槽位注册、定时器与样式在卸载时一并回收；不需要刷新页面。

**Alternatives considered**: 在组件内条件渲染，槽位注册仍然存在，停用行后按钮不会消失。

## 7. 手机样式加载

**Decision**: 本地页面（localhost/127.0.0.1/::1）用 `<link media="(max-width: 767px)">`；远程页面用带凭据的 `fetch` 取文本并注入 `<style>`；结果写到 `<html data-dsh-mobile-css>`。

**Rationale**: `/api` 路由在远程通道下不会改写 `<link href>`，直接引用会 401；fetch 走已认证的 gated 通道。

**Alternatives considered**: 只保留 fetch：本地首屏会先按原尺寸绘制再放大，出现闪动。

## 8. 清理会话

**Decision**: 会话日志位于 `<DSH home>/sessions/<cwd key>/<session id>`，一次清理先按 id 归档（`workspaceRegistry.archiveSession`），再把所有已归档会话的目录删掉；仍在主视图打开的会话按 `keepIds` 跳过，仍被 Session store 持有的延后。

**Rationale**: 与源插件行为一致，归档集合是全局事实源，未分组会话也能覆盖。

**Alternatives considered**: 只删日志不改归档集合：侧栏会继续列出已无日志的会话。

## 9. 清理推理块

**Decision**: 注册 `ctx.sessions.registerMessageProjection` 处理 `plugin:<包>/reasoning-reset` 记录；在 `agent/request-error` 里识别两类 400，写入记录并返回 `{ kind: 'retry' }`；每步最多一次。

**Rationale**: 投影只改模型可见历史，日志与用户看到的对话不变。`appendPluginRecord` 必须使用宿主同一份 `dsh-session` 实例。

**Alternatives considered**: 直接替换消息：assistant 消息不可替换，宿主会拒绝。

## 10. Claude 技能

**Decision**: 注册一个 `ctx.skills.registerProvider`，从会话 cwd 向上找 `.git` 得到项目根，扫描 `.claude/skills` 下的目录包与扁平 `.md`，解析 frontmatter，并用 `fs.watch` 刷新。

**Rationale**: 与源插件一致；只读项目文件。

**Alternatives considered**: 启动时一次性扫描：新增技能要重启宿主。

## 11. 路由命名

**Decision**: 所有路由位于 `/api/dsh-practical-tools/` 下。

**Rationale**: 与宿主中其他插件并存时不抢同一路由。

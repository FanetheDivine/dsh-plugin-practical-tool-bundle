# 常见问题

按「现象、原因、处理」排列。写断言或排查前先看一遍。

## 环境

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `setup-env.sh` 报「无法确定宿主版本」 | 未设 `RDT_DSH_VERSION`，`package.json` 没有 `@deepseek-ai/dsh-agent`，`dsh` 也不在 PATH | 设置 `RDT_DSH_VERSION`，或安装 `dsh`，或在 `package.json` 声明该依赖 |
| 本地宿主启动报 `user patch-layer watching requires the Cordis HMR service` | 旧版宿主的依赖按 caret 范围解析到之后发布的不兼容版本 | `setup-env.sh` 用 `npm i --before=<宿主发布时间>` 安装。手动安装时同样加这个参数 |
| 驱动报 `readEnv`、`reading 'session'` 等 TypeError | 加载了全局宿主而非本地宿主 | 先执行 `setup-env.sh` 打印的 `export PATH=... RDT_DSH_PKG=...` |
| 启动报 `.credentials.yaml must be a string` | 旧版宿主读取了新版宿主写的凭据文件 | 隔离配置把 `credentials.path` 指向 profile 目录 |
| 旧版宿主报 `profile does not exist` | 旧版没有 `--from-default-profile` | `setup-env.sh` 按 web 模板写 profile 的 `package.json` |
| mock provider 加载失败 | 旧版 loader 不接受裸路径 | 插件行的 `name` 用 `file:///` 开头的 URL |
| GUI 启动报 `EADDRINUSE`，多个插件未激活 | GUI 端口被残留进程占用 | `gui-up.sh` 启动前会结束占用端口的进程 |
| 安装过程很慢 | 宿主依赖数百个包 | 首次安装需要数十分钟，之后复用 `~/.dsh-local` |

## 宿主契约

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| loader 中按行 id 找不到条目 | bundle 行带组路径前缀，例如 `include:session-sweeper` | 先按完整 id 查，再按 `:${行 id}` 后缀匹配 |
| `entry.fiber.state` 判断失效 | `FiberState` 是 `const enum`，运行时没有值 | 按序号：`2` 已激活，`3` 加载失败 |
| 状态路由六行都是 `null` | 宿主 loader 服务不可用 | 确认 `ctx.get('loader')`；前端对 `null` 保持当前界面 |
| 状态路由某行为 `false` | 该行被停用，或 fiber 未进入 ACTIVE | 查 profile 的 `cordis.patch.yml` 与行入口的 `apply` |
| 工作区报 `missing or foreign unit header`，会话控制器等服务一直等待 | `workspace.json` 的 `version` 写在了顶层 | 写成 `unit: { name: 'workspace', version: 2 }` |
| GUI 停在「正在加载工作区」 | `workspace.json` 的路径或时间戳格式错误 | `path` 用反斜杠 Windows 路径，时间戳用 ISO 字符串 |
| 驱动找不到 `lib/profile-boot.js` | 旧版宿主只提供带 hash 的文件名 | `run-test.mjs` 按导出的 `runProfile` 查找 |

## 路由与认证

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Node 直接请求 `/api/dsh-practical-tools/*` 返回 401 | 路由位于宿主的 `/api` 认证围栏内 | 在已登录页面内 `fetch`，或使用 `RDT_GUI_URL` 打开页面 |
| 页面内 `fetch('/api/...')` 返回 401 | 页面未从 `gui-up.sh` 导出的带 token 地址打开 | 用 `RDT_GUI_URL` 打开，不要手输端口 |
| 清理路由返回 503 | Workspace registry 尚未就绪 | 等 GUI 完成加载再执行 B2 |
| 清理路由删除范围超出预期 | 清理会归档未置顶会话并永久删除全部已归档日志 | 只在一次性 profile 中执行；不要指向真实 profile |
| `mobile.css` 返回 500 或带 `unavailable` 注释 | `assets/mobile.css` 未随包发布 | 检查 `package.json` 的 `files` 与构建产物 |
| `restart/info` 缺少 `runtime` | 宿主版本早于运行形态字段 | 按 `web` 处理，或先升级本地宿主 |

## 热更新

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 构建后插件行为不变 | profile 不是链接安装，或 `cordis.patch.yml` 缺 `hmr` 条目 | 确认 `node_modules/<插件>` 指向仓库；确认补丁含 `- id: hmr` 与 `root: ["<repo>/dist"]` |
| 构建后插件不可用 | 新产物导入或启动失败 | 修正代码后重新构建，HMR 会再次导入并恢复 |
| 构建后毫无变化 | 只改了 `src`，没有构建 | 运行 `pnpm build` 或保持 `pnpm dev` 运行 |
| 前端改动不生效 | 宿主轮询产物有延迟，或 `dist/client.js` 未更新 | 等待数秒；确认构建产物已更新 |
| 仓库在点目录下时监听不到 | HMR 默认忽略 `**/.*` | 把仓库放在不含点目录的路径，或在 `hmr` 配置中调整 `ignored` |
| 同一轮里手工改过 `cordis.patch.yml` | 宿主按补丁重新组合，可能重载插件 | 补丁改动后按新配置重跑用例 |

## 浏览器

`browser-test.mjs` 用 Playwright 驱动无头 Chrome。定位依据：

| 元素 | 定位方式 |
| --- | --- |
| 清理会话按钮 | `button[aria-label="清理会话"]` |
| 重启按钮 | `button[aria-label="重启 DSH"]` |
| 手机样式标记 | `document.documentElement` 的 `data-dsh-mobile-css`，取值为 `link`、`style` 或 `failed` |
| 手机样式规则 | `document.styleSheets` 中的 `min-height: 44px` 与 `328px` |
| 悬停底色 | `getComputedStyle(button).backgroundColor` 的 alpha |
| 控制台异常 | `page.on('console')` 的 error 与 `page.on('pageerror')` |

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 打开 GUI 先出现「预览版说明」或「内测声明」弹窗 | 欢迎弹窗只在配置的版本号与宿主常量完全一致时隐藏 | `setup-env.sh` 从宿主读取该常量写入配置；`browser-test.mjs` 会自动点「继续」 |
| 找不到两个侧栏按钮 | 状态路由未回答 `true`，界面块尚未挂载 | 等一个 3 秒轮询周期；检查 A3；确认行 fiber 已激活 |
| 按钮存在但标签不是中文 | 宿主 locale 为英文，`aria-label` 取自英文字典 | 让 profile 使用中文 locale，或按 `locale/<语言>.json` 调整选择器 |
| 手机标记为 `failed` | 手机样式路由不可用，或远程页面取样式失败 | 检查 B4 与 `mobile-touch-ui` 行状态 |
| 手机断点下 44px 断言失败 | 宿主侧栏类名改版，锚点未命中 | 对照宿主 DOM 更新 `assets/mobile.css` 的 `[class*="…"]` 锚点 |
| 悬停 alpha 不是 0.12 | 按钮改用了别的悬停底色 | 对照 `src/client/sweeper.tsx` 与 `src/client/restart.tsx` 的 `triggerStyle` |
| GUI 每次启动 token 不同 | token 每次轮换 | 用 `gui-up.sh` 导出的 `RDT_GUI_URL` |
| 旧版宿主日志里没有 token | 旧版默认不启用访问令牌 | `gui-up.sh` 直接使用日志中的地址 |
| 打开页面返回 401 | 未带 token 访问 | 使用 `RDT_GUI_URL` 的完整地址 |
| 冷启动超过 30 秒 | 首次启动加载较多插件 | 调大 `RDT_GUI_WAIT` |
| 启动报 `URL.canParse is not a function` | Playwright 在旧版 Node 下的内部调用 | 使用 Node 22.19 及以上 |

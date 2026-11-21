---
name: real-device-test
description: 在真实 DSH 宿主上端到端测试本插件，验证插件在 DSH 中的实际表现时使用。
---

# real-device-test

单元测试使用模拟的 `ctx`。本 skill 在真实宿主中验证四类问题：

| 类别 | 验证内容 |
| --- | --- |
| A 宿主装载 | profile 创建、插件安装、根行与五行激活、状态路由、已安装 dist 与仓库一致 |
| B 后端路由 | 清理会话、重启 info、手机样式表 |
| C 前端展示 | 两个侧栏按钮、悬停样式一致、手机宽度放大 |
| D 宿主漂移 | 宿主接口或行为与插件假设不一致 |

用例随功能变化。每轮按 [cases.md](references/cases.md) 的方法推导，`scripts/` 是可直接运行的参考实现，按需扩展。

全程只读插件代码。发现缺陷写入报告，另开分支修复。

## 阶段 0：准备

1. 在仓库运行 `pnpm i && pnpm check`，确保 `dist/` 对应当前代码。构建是迭代动作，后续改代码只需再跑一次 `pnpm build`。
2. 确认 `playwright` 已安装。脚本用 `channel: 'chrome'` 启动本机 Chrome，无需下载浏览器。

## 阶段 1：搭建环境（A）

```sh
bash .dsh/skills/real-device-test/scripts/setup-env.sh <仓库绝对路径> [profile名]
```

脚本依次完成：

1. 对齐宿主版本，来源依次为：
   - `RDT_DSH_VERSION`。
   - `package.json` 的 `@deepseek-ai/dsh-agent`。
   - `dsh --version`。
   三者都取不到时报错退出。全局 `dsh` 版本一致时直接使用，不一致时安装到 `~/.dsh-local/dsh-<版本>`，全局安装保持不变。
2. 创建 profile，默认名为 `rdt-<日期>`。
3. 用 `dsh plugin add` 以链接方式安装当前检出，`node_modules` 指向仓库。
4. 写隔离配置 `cordis.patch.yml`：
   - 停用真实模型，加载 mock provider。
   - 会话、存储、凭据写入 profile 目录。
   - 跳过宿主的欢迎弹窗。
   - 启用 HMR 并监听仓库 `dist`，构建后自动替换插件。
   插件不提供配置项，补丁里不写 `config`。
5. 复制 `mock-provider.mjs` 与 `run-test.mjs` 到 profile 目录。
6. 注册测试工作区。

脚本结尾打印后续命令。使用本地宿主时，先执行其中的 `export PATH=... RDT_DSH_PKG=...`。

## 阶段 2：后端用例（A）

```sh
cd <profile目录>
node run-test.mjs
```

- 驱动用宿主的 `runProfile` 启动 profile，随后在 loader 中检查根行与五行。
- 断言包括条目 id、入口模块名、`disabled` 与 `fiber.state`，并核对已安装版本与 dist 哈希。
- 结果写入 `results.json`。全部通过时退出码为 0。
- 首个用例检查装载。装载失败时中止后续用例。
- 脚本结尾打印 HTTP 状态路由的验证命令，由 `browser-test.mjs` 在已登录页面内执行。

当前用例：

| 用例 | 断言 |
| --- | --- |
| A1 装载 | 根行与五行在 loader 中启用，条目 id 与入口模块名正确 |
| A2 产物一致 | 已安装版本与 `dist/index.mjs` 哈希和仓库一致 |

mock provider 只完成一次模型回合，固定回复「mock：已收到」。它让 GUI 保持可用，后端对话用例已由路由用例取代。

## 迭代：重建后在运行实例中查看效果（A、B、C）

搭建后实例保持运行。改完插件代码，构建一次即可让同一实例加载新代码：

```sh
pnpm build        # 或 pnpm dev，持续监听 src
```

- 宿主监听仓库 `dist`，构建完成即替换后端插件；前端产物由宿主轮询后自动替换，页面无需刷新。
- 保持插件安装与宿主进程不变；启动脚本只在轮次开始时执行一次。
- 替换会重建插件实例，因此「实例不变」的断言只在一次运行内有效。

验证一次前端热更新：

1. 记录 GUI 进程号：`netstat -ano | grep ":<端口> " | grep LISTENING`。
2. 修改 `src/client/locales.ts` 中 `action.label` 的文本。
3. 运行 `pnpm build`，等宿主替换完成。
4. 在 GUI 中悬停侧栏按钮，确认 `aria-label` 变为新文本。
5. 确认进程号不变，然后还原文本并重新构建。

构建失败或替换失败的处理见 [pitfalls.md](references/pitfalls.md)。

## 阶段 3：浏览器与路由用例（B、C）

1. 启动 GUI：

   ```sh
   eval $(bash .dsh/skills/real-device-test/scripts/gui-up.sh <profile名>)
   ```

2. 在仓库内运行浏览器驱动，它用无头 Chrome 打开 `$RDT_GUI_URL`：

   ```sh
   node .dsh/skills/real-device-test/scripts/browser-test.mjs
   ```

   - 结果写入 `<profile目录>/browser-results.json`，全部通过时退出码为 0。
   - 截图写入 `<profile目录>/shots/`。
   - `RDT_HEADLESS=0` 时显示浏览器，便于观察失败现场。

3. 当前用例：

| 用例 | 操作 | 断言 |
| --- | --- | --- |
| A3 状态路由 | 页面内 `fetch('/api/dsh-practical-tools/status')` | `rows.sweeper === true`，五行均为布尔值 |
| B1 清理会话拒绝空体 | `POST /sweep`，请求体 `{}` | HTTP 400，`ok:false` |
| B2 清理会话计数 | `POST /sweep`，`{ ids: [], keepIds: [] }` | HTTP 200，`ok:true`，五个计数为数字 |
| B3 重启 info | `GET /restart/info` | `pid`、`startedAt` 为数字，`runtime` 为 `web` 或 `desktop` |
| B4 手机样式表 | `GET /mobile.css` | `text/css`，含 `328px` 与 767px 断点，占位符已替换 |
| C1 侧栏按钮 | 查看侧栏底部 | 存在 `button[aria-label="清理会话"]` 与 `button[aria-label="重启 DSH"]` |
| C2 悬停一致 | 分别悬停两个按钮 | 背景 alpha 均为 12%，静止时为透明 |
| C3 手机放大 | 视口改为 390px | `html[data-dsh-mobile-css]` 为 `link` 或 `style`，两个按钮最小尺寸 44px |
| C4 控制台 | 收集 `console` 与 `pageerror` | 没有 error |

`A3` 与 `B1` 到 `B4` 在页面内发起同源请求，复用 GUI 的认证。`C4` 在前端操作之后、B 路由用例之前执行。

新增流程时在 `browser-test.mjs` 中加一个 `check('<编号> <名称>', fn)`。界面标签的定位依据见 [pitfalls.md](references/pitfalls.md)。

4. 每个流程后脚本自动截图到 `shots/`。

## 阶段 4：宿主漂移（D）

- 写断言前先读宿主源码确认事实：`<宿主目录>/node_modules/@deepseek-ai/*/lib/`。
- 断言失败时先区分两种原因：
  - 插件缺陷。
  - 驱动的假设已过时。查看状态路由回答、宿主 loader 条目与浏览器控制台。
- 宿主升级后先跑 A1，再跑其余用例。
- 已知漂移点见 [pitfalls.md](references/pitfalls.md)。

## 阶段 5：报告与清理

1. 按 [cases.md](references/cases.md) 末尾的结构写报告，保存截图与结果文件。
2. 结束 GUI 进程：用 `netstat -ano` 找到 GUI 端口的 PID，再 `taskkill //F //T //PID <pid>`。
3. 浏览器驱动会自行关闭浏览器，无需清理页面。
4. 删除 profile：`rm -rf <profile目录>`。下一轮重新搭建。

## 环境变量

所有变量都可省略，标注必填的除外。

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `RDT_REPO` | 无，`run-test.mjs` 必填 | 插件仓库绝对路径 |
| `RDT_PROFILE_DIR` | 脚本所在目录 | profile 目录 |
| `RDT_PROFILE` | profile 目录名 | profile 名 |
| `RDT_DSH_PKG` | 全局宿主 | 宿主 `package.json` 路径 |
| `RDT_DSH_VERSION` | 取 `package.json` 的 `dsh-agent`，再取 `dsh --version` | 指定宿主版本 |
| `RDT_GUI_PORT` | `3210` | GUI 端口 |
| `RDT_GUI_WAIT` | `90` | 等待 GUI 启动的秒数 |
| `RDT_GUI_URL` | 无，`browser-test.mjs` 必填 | `gui-up.sh` 导出的带 token 地址 |
| `RDT_SHOTS` | `<profile目录>/shots` | 截图目录 |
| `RDT_HEADLESS` | 无头 | 设为 `0` 时显示浏览器 |
| `RDT_KEEPALIVE` | 无 | 设为 `1` 时驱动结束后保留运行时 |

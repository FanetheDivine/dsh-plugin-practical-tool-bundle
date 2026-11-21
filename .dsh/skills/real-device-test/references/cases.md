# 用例推导与报告

功能会变化，用例每轮现场推导。

## 推导方法

1. 列出改动：

   ```sh
   git log <上个 tag>..HEAD --oneline
   ```

   结合 CHANGELOG 判断每个改动是否涉及宿主交互：
   - loader 行与状态路由。
   - HTTP 路由注册与请求处理。
   - 前端槽位、计算样式与页面标记。
   - 宿主服务调用，例如 `loader`、`workspaceRegistry`、`webServer`、`skills`。
2. 按四类落用例：
   - A 装载：根行与六行是否激活，状态路由是否如实回答。
   - B 后端：各功能路由的回答与错误分支。
   - C 前端：侧栏按钮、悬停样式、手机断点。
   - D 漂移：宿主条目 id、`FiberState` 数值、路由认证围栏。
3. 后端用例在已登录页面内用同源 `fetch` 执行，复用 GUI 的认证。
4. 前端用例同时使用元素断言、计算样式与截图。
5. mock provider 只返回固定文本，不调用工具。

## 当前用例

### A 装载

| 编号 | 驱动 | 断言 |
| --- | --- | --- |
| A1 | `run-test.mjs` | 根行与六行的 loader 条目存在，入口模块名正确，`disabled === false`，`fiber.state === 2` |
| A2 | `run-test.mjs` | 已安装版本与 `dist/index.mjs` 哈希和仓库一致 |
| A3 | `browser-test.mjs` | `GET /api/dsh-practical-tools/status` 返回六行布尔值，`rows.sweeper === true` |

### B 后端路由

| 编号 | 请求 | 断言 |
| --- | --- | --- |
| B1 | `POST /api/dsh-practical-tools/sweep`，体为 `{}` | HTTP 400，`ok:false` |
| B2 | 同路由，体为 `{ "ids": [], "keepIds": [] }` | HTTP 200，`ok:true`，`archived/deleted/skipped/deferred/failed` 均为数字 |
| B3 | `GET /api/dsh-practical-tools/restart/info` | `pid`、`startedAt` 为数字，`runtime` 为 `web` 或 `desktop` |
| B4 | `GET /api/dsh-practical-tools/mobile.css` | 状态 200，`text/css`，含 `328px` 与 767px 断点，不含 `__DRAWER_WIDTH__` |

B2 只提交空 id 列表。清理会永久删除已归档会话，实机只在一次性 profile 中执行；不要在真实 profile 上跑。

### C 前端

| 编号 | 操作 | 断言 |
| --- | --- | --- |
| C1 | 打开 GUI，等待状态轮询挂载界面块 | 侧栏存在 `button[aria-label="清理会话"]` 与 `button[aria-label="重启 DSH"]` |
| C2 | 分别悬停两个按钮 | 静止背景透明；悬停背景的 alpha 都约为 0.12，彼此相差小于 0.01 |
| C3 | 视口改为 390×844 | `html` 的 `data-dsh-mobile-css` 为 `link` 或 `style`；样式表含 44px 触控规则；两个按钮 `min-width` 与 `min-height` 均 ≥ 44px |
| C4 | 前端操作全程收集控制台 | `console` 的 error 与 `pageerror` 均为零 |

### D 宿主漂移

| 漂移点 | 事实 | 断言写法 |
| --- | --- | --- |
| 条目 id 前缀 | bundle 行在 loader 中可能是 `include:<行 id>` | 先按完整 id 查，再按 `:${行 id}` 后缀匹配 |
| `FiberState` | cordis 的 `const enum` 运行时没有值 | 用序号判断：`2` 已激活，`3` 加载失败 |
| 状态路由缺 loader | 五项都回答 `null` | 前端对 `null` 保持当前界面，不卸载块 |
| 客户端块键 | `sweeper`、`restart`、`mobile` | 与状态路由的行名一致，改名时两侧同步 |
| 手机样式锚点 | 宿主类名带哈希 | 样式表用 `[class*="…"]` 子串锚；宿主升级后先看 C3 |

## 新增用例

- loader 或产物断言：在 `run-test.mjs` 中加一个 `check('<编号> <名称>', fn)`。
- 路由断言：在 `browser-test.mjs` 中加一个 `check`，用页面内 `api()` 发起同源请求。
- 前端断言：在 `browser-test.mjs` 中加一个 `check`，并在 SKILL.md 阶段 3 的表格中加一行。
- mock 行为保持固定文本。需要工具调用时另开驱动，不要改回测试专用工具。

## 热更新验证

每次实机至少做一次，步骤固定：

1. 记录 GUI 进程号，确认根行与六行已激活。
2. 修改 `src/client/locales.ts` 中 `action.label` 的文本。
3. 运行 `pnpm build`，等待宿主替换与前端轮询完成。
4. 在 GUI 中确认侧栏按钮的 `aria-label` 变为新文本。
5. 断言：GUI 进程号不变；页面没有刷新；会话可继续。
6. 还原文本并重新构建。

报告里单列一节记录结论与截图。

## 常用断言依据

| 依据 | 获取方式 |
| --- | --- |
| 行状态 | `entry.options.name`、`entry.disabled`、`entry.fiber.state` |
| 状态路由 | 页面内 `fetch('/api/dsh-practical-tools/status')` |
| 路由回答 | 页面内 `fetch` 的状态码、`content-type` 与 JSON 体 |
| 手机样式生效 | `document.documentElement.getAttribute('data-dsh-mobile-css')` 与 `document.styleSheets` 的规则文本 |
| 悬停样式 | `getComputedStyle(button).backgroundColor` |
| 前端异常 | `page.on('console')` 的 error 与 `page.on('pageerror')` |

## 报告结构

```markdown
# 实机测试报告 <插件版本> <commit>

## 环境
- 宿主版本：
- profile：
- 浏览器：

## A 装载
| 用例 | 结果 | 关键断言 |

## B 后端路由
| 用例 | 结果 | 关键断言 |

## C 前端
| 用例 | 结果 | 截图 |

## D 宿主漂移
| 漂移点 | 结果 | 依据 |

## 热更新验证
| 项目 | 结果 | 依据 |

## 发现的问题

## 产物
- results.json、browser-results.json、截图路径；手动对话时另有 requests.jsonl
```

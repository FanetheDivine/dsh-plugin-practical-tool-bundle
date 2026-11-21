# dsh-plugin-practical-tool-bundle（dsh使用工具组合包）

一个 DSH 插件包，由一行根行与六行功能行组成。每行可以单独启用或停用。

## 功能

| 行 | 功能 |
| --- | --- |
| 根行 | 提供浏览器半部与聚合状态路由，前端据此挂载其余三行的界面 |
| `session-sweeper` | 侧栏底部的扫帚：先把未置顶会话（含未分组的）归档，再永久删除全部已归档会话及其日志 |
| `reasoning-reset` | provider 拒绝历史推理块时，去掉模型可见历史里的推理块并重试同一步 |
| `claude-skills` | 把项目 `.claude/skills` 下的技能只读并入会话技能目录 |
| `restart-button` | 侧栏底部的重启按钮：网页场景重启服务，桌面场景重启应用 |
| `mobile-touch-ui` | 手机上（≤767px）放大侧栏、会话列表、顶栏与输入区控件 |
| `official-features` | 管理官方功能：面板里开关自动化任务、goal、task、plan、present 五项官方能力 |

停用某行只下线它的路由或 provider，其余行照常运行；前端在一个轮询周期内跟着装卸界
面，不需要刷新页面。

## 安装

```sh
dsh plugin add dsh-plugin-practical-tool-bundle
```

本地开发时可直接加载仓库产物：

```yaml
- insert:
    - id: dsh-plugin-practical-tool-bundle-dev
      name: file:///<repo>/dist/index.mjs
```

## 配置

除「管理官方功能」外，各行不提供配置项，使用固定默认值：

- 技能目录为项目根下的 `.claude/skills`。
- 手机样式表的抽屉宽度为 328。
- 重启日志写在 `~/.dsh/logs`。

### 管理官方功能

在侧栏 **Plugins** 页打开本包的「管理官方功能」行，点 **Configure** 进入面板。面板每行一个功能，右侧是开关：

| 功能 | 关掉后失效的内容 |
| --- | --- |
| 自动化任务（`schedule`） | 宿主定时任务服务、任务页面与模型侧定时任务工具 |
| 目标（`goal`） | 目标服务、`/goal` 命令、目标工具与输入区目标条 |
| 任务清单（`task`） | `todo_write` 工具与任务清单界面 |
| 计划模式（`plan`） | 计划模式、`/plan` 命令与计划界面；提问界面不受影响 |
| 交付文件（`present`） | `present` 工具与文件引用指引；变更文件卡片保留 |

开关显示功能当前是否真的可用：只要还有一行在启用，开关就是开。关闭同时作用于宿主行与全部 preset 声明里的对应子行，因此新建会话不再提供该能力；已存在的会话保持它启动时的组合。

关闭记录存在宿主存储域 `practical_tool_official_features` 里，落在 `$DSH_HOME/storages`，不写 profile 配置。停用本行即撤销全部关闭动作；重新启用后按记录再次施加。关闭不删除该功能已有的数据，包括已排定的任务。

## 路由

全部路由在 `/api/dsh-practical-tools/` 下，位于宿主的 `/api` 认证围栏内。

| 路由 | 行 | 说明 |
| --- | --- | --- |
| `GET /status` | 根行 | 六行是否可用 |
| `POST /sweep` | `session-sweeper` | 归档并删除会话 |
| `GET /restart/info` | `restart-button` | 当前进程标识与运行形态 |
| `POST /restart` | `restart-button` | 重启服务或应用 |
| `GET /mobile.css` | `mobile-touch-ui` | 手机样式表 |
| `GET /official-features` | `official-features` | 五项官方功能的开关状态 |
| `POST /official-features` | `official-features` | 打开或关闭一个官方功能 |

接口形状见 [状态路由契约](specs/023-practical-tool-bundle/contracts/http-api.md) 与 [官方功能契约](specs/024-official-feature-toggles/contracts/official-features-api.md)。

## 开发

- 工作机制见 [how-it-works.md](./docs/how-it-works.md)。
- 开发与命令见 [development.md](./docs/development.md)。
- 已知风险见 [known-risks.md](./docs/known-risks.md)。

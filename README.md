# dsh-plugin-practical-tool-bundle（dsh使用工具组合包）

一个 DSH 插件包，由一行根行与五行功能行组成。每行可以单独启用或停用。

## 功能

| 行 | 功能 |
| --- | --- |
| 根行 | 提供浏览器半部与聚合状态路由，前端据此挂载其余三行的界面 |
| `session-sweeper` | 侧栏底部的扫帚：先把未置顶会话（含未分组的）归档，再永久删除全部已归档会话及其日志 |
| `reasoning-reset` | provider 拒绝历史推理块时，去掉模型可见历史里的推理块并重试同一步 |
| `claude-skills` | 把项目 `.claude/skills` 下的技能只读并入会话技能目录 |
| `restart-button` | 侧栏底部的重启按钮：网页场景重启服务，桌面场景重启应用 |
| `mobile-touch-ui` | 手机上（≤767px）放大侧栏、会话列表、顶栏与输入区控件 |

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

插件不提供配置项。各行使用固定默认值：

- 技能目录为项目根下的 `.claude/skills`。
- 手机样式表的抽屉宽度为 328。
- 重启日志写在 `~/.dsh/logs`。

## 路由

全部路由在 `/api/dsh-practical-tools/` 下，位于宿主的 `/api` 认证围栏内。

| 路由 | 行 | 说明 |
| --- | --- | --- |
| `GET /status` | 根行 | 五行是否可用 |
| `POST /sweep` | `session-sweeper` | 归档并删除会话 |
| `GET /restart/info` | `restart-button` | 当前进程标识与运行形态 |
| `POST /restart` | `restart-button` | 重启服务或应用 |
| `GET /mobile.css` | `mobile-touch-ui` | 手机样式表 |

接口形状见 [契约](specs/023-practical-tool-bundle/contracts/http-api.md)。

## 开发

- 工作机制见 [how-it-works.md](./docs/how-it-works.md)。
- 开发与命令见 [development.md](./docs/development.md)。
- 已知风险见 [known-risks.md](./docs/known-risks.md)。

# Changelog

## [1.0.1] - 2026-11-21

## Unreleased

### Added

- `official-features` 行「管理官方功能」：Plugins 页的行配置页里五个功能各一行开关（自动化任务、goal、task、plan、present）
- 开关同时作用于宿主行、界面行与全部 preset 声明的对应子行；宿主行按施加前的原值恢复，preset 按基线重算
- 关闭记录存在宿主存储域 `practical_tool_official_features`，不写 profile 配置；本行停用即撤销全部施加
- 订阅 `app-boot/config-reload`，配置重组后按记录重新施加
- 路由 `GET`/`POST /api/dsh-practical-tools/official-features`
- 根行状态路由增加 `officialFeatures` 项，前端新增一块面板界面

### Fixed

- 清理会话不再归档和删除打开中的会话：会话列表改读 `ctx.sessions.list`，此前服务结构读错使 `keepIds` 恒为空
- 打开 subagent 时保护它的全部祖先会话；宿主对同一请求内刚归档的会话按延后处理，不再删除日志

### Changed

- 插件标题改为「DSH实用工具组合包」，英文 `DSH practical tool bundle`；描述按用户视角重写
- 六个功能行新增中英文标题、描述与图标，显示在 Plugins 页
- 功能名改为：一键清理会话、推理报错自动重试、加载项目 Claude 技能、重启按钮、手机大按钮、官方功能开关
- README 只保留 npm 徽章与六段功能简介；路由与开发内容在 `docs/`
- 官方功能开关面板：去掉重复标题，每个功能下显示关闭后果，区分加载中与读取失败
- 重启与官方功能切换失败时显示本地化文案；重启路由的 `error` 改为错误码 `restart-pending`、`helper-failed`、`restart-failed`，原始说明在 `message`
- 清理面板与重启弹窗文案精简
- 宪章 2.2.0：README 归属改为功能简介与 npm 徽章

## 1.0.0

### Added

- 根行 `dsh-plugin-practical-tool-bundle`：提供浏览器半部与 `GET /api/dsh-practical-tools/status`，前端按行状态装卸界面
- `session-sweeper`：侧栏扫帚，先归档未置顶会话（含未分组），再删除全部已归档会话的日志；跳过主视图会话与运行中会话
- `reasoning-reset`：provider 以 400 拒绝历史推理块时，去掉模型可见历史里的推理块并重试同一步
- `claude-skills`：把项目根下 `.claude/skills` 的技能只读并入会话技能目录，支持目录与文件变化后的刷新
- `restart-button`：侧栏重启按钮，网页场景重启服务，桌面场景重启应用，含确认对话框与进度遮罩
- `mobile-touch-ui`：≤767px 生效的样式表，放大侧栏、会话列表、顶栏与输入区控件
- `assets/launcher.cjs` 与 `assets/mobile.css` 随包发布
- `locale/zh.json`、`locale/en.json`：中文标题「dsh使用工具组合包」与英文标题
- 测试：行状态、状态路由、清理会话、重启、清理推理块、Claude 技能、手机样式与前端装卸

# Changelog

## Unreleased

### Added

- `lark-super-agent` 与 `SA-调度会话`、`SA-任务会话` 预设：通过独立安装的 lark-bridge 远程派发任务并协调会话
- `send_report`、结构化注入块、任务失败通知与候选会话查询
- 调度工作区内的任务与工作区笔记、git 提交、上报存档及任务完成自动归档

### Fixed

- 官方功能开关的关闭记录在宿主重启后不生效：启动期首次重新施加的窗口在受管行装载完成前用完，之后没有补偿动作
- 现在在启动成功提交（`appReady.onReady`）后再施加一次，两次各重试 8 轮；宿主不提供 `appReady` 时只做启动那一次
- 两次都没达成时写一条 warn，包含未达成的功能标识

## 1.0.1

### Added

- `official-features` 行「管理官方功能」：在 Plugins 页的配置页逐项开关自动化任务、目标、任务清单、计划模式和交付文件
- 开关同时作用于宿主行、界面行与全部 preset 声明的对应子行；关闭记录存在宿主存储域 `practical_tool_official_features`
- 路由 `GET`/`POST /api/dsh-practical-tools/official-features`
- 根行状态路由的 `officialFeatures` 项与官方功能面板
- 六个功能行的中英文标题、描述与图标

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
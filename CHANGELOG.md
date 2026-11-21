# Changelog

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

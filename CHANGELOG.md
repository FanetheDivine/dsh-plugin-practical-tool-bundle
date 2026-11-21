# Changelog

## Unreleased

### Changed

- `SA-调度会话` 的系统提示词要求始终把任务派给 worker 会话，自身只在调度工作区读写
- `SA-调度会话` 的系统提示词要求建任务前先匹配工作区；无匹配时请用户新增工作区或补充 summary / keywords
- `SA-调度会话` 的系统提示词把项目巡检、改代码、跑构建与装环境交给 worker
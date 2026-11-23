# 实机测试报告：移除飞书任务与调度会话

**日期**：2026-11-23
**宿主**：0.2.2-rc.5（全局 dsh）
**profile**：`rdt-033`，隔离会话与存储
**模型**：mock provider；宿主、插件、会话存储与 GUI 为真实实现

## 范围

本报告验证装载、路由与界面：六行是否加载、已删除的行与预设是否消失、调度状态路由是否下线、其余功能是否照常。模型行为不涉及。

## A 装载

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| A1 根行与六行在 loader 中启用 | 通过 | 根行与六个功能行（含 `official-features`）的入口模块名、`disabled` 与 fiber 状态正确 |
| A2 已安装产物与仓库 dist 一致 | 通过 | 版本 1.1.0，`dist/index.mjs` 哈希一致 |
| A3 已删除的行不在 loader | 通过 | 213 个条目中没有 `lark-super-agent`、`sa-dispatch`、`sa-worker` |

## 路由与界面

| 用例 | 结果 | 关键断言 |
| --- | --- | --- |
| A3 状态路由报告六行可用 | 通过 | 键集为 `sweeper`、`reasoningReset`、`claudeSkills`、`restart`、`mobile`、`officialFeatures`，值为布尔 |
| B1 清理会话拒绝空请求体 | 通过 | HTTP 400 |
| B2 清理会话返回计数 | 通过 | HTTP 200，五个计数为数字 |
| B3 重启 info | 通过 | `pid`、`startedAt` 为数字，`runtime` 为 `web` |
| B4 手机样式表 | 通过 | `text/css`，含 328px 与 767px 断点 |
| B5 调度状态路由 | 通过 | `GET /api/dsh-practical-tools/lark-super-agent/status` 返回 404 |
| C1 侧栏按钮 | 通过 | 清理会话与重启按钮存在 |
| C2 悬停样式 | 通过 | 两个按钮的背景 alpha 均为 12% |
| C3 手机放大 | 通过 | 390px 视口下样式表注入，控件最小尺寸 44px |
| C4 控制台 | 通过 | 无 error |

## 与 quickstart 的对应

| quickstart | 覆盖用例 |
| --- | --- |
| Q-7 隔离 profile 装载 | A1、A2 |
| Q-8 插件页六行 | A1、A3 |
| Q-9 预设列表无 `SA-调度会话` 与 `SA-任务会话` | A1 的 loader 条目检查（预设声明不再存在） |
| Q-10 状态路由六项 | A3 状态路由 |
| Q-11 调度状态路由 404 | B5 |
| Q-12 其余界面不受影响 | B1 至 B4、C1 至 C4 |

## 结论

全部用例通过，未发现缺陷。测试结束后已删除 profile。

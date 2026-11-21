# Quickstart: dsh使用工具组合包

## 前置条件

- Node.js 24.9 及以上，pnpm 11。
- 已安装 DSH 0.2.2-rc.5（`dsh --version`）。

## 构建与检查

```sh
pnpm install
pnpm format
pnpm check
pnpm build
```

`pnpm build` 末尾运行 `test:dist`，要求 `dist` 为最新。

## 本地加载

1. 在 profile 的 `cordis.patch.yml` 加入根行与需要的功能行，或直接 `dsh plugin add <本仓库>`。
2. 只加根行时，状态路由报告五行均为 `false`，侧栏没有按钮；逐行添加后逐个出现。

## 场景验证

| 场景 | 步骤 | 期望 |
| --- | --- | --- |
| 状态路由 | `curl http://127.0.0.1:<port>/api/dsh-practical-tools/status` | 五项均为布尔值或 `null`，启用行为 `true` |
| 清理会话 | 侧栏悬停扫帚 → 打开面板 → 两次点击清理 | 面板显示数量，清理后侧栏会话消失，主视图会话保留 |
| 悬停一致性 | 分别悬停扫帚与重启按钮 | 两者的背景混合比例、尺寸、圆角一致，强调色不同 |
| 重启（网页） | 点击重启 → 确认 | 出现遮罩，服务恢复后页面自动刷新 |
| 重启（桌面） | 同上 | 应用关闭后重新打开，页面回来 |
| 清理推理块 | 用会拒绝历史推理块的 provider 继续对话 | 同一步自动重试并继续，日志条数不变 |
| Claude 技能 | 在含 `.claude/skills/<name>/SKILL.md` 的项目新建会话 | 技能列表出现该技能；修改文件后 5 秒内刷新 |
| 手机样式 | 以 767px 宽度打开页面 | 会话列表与输入区控件放大；768px 以上无差异 |
| 行开关 | 停用重启行 | 1 分钟内重启按钮消失且无失败请求；重新启用后按钮回来 |

## 验收命令

```sh
pnpm check
pnpm build
npm pack --dry-run --json
```

包内容应包含 `dist/*.mjs`、`dist/client.js`、`assets/launcher.cjs`、`assets/mobile.css`、`icon.svg`、`cordis.patch.yml`、`locale/*.json` 与 `README.md`，不含 `src`、`tests`、`scripts`。

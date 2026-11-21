# Quickstart: 管理官方功能

## 前提

- Node 24.9 及以上，pnpm 11。
- 一个只含 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app` 的临时 profile，`patchReload` 为 `live`。
- 本包构建产物 `dist/`，由 `pnpm build` 生成。

## 本地检查

```text
pnpm format && pnpm check
pnpm build
```

## 真机验证

1. 在临时 profile 的补丁中用 `insert` 加入本包各行，模块名指向 `dist/*.mjs` 的 `file:///<repo>/dist/...`。
2. 启动：`dsh <profile> --no-open`，打开输出的地址。
3. 在侧栏 Plugins 页打开本包，进入「管理官方功能」行页。

## 验证场景

| 场景 | 步骤 | 期望 |
| --- | --- | --- |
| 关闭 | 关闭「自动化任务」 | 2 秒内开关显示关；新会话看不到定时任务工具；`ui-schedule` 界面消失 |
| 打开 | 再打开该开关 | 能力与界面恢复，无需刷新页面 |
| 外部状态 | 手工把 `ui-goal` 在 profile 里停用 | 面板 goal 行仍为开，因为 preset 子行仍在；再把 preset 子行也移除后显示关 |
| 多行 | 关闭 goal | `goal`、`goal-round-driver`、`ui-goal` 与各 preset 的 `command-goal`、`tool-goal` 全部停用 |
| 默认停用行 | 在 Web 面关闭 task | 宿主 `tool-todo` 不被启用；只移除 preset 子行 |
| 重组 | 触碰 profile 补丁文件 | 重组后 2 秒内被关闭的功能重新关闭 |
| 重启 | 重启宿主 | 被关闭的功能保持关闭 |
| 本行停用 | 在 Plugins 页停用「管理官方功能」行 | 全部功能恢复；面板入口消失 |
| 不写文件 | 关闭全部五项 | `cordis.yml`、`cordis.patch.yml`、`package.json` 内容与操作前一致 |
| 记录损坏 | 把存储域文件改成非法内容后重启 | 按无记录运行并记录警告，不覆盖原文件 |

## 清理

删除临时 profile 与 `$DSH_HOME/storages/practical_tool_official_features.json`。

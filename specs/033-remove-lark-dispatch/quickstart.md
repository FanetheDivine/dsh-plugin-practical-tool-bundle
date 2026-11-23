# 验证指南：移除飞书任务与调度会话

## 前置

- Node.js 24.9 及以上，pnpm 11。
- 已安装依赖：`pnpm install`。

## 自动化

| 步骤 | 命令 | 预期 |
| --- | --- | --- |
| Q-1 | `pnpm check` | 类型、lint、`code` project 通过 |
| Q-2 | `pnpm build` | 构建通过，`dist` project 通过 |
| Q-3 | `ls dist` | 只有 `index.mjs`、`sweeper.mjs`、`reasoning-reset.mjs`、`claude-skills.mjs`、`restart.mjs`、`mobile.mjs`、`official-features.mjs`、`client.js` 与类型声明 |
| Q-4 | `grep -ril "lark\|飞书\|sa-dispatch\|sa-worker" --exclude-dir=node_modules --exclude-dir=dist .` | 命中只出现在 `specs/`、`changelogs/` 与 `CHANGELOG.md` |
| Q-5 | `node -e "const p=require('./package.json');console.log(Object.keys(p.exports).filter((k)=>k.includes('lark')||k.includes('sa-')))"` | 输出空数组 |
| Q-6 | `grep -n "meta-tools" package.json pnpm-workspace.yaml` | 无命中 |

## 实机

| 步骤 | 操作 | 预期 |
| --- | --- | --- |
| Q-7 | `pnpm pack`，在隔离 profile 安装产物并重启宿主 | 启动无缺失模块错误 |
| Q-8 | 打开 Plugins 页 | 只有根行与六行功能行，无 `lark-super-agent` |
| Q-9 | 新建会话查看预设列表 | 无 `SA-调度会话` 与 `SA-任务会话` |
| Q-10 | 请求 `GET /api/dsh-practical-tools/status` | 返回六个键，无 `larkSuperAgent` |
| Q-11 | 请求 `GET /api/dsh-practical-tools/lark-super-agent/status` | 返回 404 |
| Q-12 | 打开清理会话、重启、手机、官方功能四个界面 | 行为与删除前一致 |

实机步骤按 `real-device-test` skill 的隔离 profile 流程执行。
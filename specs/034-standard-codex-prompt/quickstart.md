# 快速验证：标准模式叠加层

**Feature**: `feat/034-standard-codex-prompt` | **Date**: 2026-11-29

## 静态验证

```sh
pnpm format && pnpm check
pnpm build
```

期望：

- `pnpm check` 通过类型检查、lint 与 `code` project。
- `pnpm build` 产出 `dist/standard-codex.mjs`、`dist/codex-behavior.mjs` 与类型声明，`dist` project 通过。
- 三个新增测试通过。

## 真机验证

1. 构建并搭隔离 profile：

   ```sh
   bash .dsh/skills/real-device-test/scripts/setup-env.sh <repo> <profile>
   ```

2. 启动 GUI 并发送一条消息，读取 profile 下的 `requests.jsonl`：

   - 系统提示词含 `## Responsiveness`、`### Sharing progress updates`、`### Stop-loss and convergence` 各一次。
   - 三段顺序为响应性、进度、止损，且都出现在 plan 政策与工具规则之前。
   - 不含 `You are a coding agent powered by`，不含插值后的模型名。
   - 工具名集合与停用 `standard-codex` 行时相同。

3. 关闭一个官方功能后再开新会话，确认三段仍在，受管子行按开关变化。

4. 结束：结束 GUI 进程，删除 profile。

## 失败处理

- 三段未出现：确认 `standard-codex` 行已启用，`preset-standard` 条目已被改写。
- persona 前缀仍在：确认条目的 `config.plugins` 里 persona 子行 `config.prefix` 为空串。
- 工具集合变化：本行只追加提示词子行，检查是否误改了其它子行。
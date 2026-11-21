# Quickstart: 官方功能关闭跨重启生效

## 前置

- 仓库执行 `pnpm install`，`dist/` 与当前代码一致（`pnpm build`）。
- 宿主 `@deepseek-ai/dsh` 为 `0.2.2-rc.5`。
- 实机验证按 `.dsh/skills/real-device-test` 搭建独立 profile。

## 单元验证

```sh
pnpm format && pnpm check
```

期望：

- `tests/official-features-lifecycle.test.ts` 覆盖 `appReady` 存在时施加两次、缺失时只施加一次、取消函数随 effect 释放。
- `tests/official-features-reapply.test.ts` 覆盖轮数用尽时 `warn` 收到一条含功能 id 的记录。

## 实机验证

1. 搭建 profile 并写入五项关闭记录：

   ```sh
   bash .dsh/skills/real-device-test/scripts/setup-env.sh <repo> rdt-fix028-check
   ```

   记录文件放在 profile 的存储根下，`off` 含 `schedule`、`goal`、`task`、`plan`、`present`。

2. 启动宿主，读取五项状态：

   ```sh
   node probe-official.mjs
   ```

   期望：`samples` 最后一次的五项全部 `on: false`。

3. 连续启动 3 次，重复第 2 步；每次结果一致。

4. 打开面板确认开关显示为关闭，切换一项为开启后再次启动，确认该项保持开启。

## 回退验证

1. 停用 `official-features` 行后启动，五项恢复可用。
2. 重新启用该行，面板显示真实状态，开关可切换。

## 已知限制

- 宿主不提供 `appReady` 时只做启动施加；受管行晚于首次施加装载完成时，可能出现一次启动后未关闭。
- 施加失败只写 warn，面板不额外提示。

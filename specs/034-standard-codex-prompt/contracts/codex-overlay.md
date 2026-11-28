# 契约：标准模式叠加层

**Feature**: `feat/034-standard-codex-prompt` | **Date**: 2026-11-29

## 1. 宿主行 `standard-codex`

- 模块名 `dsh-plugin-practical-tool-bundle/standard-codex`，注入 `loader`。
- 目标条目：`options.name === '@deepseek-ai/dsh-agent-preset'` 且 `options.config.id === 'standard'`。
- 无目标条目时不做任何写操作，不抛错。

### 变换

| 输入 | 输出 |
| --- | --- |
| `config.plugins` 里的 persona 子行 | `config.prefix` 为空串，其余字段与位置不变 |
| `config.plugins` 末尾 | 追加 `{ id: 'codex-behavior', name: 'dsh-plugin-practical-tool-bundle/codex-behavior' }` |
| 其余子行 | 原对象原顺序保留 |
| `config` 其它字段 | 原样保留 |

- 已存在同 id 子行时不再追加。
- 目标状态已满足时不调用 `loader.update`。
- 每个条目只保存一次首次施加前的 `config` 快照。
- `app-boot/config-reload` 后重新施加。
- 行停用按快照恢复，失败只写 warn。

## 2. 预设子行 `codex-behavior`

只注册三个系统提示词段，不注册工具、不提供服务。

| 段名 | 段序 | 文本 |
| --- | --- | --- |
| `codex:responsiveness` | 100 | S3 响应性原文 |
| `codex:progress-updates` | 110 | S4 进度更新原文 |
| `codex:stop-loss` | 120 | S6 止损收敛原文 |

- 文本为英文，逐字使用 `src/codex-behavior/prompts.ts` 的常量。
- 不出现模型名、`{{...}}` 插值与其它段落的复制。

## 3. 与既有行的关系

- 官方 `standard.patch.yml` 不改动；`preset-standard` 的 `name` 与 `id` 不变。
- 本包的 `official-features` 行重算时用当前子行覆盖基线同名子行，并追加基线外子行，因此保留 persona 空前缀与 `codex-behavior`。
- `standard-codex` 行在 `cordis.patch.yml` 中排在 `official-features` 之后。
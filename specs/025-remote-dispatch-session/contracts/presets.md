# 契约：补丁中的行与预设

本包 `cordis.patch.yml` 在现有六行之后插入以下三行。

## 行

| 行 id | `name` | 作用 |
| --- | --- | --- |
| `lark-super-agent` | `dsh-plugin-practical-tool-bundle/lark-super-agent` | 提供 `larkSuperAgent` 服务与状态路由 |
| `preset-sa-dispatch` | `@deepseek-ai/dsh-agent-preset` | 声明 `SA-调度会话` |
| `preset-sa-worker` | `@deepseek-ai/dsh-agent-preset` | 声明 `SA-任务会话` |

两个预设声明行出现在插件页本包的行列表中，停用即下线该预设。

## `preset-sa-dispatch`

```yaml
config:
  id: sa-dispatch
  name: SA-调度会话
  description: <中文说明>
  plugins: <下表>
```

| 子行 id | `name` | 配置 |
| --- | --- | --- |
| `persona` | `@deepseek-ai/dsh-persona` | 与标准预设相同 |
| `agent-instructions` | `@deepseek-ai/dsh-agent-instructions` | `maxBytes: 65536` |
| `time-context` | `@deepseek-ai/dsh-time-context` | — |
| `tool-bash` | `@deepseek-ai/dsh-tool-bash` | 平台条件见 P-015 |
| `tool-pwsh` | `@deepseek-ai/dsh-tool-pwsh` | 平台条件见 P-015 |
| `tool-fs` | `@deepseek-ai/dsh-tool-fs` | `applyPatch: false` |
| `tool-fs-search` | `@deepseek-ai/dsh-tool-fs-search` | `sampleOverCapGlobResults: false` |
| `tool-web` | `@deepseek-ai/dsh-tool-web` | `fetch: true`、`searchTimeoutMs: 60000` |
| `skill-filesystem` | `@deepseek-ai/dsh-skill-filesystem` | 不写 `customSkillDirs`，见 P-015 |
| `tool-skill` | `@deepseek-ai/dsh-tool-skill` | — |
| `compaction` | `cordis:group` | 与标准预设相同的三行 |
| `meta-tools` | `dsh-plugin-meta-tools` | 十一项全开，`session_preset: sa-worker` |
| `sa-dispatch` | `dsh-plugin-practical-tool-bundle/sa-dispatch` | 笔记写工具、`task_candidates` 与提示词段 |

## `preset-sa-worker`

```yaml
config:
  id: sa-worker
  name: SA-任务会话
  description: <中文说明>
  plugins: <宿主 0.2.2-rc.5 标准预设全部子行，去掉 tool-ask-user，加入下行>
```

| 子行 id | `name` | 作用 |
| --- | --- | --- |
| `sa-worker` | `dsh-plugin-practical-tool-bundle/sa-worker` | `send_report`、提示词段、失败监听 |

`skill-filesystem` 同样不写 `customSkillDirs`。

## 结构测试

`tests/` MUST 断言：

- 两个预设都不含 `@deepseek-ai/dsh-tool-ask-user`。
- `sa-dispatch` 的工具行只有上表所列。
- `sa-worker` 与标准预设快照相比，只差 `tool-ask-user`、`sa-worker` 与 `customSkillDirs`。
- 两个预设都不设为默认，补丁不改动 `agent-preset-registry`。

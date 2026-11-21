# 数据模型

## 文件布局

| 文件 | 内容 |
| --- | --- |
| `locale/{zh,en}.json` | 包级 meta |
| `rows/<子路径>/locale/{zh,en}.json` | 行 meta：`meta.title`、`meta.description` |
| `rows/<子路径>/icon.svg` | 行图标 |

子路径：`sweeper`、`reasoning-reset`、`claude-skills`、`restart`、`mobile`、`official-features`。与 `cordis.patch.yml` 的 `name` 后缀一致。

`package.json`：

- `exports` 为每个子路径增加 `./<子路径>/locale/*.json` → `./rows/<子路径>/locale/*.json` 与 `./<子路径>/icon` → `./rows/<子路径>/icon.svg`。
- `files` 增加 `rows`。

## 前端字典键

键集与文案见 [copy.md](./contracts/copy.md)。

| 变化 | 键 |
| --- | --- |
| 新增 | `restart.error.duplicate`、`restart.error.helper`、`restart.error.unknown` |
| 新增 | `officialFeatures.loading`、`officialFeatures.loadFailed`、`officialFeatures.error.store`、`officialFeatures.error.apply`、`officialFeatures.error.unknown` |
| 新增 | `officialFeatures.detail.<功能 id>` 五个 |
| 删除 | `officialFeatures.failed`、`officialFeatures.unavailable` |

## 面板状态

| 状态 | 条件 |
| --- | --- |
| `loading` | 尚未读到任何状态，且没有失败 |
| `failed` | 尚未读到任何状态，且最近一次读取失败 |
| `ready` | 已读到状态；之后的单次读取失败保持当前显示 |

## 路由错误字段

| 路由 | 字段 | 值 |
| --- | --- | --- |
| `POST /restart` | `error` | `restart-pending`、`helper-failed`、`restart-failed` |
| `POST /restart` | `message` | 原始英文说明，可选 |
| `POST /official-features` | `error` | 不变：`invalid-request`、`store-failed`、`apply-failed` |
| `POST /sweep` | `error` | 不变；前端只区分成功与失败 |

# Implementation Plan: 优化用户可见内容

**Branch**: `docs/027-user-facing-copy` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-user-facing-copy/spec.md`

**Status**: Approved

## Open Decisions

（无）

## Clarifications

### Session 2026-11-21

- [P-001] Q: 行 meta 与图标放在哪个目录？ -> A: `rows/<子路径>/`，经 `exports` 映射。
- [P-002] Q: 官方功能开关面板是否去掉自己的标题？ -> A: 去掉。
- [P-003] Q: 重启路由的 `error` 字段改为错误码？ -> A: 改为 `restart-pending`、`helper-failed`、`restart-failed`，原始说明移到 `message`；同步更新 023 路由契约。
- [P-004] Q: 文案定稿？ -> A: 按 [copy.md](./contracts/copy.md) 实现。

## Review Record

- 2026-11-21 | Decision: Approved | Scope: current full document | Open items: none | Risks: 宿主详情页可能不加载远程徽章图片，实机核对

## Summary

只改用户可见内容：

- 包级 meta 改标题与描述。
- 六个功能行新增中英文 meta 与图标。
- README 改为 npm 徽章加六段功能简介。
- 官方功能开关面板加每行说明、加载中与读取失败状态。
- 界面错误按错误码显示本地化文案。
- 清理面板与重启弹窗只改文字。

功能行为、路由路径与行 id 不变。

## Technical Context

**Language/Version**: TypeScript 6，React 18

**Primary Dependencies**: DSH `0.2.2-rc.5` 宿主与前端包

**Storage**: N/A

**Testing**: vitest，`tests/helpers.ts` 的模拟 `ctx`

**Target Platform**: DSH 网页版与桌面版

**Project Type**: DSH 插件包

**Performance Goals**: N/A

**Constraints**: 英文 sentence case；locale 资源不含 U+200B 与 U+FEFF；仅公网 URL

**Scale/Scope**: 1 个包级 meta、6 个行级 meta、6 个图标、约 80 个字典键、1 份 README

## Constitution Check

| 原则 | 结论 |
| --- | --- |
| I. 宿主依赖版本 | 通过。依赖不变 |
| II. 测试同步 | 通过。meta、打包、面板状态、错误码各有测试，见 [quickstart.md](./quickstart.md)；测试断言行为与结构，不复述文案 |
| III. 文档结构 | 通过。宪章原则 III 的 README 归属按 D-004a 修订为「功能简介与 npm 徽章」，版本 2.1.0 → 2.2.0；删除内容在 `docs/` 已有归属，见 [R-004](./research.md#r-004-开发者内容的去向)；`docs/i18n.md` 增加行 meta 一节；CHANGELOG 增加条目 |
| IV. 质量门禁 | 通过。每阶段运行 `pnpm format && pnpm check` |
| V. 公开引用 | 通过。徽章与链接均为公网 URL；图标为本仓库作者的本地插件资源，随包复制 |

设计完成后复核：通过。

## Project Structure

### Documentation (this feature)

```text
specs/027-user-facing-copy/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/copy.md
└── tasks.md
```

### Source Code

```text
locale/{zh,en}.json                 # 包级 meta
rows/<子路径>/locale/{zh,en}.json    # 行 meta，六个子路径
rows/<子路径>/icon.svg               # 行图标
package.json                        # description、exports、files
README.md
src/client/locales.ts               # 字典
src/client/official-features.tsx    # 面板状态、每行说明、错误码映射
src/client/restart.tsx              # 错误码映射
src/restart/index.ts                # 错误码
docs/i18n.md、docs/how-it-works.md、docs/development.md
.specify/memory/constitution.md
specs/023-practical-tool-bundle/contracts/http-api.md
CHANGELOG.md
tests/
```

**Structure Decision**：行资源集中在 `rows/`，见 P-001。

## 阶段

| 阶段 | 内容 |
| --- | --- |
| 1 | 宪章修订 |
| 2 | 包级与行级 meta、图标、`package.json`、metadata 与打包测试 |
| 3 | 字典、面板、错误码与对应测试 |
| 4 | README、`docs/`、契约与 CHANGELOG |
| 5 | 构建与实机核对 |

## Complexity Tracking

无。

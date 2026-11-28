# Implementation Plan: 标准模式追加 Codex 行为提示词

**Branch**: `feat/034-standard-codex-prompt` | **Date**: 2026-11-29 | **Spec**: [spec.md](./spec.md)

**Status**: Approved

## Open Decisions

无。实施决策见 Clarifications。

## Clarifications

### Session 2026-11-29

- [P-001] Q: 叠加方式？ -> A: 新增宿主行 `standard-codex`，运行期 `loader.update` 改写 `preset-standard` 的 `config.plugins`，与 `official-features` 同模式。
- [P-002] Q: 三段放在一个 plugin 还是拆三个？ -> A: 一个 `codex-behavior` 插件注册三个 section，段序 100/110/120。
- [P-003] Q: 恢复时机？ -> A: 行停用时按首次施加前的 config 恢复，失败只记 warn。
- [P-004] Q: 与 `official-features` 的先后？ -> A: `standard-codex` 排在 `official-features` 之后；后者的 `rebuild` 用当前子行覆盖基线子行并追加基线外子行，因此保留本功能。
- [P-005] Q: 版本与发布？ -> A: 合入后按 `pnpm release` 打 patch 版本。

## Review Record

- 2026-11-29 | Decision: Approved | Scope: current full document | Open items: none | Risks: 宿主 loader 契约变化；Web 编辑器改写标准模式后运行期基线漂移
- 2026-11-29 | 依据: 用户确认基座、三段文本与自行发布授权

## Summary

在标准模式上叠加 Codex 行为层：新增宿主行 `standard-codex`，启动与配置重组后把官方 `preset-standard` 的 persona 前缀清空、追加 `codex-behavior` 子行；该子行注册三段英文提示词。官方声明文件与工具面保持不变。

## Technical Context

**Language/Version**: TypeScript 6，Node.js ≥ 24.9，pnpm 11

**Primary Dependencies**: 宿主 `@deepseek-ai/*`；本包运行时 `yaml`。不新增依赖

**Testing**: vitest `code` 与 `dist` 两个 project；`pnpm check`、`pnpm build`

**Target Platform**: DSH 宿主行与预设子行

**Project Type**: DSH 插件包

**Scale/Scope**: 2 个新宿主入口、3 个新测试文件、1 个新宿主行；修改约 10 个共享文件

## Constitution Check

| 原则 | 结论 | 依据 |
| --- | --- | --- |
| I 宿主依赖版本 | 通过 | 不新增 `@deepseek-ai/*` 依赖 |
| II 测试同步 | 通过 | 变换与提示词段均有单元测试；quickstart 覆盖真机验证 |
| III 文档结构 | 通过 | README 写用户可见变化；`docs/how-it-works.md` 写机制与共存；`docs/development.md` 写入口；`locale/` 与 `CHANGELOG.md` 同步 |
| IV 质量门禁 | 通过 | 每阶段收尾 `pnpm format && pnpm check`，交付前 `pnpm build` |
| V 公开引用 | 通过 | 文档只引用仓库内路径与公网 URL |

**设计后复核**: 通过。代码不写入任何本机路径。

**Complexity Tracking**: 无偏离。

## Project Structure

```text
specs/034-standard-codex-prompt/
├── plan.md
├── spec.md
├── contracts/
│   └── codex-overlay.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md

src/
├── codex-behavior/
│   ├── index.ts      # 预设子行：注册三段 section
│   └── prompts.ts    # 三段英文原文
└── standard-codex/
    └── index.ts      # 宿主行：运行期叠加 preset-standard

tests/
├── codex-behavior.test.ts
├── standard-codex.test.ts
└── standard-codex-prompt.test.ts
```

## Implementation Order

每个阶段一个 commit。

1. **插件与行**：写 `codex-behavior`、`standard-codex`，登记 `cordis.patch.yml`、`tsdown`、`exports`。
2. **测试**：新增三个测试，更新产物、打包与行名断言的清单。
3. **文档与元数据**：README、AGENTS、`docs/`、`locale/`、`CHANGELOG.md`。
4. **构建与真机验证**：`pnpm build`；隔离 profile 验证提示词与工具集合；PR、CI、合并、release。

## Verification

- `pnpm check`、`pnpm build`。
- 单元测试覆盖变换、幂等、恢复、重载、缺失预设、loader 缺失、三段注册。
- 真机：标准会话说一条消息，系统提示词含三段各一次、顺序正确、无模型名身份句；启用与停用本行时工具名集合相同。

## Risks

- `loader.update` 属宿主内部契约，升级需回归。缓解：真机验证 + known-risks 记录。
- `official-features` 重算若改变 `rebuild` 语义会丢行为段。缓解：真机同时开关一个功能验证。
- Web 编辑器改写标准模式后运行期基线漂移。缓解：配置重组后重新施加；文档说明。
# Implementation Plan: dsh使用工具组合包

**Branch**: `feat/023-practical-tool-bundle` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-practical-tool-bundle/spec.md`

**Status**: Draft

## Open Decisions

- 无。实现决策已在澄清阶段确认。

## Clarifications

### Session 2026-11-21

- [D-101] Q: 源插件的 JS 实现怎么迁入模板？ -> A: 全部重写为 TypeScript 模块。
- [D-102] Q: 根行怎么判断五行是否启用？ -> A: 根行读 loader 的行列表、`disabled` 与 fiber 状态。
- [D-103] Q: 验收做到哪一步？ -> A: 单测与产物测试全跑，再在桌面宿主实机验证一轮。

## Review Record

- 2026-11-21 | Decision: Approved | Scope: current full document | Open items: 无 | Risks: loader 内部 API 随宿主升级可能变化；`files` 漏写 `assets/` 会使重启与手机样式失效；清理会话在测试中只操作临时目录

## Summary

把模板改造成一个单包多行的插件：根行 `dsh-plugin-practical-tool-bundle` 携带浏览器半部与一条聚合状态路由，五个功能行分别提供清理会话、清理推理块、Claude 技能、重启按钮与手机触控放大。宿主半部按源插件行为移植为 TypeScript，前端按模板的 React 约定重写，用根行状态路由驱动三个界面块的装卸。

## Technical Context

**Language/Version**: TypeScript 6.0（strict、`exactOptionalPropertyTypes`）、React 18.3（前端）、Node 24.9+

**Primary Dependencies**: `@deepseek-ai/cordis` ~4.1.0、`@deepseek-ai/dsh-home-paths` 0.2.2-rc.5、`@deepseek-ai/dsh-llm` 0.2.2-rc.5、`@deepseek-ai/dsh-session` 0.2.2-rc.5、`@deepseek-ai/dsh-skill` 0.2.2-rc.5、`yaml` ^2.9.1（随 claude-skills 打进产物）

**Storage**: DSH 数据目录 `~/.dsh/sessions/<cwd key>/<session id>`（清理会话读取并删除）、`~/.dsh/logs`（重启日志）；插件不新建存储。

**Testing**: vitest（`code` 与 `dist` 两个 project）、`npm pack --dry-run` 包内容回归、桌面宿主实机验证

**Target Platform**: DSH 0.2.2-rc.5，Web 与 Desktop 宿主

**Project Type**: DSH 插件（单包多 Loader 行 + 浏览器半部）

**Performance Goals**: 状态路由单次响应 < 5ms；前端每 3 秒最多一次状态请求且仅在页面可见时；清理一次 5000 个会话 id 上限

**Constraints**: 宿主依赖必须保持 external 并使用宿主同一实例；前端产物必须在宿主冻结模块表内解析；不得与其他插件的 `/api` 路由冲突

**Scale/Scope**: 6 个宿主入口、1 个前端入口、3 个前端界面块、5 个功能行

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 结论 | 说明 |
| --- | --- | --- |
| I. 宿主依赖版本 | 通过 | 全部 `@deepseek-ai/dsh-*` 锁定 0.2.2-rc.5；`@deepseek-ai/cordis` 取该版 dsh 声明的 `~4.1.0`；每个 dsh 子包按 `<包名>@0.2.2-rc.5` 列入 `minimumReleaseAgeExclude` |
| II. 测试同步 | 通过 | 每个宿主行与前端块新增单测；包内容、产物契约、元数据、依赖版本测试同步更新；实机一轮见 quickstart |
| III. 文档结构 | 通过 | README 写功能、AGENTS 去模板化、宪章改项目名与原则、docs 重写工作机制与文件地图 |
| IV. 质量门禁 | 通过 | 每阶段结束运行 `pnpm format && pnpm check`，合并前 `pnpm check` |
| V. 公开引用 | 通过 | 文档只引用仓库内路径；源插件的实现只作行为参照，不写入路径引用 |

偏离项：无。`loader` 内部 API 的使用是用户选定的实现方式，风险记入 Risks，不构成宪章偏离。

## Project Structure

### Documentation (this feature)

```text
specs/023-practical-tool-bundle/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/http-api.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks 生成
```

### Source Code (repository root)

```text
package.json                  # 包名、多入口 exports、files、dsh.client
cordis.patch.yml              # 根行 + 五个功能行
assets/
├── launcher.cjs              # 重启用的 detached 启动器
├── mobile.css                # 手机样式表（含抽屉宽度占位符）
└── icon.svg                  # 插件图标
locale/
├── zh.json                   # 标题「dsh使用工具组合包」与描述
└── en.json
src/
├── index.ts                  # 根行：状态路由
├── rows.ts                   # 行 id、服务名、路由常量
├── types.ts                  # 宿主类型再导出
├── utils.ts                  # 运行时判断等零依赖函数
├── row-status.ts             # 读 loader 汇总行状态
├── sweeper/index.ts          # 清理会话行：归档 + 删除日志
├── reasoning-reset/index.ts  # 清理推理块行：消息投影 + 重试
├── claude-skills/index.ts    # Claude 技能行：注册 provider
├── claude-skills/provider.ts # 只读技能目录扫描与监听
├── restart/index.ts          # 重启行：info/restart 路由
├── mobile/index.ts           # 手机样式行：样式表路由
└── client/
    ├── index.ts              # 前端入口：字典、状态轮询、块装卸
    ├── locales.ts            # 中英文字典
    ├── status.ts             # 状态轮询与子插件装卸
    ├── sweeper.tsx           # 侧栏扫帚按钮与面板
    ├── restart.tsx           # 重启按钮、对话框与进度遮罩
    └── mobile.ts             # 手机样式表挂载
tests/                        # 单测、产物测试与包内容测试
```

**Structure Decision**: 每个 Loader 行一个入口文件，由 `package.json` 的 `exports` 子路径声明；根行入口同时承载状态路由。前端只有一个入口，三个界面块在运行时按状态装卸。

## Phase 0: Research

见 [research.md](./research.md)。要点：

- 行状态来源：`ctx.get('loader')` 的 `EntryTree.entries()`，按行 id 匹配，读 `disabled` 与 fiber 状态。
- Fiber 的 `ACTIVE` 是 `const enum`，运行时不存在，按数值 2 比较并注明来源。
- 多入口构建：tsdown 用对象形式的 `entry`，每个入口输出 `dist/<name>.mjs`；`neverBundle` 保持宿主依赖 external，`alwaysBundle: ['yaml']` 只打包 yaml。
- 静态资源：`assets/` 随包发布，运行期用 `new URL('../assets/...', import.meta.url)` 定位。
- 前端种子：沿用模板的 `PLATFORM_MODULES`，新增的客户端依赖仅限已注入的两个包。

## Phase 1: Design

- 数据模型见 [data-model.md](./data-model.md)。
- HTTP 契约见 [contracts/http-api.md](./contracts/http-api.md)。
- 验收步骤见 [quickstart.md](./quickstart.md)。

### 行与路由

| 行 id | 包入口 | 路由 | 前端块 |
| --- | --- | --- | --- |
| `dsh-plugin-practical-tool-bundle` | `.` | `GET /api/dsh-practical-tools/status` | 全部 |
| `session-sweeper` | `./sweeper` | `POST /api/dsh-practical-tools/sweep` | 扫帚按钮与面板 |
| `reasoning-reset` | `./reasoning-reset` | 无 | 无 |
| `claude-skills` | `./claude-skills` | 无 | 无 |
| `restart-button` | `./restart` | `GET /api/dsh-practical-tools/restart/info`、`POST /api/dsh-practical-tools/restart` | 重启按钮与遮罩 |
| `mobile-touch-ui` | `./mobile` | `GET /api/dsh-practical-tools/mobile.css` | 样式表挂载 |

### 实现顺序

1. 仓库标识与模板清理：包名、版本 1.0.0、图标、locale、README、AGENTS、宪章、docs、清空历史 spec 与 changelog、CI 发布解禁。
2. 依赖升级到 0.2.2-rc.5，更新 `pnpm-workspace.yaml`。
3. 构建骨架：多入口 `tsdown.config.ts`、`package.json` exports/files、`cordis.patch.yml`。
4. 根行状态路由与 `rows.ts` 常量。
5. 清理会话行（宿主）与前端面板。
6. 重启按钮行（含 `assets/launcher.cjs`）与前端对话框。
7. 手机样式行（含 `assets/mobile.css`）与前端挂载。
8. 清理推理块行。
9. Claude 技能行。
10. 前端状态轮询与装卸。
11. 测试补齐、文档定稿、实机验证。

## Risks

- `loader` 的行条目与 fiber 状态属于 loader 内部 API，宿主升级后可能需要调整；测试用固定形状的假 loader 覆盖判定逻辑。
- `assets/` 进包依赖 `files` 字段；漏写时重启与手机样式在安装后失效，由包内容测试兜底。
- 清理会话直接删除会话目录，测试必须在临时目录进行，禁止触碰真实宿主数据。
- 桌面重启依赖 Windows 的 `explorer.exe` 与脚本宿主；非 Windows 平台只验证网页场景。
- 前端状态轮询失败时保留当前界面，避免宿主瞬时不可用导致功能消失。

## 交付要求

1. 交付前调用 subagent 审查全部代码与文档，确认提交到远程的内容不含本机信息：本机绝对路径、用户名、主机名、profile 名、私钥与令牌、个人邮箱、内网地址、只在本机可访问的 URL。
2. 全部阶段提交在 push 前压缩为一个 commit，提交历史同样不含本机信息；PR 只含这一个提交。
3. 审查发现本机信息时，先修正再重新审查，审查结论写入 PR 描述。


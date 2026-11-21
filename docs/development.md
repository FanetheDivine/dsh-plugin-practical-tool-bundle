# 开发

## 本地加载

1. 运行 `pnpm dev`，tsdown 监听 `src/` 并重建 `dist/*.mjs` 与 `dist/client.js`。
2. 在 profile 的 `cordis.patch.yml` 中加入要启用的行：

```yaml
- insert:
    - id: dsh-plugin-practical-tool-bundle-dev
      name: file:///<repo>/dist/index.mjs
    - id: session-sweeper-dev
      name: file:///<repo>/dist/sweeper.mjs
    - id: official-features-dev
      name: file:///<repo>/dist/official-features.mjs
```

- 根行负责前端与状态路由；只加载功能行时没有界面。
- 状态路由按行 id 判断，开发时行 id 需要与 `src/rows.ts` 的 `ROW_IDS` 一致；运行时条目的组路径前缀会被忽略。
- 浏览器验证用 `playwright` 驱动本机 Chrome，脚本见 `.dsh/skills/real-device-test/scripts/`。

## 热更新

在同一文件启用 `hmr` 并监听 `dist`：

```yaml
- id: hmr
  disabled: false
  config:
    root: ["<repo>/dist"]
    ignored: ["**/node_modules"]
```

- 修改补丁后无需重启 DSH，运行中的 profile 会重新应用补丁。
- 插件行指向新路径时同时修改 `id`，确保宿主加载新路径的模块。
- 仓库路径含 `.dsh` 等点目录时，去掉默认的 `**/.*` 忽略规则。

## 构建

`tsdown.config.ts` 有两组构建：

| 构建组 | 入口 | 产物 |
| --- | --- | --- |
| 宿主 | `src/index.ts`、`src/sweeper/index.ts`、`src/reasoning-reset/index.ts`、`src/claude-skills/index.ts`、`src/restart/index.ts`、`src/mobile/index.ts`、`src/official-features/index.ts` | `dist/<name>.mjs` |
| 浏览器 | `src/client/index.ts` | `dist/client.js` |

- 宿主构建用对象形式的 `entry`，产物名与 `package.json` 的 `exports` 子路径一一对应。
- `neverBundle: true` 让宿主依赖保持 external；`alwaysBundle: ['yaml']` 只把 yaml 打进产物。
- 浏览器组用 banner/footer/intro 包成 `window.__ModuleLoader__.load({ id, factory })` 闭包工厂。
- 类型声明由 `tsc -p tsconfig.build.json` 生成到 `dist/`。

## 前端 UI 链接

前端 UI 里 `a` 标签的 `href` MUST 使用完整 URL，例如 `https://github.com/FanetheDivine/dsh-plugin-practical-tool-bundle`。Desktop 用应用内地址加载页面，相对路径会指向应用地址。

## 环境要求

- Node.js 24.9 及以上，与 DSH 的运行要求一致；CI 使用 Node 24。
- pnpm 11。

## 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 监听并构建 |
| `pnpm build` | 打包、生成类型声明并运行 `test:dist` |
| `pnpm check` | 依次运行类型检查、lint 和 `test:code` |
| `pnpm typecheck` | 类型检查 |
| `pnpm lint` | biome 检查 |
| `pnpm lint:fix` | biome 检查并自动修复 |
| `pnpm format` | biome 格式化 |
| `pnpm test:code` | 只运行源码测试 |
| `pnpm test:dist` | 只运行产物测试，要求 `dist` 新鲜 |
| `pnpm run release` | 检查并发布新版本 |

代码质量门禁是 `pnpm check`；`test:code` 与 `test:dist` 用于局部验证。

## CI

`.github/workflows/ci.yml` 有两个 job：

| Job | 触发 | 内容 |
| --- | --- | --- |
| `check` | PR、打 tag | Node 24 上运行 `pnpm run full-check` |
| `publish` | 打 tag | 用 OIDC 发布 npm |

- `full-check` 依次运行 `check` 与 `build`：`check` 不读取 `dist`，产物测试在 `build` 末尾执行。
- `publish` 使用 npm Trusted Publishing（OIDC），首次发布前需要把仓库与工作流绑定到 npm 包。

## 测试

| 文件 | 覆盖内容 |
| --- | --- |
| `tests/row-status.test.ts` | 行状态判定：启用、禁用、fiber 未 ACTIVE、loader 缺失 |
| `tests/status-route.test.ts` | 状态路由的注册与响应形状 |
| `tests/sweeper.test.ts` | 归档与删除、非法 id、`keepIds`、延后、失败计数 |
| `tests/restart.test.ts` | 重启计划、端口推导、重复请求、响应形状 |
| `tests/reasoning-reset.test.ts` | 失败分类、去推理块、投影、每步一次 |
| `tests/claude-skills.test.ts` | 项目根查找、frontmatter、技能过滤、provider 注册 |
| `tests/mobile.test.ts` | 宽度替换、响应头、读取失败 |
| `tests/client-sweeper.test.ts` | 扫帚槽位、悬停样式、面板文案 |
| `tests/client-restart.test.ts` | 按钮槽位、确认流程、rail 样式 |
| `tests/client-mobile.test.ts` | 本地 link 与远程 fetch 注入 |
| `tests/client-status.test.ts` | 状态轮询与界面装卸 |
| `tests/client-bundle.test.ts` | `dist/client.js` 的注册契约（产物测试） |
| `tests/package-pack.test.ts` | 包内容：入口、assets、图标与 locale（产物测试） |
| `tests/pack-report.test.ts` | `npm pack --json` 的两种报告形状 |
| `tests/metadata.test.ts` | 元数据的结构、键集与清单声明 |
| `tests/dependency-versions.test.ts` | `dsh-*` 依赖版本一致并列入 `minimumReleaseAgeExclude` |
| `tests/dist-freshness.test.ts` | 产物新鲜度判定 |
| `tests/worktree-extension.test.ts` | worktree 扩展的创建、复用与清理 |
| `tests/sync-main.test.ts` | 主工作区同步与 `--prepare` 整理 |
| `tests/helpers.ts` | 模拟宿主与客户端 `ctx` |

测试要求见[宪章](../.specify/memory/constitution.md)原则 II。文案与元数据的规范见 [i18n.md](./i18n.md)。

vitest 拆成 `code` 与 `dist` 两个 project。产物测试读取 `dist`，由 `build` 末尾的 `test:dist` 执行；`test:code` 不读取 `dist`。

## 实机验证

按 spec 的 `quickstart.md` 验证。`real-device-test` skill 提供在真实宿主上安装、启用与清理 profile 的流程。

## Spec Kit 流程

DSH 从 `.dsh/skills/` 加载 `speckit-*` skill，在对话框输入 `/` 调用。执行条件见 [AGENTS.md](../AGENTS.md#开发流程)。

| 步骤 | 命令 | 产出 |
| --- | --- | --- |
| 1 | `/speckit-specify <需求描述>` | 主工作区 `main` 同步、worktree、规格草稿与待确认决策 |
| 2 | `/speckit-clarify` | 分批访谈记录与完整规格的审查记录 |
| 3 | `/speckit-plan` | `plan.md` 与设计产物、实现细节访谈记录与计划审查记录 |
| 4 | `/speckit-tasks` | `tasks.md` |
| 5 | `/speckit-analyze` | 跨产物一致性报告 |
| 6 | `/speckit-implement` | 按阶段提交的实现 |
| 7 | `/speckit-worktree-finish` | PR、等待 CI 与合并、合并后清理 |

- `base_ref` 默认为 `origin/main`。
- 创建 spec 时先同步远程全部分支，再推送 `<type>/<NNN>-<name>` 占号，最后创建 worktree。
- `worktrees/` 已加入 `.gitignore`，biome 与 vitest 也会跳过它。

## 维护 Spec Kit 核心流程

核心 `.dsh/skills/speckit-*/SKILL.md` 由 Spec Kit integration 生成。修改这些文件时：

1. 保留 front matter。
2. 更新 `.specify/integrations/dsh.manifest.json` 中被修改 skill 的 SHA-256。
3. 修改 `.specify/templates/` 或 `.specify/scripts/` 时，同步更新 `.specify/integrations/speckit.manifest.json` 中对应条目。
4. 上游 Spec Kit 刷新后重新审查并应用本地流程定制。

## 维护 worktree 扩展

扩展源码在 `.specify/extensions/worktree/`，`.dsh/skills/speckit-worktree-*` 由它渲染生成。

修改 `commands/` 或 `extension.yml` 后重新渲染：

1. 把扩展目录复制到仓库外的临时目录，删除其中的 `.specify-dev/`。
2. 运行 `specify extension add --dev <临时目录> --force`。

脚本行为由 `tests/worktree-extension.test.ts` 与 `tests/sync-main.test.ts` 覆盖。

## 文件地图

```text
cordis.patch.yml            # 根行与五个功能行
assets/
├── launcher.cjs            # 重启用的 detached 启动器
└── mobile.css              # 手机样式表
icon.svg                    # 插件图标
locale/                     # 插件元数据资源，规范见 i18n.md
src/
├── index.ts                # 根行：状态路由
├── rows.ts                 # 行 id 与路由常量
├── row-status.ts           # 读 loader 汇总行状态
├── types.ts                # 宿主类型再导出
├── utils.ts                # JSON 响应与对象收窄
├── sweeper/index.ts        # 清理会话路由
├── reasoning-reset/index.ts# 清理推理块
├── claude-skills/
│   ├── index.ts            # 注册技能 provider
│   └── provider.ts         # 技能目录扫描与监听
├── restart/index.ts        # 重启路由
├── mobile/index.ts         # 手机样式表路由
└── client/
    ├── index.ts            # 前端入口
    ├── locales.ts          # 中英文字典
    ├── status.ts           # 状态轮询与界面装卸
    ├── sweeper.tsx         # 扫帚按钮与面板
    ├── restart.tsx         # 重启按钮、对话框与遮罩
    └── mobile.ts           # 手机样式表挂载
dist/                       # 构建产物
scripts/release-archive.mjs # 发布时归档 CHANGELOG
tests/                      # vitest 测试
docs/                       # 开发者文档
specs/<NNN>-<name>/         # 每个需求的 spec、plan、tasks
```

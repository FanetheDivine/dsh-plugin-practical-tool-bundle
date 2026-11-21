# 研究记录：清理会话的保护范围

## R1 保护集合的数据来源

- **Decision**: 前端从 `ctx.sessions.list.getSnapshot()` 读取会话行；保护按 `byId` 全量遍历，归档候选仍取 `ids`。
- **Rationale**: 复现确认根因是服务结构用错。前端把 `ctx.sessions` 当成带 `getSnapshot()` 的存储，实际 `ctx.sessions` 是 `ISessions`，会话列表挂在 `sessions.list` 上。于是 `sessionList()` 恒为 `undefined`，`keepIds` 恒为 `[]`，打开中的会话照常归档并被删。实测请求体为 `{"ids":[...],"keepIds":[]}`。
- **Alternatives considered**:
  - 只把 `ids` 换成 `byId`：服务结构不改，`list` 仍是 `undefined`，缺陷照旧。
  - 从 Workspace 成员读取：成员不含子代理，且包含未打开的会话。

## R2 视图持有来源

- **Decision**: 收集 `mainView`、`sidebarChat`、`sidebarView` 三种来源的持有计数，任一大于 0 即视为打开。忽略 `gateway`、`commandCatalog`、`goalActivation`、`referenceCandidates`、`skillCatalog`、`workspaceOperation`、`controllerOperation` 等临时引用。
- **Rationale**: 前三种对应用户正在查看的内容区域：主对话区、子代理聊天、右侧会话视图。临时引用只代表一次等待中的读取，不代表用户正在看。
- **Alternatives considered**:
  - 只读 `mainView`：漏掉子代理聊天面板。
  - 任意来源大于 0：会把临时的目录读取、命令抓取算作打开，导致清理无故跳过。

## R3 祖先链解析

- **Decision**: 前端按会话行的 `parentId` 逐级上溯，直到没有父级或用例环；父级不在 `byId` 时停止。
- **Rationale**: 宿主 `session.list` 返回 `parentSessionId`，前端已把它映射为 `parentId`；目录投影也带同名映射。祖先链不需要宿主参与。
- **Alternatives considered**:
  - 宿主按会话头解析：宿主会话服务只保证活体会话可读，已归档祖先拿不到头信息。
  - 只保护直接父级：与规格 D-003 的全链要求不符。

## R4 宿主删除阶段与同请求竞态

- **Decision**: 归档前记录 `sessions.get(id)` 非空的会话 id，删除阶段把这些 id 当作延后处理。
- **Rationale**: 归档会通过连接通知前端，前端清空主视图并释放会话引用，宿主随即丢弃该会话。删除阶段再查内存时可能已经查不到，于是把刚归档的打开会话日志删掉。请求开始时的快照可以挡住这一竞态。
- **Alternatives considered**:
  - 只依赖 `keepIds`：保护集合一旦漏掉某个会话就没有第二道防线。
  - 删除前再查一次归档集合：解决不了内存释放的时序。

## R5 面板计数

- **Decision**: `overview()` 的未置顶计数按同一保护集合扣除。
- **Rationale**: 规格 D-009 要求面板数字等于本次实际会清理的数量。
- **Alternatives considered**:
  - 保留原计数：用户看到的数字与结果不一致。

## R6 结果计数

- **Decision**: 受保护会话继续计入宿主返回的 `skipped`，前端沿用「跳过 {n} 个打开中的会话」一行。
- **Rationale**: 宿主在归档与删除两个阶段都把 `keepIds` 计入 `skipped`，无需新增字段；规格 D-006 要求不新增文案。
- **Alternatives considered**:
  - 新增 `kept` 字段与文案：与规格 D-006 冲突。

## R7 服务可用性

- **Decision**: `sessions` 服务不可用时保护集合为空，清理按无打开会话继续。
- **Rationale**: 规格 D-007 的选择；Cordis 的 `ctx.get` 只返回活跃提供者，缺席时读不到快照。
- **Alternatives considered**:
  - 拒绝清理：用户已明确选择继续。

## R8 宿主路由契约

- **Decision**: 保持 `POST /sweep` 的请求体 `{ ids, keepIds }` 与响应字段不变。
- **Rationale**: 祖先链在前端展开后放进 `keepIds`，宿主无需理解父子关系；现有测试与文档无需改协议。
- **Alternatives considered**:
  - 新增 `keepAncestorsOf` 字段：宿主无法解析已归档祖先的头信息，收益有限。

## R9 实机复现记录

- 一次性 profile 中打开会话后清理，修复前请求体为 `{"ids":[两条],"keepIds":[]}`，两条均被归档。
- 修复后请求体为 `{"ids":["<打开的 blank 会话以外的一条>"],"keepIds":["<打开中的会话>"]}`，打开中的会话未进入归档。
- 该 profile 的会话持久化根目录与 `dshHomePath('sessions')` 不同，删除阶段在本 profile 里只会得到 `deferred`；日志删除由 `tests/sweeper.test.ts` 的临时目录用例覆盖。

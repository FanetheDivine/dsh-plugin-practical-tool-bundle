# Research: 官方功能关闭跨重启生效

## R-001 启动完成信号用哪个

**Decision**: 用宿主提供的 `appReady` 服务，`onReady(listener)` 在启动成功提交后调用。

**Rationale**:

- 实测 `runtime.ctx.get('appReady')` 存在，`onReady` 在整棵树挂载完成后触发，此时受管行都已装载。
- 桌面与 Web 宿主都经 `runProfile` 启动，`provideCmdline` 会注入该服务。
- 它不是 cordis 事件，注册方式与释放方式都简单，且不依赖额外轮询。

**Alternatives considered**:

- 继续加长启动重试窗口：仍可能被更慢的宿主打破，且没有明确的完成信号。
- 监听 `loader/entry-init` 逐条补施加：事件更细，但需要去抖与收敛判断，复杂度高于收益。
- 轮询 `loader.entries()` 到稳定：占用定时器，且「稳定」判断易误判。

## R-002 appReady 缺失时的行为

**Decision**: 只做启动那一次施加，不报错、不阻塞。

**Rationale**: `appReady` 是可选服务（`provideCmdline` 在 launcher 未提供时省略）。缺失时降级到既有行为，保持插件在嵌入宿主里可用。

**Alternatives considered**: 把 `appReady` 写进 `ctx.inject`。cordis 的 inject 只接受必填服务，宿主不提供时该行永不启动。

## R-003 两次施加的重试规模

**Decision**: 保持每次 8 轮 × 250 毫秒，两次独立计算。

**Rationale**: 用户明确要求「两次均重试 8 次」。首次覆盖行已装载的常态，第二次由启动完成信号兜底晚装载；单次窗口维持现状，避免无上限重试。

**Alternatives considered**: 第二次改成无上限重试；改动大且没有完成信号时无法收敛。

## R-004 失败日志

**Decision**: 服务依赖注入可选 `warn` 回调，`reapply` 用尽轮数仍未达成时写一条，包含未达成功能的 id。

**Rationale**: 本次缺陷的诊断成本来自静默放弃。日志只写一次，不逐轮刷屏。

**Alternatives considered**: 在行接线处包装 reapply 判断结果；需要 reapply 返回结果，改动面更大。

## R-005 测试策略

**Decision**: 单元测试用模拟 ctx 验证 `onReady` 注册与调用次数、缺失时的降级、用尽轮数的 warn；真实宿主用记录注入加多次启动验证。

**Rationale**: 启动期竞态无法在单元测试里复现真实时序，必须用真实宿主回归；单元测试固定接线行为。

**Alternatives considered**: 只写真实宿主机测试；CI 没有宿主，回归会缺失。

## R-006 关闭记录是否需要迁移

**Decision**: 不需要。记录格式版本仍为 1，字段不变。

**Rationale**: 缺陷在施加时机，不在数据。

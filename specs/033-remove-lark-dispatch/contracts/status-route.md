# 契约：聚合状态路由

`GET /api/dsh-practical-tools/status`

## 删除前

```json
{
  "ok": true,
  "rows": {
    "sweeper": true,
    "reasoningReset": true,
    "claudeSkills": true,
    "restart": true,
    "mobile": true,
    "officialFeatures": true,
    "larkSuperAgent": true
  }
}
```

## 删除后

```json
{
  "ok": true,
  "rows": {
    "sweeper": true,
    "reasoningReset": true,
    "claudeSkills": true,
    "restart": true,
    "mobile": true,
    "officialFeatures": true
  }
}
```

## 规则

- `rows` 的键集与六个功能行一一对应，值表示该行是否可用。
- loader 不可用时六个值都为 `null`。
- 响应头保持 `cache-control: no-store`。
- 前端读取键集，删除 `larkSuperAgent` 不改变界面装卸逻辑。

## 已删除的路由

`GET /api/dsh-practical-tools/lark-super-agent/status` 不再注册，请求返回 404。
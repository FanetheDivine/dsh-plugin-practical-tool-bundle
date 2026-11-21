# 技术调研

## R-001 子路径行的 meta 与图标

- Decision：每个子路径行导出 `./<子路径>/locale/*.json` 与 `./<子路径>/icon`。
- Rationale：宿主 `host-plugin.md` 规定子路径插件不读 `package.json`，改读这两个导出；本地插件 `@local/local-plugins` 已按此方式在 Plugins 页显示行标题与图标。
- Alternatives：只写包级 meta。Plugins 页的行仍显示模块名，不满足 FR-002。

## R-002 行配置页的已有内容

- Decision：官方功能开关面板去掉自己的标题。
- Rationale：宿主 `RowDetail` 已在配置页顶部显示行标题 `h3`、行 id、模块名与行描述；面板再写一次标题是重复。行有 `meta.description` 时，宿主不再渲染 `view: 'summary'`。
- Alternatives：保留面板标题。页面出现两次「官方功能开关」。

## R-003 错误码

- Decision：重启路由与官方功能路由的 `error` 字段改为稳定错误码，原始说明移到 `message`。
- Rationale：前端需要按值选择本地化文案；官方功能路由已用错误码，重启路由仍返回英文句子。
- Alternatives：前端按英文句子匹配。句子一改就失配。

## R-004 开发者内容的去向

- Decision：README 删掉的内容不新增文档。
- Rationale：路由表、存储域、抽屉宽度、日志目录已在 `docs/how-it-works.md` 与 `docs/known-risks.md`；本地加载已在 `docs/development.md`。删除后每条信息仍有唯一归属。
- Alternatives：无。

## R-005 npm 徽章

- Decision：使用 shields.io 的 version、downloads、license 三枚徽章，链接到 npmjs 与 GitHub。
- Rationale：包已发布到 npm，`latest` 为 1.0.0；均为公网 URL，符合宪章原则 V。
- 待实机核对：宿主详情页是否加载远程图片。不加载时徽章显示为替代文字，README 其余内容不受影响。
- Alternatives：只放 version。信息较少。

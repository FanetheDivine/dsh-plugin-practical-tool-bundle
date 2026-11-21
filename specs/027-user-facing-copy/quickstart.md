# 验证指南

## 自动检查

```sh
pnpm format && pnpm check
pnpm build
```

| 测试 | 断言 |
| --- | --- |
| `tests/metadata.test.ts` | 包级与六个行级 meta 的结构、键集、禁用字符；每行的导出与图标文件存在 |
| `tests/package-pack.test.ts` | 包内含 `rows/<子路径>/locale/*.json` 与 `rows/<子路径>/icon.svg` |
| `tests/client-official-features.test.ts` | 加载中、读取失败加重试、每行说明、按错误码显示文案 |
| `tests/client-restart.test.ts` | 失败弹窗按错误码显示文案，未知值显示通用文案 |
| `tests/restart.test.ts` | 重启路由返回错误码 |
| `tests/client-bundle.test.ts` | 中英文键集一致 |

## 实机核对

使用 skill `real-device-test` 装载本分支产物，然后：

1. Plugins 页：本插件标题为「DSH实用工具组合包」；六行各显示图标、标题与描述。切到英文再看一遍。
2. 停用任一行，标题、描述与图标照常显示。
3. 打开本插件详情页：README 显示徽章与六段简介。记录远程徽章是否加载。
4. 打开「官方功能开关」行的配置页：面板没有重复标题；五行各有说明。
5. 点侧栏扫帚：提示为三句；第一次点「清理」后按钮显示「再点一次确认」。
6. 点重启按钮：确认框文字为两句。
7. 390px 宽度下检查面板与行描述没有横向溢出。

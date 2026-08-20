# Foscen 品牌资产

主标志由“聚焦框 + 场景方块 + F”组成，表达 Focus + Scene。应用图标使用深森林绿底与高对比薄荷绿，不依赖文字，在 16px 到 1024px 均可辨认。

- `foscen-icon.svg`：应用与小尺寸场景使用。
- `foscen-wordmark.svg`：文档与网站横向使用。
- `foscen.icns`：由 `./scripts/generate-icon.sh` 从 SVG 生成，不手工编辑。

颜色：

- 深色场：`#0B2018` / `#123426` / `#1D4D39`
- 聚焦绿：`#72DBA5`
- 场景高光：`#E8FFF2` / `#A6E8C4`

不要拉伸、旋转、改变内部比例或在复杂背景上移除必要留白。

## 接入合同

- 可信控制面、内置落地页和关于页使用 SVG 资产，不用文字 `F` 代替正式标志。
- 打包应用统一使用产品名 `Foscen`、bundle id `com.conteman.foscen` 和 `foscen.icns`。
- 品牌资源只从随包本地路径加载，不引入远程图片或放宽 CSP。
- `pnpm start` 启动的是 Electron 开发宿主，不作为 macOS 系统身份验收依据。
- Finder、Dock、菜单栏、窗口切换器与活动监视器必须使用打包后的 `Foscen.app` 验收。

# Foscen 品牌资产

主标志由“聚焦框 + 场景方块 + F”组成，表达 Focus + Scene。应用图标使用中性炭黑底与高对比浅灰场景方块，不依赖文字，在 16px 到 1024px 均可辨认。

- `foscen-icon.svg`：应用与小尺寸场景使用。
- `foscen-wordmark.svg`：文档与网站横向使用。
- `foscen.icns`：由 `./scripts/generate-icon.sh` 从 SVG 生成，不手工编辑。

颜色（2026-08-25 起为中性板，品牌绿已废止）：

- 深色场：`#0A0A0B` / `#16161A` / `#24242A`
- 标记（四角）：`#F5F5F7`
- 场景方块：`#FFFFFF` → `#D1D1D6` → `#A1A1A6`，其上的 F 为 `#16161A`

图底关系不可反转：**场景方块必须比场亮，F 必须比方块暗**。反过来会让方块在 16px 上并入底色，只剩四角。

不要拉伸、旋转、改变内部比例或在复杂背景上移除必要留白。

## 接入合同

- 可信控制面、内置落地页和关于页使用 SVG 资产，不用文字 `F` 代替正式标志。
- 打包应用统一使用产品名 `Foscen`、bundle id `com.conteman.foscen` 和 `foscen.icns`。
- 品牌资源只从随包本地路径加载，不引入远程图片或放宽 CSP。
- `pnpm start` 启动的是 Electron 开发宿主，不作为 macOS 系统身份验收依据。
- Finder、Dock、菜单栏、窗口切换器与活动监视器必须使用打包后的 `Foscen.app` 验收。

# Foscen 品牌资产

主标是**光圈**：一个倒圆角的六边形，正中一个向上的三角光孔。六边形不是圆角矩形——轮廓本身就是识别点；三角光孔取自 `Foscen` 名字里的 focus。

2026-08-27 定稿，废止此前的「聚焦框 + 场景方块 + F」与「方中方」两版。

| 文件                                             | 用途                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `foscen-icon.svg`                                | 应用图标源：品牌红底 + 浅色标。只用于生成 `foscen.icns`               |
| `foscen-mark.svg`                                | 应用内：脱板、满幅、**纯中性**，无底板无颜色                          |
| `foscen-wordmark.svg`                            | 浅底文档与网站横向使用                                                |
| `foscen.icns`                                    | 由 `./scripts/generate-icon.sh` 从 `foscen-icon.svg` 生成，不手工编辑 |
| `tahoe/background.svg`<br>`tahoe/foreground.svg` | macOS 26 Icon Composer 的分层源，见下                                 |

## 颜色

- 品牌红 `#D05954`
- 标 `#F5F5F7`
- 深色场 `#16161A`，字标文字 `#1C1C1E`

**品牌红只属于品牌资产。** 应用图标、wordmark、关于页可以用；覆盖层、工作面、地址条、命令面板一律不得出现——那里保持中性墨阶，层级只靠明度。这条分界是刻意的：Dock 图标的任务是被认出来，界面的任务是退让。

## 几何

三个比例决定这个标，改其中任何一个等于改标，不要单独调：

| 项             | 值                    |
| -------------- | --------------------- |
| 六边形顶点圆角 | 外接半径 × 0.21       |
| 三角外接半径   | 六边形外接半径 × 0.46 |
| 三角顶点圆角   | 三角外接半径 × 0.29   |

三角向下偏移三角半径 × 0.10 做光学居中——几何居中会显得偏高。

## 硬约束

- **界面里不要缩放 `foscen-icon.svg`。** 16px 时圆角底板吃掉外圈约 5px，标只剩 6–7px 必然发糊。应用内一律用脱板的 `foscen-mark.svg`。
- 应用内不使用品牌红，用 `foscen-mark.svg` 的纯中性版。
- 不要拉伸、旋转、改变三角与六边形的比例，或在复杂背景上移除必要留白。

## macOS 26 Tahoe

Tahoe 由系统施加 squircle 遮罩、阴影与 Liquid Glass，设计者提供的是**满幅方形图层**，不能自绘圆角底板。`tahoe/background.svg`（纯品牌红满幅）与 `tahoe/foreground.svg`（浅色标）就是这两层，用 Apple 的 Icon Composer 合成 `.icon` 包。

Icon Composer 是 GUI 工具，这一步无法脚本化。**尚未在 Tahoe 实机验证**，详见 [brand-research.md](../../docs/design/brand-research.md)。当前 `foscen-icon.svg` 自绘圆角底板，是给旧版 macOS 的 `.icns` 用的。

## 接入合同

- 可信控制面、内置落地页和关于页使用 SVG 资产，不用文字 `F` 代替正式标志。
- 打包应用统一使用产品名 `Foscen`、bundle id `com.conteman.foscen` 和 `foscen.icns`。
- 品牌资源只从随包本地路径加载，不引入远程图片或放宽 CSP（`img-src 'self'`）。
- `pnpm start` 启动的是 Electron 开发宿主，不作为 macOS 系统身份验收依据。
- Finder、Dock、菜单栏、窗口切换器与活动监视器必须使用打包后的 `Foscen.app` 验收。

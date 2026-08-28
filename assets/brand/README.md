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

## 画布比例（实测对齐）

`foscen-icon.svg` 的圆角本体是 **824/1024 = 80.5%**，居中，圆角 185。

这个数字是量出来的，不是估的：把本机 Notes / Terminal / Maps / Reminders 的 `.icns` 渲成 1024 后测不透明包围盒，系统应用是 854px（83.4%，含阴影扩散），第三方的 Pen.app 是 832px（81.2%）。我们生成的 `.icns` 实测 826px（80.7%），落在同一区间。

早先是 912/1024 = 89%，比 Dock 里的邻居明显大一圈。**改这个比例前先重新量一遍，不要凭感觉调。**

## 透明底（不要用 qlmanage）

`.icns` 必须四角透明。`qlmanage -t` 会给 SVG 铺一层不透明白底，用它生成的图标在 Dock 里是「白方块上贴个图标」——这个缺陷存在过，已修。

本机没有 rsvg-convert / cairosvg / Inkscape，`generate-icon.sh` 改用随包 Electron 光栅化（`scripts/render-svg.mjs`），这是唯一能保留 alpha 的可用渲染器。改动图标后用下面这条自查：

```
sips -s format png -Z 1024 assets/brand/foscen.icns --out /tmp/i.png
python3 -c "from PIL import Image; im=Image.open('/tmp/i.png').convert('RGBA'); print(im.getpixel((2,2)))"
```

四角必须是 `(0, 0, 0, 0)`。

## macOS 26 Tahoe

Tahoe 由系统施加 squircle 遮罩、阴影与 Liquid Glass，设计者提供的是**满幅方形图层**，不能自绘圆角底板。`tahoe/background.svg`（纯品牌红满幅）与 `tahoe/foreground.svg`（浅色标）就是这两层。

合成 `.icon` 需要 `actool`，它随完整 Xcode 提供；本机只有 Command Line Tools，所以这一步现在做不了。**也尚未在 Tahoe 实机验证**，详见 [brand-research.md](../../docs/design/brand-research.md)。当前随包的仍是 `.icns`，走上面的 Electron 光栅化路径。

## 接入合同

- 可信控制面、内置落地页和关于页使用 SVG 资产，不用文字 `F` 代替正式标志。
- 打包应用统一使用产品名 `Foscen`、bundle id `com.conteman.foscen` 和 `foscen.icns`。
- 品牌资源只从随包本地路径加载，不引入远程图片或放宽 CSP（`img-src 'self'`）。
- `pnpm start` 启动的是 Electron 开发宿主，不作为 macOS 系统身份验收依据。
- Finder、Dock、菜单栏、窗口切换器与活动监视器必须使用打包后的 `Foscen.app` 验收。

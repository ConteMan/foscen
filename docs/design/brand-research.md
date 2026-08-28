# 品牌标怎么做：外部做法调研与结论

2026-08-25。起因是「方中方」这一版被判定为「感觉是没有设计」。这份文档回答两件事：为什么它读起来像没设计，以及热门项目实际是怎么做的。

## 一、诊断：问题不在画得好不好，在没有隐喻

GNOME 人机界面指南对应用图标的第一条要求是隐喻，不是形状：

> Each app icon should have a simple, recognizable metaphor that ideally has a clear and obvious relationship with the app name.

第二条直接点名了我们踩的坑：

> Your icon should have a distinctive shape/silhouette to improve its recognition… the icon should not always be a rounded rectangle. If your icon's metaphor lends itself well to a unique shape, use that shape for the overall icon shape instead of placing that shape onto a generic rectangle, square, or circle.

我们做的正是「把一个几何形放到一个圆角矩形上」。方中方 = 圆角矩形 + 圆角矩形，没有一处只属于 Foscen——把名字换成任何别的产品，这个标照样成立。这就是「没设计」的准确含义：**它通过了可辨认性测试，但没通过归属性测试。**

对照几个有记忆点的：

| 项目    | 隐喻               | 链条                                       |
| ------- | ------------------ | ------------------------------------------ |
| Ghostty | 幽灵               | 名字 → 物 → 形。轮廓不是矩形               |
| Raycast | 一束射线构成的游标 | 名字 → 动作 → 形，表达速度与精确           |
| Zed     | 字母 Z 的几何切分  | 名字首字母，但做成了独特轮廓而非贴在方块上 |

三个都能一句话说清「为什么是这个形」。我们的方中方说不出来——「外方是场景，内洞是焦点」是事后附会的解释，不是设计的出发点。

## 二、可迁移的四条规律

### 1. 隐喻先于形状

先回答「Foscen 是什么东西」，再画。抽象几何是最后的退路，不是起点。GNOME 明确列了可接受的隐喻类型：与功能直接相关的实物、领域相关的实物（或它的模拟时代前身）、简化的界面表征。

### 2. 轮廓要能独立成立

判据：把图标涂成纯黑剪影，还认得出吗？圆角矩形加内部细节的剪影就是一个圆角矩形。Ghostty 的幽灵剪影不是。

### 3. 每个尺寸单独画，不是缩放一个文件

elementary OS 的指南说得最直白：

> Design each icon for the size it's meant to be viewed at. In other words, do not design one icon and resize it to fill the remaining sizes.

它要求六档全出：**16 / 24 / 32 / 48 / 64 / 128**。GNOME 的基准是 128 画布、64 典型观看尺寸、32 最小，并要求全程贴 2px 网格、细节量按最小尺寸倒推。

我们现在是一个 1024 SVG 缩放到所有档——「脱板」是朝对的方向走了一步，但仍然是缩放，不是逐档设计。

### 4. 资产按三分法组织，颜色变体收紧，禁止清单写明

几乎所有正经项目都是同一套结构（Open Liberty 写得最清楚）：

- **logomark** 标（纯符号）
- **wordmark** 字标（纯文字）
- **combomark** 组合标

命名 `[描述]_[颜色]_[尺寸]_[背景]`，PNG 与 SVG 双份。

颜色变体要少而明确。Zed 只允许三种：品牌蓝 `#1348DC`、纯白、纯黑，其余一律禁止。禁止清单也明确：不得变形、不得改色、不得暗示背书、周边需书面授权。

我们的 `assets/brand/README.md` 已经有接入合同，这块底子不差，但缺三分法、缺颜色变体、缺留白规则（XMTP 的规则是标外留白 3× 上下左右）。

## 三、尺寸与格式的现实（2026-08）

### macOS：`.icns` 已经不是唯一格式，而且我们的做法是错的

macOS 26 Tahoe 引入 `.icon` 格式（Icon Composer 生成），分层结构：Background / Midground / Foreground，最多 4 组，需覆盖 Default、Dark、Clear Light、Clear Dark、Tinted Light、Tinted Dark 等外观变体。Ghostty 的 macOS 图标就是三层 SVG 的 Icon Composer 产物。

关键在于**谁画圆角**：

> the OS scales the square artwork, masks it to the standard squircle app icon shape, and fills in the corners with the same color if necessary. Liquid Glass effects are applied automatically…

也就是说，Tahoe 上圆角遮罩、阴影、玻璃材质**由系统施加**，设计者提供的是满幅方形图层。Apple 的指南也把「自己往图上画阴影、圆角、高光」列为常见错误。

**我们现在的 `foscen-icon.svg` 在 1024 画布里自绘了一块 912×912、圆角 218 的底板。** 在 Tahoe 上这块底板会被系统的 squircle 二次遮罩，结果是「圆角方套在圆角方里」，四周多一圈空隙——就是社区说的 icon jail / 灰盒子。旧 `.icns` 在 Tahoe 上还会被重复施加光照效果。

⚠️ 这条我无法在本机验证：这台是 Darwin 24.6（macOS 15 Sequoia），不是 Tahoe。**需要在 Tahoe 机器上实机确认后再改。**

同时 Tahoe 与旧系统需要分别出图，社区目前的做法是 bundle 里同时放 `.icns` 和 `.icon`，用 `actool` 编译并同时设置 `CFBundleIconFile` 与 `CFBundleIconName`——方案偏脆，随 Xcode 版本变动。

### 界面内图标

GNOME 与 elementary 都把**符号图标（symbolic）**与应用图标分开：符号图标用于按钮、列表、状态位，单色、描边统一（elementary 用 1px 描边），不用应用图标缩小顶替。

这和我们已经做的「脱板 `foscen-mark.svg`」方向一致，是对的；但脱板标仍应逐档 pixel-fit，而不是同一份缩放。

## 四、Foscen 要改什么

按优先级：

1. **重做隐喻。** 先回答「Foscen 是什么东西」，画之前就要能一句话说清为什么是这个形。抽象几何不再作为起点。
2. **轮廓独立成立。** 新标要通过纯黑剪影测试，且不得是「几何形贴在圆角矩形上」。
3. **应用图标停止自绘底板。** 改为满幅方形图层交给系统遮罩；在 Tahoe 实机确认后决定是否出 `.icon`，并保留 `.icns` 兼容旧系统。
4. **16 / 24 / 32 逐档 pixel-fit**，不再从 1024 缩放。
5. **资产改三分法**：`mark` / `wordmark` / `combomark`，各自给深底与浅底两个颜色变体，补留白规则。

第 1、2 条是设计问题，需要先定方向；第 3、4、5 条是工程问题，方向定了就能落。

## 参考

- [GNOME HIG · App Icons](https://developer.gnome.org/hig/guidelines/app-icons.html)
- [elementary OS HIG · Iconography](https://docs.elementary.io/hig/reference/iconography)
- [Apple HIG · App Icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- [Apple · Icon Composer](https://www.developer.apple.com/icon-composer/)
- [Michael Tsai · Icon Composer Notes](https://mjtsai.com/blog/2025/06/23/icon-composer-notes/)
- [Michael Tsai · Separate Icons for macOS Tahoe vs. Earlier](https://mjtsai.com/blog/2025/08/08/separate-icons-for-macos-tahoe-vs-earlier/)
- [Michael Tsai · How to Export a Mac .icon File With the Proper Margins](https://mjtsai.com/blog/2025/10/02/how-to-export-a-mac-icon-file-with-the-proper-margins/)
- [9to5Mac · macOS Tahoe put your apps in icon jail](https://9to5mac.com/2025/08/08/macos-tahoe-fix-gray-box-icons/)
- [Zed · Brand](https://zed.dev/brand)
- [Open Liberty · logos](https://github.com/OpenLiberty/logos)
- [jasonlong/ghostty-theme-icons](https://github.com/jasonlong/ghostty-theme-icons)

# 品牌应用（不是新 Logo）

结构仍是聚焦框 + 场景方块 + F，不重做 `foscen.icns`。

2026-08-25：覆盖层改为中性。随包 [assets/brand/foscen-icon.svg](../../assets/brand/foscen-icon.svg) **先不覆盖**。覆盖层与关于页用 [brand-neutral.svg](brand-neutral.svg)：场 `#0A0A0B` / `#16161A` / `#24242A`，四角与 F 为 `#F5F5F7`，方块 `#26262A`。

实测栅格在 [explorations/brand-scale/](explorations/brand-scale/)，用 `qlmanage -t -s N` 从 SVG 渲出，再用邻近插值 ×8 看像素，不是目测推断。

## 16px 实测结论

[icon-16-x8.png](explorations/brand-scale/icon-16-x8.png)：16×16 时四角框仍可辨认为「窗口」。中间薄荷方还在。**F 消失**，只剩方块里一块略深的糊斑。阴影完全看不见。圆角底板还在，占掉边缘 1px。

[icon-24-x8.png](explorations/brand-scale/icon-24-x8.png)：24px（工作面 header 规格）四角和方块清楚，F 能看出是字母但锯齿重。

[icon-32-x8.png](explorations/brand-scale/icon-32-x8.png)：32px 起 F 可读。64px 起与设计稿一致。

所以：**16px 不能直接缩放正式图标还指望认出 F。**

## 中性版 16 / 24 / 32 实测（2026-08-25）

同一结构、无彩色。栅格：[neutral-icon-16-x8.png](explorations/brand-scale/neutral-icon-16-x8.png)、[24](explorations/brand-scale/neutral-icon-24-x8.png)、[32](explorations/brand-scale/neutral-icon-32-x8.png)。

- **16px**：四角仍能读成框，但比绿版更灰；中间 F 糊成一块浅斑，比绿版更难认（浅字叠在深灰方上，16px 只剩一坨）。低对比让「四角更容易糊」这条部分成立——角还在，整体更闷。
- **24px**：四角清楚，F 因明度差反而比绿版 24px 更容易看成字母。
- **32px**：结构完整，F 可读。

结论：中性板下 **16px 仍必须用简化变体**（四角 + 实心方、无 F），见 [mark-16-neutral-corners-square.svg](explorations/brand-scale/mark-16-neutral-corners-square.svg)。24px 工作面可用完整中性 SVG。

绿版与中性版关系：绿版仍是已发布 Dock / 落地页身份；中性版只服务覆盖层。用户拍板后再替换随包资产。

## 要不要 16px 专用简化变体

要，但**只给 16px 场景**（若有）。工作面 header 用 24px [brand-neutral.svg](brand-neutral.svg)。

废止的绿版（2026-08-25 前）曾按 16×16 试过三枚简化候选（绿 hex 仅作历史对照）：

| 候选                | 图                                                                                | 结论                                                             |
| ------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 四角 + 实心方，无 F | [mark-16-corners-square.svg](explorations/brand-scale/mark-16-corners-square.svg) | **采用**。16px 上 F 本就不可读，去掉它让方块更稳；四角仍是 Focus |
| 只留 F 方块         | [mark-16-f-only.svg](explorations/brand-scale/mark-16-f-only.svg)                 | 否。失去「框」语义，像通用文件图标                               |
| 只留四角            | [mark-16-corners-only.svg](explorations/brand-scale/mark-16-corners-only.svg)     | 否。空心框在 16px 对比不够                                       |

地址条 **16px 工具图标**（后退/前进/刷新/关闭）不是品牌标，用 `currentColor` 描边，不要塞正式图标。

实现阶段把 16px 变体做成随包 SVG（例如 `foscen-mark-16.svg`），CSP 仍 `img-src 'self'`。今晚不改 `assets/`。

## 覆盖层色（2026-08-25 起）

覆盖层 **不再使用品牌绿**。层级只靠明度：`text` / `muted` / `dim`。无强调色。字母 F 的 CSS 方块仍禁止。

废止的绿版（2026-08-25 前）hex 记在 `tokens.json` 的 `deprecatedColor`。

## 各表面用法

| 表面              | 用法                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 地址条 / 命令面板 | 不放品牌                                                                                                                         |
| 工作面标题        | 24px [brand-neutral.svg](brand-neutral.svg) + 标题 15/600                                                                        |
| 关于              | 24px 标 + Foscen + Focus + Scene + 版本 + MIT                                                                                    |
| 空态              | 可选 48px 四角框，文案 12/400。探索气质图：[empty-state-frame-object.jpg](explorations/empty-state-frame-object.jpg)（非正式稿） |
| 落地页            | 维持现有大号字标，不改                                                                                                           |

关于页锁区气质：[about-lockup-wordmark.jpg](explorations/about-lockup-wordmark.jpg)（生图，字可能不准；实现用 SVG + `textContent`）。

续探（非正式稿，16px 仍以 SVG 变体为准）：

- [mark-16-from-brand-no-f.jpg](explorations/mark-16-from-brand-no-f.jpg) 从正式标简化去 F
- [mark-16-pixel-corners-square.jpg](explorations/mark-16-pixel-corners-square.jpg)
- [mark-16-pixel-f-only.jpg](explorations/mark-16-pixel-f-only.jpg)
- [mark-16-pixel-corners-only.jpg](explorations/mark-16-pixel-corners-only.jpg)
- 乙实色氛围 [mood-style-yi-solid.jpg](explorations/mood-style-yi-solid.jpg)
- 丙纸感氛围 [mood-style-bing-paper.jpg](explorations/mood-style-bing-paper.jpg)
- 空态静物 [empty-state-desk-frame.jpg](explorations/empty-state-desk-frame.jpg)

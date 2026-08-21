# 品牌应用（不是新 Logo）

正式资产：`assets/brand/foscen-icon.svg`（聚焦框 + 场景方块 + F）。颜色合同：`#0B2018` / `#123426` / `#1D4D39` 场，`#72DBA5` 聚焦绿，`#E8FFF2` / `#A6E8C4` 高光。不重做 `foscen.icns`。

实测栅格在 [explorations/brand-scale/](explorations/brand-scale/)，用 `qlmanage -t -s N` 从 SVG 渲出，再用邻近插值 ×8 看像素，不是目测推断。

## 16px 实测结论

[icon-16-x8.png](explorations/brand-scale/icon-16-x8.png)：16×16 时四角框仍可辨认为「窗口」。中间薄荷方还在。**F 消失**，只剩方块里一块略深的糊斑。阴影完全看不见。圆角底板还在，占掉边缘 1px。

[icon-24-x8.png](explorations/brand-scale/icon-24-x8.png)：24px（工作面 header 规格）四角和方块清楚，F 能看出是字母但锯齿重。

[icon-32-x8.png](explorations/brand-scale/icon-32-x8.png)：32px 起 F 可读。64px 起与设计稿一致。

所以：**16px 不能直接缩放正式图标还指望认出 F。**

## 要不要 16px 专用简化变体

要，但**只给 16px 场景**（若有）。工作面 header 用 24px 正式 SVG，不必换变体。

三个候选都按 16×16 重画（去掉阴影、加粗描边）：

| 候选                | 图                                                                                | 结论                                                             |
| ------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 四角 + 实心方，无 F | [mark-16-corners-square.svg](explorations/brand-scale/mark-16-corners-square.svg) | **采用**。16px 上 F 本就不可读，去掉它让方块更稳；四角仍是 Focus |
| 只留 F 方块         | [mark-16-f-only.svg](explorations/brand-scale/mark-16-f-only.svg)                 | 否。失去「框」语义，像通用文件图标                               |
| 只留四角            | [mark-16-corners-only.svg](explorations/brand-scale/mark-16-corners-only.svg)     | 否。空心框在 16px 对比不够                                       |

地址条 **16px 工具图标**（后退/前进/刷新/关闭）不是品牌标，用 `currentColor` 描边，不要塞正式图标。

实现阶段把 16px 变体做成随包 SVG（例如 `foscen-mark-16.svg`），CSP 仍 `img-src 'self'`。今晚不改 `assets/`。

## 聚焦绿在深色 UI 里的边界

允许 `#72DBA5`：

- 高亮建议行背景（14–18% 透明）
- 焦点环 2px
- 选中 tab 底线 2px
- 甲/乙的主按钮填充
- 成功状态文字
- 随包 SVG 内部

禁止：

- 丙的面板底、输入默认描边、主按钮填充、页脚
- 用 `#a5f4c5` 代替品牌绿
- 字母 F 的 CSS 方块
- 16px 导航图标填绿

## 各表面用法

| 表面              | 用法                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 地址条 / 命令面板 | 不放品牌                                                                                                                         |
| 工作面标题        | 24px 正式 `foscen-icon.svg` + 标题 15/600                                                                                        |
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

# 品牌、配色与 Logo 方向

核对对象：`assets/brand/`（`foscen-icon.svg`、`foscen-wordmark.svg`、README）。探索图在 [explorations/](explorations/)，由 Grok 的 `image_gen` / `image_edit` 生成，**不是**可实现像素稿；UI 结构以 HTML 原型和 token 为准。

## 1. 现有资产成立吗？

成立。图标语义清楚：四角聚焦框 + 中间场景方块 + 方块里的 F = Focus + Scene。颜色已经写成合同：

| 角色     | hex                               |
| -------- | --------------------------------- |
| 深色场   | `#0B2018` / `#123426` / `#1D4D39` |
| 聚焦绿   | `#72DBA5`                         |
| 场景高光 | `#E8FFF2` / `#A6E8C4`             |

落地页（`src/scene/styles.css`）用纸色 `#F2F5F1` + 墨绿字，和品牌是同一家族。窗口外框暗色 `#1C211E` 也合适。

**出问题的是控制面，不是品牌。** 控制面把 accent 推到 `#a5f4c5`，再加 18px 圆角、80px 阴影和径向光斑，看起来像另一套霓虹玻璃产品。字母 `F` 方块（`src/renderer/index.html` 18 行）直接违反 ADR-0003 和品牌 README。

## 2. 配色主张

**主方案：留在品牌森林绿，把控制面拉回 `#72DBA5`，不要更亮。**

理由：

- 图标、wordmark、落地页、外框已经统一。换色等于重做系统身份。
- 「低干扰」靠降低饱和填充和缩小面板，不靠改成灰黑再点一个绿点。
- 控制面 92% 不透明深场 `#0B2018` 已经够压住网页；强调只用 1px 线和 14% 高亮底。

具体 hex 见 [tokens.json](tokens.json)。对比：

|      | 现状控制面                       | 主张                         |
| ---- | -------------------------------- | ---------------------------- |
| 强调 | `#a5f4c5`                        | `#72DBA5`                    |
| 面板 | `rgb(10 31 23 / 96%)` + 径向光斑 | `rgb(11 32 24 / 92%)` 无光斑 |
| 正文 | `#eef9f2`                        | `#E8FFF2`（品牌高光）        |
| 圆角 | 18                               | 12（A）/ 14（B）/ 10（C）    |

**备选（不推荐做主方案）：** 炭灰底 `#161A18` + 单一 `#72DBA5` 描边，见 [explorations/color-mood-charcoal-accent.jpg](explorations/color-mood-charcoal-accent.jpg)。只在用户觉得森林绿「太主题化」时启用。图标和 Dock 仍保持现有绿，避免系统身份和控制面割裂。

物理色板氛围：[explorations/color-moodboard-forest.jpg](explorations/color-moodboard-forest.jpg)。

## 3. Logo 方向

应用图标 **不要重做**。`foscen.icns` 由 `./scripts/generate-icon.sh` 从 SVG 生成，打包身份验收走 `Foscen.app`。本任务只决定**控制面里放什么**。

| 方向             | 主张                               | 探索图                                                                        | 结论                                  |
| ---------------- | ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------- |
| L1 现标缩小      | 四角框 + 薄荷方 + F，24px 描边加粗 | [logo-inapp-24px-from-brand.jpg](explorations/logo-inapp-24px-from-brand.jpg) | **采用**：与 Dock 一致                |
| L2 去掉 F        | 只留框和场景方                     | [logo-icon-no-letter.jpg](explorations/logo-icon-no-letter.jpg)               | 否。16px 会变成「空窗口」，F 是辨识锚 |
| L3 极细框        | 四段独立圆角描边                   | [logo-minimal-frame.jpg](explorations/logo-minimal-frame.jpg)                 | 否。太像通用「裁切」图标              |
| L4 暗色 wordmark | 24px 标 + 「Foscen」               | [logo-wordmark-dark-chrome.jpg](explorations/logo-wordmark-dark-chrome.jpg)   | 工作面 header 用；地址条不用          |
| L5 16px 栅格     | 四角点 + 中心块                    | [logo-16px-pixel-study.jpg](explorations/logo-16px-pixel-study.jpg)           | 作绘制参考，不单独做点阵字体          |

控制面规则：

- 地址条 / palette：**不放**品牌。省垂直空间。
- 工作面 header：24px `foscen-icon.svg` + 15/600「Foscen」。
- 落地页可继续用大号字标，不改。
- 禁止再用 CSS 方块 + 字母 F。

## 4. 材质

面板：92% 深场 + `blur(20px) saturate(1.2)` + 内侧 1px `rgb(232 255 242 / 8%)`。不是厚重玻璃砖。边缘研究：[explorations/material-frosted-glass-edge.jpg](explorations/material-frosted-glass-edge.jpg)（氛围，圆角以 token 12px 为准）。

## 5. 给 Pencil 的一句话

画控制面时把品牌当**已经存在的 SVG 标**，不要发明新 Logo；把绿色从霓虹拉回 `#72DBA5`；地址条上不要出现 wordmark。

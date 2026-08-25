# 设计 token

机器源：[tokens.json](tokens.json)。`layout` / `type` / `space` / `radius` / `stroke` / `motion` 锁定，不随配色改。

2026-08-25：覆盖层改为黑白灰中性。品牌绿从 UI 与图标退出，见 `deprecatedColor`。变体表与 [omnibar.md](omnibar.md) §6 同步。

## 中性色板

| token         | 值                       | 用途             |
| ------------- | ------------------------ | ---------------- |
| `neutral-0`   | `#0A0A0B`                | 最深，页面外的底 |
| `neutral-1`   | `#121214`                | 输入框底         |
| `neutral-2`   | `#1C1C1E`                | 面板底（乙）     |
| `neutral-3`   | `#26262A`                | 悬浮/次级面      |
| `text`        | `#F5F5F7`                | 主文字、图标强调 |
| `muted`       | `#A1A1A6`                | 次文字、默认图标 |
| `dim`         | `#6E6E73`                | footer、占位符   |
| `line`        | `rgb(255 255 255 / 8%)`  | 分割             |
| `line-strong` | `rgb(255 255 255 / 14%)` | 较强边           |

品牌标 SVG（`docs/design/brand-neutral.svg`，不覆盖随包资产）：

| token     | 值        |
| --------- | --------- |
| `field-0` | `#0A0A0B` |
| `field-1` | `#16161A` |
| `field-2` | `#24242A` |
| `mark`    | `#F5F5F7` |

焦点环（三变体共用）：`2px solid rgb(255 255 255 / 70%)`，offset `2px`。

错误不设独立色。输入边框升到 `rgb(255 255 255 / 32%)`，错误行用 `lucide: alert-triangle` + `text` 字重。`danger` 已删除。

图标：lucide 描边 1.75。默认 `muted`，激活行/焦点内 `text`，footer `dim`。无强调色。

## 变体

默认推荐 `yi`（乙 · 实色）。甲玻璃、丙硬边纯黑的完整字段在 `tokens.json` 的 `styles.*`。

# 设计 token

机器可读源：[tokens.json](tokens.json)。下表给 Pencil 画稿用。方向 A 为默认；B/C 只列出覆盖项。

## 颜色

| token           | 值                       | 用途                           |
| --------------- | ------------------------ | ------------------------------ |
| `field-0`       | `#0B2018`                | 最深场、实底                   |
| `field-1`       | `#123426`                | 场、主按钮字                   |
| `field-2`       | `#1D4D39`                | 场                             |
| `panel`         | `rgb(11 32 24 / 92%)`    | 覆盖层面板                     |
| `panel-solid`   | `#10261C`                | `prefers-reduced-transparency` |
| `text`          | `#E8FFF2`                | 正文、输入                     |
| `muted`         | `#9BB5A8`                | 辅文、页脚、placeholder        |
| `accent`        | `#72DBA5`                | 品牌聚焦绿、焦点、高亮         |
| `accent-strong` | `#A6E8C4`                | 悬停                           |
| `danger`        | `#FFB5AC`                | 错误字、描边                   |
| `danger-soft`   | `rgb(255 117 104 / 16%)` | 错误底/外光                    |
| `line`          | `rgb(114 219 165 / 18%)` | 分割                           |
| `line-strong`   | `rgb(114 219 165 / 32%)` | 输入默认边                     |
| `option-active` | `rgb(114 219 165 / 14%)` | 高亮行                         |
| `frame`         | `#1C211E`                | 窗口外框（已有）               |

不要用现状 renderer 的 `#a5f4c5` / `#c8ffdc`。

## 字号

| token        | size | weight | lineHeight |
| ------------ | ---- | ------ | ---------- |
| input        | 14   | 500    | 20         |
| optionTitle  | 13   | 600    | 18         |
| optionMeta   | 11   | 400    | 16         |
| footer       | 11   | 400    | 16         |
| surfaceTitle | 15   | 600    | 20         |
| tab          | 12   | 500    | 16         |
| tabActive    | 13   | 600    | 16         |
| button       | 13   | 700    | 16         |

字体栈：`Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`。不用 10px 全大写英文 eyebrow。

## 尺寸（A）

| token            | px  |
| ---------------- | --- |
| omnibarMaxWidth  | 640 |
| omnibarMaxHeight | 360 |
| surfaceMaxWidth  | 720 |
| surfaceMaxHeight | 420 |
| dragStrip        | 10  |
| inputRow         | 44  |
| input            | 36  |
| option           | 40  |
| footer           | 28  |
| iconButton       | 28  |
| icon             | 16  |
| brandMark        | 24  |
| maxVisibleRows   | 6   |

圆角：面板 12，控件 8，高亮行 8。

阴影：`0 16px 40px rgb(0 8 5 / 38%)` + `inset 0 1px 0 rgb(232 255 242 / 8%)`。

Blur：`blur(20px) saturate(1.2)`。

## 动效

| token   | 值                               |
| ------- | -------------------------------- |
| enterMs | 120                              |
| exitMs  | 80                               |
| listMs  | 100                              |
| spinMs  | 700                              |
| ease    | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| enterY  | 4                                |

## B / C 覆盖

**B：** 宽 600 / 680，行高 38，面板圆角 14，mode 标签宽 52，morph 160ms。

**C：** 宽高固定 800×400，行高 36，header 44，tab 36，面板圆角 10，阴影 `0 12px 32px rgb(0 8 5 / 32%)`。

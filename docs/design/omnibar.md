# Foscen ⌘L 覆盖层设计规范

状态：信息架构已采纳（轻量地址条 + 命令面板 + 工作面，同一 control View）。本文是画稿与实现的**唯一数值事实源**。视觉还剩甲 / 乙 / 丙三套风格供用户挑选。

阶段二才改 `src/`。不要把关键数值只写在原型 CSS 里。

相关：评估 [current-assessment.md](current-assessment.md) · token [tokens.json](tokens.json) · 原型 [omnibar-prototype.html](omnibar-prototype.html) · ADR [0004](../adr/0004-on-demand-omnibar.md)。

---

## 1. 已锁定的产品模型

`⌘L` 打开或切换一个 HTTPS 场景。`⌘⇧P` 执行桌面动作。场景 / 下载 / 设置是中等工作面。六个快捷键不再共用 530×近全宽多 tab 板。

| 入口  | 打开               | 查询 / 内容                      |
| ----- | ------------------ | -------------------------------- |
| `⌘L`  | 地址条 omnibar     | 当前 URL、已存场景、规范化 HTTPS |
| `⌘⇧P` | 命令面板 palette   | 固定动作列表                     |
| `⌘S`  | 工作面 / 场景      | 命名、打开、删除                 |
| `⌘J`  | 工作面 / 下载      | 审批、进度                       |
| `⌘,`  | 工作面 / 设置      | 窗口、权限、关于                 |
| `⌘U`  | 工作面 / 设置·更新 | 升级                             |
| `⌘⇧S` | 无面板             | 直接截图                         |
| `Esc` | 关闭               | 焦点回 scene                     |

共用一个 control `WebContentsView`。`overlayMode: hidden | omnibar | palette | surface`。

不做什么：书签、完整历史、搜索引擎、多标签、HTTP/localhost 例外、第四 View、全窗透明垫、字母 `F` 占位、放宽 CSP、本阶段实现 `settings.json`。

---

## 2. 布局（三套风格共用，禁止改这些数字）

单位逻辑像素。View 矩形等于不透明面板，禁止为阴影或居中留可点透明区。

### 地址条 / 命令面板

```text
width  = min(640, windowWidth - 48)
x      = floor((windowWidth - width) / 2)
y      = clamp(round(windowHeight * 0.14), 72, 140)
height = 10 + 44 + rowCount * 40 + 28 + 8
         上限 min(360, windowHeight - y - 16)
rowCount 显示 0–6；超过在列表内滚动
```

窗口宽 < 520：`width = max(1, windowWidth - 48)`，隐藏前进/后退，保留刷新。  
窗口高 < 400：`y = 24`，最多 4 行。

1280×800、4 行建议：`{ x: 320, y: 112, width: 640, height: 250 }`  
250 = 10 drag + 44 输入 + 160 四行 + 28 页脚 + 8 底。

### 工作面

```text
width  = min(720, windowWidth - 48)
height = min(420, windowHeight - y - 16)
x      = floor((windowWidth - width) / 2)
y      = clamp(round(windowHeight * 0.10), 56, 96)
```

1280×800：`{ x: 280, y: 80, width: 720, height: 420 }`。

动态高度：renderer 在行数变化 16ms 内 `reportOverlaySize({ width, height })`，主进程夹紧整数，校验 sender / 主 frame / 精确本地 URL。

---

## 3. 地址条结构、状态、键盘

自上而下：10px drag · 输入行（后退 28 / 前进 28 / 刷新 28 / 输入 36h / 关闭 28）· 建议列表（行高 40）· 页脚 28（`Esc 关闭` · `⌘⇧P 命令` · `仅 HTTPS`）。无「前往」按钮，无品牌字标，无 tab。

建议优先级：① 非法协议错误（独占）② 前往（规范化成功且 ≠ 当前 URL）③ 当前（空查询或输入等于当前 URL）④ 场景（名称/URL 子串，最多 6，排除当前 URL）。

| 状态     | 输入                               | 列表                                        | 焦点             |
| -------- | ---------------------------------- | ------------------------------------------- | ---------------- |
| 空态     | 当前 URL，全选                     | 当前 + 最近场景                             | 输入框           |
| 输入中   | 正在改                             | 即时过滤，高亮第 1 项                       | 输入框           |
| 有建议   | 有匹配或可前往                     | combobox + listbox                          | 输入框           |
| 无结果   | 不能规范化且无场景（如 `foo bar`） | 「没有匹配的场景。补全 HTTPS 地址后回车。」 | 输入框           |
| 非法输入 | 显式 `http:` / 凭据 / 其它协议     | 「仅支持 HTTPS 网页地址」                   | 输入框，危险描边 |
| 加载中   | 只读                               | 「正在打开…」，刷新位 spinner               | 面板内           |
| 错误     | 可编辑，危险描边                   | 「页面加载失败，请检查网络或地址」          | 输入框           |

成功导航：`hideChrome()`，焦点回 scene。空态回车激活高亮：默认「当前」则关闭。非法回车不导航。

键盘：焦点留在输入框（ARIA 1.2 combobox）。`↓↑` 循环高亮并 `preventDefault`。`Enter` 激活。`Tab` 把高亮 URL/名称填进输入，不提交。`Esc` / scene mousedown / 关闭钮 → 关闭。`⌘L` 在其它覆盖层时切到地址条并全选。

combobox：`aria-expanded` `aria-autocomplete="list"` `aria-controls` `aria-activedescendant`。列表 `listbox` / `option`。错误行兼 `status` + `aria-live="polite"`。对话框 `role="dialog"` `aria-modal="true"` `aria-label="打开场景"`。焦点环 2px `#72DBA5` offset 2。

---

## 4. 命令面板（与地址条同壳、同颗粒度）

### 尺寸

与地址条同一套 width / y / 行高公式。无前进后退，输入行变为 `[ 输入 36h ][ 关闭 28 ]`，左右仍 padding 8。  
6 条命令时：`10 + 44 + 6*40 + 28 + 8 = 330`。未过滤时一次显示全部 6 行，不滚动。

### 行

|      |                                              |
| ---- | -------------------------------------------- |
| 行高 | 40                                           |
| 左   | 16px 闪电图标 + 12px 间隙 + 标题 13/600/18   |
| 右   | `kbd` 11/400，padding 1×5，圆角 5，边 `line` |
| 高亮 | `option-active` 底，圆角 8                   |
| 过滤 | 名称或快捷键子串，大小写不敏感               |

固定动作（顺序不可改）：

| 标题     | 快捷键  | 行为                              |
| -------- | ------- | --------------------------------- |
| 打开网页 | `⌘ L`   | 切到地址条                        |
| 保存截图 | `⌘ ⇧ S` | 截图，成功后关闭面板              |
| 保存场景 | `⌘ S`   | 打开工作面 / 场景，焦点到名称输入 |
| 下载     | `⌘ J`   | 打开工作面 / 下载                 |
| 设置     | `⌘ ,`   | 打开工作面 / 设置                 |
| 检查更新 | `⌘ U`   | 打开工作面 / 设置·更新            |

### 状态

| 状态       | 表现                                                               |
| ---------- | ------------------------------------------------------------------ |
| 空查询     | 6 行全在，高亮第 1 项「打开网页」                                  |
| 过滤中     | 即时过滤，高亮第 1 个匹配                                          |
| 无结果     | 「没有匹配的命令。」12/400，颜色 muted，上下 padding 12            |
| 动作进行中 | 仅截图：输入只读 + 第一行改「正在保存截图…」；其它动作切走 overlay |

placeholder：`搜索命令`。页脚：`Esc 关闭` · `⌘L 打开地址条`。

### 键盘

与地址条相同的 combobox 模型。`⌘⇧P` 已打开则全选输入。`Enter` 激活高亮动作。`Tab` 把标题填进输入（不执行）。无 URL 规范化、无非法协议态。

---

## 5. 工作面（同颗粒度）

### 结构

```
[ 10px drag 含在 44px header 顶部 ]
[ header 44：24px 品牌标 + 标题 15/600 + 弹性空白(drag) + 关闭 28 ]
[ tab 36：场景 / 下载 / 设置 ]
[ 内容，padding 16，overflow auto ]
```

无地址栏、无 eyebrow、无「现在要做什么？」。

标题随 tab：`场景` / `下载` / `设置`。`⌘U` 打开时标题仍是「设置」，内容滚到更新块并聚焦「检查升级」。

### Tab

宽随文字，高度 36，字 12/500，选中 13/600 + 底边 2px 强调色（token `accent`，丙同样用聚焦绿——这是允许的强调用法）。左右箭头、Home/End 循环 tab。计数徽章：场景数 / 下载数，min 18×18，字 10；权限待办若 >0 用 accent 底 + `accent-ink` 字。

### 场景

| 元素       | 数值                                           |
| ---------- | ---------------------------------------------- |
| 名称输入   | 36h，14/500，maxlength 120                     |
| 保存按钮   | 36h，13/700，主按钮                            |
| 表单间隙   | 8                                              |
| 列表距表单 | 12                                             |
| 行高       | 48                                             |
| 行圆角     | 10                                             |
| 标题       | 13/600，ellipsis                               |
| URL        | 11/400 muted                                   |
| 打开       | 30h 主按钮                                     |
| 删除       | 30h 危险按钮                                   |
| 空态文案   | 「还没有保存场景。」12/400，居中，padding 24 0 |
| 空态插图   | 可选 48px 四角框标，见品牌节；无插图也可以     |

保存空名：输入危险描边，不提交，文案「请输入场景名称」放在输入下 11/400 danger，不当 header 状态。删除先 `confirm`。

键盘：打开时焦点在名称输入。`Enter` 在输入内 = 保存。列表里 Tab 到打开/删除。

### 下载

行高 48。左：文件名 13/600 + 来源 origin 11 + 状态 11 + 进度 11。右：仅 `awaiting-approval` 显示「允许下载」主按钮 +「拒绝」危险按钮，30h。  
空态：「当前没有下载。」  
无输入框。打开时焦点：若有待审批则第一个「允许下载」，否则 tabpanel。

状态文案：等待审批 / 下载中 / 已暂停 / 已完成 / 已取消 / 已中断 / 已拒绝。

### 设置（入口形态，不实现存储）

内部分区垂直排列，每区一个 11/600 uppercase 0.06em 的分区名 + 内容，区间距 20。

- 窗口：边框/极简、交通灯（macOS）——本阶段只画开关位。
- 权限：复用现有记录列表与撤销，行高 48。
- 更新：标题 14/600 + 说明 12 muted + 版本 11 monospace accent +「检查升级」按钮。
- 关于：24px 标 + 「Foscen」15/600 + `Focus + Scene` 11 muted + 版本 + MIT。不要再放字母 F 方块。

`⌘,` 打开设置顶部。`⌘U` 打开并聚焦更新按钮。

### 工作面键盘

Tab 在 header 关闭、tablist、内容控件间循环。tablist 左右箭头。`Esc` 关闭。地址条的 Tab=补全 **不** 适用于工作面。

---

## 6. 三套视觉风格（唯一留给用户挑的选择）

信息架构、尺寸、状态、键盘全部不变。只变材质。对照原型：同一「空态 + 三条建议」画三次，见 [style-compare.html](style-compare.html)。

共用排版（三套相同）：输入 14/500/20，标题 13/600/18，辅文 11/400/16，页脚 11/400/16，面板圆角除外见下，控件圆角 8，图标按钮 28，图标描边 1.75。

### 甲 · 玻璃

半透明森林场，blur 出网页层次。最接近当前方案，也最吃 GPU、最受底层网页颜色影响。

| token                          | 值                                     |
| ------------------------------ | -------------------------------------- |
| panel                          | `rgb(11 32 24 / 88%)`                  |
| blur                           | `blur(20px) saturate(1.2)`             |
| border                         | `1px solid rgb(232 255 242 / 12%)`     |
| radius.panel                   | 12                                     |
| shadow                         | `0 16px 40px rgb(0 8 5 / 38%)`         |
| inset                          | `inset 0 1px 0 rgb(232 255 242 / 10%)` |
| input-bg                       | `rgb(2 17 10 / 45%)`                   |
| input-border                   | `rgb(114 219 165 / 32%)`               |
| text                           | `#E8FFF2`                              |
| muted                          | `#9BB5A8`                              |
| accent                         | `#72DBA5`                              |
| option-active                  | `rgb(114 219 165 / 16%)`               |
| line                           | `rgb(114 219 165 / 18%)`               |
| primary-fill                   | `#72DBA5`                              |
| primary-ink                    | `#123426`                              |
| `prefers-reduced-transparency` | 降为乙的实色值                         |

### 乙 · 实色（推荐默认）

完全不透明。无 blur。边界靠 1px 描边 + 阴影。浅色网页、深色网页、滚动中的视频上外观稳定。`prefers-reduced-transparency` 无需分支。

| token         | 值                                    |
| ------------- | ------------------------------------- |
| panel         | `#10261C`（alpha 100%）               |
| blur          | `none`                                |
| border        | `1px solid rgb(114 219 165 / 28%)`    |
| radius.panel  | 12                                    |
| shadow        | `0 12px 28px rgb(0 8 5 / 45%)`        |
| inset         | `inset 0 1px 0 rgb(232 255 242 / 6%)` |
| input-bg      | `#0B2018`                             |
| input-border  | `rgb(114 219 165 / 28%)`              |
| text          | `#E8FFF2`                             |
| muted         | `#9BB5A8`                             |
| accent        | `#72DBA5`                             |
| option-active | `rgb(114 219 165 / 14%)`              |
| line          | `rgb(114 219 165 / 16%)`              |
| primary-fill  | `#72DBA5`                             |
| primary-ink   | `#123426`                             |

### 丙 · 纸感 / 低对比

中性暗面板，接近 macOS 深色 vibrancy。聚焦绿**只**用在高亮行和焦点环。面板本身不染绿。品牌绿留给图标 SVG 与上述两处强调。

| token                          | 值                                       |
| ------------------------------ | ---------------------------------------- |
| panel                          | `rgb(36 36 38 / 86%)`                    |
| blur                           | `blur(24px) saturate(1.35)`              |
| border                         | `1px solid rgb(255 255 255 / 12%)`       |
| radius.panel                   | 10                                       |
| shadow                         | `0 10px 24px rgb(0 0 0 / 28%)`           |
| inset                          | `inset 0 0.5px 0 rgb(255 255 255 / 14%)` |
| input-bg                       | `rgb(0 0 0 / 28%)`                       |
| input-border                   | `rgb(255 255 255 / 14%)`                 |
| text                           | `#F5F5F7`                                |
| muted                          | `#A1A1A6`                                |
| accent                         | `#72DBA5`（仅高亮行、焦点环、tab 底线）  |
| option-active                  | `rgb(114 219 165 / 18%)`                 |
| line                           | `rgb(255 255 255 / 8%)`                  |
| primary-fill                   | `#F5F5F7`                                |
| primary-ink                    | `#1C1C1E`                                |
| `prefers-reduced-transparency` | panel `#2C2C2E`，blur none               |

丙禁止：用聚焦绿填主按钮、染面板、做输入默认描边、做页脚强调。图标按钮用 `text` 色，不用 accent。

### 推荐：乙 · 实色

覆盖层压在任意 HTTPS 网页上。玻璃会吸入底层图片/绿色站点，层次不稳定。Foscen 已有不透明窗口外框，实色覆盖层和它一致。无 blur 也无 reduced-transparency 分支。甲留给「要展示材质」的场合；丙最像系统，但中性灰面板会和 Dock 里的森林绿图标略分家。

---

## 7. 动效与拖动

| 名            | 时长  | 缓动                             | 属性                |
| ------------- | ----- | -------------------------------- | ------------------- |
| overlay.enter | 120ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` | opacity 0→1，Y -4→0 |
| overlay.exit  | 80ms  | 同上                             | opacity             |
| list.height   | 100ms | 同上                             | height              |
| option.active | 0     | —                                | 立即                |
| spin          | 700ms | linear                           | rotate              |

`prefers-reduced-motion`：无位移，高度瞬时，spinner 改静态文案。

拖动：window chrome 顶部 10px 不变。覆盖层 drag strip / 工作面 header 空白 `app-region: drag`。输入、按钮、列表、tab、页脚 `no-drag`。

---

## 8. 品牌绿用法边界

正式资产就是 `assets/brand/foscen-icon.svg`，不设计新 Logo。实测见 [brand.md](brand.md)。

| 允许用 `#72DBA5`      | 不允许                                   |
| --------------------- | ---------------------------------------- |
| 高亮建议行背景        | 面板底色（丙尤其禁止）                   |
| 焦点环                | 地址条输入的默认描边（丙）               |
| 选中 tab 底线         | 页脚文字                                 |
| 主按钮填充（仅甲/乙） | 16px 工具图标（后退等用 `currentColor`） |
| 进度/成功状态         | 用字母 `F` 方块代替 SVG                  |
| 随包 SVG 内部         | 径向霓虹光斑、`#a5f4c5`                  |

地址条不放 wordmark。工作面 header：24px `foscen-icon.svg` + 标题。关于：24px 标 + 名称 + 版本。空态：可选 48px 四角框，不要插画故事。

---

## 9. 阶段二切片（实现仍等审阅）

1. `calculateWindowViewLayout(overlayMode, rowCount)` + 单测。
2. `reportOverlaySize` IPC。
3. 地址条 combobox。
4. palette 同壳。
5. surface 尺寸与 tab。
6. 接入选定风格 token（默认乙）。
7. README / architecture / CHANGELOG。

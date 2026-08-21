# 推荐方向 A：可实现设计规范

**已并入 [omnibar.md](omnibar.md)。** 画稿与实现以那份为唯一事实源。本文保留作归档。

## 1. 信息架构

瞬时层与工作面共用一个 control `WebContentsView`。主进程用 `overlayMode: 'hidden' | 'omnibar' | 'palette' | 'surface'` 计算 bounds。

`ChromeState.focusMode` 建议演进：

```text
'omnibar' | 'palette' | 'scenes' | 'downloads' | 'settings'
```

过渡期可将 `'navigate'` 视为 `'omnibar'`，`'command'` 视为 `'palette'`，`'permissions' | 'update'` 视为 `'settings'`。

表面分区：

- palette 动作：打开网页、保存截图、保存场景、下载、设置、检查更新。
- surface tab：场景、下载、设置。设置内部再分窗口 / 权限 / 更新 / 关于（设置页本身不在本规范实现，只规定入口落到 surface）。

## 2. 布局算法

输入：窗口内容区 `W×H`，`overlayMode`，地址条 `rowCount`（0–6）。

```text
gap = 8
minSide = 24

if overlayMode in {omnibar, palette}:
  maxW = 640
  w = min(maxW, max(1, W - 48))
  if W < 520: w = max(1, W - minSide * 2)
  x = floor((W - w) / 2)
  y = clamp(round(H * 0.14), 72, 140)
  if H < 400: y = 24
  maxRows = 4 if H < 400 else 6
  rows = min(rowCount, maxRows)
  contentH = 10 + 44 + rows * 40 + 28 + 8
  h = min(contentH, 360, H - y - 16)
  h = max(1, h)

if overlayMode == surface:
  w = min(720, max(1, W - 48))
  x = floor((W - w) / 2)
  y = clamp(round(H * 0.10), 56, 96)
  h = min(420, H - y - 16)
  h = max(1, h)
```

Renderer 在 `rowCount` 变化后 16ms 内 invoke `reportOverlaySize({ width, height })`：

- 仅接受有限整数。
- 主进程按上式夹紧，忽略越界。
- sender 必须是当前 control、主 frame、精确本地 file URL。

禁止：View 高度预留 360 而面板只有 90。禁止为阴影扩大 View。

1280×800 验收数字：

| mode    | x   | y   | w   | h（4 行） |
| ------- | --- | --- | --- | --------- |
| omnibar | 320 | 112 | 640 | 250       |
| palette | 320 | 112 | 640 | 250       |
| surface | 280 | 80  | 720 | 420       |

250 的拆解：10 drag + 44 输入 + 160 四行 + 28 页脚 + 8 底 padding。

## 3. 间距与排版网格

基数 8。

| 元素           | 值                                 |
| -------------- | ---------------------------------- |
| 面板圆角       | 12                                 |
| 控件圆角       | 8                                  |
| 建议行圆角     | 8（高亮底），行与行间隙 0          |
| 输入行左右     | 8                                  |
| 输入与按钮间隙 | 6                                  |
| 图标按钮       | 28×28，图标 16×16，描边 1.75       |
| 输入框高度     | 36，字 14/500/20                   |
| 建议行         | 40，标题 13/600/18，辅文 11/400/16 |
| 页脚           | 28，字 11/400/16，项间隙 14        |
| 关闭命中       | 28，即使图标视觉 16                |

工作面：

| 元素         | 值                                  |
| ------------ | ----------------------------------- |
| header       | 44h，标题 15/600/20，icon 24        |
| 内容 padding | 16                                  |
| 场景行       | 48h，不是 52                        |
| 主按钮       | 36h，字 13/700，背景 `--accent`     |
| tab          | 36h，12/500，选中 13/600 + 2px 底线 |

## 4. 颜色（必须用品牌，不用现状 accent）

| token           | hex / rgba                            | 用途                 |
| --------------- | ------------------------------------- | -------------------- |
| `field.0`       | `#0B2018`                             | 最深场               |
| `field.1`       | `#123426`                             | 场                   |
| `field.2`       | `#1D4D39`                             | 场                   |
| `panel`         | `rgb(11 32 24 / 92%)`                 | 面板                 |
| `panel.solid`   | `#10261C`                             | reduced-transparency |
| `text`          | `#E8FFF2`                             | 正文                 |
| `muted`         | `#9BB5A8`                             | 次要                 |
| `accent`        | `#72DBA5`                             | 聚焦绿               |
| `accent.strong` | `#A6E8C4`                             | 悬停高光             |
| `accent.ink`    | `#123426`                             | 主按钮字             |
| `danger`        | `#FFB5AC`                             | 错误                 |
| `danger.soft`   | `rgb(255 117 104 / 16%)`              | 错误底               |
| `line`          | `rgb(114 219 165 / 18%)`              | 线                   |
| `line.strong`   | `rgb(114 219 165 / 32%)`              | 输入边               |
| `frame`         | `#1C211E`                             | 窗口外框（不改）     |
| `option.active` | `rgb(114 219 165 / 14%)`              | 高亮行               |
| `shadow`        | `0 16px 40px rgb(0 8 5 / 38%)`        | 面板                 |
| `inset`         | `inset 0 1px 0 rgb(232 255 242 / 8%)` | 顶高光               |

废弃：`#a5f4c5`、`#c8ffdc`、18px 圆角、`0 28px 80px`、径向光斑。

## 5. 状态机（地址条）

```text
hidden --⌘L--> idle
idle --输入--> filtering
filtering --匹配--> results
filtering --无匹配且非合法URL--> empty
filtering --显式http/凭据/其它协议--> invalid
results|empty|invalid --Enter 合法前往--> loading
loading --loadURL ok--> hidden
loading --loadURL fail--> failed
* --Esc | scene mousedown | 关闭钮--> hidden
hidden --⌘⇧P--> palette
any overlay --⌘L--> idle（切 omnibar，全选）
```

空态定义：`input.trim()` 为空，或 `normalizeSceneUrl(input) === currentUrl`。

idle 回车：激活高亮行。默认高亮「当前」→ 关闭。高亮场景 → `openScene`。

invalid 回车：不导航，保持 invalid。

## 6. 建议排序伪代码

```text
function buildRows(query, currentUrl, scenes):
  parsed = tryNormalize(query)
  if parsed.forbiddenProtocol: return [Error("仅支持 HTTPS 网页地址")]
  rows = []
  idle = query is empty OR parsed.href == currentUrl
  if not idle and parsed.ok and parsed.href != currentUrl:
    rows.push(Go(parsed.href))
  if idle or currentUrl contains query (case-insensitive):
    rows.push(Current(currentUrl))
  for scene in scenes sorted by updatedAt desc:
    if scene.url == currentUrl: continue
    if idle or scene.name/url contains query:
      rows.push(Scene(scene))
    if scene rows == 6: break
  return rows
```

`tryNormalize` 与 `src/main/url-policy.ts` 行为一致：无协议补 `https://`；`http:` / `file:` / `javascript:` / 凭据 → forbiddenProtocol；格式坏 → 不产生 Go，走 empty 或仅场景。

## 7. 键盘与焦点

见 directions A。补充：

- 打开时 `chromeView.webContents.focus()` 后 `requestAnimationFrame` 聚焦输入。
- 关闭时先 `setVisible(false)` 再 `sceneView.webContents.focus()`。
- combobox：`role="combobox"` `aria-expanded="true"` `aria-autocomplete="list"` `aria-controls="omnibar-list"` `aria-activedescendant="opt-N"`。
- 列表 `role="listbox"`，行 `role="option"` `aria-selected`。
- 错误行同时 `role="status"` `aria-live="polite"`。
- 对话框：`role="dialog"` `aria-modal="true"` `aria-label="打开场景"`。
- 工作面保留 tablist 键盘。
- 焦点可见：`outline: 2px solid #72DBA5; outline-offset: 2px`。

## 8. 动效

| 名              | 时长  | 缓动                             | 属性                         |
| --------------- | ----- | -------------------------------- | ---------------------------- |
| `overlay.enter` | 120ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` | opacity 0→1, translateY -4→0 |
| `overlay.exit`  | 80ms  | same                             | opacity 1→0                  |
| `list.height`   | 100ms | same                             | height                       |
| `option.active` | 0     | —                                | 立即                         |
| `spin`          | 700ms | linear                           | rotate                       |

`prefers-reduced-motion: reduce`：enter/exit 无位移，height 瞬时，spinner 换成静态「加载中」。

`prefers-reduced-transparency: reduce`：面板背景 `#10261C`，无 blur。

## 9. 图标

16px SVG，`fill="none"` 描边 `currentColor` 1.75，`stroke-linecap: round`。按钮 `aria-label` 中文，svg `aria-hidden="true"`。

必备：后退、前进、刷新、关闭、地球（前往）、四角框（场景/当前）、闪电（命令）、警告、spinner。

品牌：工作面 header 引用随包 `foscen-icon.svg` 24px。地址条不放 wordmark。CSP `img-src 'self'`。

## 10. 拖动

- 边框模式：window chrome 顶部 10px，不变。
- 覆盖层：`.drag-strip` 10px `app-region: drag`。
- 输入、按钮、列表、tab、页脚：`app-region: no-drag`。
- 极简模式无常驻拖动，只能在覆盖层顶部拖。

## 11. 明确不做

书签、完整历史、搜索引擎、多标签、多 Profile、HTTP/localhost 例外、第四 View、全窗透明垫、把下载/权限做进地址建议、字母 F、放宽 CSP、本阶段实现 `settings.json`。

## 12. 阶段二提交切片（确认 A 之后）

1. `calculateWindowViewLayout(overlayMode, rowCount)` + 单测。
2. `reportOverlaySize` IPC + 校验。
3. 地址条 DOM/CSS/combobox/建议过滤。
4. palette 共用壳。
5. surface 改尺寸；tab 过渡期可暂留权限/升级。
6. README 快捷键表、architecture 布局段、CHANGELOG。

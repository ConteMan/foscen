# ⌘L 控制面现状评估

日期：2026-08-22。评估对象：仓库 `0.2.0`，`main` 上 `pnpm start` 的 Electron 开发宿主。开发宿主 Dock 身份是 Electron，不作为品牌验收。

方法：`corepack enable && pnpm install --frozen-lockfile && pnpm run build && pnpm start`，用辅助功能树和窗口截图记录 `⌘L`、`Esc`、`⌘⇧P`、`⌘S`，以及提交 `http://example.com`。截图在 [current/](current/)。

## 1. 入口全部落到同一块 View

`src/main/index.ts` 654–683 行：`⌘L / ⌘⇧P / ⌘S / ⌘, / ⌘J / ⌘U` 全部调用 `showChrome(mode)`。`showChrome`（365–372 行）只切换 `focusMode`、显示同一个 `chromeView`、把焦点交给它。

Renderer 的 `focusMode`（`src/renderer/index.ts` 319–336 行）：

| 快捷键 | focusMode  | 实际焦点                   |
| ------ | ---------- | -------------------------- |
| `⌘L`   | `navigate` | 地址框全选                 |
| `⌘⇧P`  | `command`  | 第一个命令按钮「打开网页」 |
| `⌘S`   | `scenes`   | 场景名称输入               |
| 其余   | 对应 tab   | 该分区第一个控件           |

截图：

- [current/01-current-cmdl-default.png](current/01-current-cmdl-default.png)：`⌘L`，地址框选中 `https://…`，下面是「现在要做什么？」命令网格。
- [current/05-cmd-shift-p.png](current/05-cmd-shift-p.png)：`⌘⇧P`，同一块板，焦点在「打开网页」。
- [current/06-cmd-s-scenes.png](current/06-cmd-s-scenes.png)：`⌘S`，切到场景 tab，地址栏和品牌区仍在。

产品问题：快捷键只是「打开大控制台并放焦点」，不是不同形态的工具。

## 2. 尺寸：近全宽 × 固定 530

`src/main/window-layout.ts` 7–10、64–69 行：

```text
CONTROL_HEIGHT = 530
CONTROL_SIDE_INSET = 52
CONTROL_TOP_INSET = 44
width = windowWidth - 2 * min(52, max(8, floor(windowWidth * 0.05)))
```

单测锁死了这个合同（`test/window-layout.test.ts` 30–48 行）：

| 窗口     | control bounds                               |
| -------- | -------------------------------------------- |
| 1280×800 | `{ x: 52, y: 44, width: 1176, height: 530 }` |
| 720×540  | `{ x: 36, y: 44, width: 648, height: 488 }`  |

1280×800 下面板约占窗口面积 **61%**。实地开发窗口约 2361×1304，侧边仍只有 52px，面板被拉成超宽条，命令按钮横向填满。

[current/02-scene-only.png](current/02-scene-only.png) 是 `Esc` 之后：边框模式的细外框可见，网页完整。对比 01 可以量出控制面盖住了上三分之二。

## 3. 信息层级：一次塞进五个职责

`src/renderer/index.html` 14–246 行，自上而下：

1. header：字母 `F` 品牌、状态文案、关闭 `×`（15–25）
2. 导航：`←` `→` `↻`、地址、`前往`（27–46）
3. 五个 tab：命令 / 场景 / 下载 / 权限 / 升级（48–93）
4. 每个 tab 的 eyebrow + h1 + muted（例如命令 104–110：「键盘优先 / 现在要做什么？ / 所有桌面能力都由可信控制面发起。」）
5. 命令 3×2 网格（111–126）
6. footer：`Esc` / `⌥←⌥→` / 仅允许 HTTPS（242–246）

`⌘L` 真正需要的只有地址输入。其余都是常驻噪音。

CSS 强化了「仪表盘」感（`src/renderer/styles.css`）：

| token      | 现值                                                | 品牌资产                       |
| ---------- | --------------------------------------------------- | ------------------------------ |
| `--accent` | `#a5f4c5`                                           | 聚焦绿是 `#72DBA5`             |
| 面板圆角   | 18px（`.control-panel` 118 行）                     | 图标内场景方块约更硬           |
| 阴影       | `0 28px 80px`（119–121）                            | 过重                           |
| 背景       | 径向光斑 + `backdrop-filter: blur(26px)`（114–122） | 落地页是克制纸色，不是霓虹玻璃 |

品牌位是文字 `F`（`index.html` 18 行 `.brand-mark`），违反 ADR-0003 与 `assets/brand/README.md`：必须用随包 SVG。

图标全部是文本字符：`←` `→` `↻` `×` `↑`（`index.html` 24、29–31、226 行）。

## 4. 地址框没有建议，非法输入反馈跑偏

Renderer 提交地址（`src/renderer/index.ts` 361–376 行）只调用 `navigate`，没有本地建议列表，没有 `listbox`。

主进程 `normalizeSceneUrl`（`src/main/url-policy.ts` 10–38 行）：

- 无协议主机补 `https://`（20 行）——`example.com` 会成功。
- 显式 `http:`、凭据、其它协议抛 `InvalidSceneUrlError`，默认文案「仅支持 HTTPS 网页地址」。

成功导航会 `hideChrome()`（`src/main/index.ts` 339–340 行）。失败时 renderer 把 `result.error` 写进 header 的 `[data-status]`（88–91、367 行），颜色 `--danger`，字号 12px，右对齐（`styles.css` 182–199）。

实测 [current/04-http-rejected.png](current/04-http-rejected.png)：

- 输入框保持 `http://example.com`，**无**危险描边。
- 右上角才出现珊瑚色「仅支持 HTTPS 网页地址」。
- 命令网格仍占主视觉。
- 面板不关闭，焦点仍在输入框。

这是策略正确、反馈位置错误。

## 5. 键盘与无障碍：有骨架，但模型是「大对话框」

已有、应保留：

- tablist 左右箭头、Home/End（`index.ts` 418–441）
- 关闭按钮 `aria-label="关闭控制面"`
- 地址 `label.visually-hidden`
- `Esc` 关闭（487–491 行 + 主进程 693–696 行）
- `focus-visible` 2px outline（`styles.css` 69–73）

缺失：

- 地址框不是 combobox，没有 `aria-activedescendant`
- 错误 live region 远离输入
- 没有建议行的 `option`
- Tab 在地址条没有「补全当前建议」语义
- 点击未被覆盖的网页不会关闭控制面（scene 收到点击后面板仍在，除非 `Esc`）

## 6. 与 ADR-0003 的差距

ADR-0003 已接受但未落地：

- 一级分类应变为「命令、场景、下载、设置」；现状仍是权限 / 升级两个独立 tab。
- `settings.json`、边框/极简切换、交通灯开关：`presentationMode` 在 `src/main/index.ts` 140 行写死默认值。
- 品牌 SVG 未接入控制面。
- 控制面顶部 `app-region: drag` 已做（`styles.css` 133–144），按钮/输入 `no-drag` 已做（48–50）。这一条合格。

窗口 chrome 本身（`src/window-chrome/`）是无脚本、顶部 10px drag、暗色 `#1C211E`，与「低干扰外框」一致。问题集中在 **control overlay**，不是外框。

## 7. 问题清单（实现前必须处理）

1. 所有入口共用 530×近全宽面板，遮挡 scene。
2. `⌘L` 没有建议列表。
3. 非法 URL 的错误离开输入框。
4. 字母 `F` 与文本图标。
5. 强调色偏离品牌聚焦绿。
6. 18px 圆角 + 80px 阴影 + 径向光斑过重。
7. 每个分区重复 eyebrow/h1/muted。
8. ADR-0003 的设置信息架构未落地（本设计任务可规定目标，不实现设置存储）。
9. 控制 View 高度写死，无法随内容收缩；若只把面板画小而 View 仍 530，会留下透明命中区。

## 8. 对后续方向的约束（从评估推出，不是偏好）

无论选 A/B/C：

- 只能继续用现有 control `WebContentsView`，不新增第四个 View，不用全窗透明层。
- View bounds 必须等于不透明面板。
- 拖动规则保持 ADR-0003。
- 建议数据不得滑向完整历史/书签。
- HTTPS-only 文案必须贴着输入。
- 品牌用随包 SVG。

# 阶段二测试计划

实现仍等审阅。本文规定**每种验证走哪一层**，避免把 combobox 焦点矩阵塞进无 GUI 的单测，或把布局公式只靠肉眼。

现有门禁入口不变：`./scripts/selftest.sh`（锁文件、格式、lint、类型、`tsx --test test/**/*.test.ts`、构建、`scripts/smoke.mjs`）。新测试必须能进这个入口，或明确标为人工。

验收数字（[omnibar.md](omnibar.md) / 画稿）：

| 场景                 | bounds                      |
| -------------------- | --------------------------- |
| 1280×800 地址条 4 行 | 320, 112, **640×250**       |
| 空列表（0 行）       | 640×**130**（10+44+0+28+8） |
| 2 行                 | 640×**210**                 |
| 命令面板 6 行        | 640×**330**                 |
| 工作面               | 280, 80, **720×420**        |

---

## A. 布局与纯函数单测（必须，无 Electron）

放 `test/window-layout.test.ts`（替换当前锁死的 1176×530）以及新建 `test/overlay-size.test.ts`、必要时 `test/omnibar-suggest.test.ts`。

| ID  | 断言                                                                                                                        | 层                         |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| U1  | `overlayMode=omnibar`、1280×800、rowCount=4 → `{x:320,y:112,width:640,height:250}`                                          | 单测                       |
| U2  | rowCount=0 → height=130                                                                                                     | 单测                       |
| U3  | rowCount=2 → height=210                                                                                                     | 单测                       |
| U4  | `overlayMode=palette`、rowCount=6 → height=330                                                                              | 单测                       |
| U5  | `overlayMode=surface`、1280×800 → `{x:280,y:80,width:720,height:420}`                                                       | 单测                       |
| U6  | 窗口宽 500：omnibar width=`500-48=452`（或 `500-48` 按规范 `max(1,W-48)`），隐藏前进/后退是 renderer 职责，布局函数只负责宽 | 单测                       |
| U7  | 窗口高 390：y=24，maxRows 由 renderer 限制为 4；布局 height 不超过 `390-24-16`                                              | 单测                       |
| U8  | frame / minimal 下 scene 与 window chrome 数字**保持**现有用例（10px 内缩、极简铺满）                                       | 单测                       |
| U9  | `reportOverlaySize` 校验：非整数、NaN、负数、超上限被夹紧或拒绝；合法值更新 control bounds                                  | 单测（抽纯函数）           |
| U10 | sender 不是 control 主 frame / URL 不是精确本地文档 → 忽略 resize（可与现有 IPC 校验测试同模式）                            | 单测                       |
| U11 | 建议排序：`http://` → 仅错误；`example.com` → 前往 https；输入等于当前 URL → 无前往、有当前；场景子串匹配；最多 6 条场景    | 单测（纯函数 `buildRows`） |
| U12 | `normalizeSceneUrl` 现有用例继续绿：补 https、拒 http/凭据/javascript                                                       | 已有 `url-policy.test.ts`  |

禁止：在单测里启动 Electron、截图、听 VoiceOver。

---

## B. 渲染 DOM 合同（单测或轻量 jsdom，无窗口）

若阶段二把 combobox 标结构抽成可 import 的 render，用 jsdom/`linkedom` 锁 [a11y.md](a11y.md) 的 C5–C10、L1–L4、T1–T4、M1–M3。

| ID  | 断言                                                                                         | 层   |
| --- | -------------------------------------------------------------------------------------------- | ---- |
| D1  | omnibar 根 `role=dialog` + combobox + listbox，**无** tablist                                | 单测 |
| D2  | palette 无前进/后退按钮                                                                      | 单测 |
| D3  | surface 有 tablist 三项，无 combobox                                                         | 单测 |
| D4  | 非法输入渲染 `role=status` 文案「仅支持 HTTPS 网页地址」，option 数量为 0                    | 单测 |
| D5  | 高亮变化只改 `aria-activedescendant` 与 `aria-selected`，`document.activeElement` 仍是 input | 单测 |

做不到 jsdom 就并入人工清单，不要假装覆盖。

---

## C. Electron smoke（必须进 selftest，但保持瘦）

现状：`scripts/smoke.mjs` 等 `FOSCEN_SMOKE_READY`。控制面重构后**至少**继续：进程能起、preload 握手、退出码 0。

可加、仍属 smoke（失败应直接红）：

| ID  | 断言                                                                                                    | 层                                |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------- |
| S1  | 握手成功（现有）                                                                                        | smoke                             |
| S2  | control View 加载的是精确本地 `file:` 文档（可用现有 window-chrome-contract 同类断言扩到 overlay HTML） | 单测更合适；若放 smoke 只检查路径 |
| S3  | 不要在 smoke 里发真实 `⌘L` 或等动画。快捷键与焦点是人工                                                 | —                                 |

Smoke 超时仍 20s。不要把 VoiceOver、多窗口尺寸拍图放进来。

---

## D. 必须 Electron 窗口、但不能进 CI 门禁的

本地可写 `pnpm start` 脚本或手工。**不**作为 `selftest.sh` 红绿条件，除非以后有稳定的 Playwright+Electron 基建（当前仓库没有）。

| ID  | 断言                                                                | 层                  |
| --- | ------------------------------------------------------------------- | ------------------- |
| E1  | `⌘L` 打开 640 宽条，scene 四周仍可见                                | 人工 / 可选本地 E2E |
| E2  | 输入 `http://example.com` 回车：面板不关，错误在输入旁              | 人工                |
| E3  | 合法 https 回车：面板关，scene 导航                                 | 人工                |
| E4  | `⌘⇧P` 为 330 高命令列表，无地址导航钮                               | 人工                |
| E5  | `⌘S` 720×420 工作面，无地址建议                                     | 人工                |
| E6  | 点击 scene 未覆盖区关闭 overlay                                     | 人工                |
| E7  | 甲玻璃在浅色页上仍可读；乙实色在深/浅页一致；丙绿只用在高亮与焦点环 | 人工（三套风格）    |
| E8  | 宽 500 窗口：无前进/后退，输入仍可用                                | 人工                |
| E9  | 高 390 窗口：条在 y=24，最多 4 行                                   | 人工                |
| E10 | View 外缘点击网页能点到网页控件（无透明死区）                       | 人工，回归 ADR-0003 |

---

## E. 只能人工验收

| ID  | 断言                                                                                | 层   |
| --- | ----------------------------------------------------------------------------------- | ---- |
| H1  | VoiceOver：打开地址条读「打开场景」对话框，再读 combobox；箭头移动时读 option 标题  | 人工 |
| H2  | VoiceOver：错误态读出「仅支持 HTTPS 网页地址」，不读命令网格（因为没有）            | 人工 |
| H3  | VoiceOver：工作面左右箭头切换「场景 / 下载 / 设置」                                 | 人工 |
| H4  | 全键盘走完：⌘L → 输入 → ↓ → Enter；⌘⇧P → Enter 打开网页；Esc 回网页再点网页顶部按钮 | 人工 |
| H5  | 品牌：工作面 24px 为正式 SVG，不是字母 F；地址条无 wordmark                         | 人工 |
| H6  | 拖动：面板顶部可拖窗口；输入/按钮不可拖                                             | 人工 |
| H7  | reduced-motion / reduced-transparency 系统设置下无位移、无 blur                     | 人工 |
| H8  | 画稿对照：打开态与 `design/previews/` 相应画板并排看（**不修改 design/**）          | 人工 |

---

## F. 明确不测

- 搜索引擎建议、浏览历史、书签。
- 设置存储 / 交通灯真实切换（ADR-0003 独立实现）。
- 打包应用 Dock 品牌（`pnpm start` 仍是 Electron 宿主）。
- Pencil `.pen` 文件。

## G. 阶段二落地顺序

1. 先改 `calculateWindowViewLayout` 并把 U1–U8 写红再写绿。
2. 抽 `buildRows` + U11。
3. IPC resize U9–U10。
4. renderer combobox；能锁 DOM 则 D1–D5。
5. `selftest.sh` 全绿。
6. 对照 H1–H8 与画稿做一次人工清单，把日期记在 PR，不写进 docs 当进度。

# ADR-0001：使用 BaseWindow + WebContentsView 隔离应用 UI 与网页

- 状态：已接受
- 日期：2026-08-13

## 背景

Foscen 需要把网页作为几乎无 chrome 的桌面场景，同时按需叠加可信命令 UI。网页内容不受信任，不能与桌面能力共享 renderer 或 preload。

## 决策

采用 Electron `BaseWindow` 组合两个 `WebContentsView`：

- scene View 加载网页，使用独立持久 Session，不配置 preload；
- chrome View 只加载随应用发布的本地资源，使用独立内存 Session 和最小 preload；
- 主进程拥有布局、导航、快捷键、安全策略和资源释放；
- macOS 使用 `titleBarStyle: hiddenInset`，保留原生交通灯，不启用透明窗口。

## 后果

优点：网页和应用能力有清晰的进程/Session/IPC 边界；chrome 可独立显示、隐藏和演进。

代价：需要手动同步 View bounds；透明或隐藏的上层 View 可能拦截输入；`BaseWindow` 关闭时必须显式关闭每个 View 的 `webContents`。

## 复审条件

仅当 Electron 官方 API 生命周期、组合能力或安全模型发生实质变化，或该结构无法满足已验证的交互需求时复审。

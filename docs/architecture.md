# 架构

## 目标

Foscen 用最少的桌面 chrome 将一个网页呈现为独立场景。应用能力必须与网页内容分离，键盘操作由主进程统一编排。

## 运行时组成

```text
BaseWindow
├── scene WebContentsView
│   ├── 不受信任网页
│   ├── persist:foscen-scenes Session
│   └── 无 preload / 无 Node / 无 IPC
└── chrome WebContentsView（按需显示）
    ├── 本地可信 HTML/CSS/JS
    ├── 内存 Session
    └── 最小 preload → 白名单 IPC → 主进程
```

主进程拥有窗口、View、布局、导航、快捷键、权限和生命周期。`sceneView` 先加入，`chromeView` 后加入，从而让按需 UI 位于网页上方。隐藏 chrome 时同时隐藏整个 View，避免透明区域拦截网页输入。

## 数据与控制流

1. 主进程在 `app.ready` 后创建两个隔离 Session 和 View。
2. 本地 chrome 通过 `contextBridge` 只能调用导航、前进、后退、刷新和关闭 chrome。
3. 主进程同时验证 IPC channel、sender、sender frame URL 与参数。
4. scene 导航只接受规范化后的 HTTPS；内置落地页是唯一允许的 `file:` 页面。
5. scene 的网页会话写入 Electron 的持久分区；应用 UI 不复用该分区。

## 源码结构

- `src/main/`：Electron 生命周期、View 组合与安全策略。
- `src/preload/`：可信 UI 的最小能力桥。
- `src/renderer/`：按需浮现的本地应用 UI。
- `src/scene/`：无权限的离线落地页。
- `src/shared/`：IPC 名称与类型合同。
- `test/`：不依赖 GUI 的策略单元测试。

## 生命周期

`BaseWindow` 不会自动销毁附着的 `WebContentsView.webContents`。窗口关闭时必须逐个调用 `webContents.close()`；未来场景切换或 View 移除也必须遵守同一规则。

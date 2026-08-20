# 架构

## 目标

Foscen 用最少的桌面 chrome 将一个网页呈现为独立场景。网页是不受信任的数据与代码；窗口、文件、权限、持久化和升级始终属于主进程的可信域。

## 运行时组成

```text
BaseWindow（单实例）
├── window chrome WebContentsView（边框模式位于最底层）
│   ├── 随应用发布的本地 HTML/CSS
│   └── 无 preload / 无 Node / 无 IPC
├── scene WebContentsView
│   ├── 不受信任 HTTPS 网页
│   ├── persist:foscen-scenes Session
│   └── 无 preload / 无 Node / 无 IPC
└── control WebContentsView（按需显示）
    ├── 随应用发布的本地 HTML/CSS/JS
    ├── 独立内存 Session
    └── 最小 contextBridge → 白名单 IPC → 主进程

主进程
├── SceneStore → userData/scenes.json
├── PermissionController/Store → userData/permissions.json
├── DownloadManager → Downloads/Foscen/.foscen-staging → 排他发布
├── ScreenshotService → Pictures/Foscen
└── UpdateService → 固定 GitHub 公共更新源
```

window chrome、scene、control 按从下到上的顺序加入。默认边框模式下，window chrome 铺满窗口作为克制的可信背景，scene 从四边等距内缩并覆盖其中央区域；只有露出的顶部外框提供 `app-region: drag`，因此拖动入口不覆盖网页输入。macOS 交通灯在窗口首次显示前默认隐藏。极简模式下 scene 铺满窗口且 window chrome 隐藏，不存在常驻拖动命中区。control 展开时位于最上层，其顶部可拖动，按钮和输入使用 `app-region: no-drag`。

隐藏 control 时隐藏整个 View，避免其透明区域拦截网页输入。`BaseWindow` 不会自动销毁附着 View 的 `webContents`，关闭窗口时必须逐个关闭三个 View。

## 启动与恢复

1. 模块加载最早阶段获取 Electron 单实例锁；后续实例只聚焦现有窗口。
2. `app.ready` 后从固定 `userData` 读取经过严格校验的窗口、当前 URL、场景和持久权限。
3. 创建隔离 Session 与三个 View，先安装导航、权限、下载和生命周期处理器，再加载本地窗口外框、控制面及恢复的 HTTPS 页面；设置框架交付后会在首次显示前应用持久化的边框／极简模式。
4. 控制面完成 preload 握手后显示窗口；开发 smoke 以同一握手作为真实 Electron 启动证据。
5. 移动/缩放窗口采用短防抖写入；主 frame 导航提交采用最后写入优先的有界合并，窗口关闭前等待最新 URL 与窗口状态落盘。

## 可信控制流

window chrome 不配置 preload 或 IPC，只在边框模式的顶部外框提供静态拖动命中。control 只能调用 `src/shared/ipc.ts` 中逐项定义的方法。每次 IPC 必须同时满足：

- sender 是当前 control View；
- sender frame 是 control 的主 frame；
- frame URL 是精确的随包本地文档；
- 主进程重新校验所有参数，不信任 preload 的 TypeScript 类型。

控制面接收单向 `ChromeState` 快照，包含导航状态、场景、下载、权限提示/记录和升级状态。动态文本使用 DOM `textContent`，不解释网页提供的 HTML。

## 能力生命周期

- 场景：名称与 URL 经过 schema 校验，原子保存；打开场景仍走统一 HTTPS 导航策略。
- 权限：仅当前主 frame 的精确 HTTPS origin 可进入最多 32 项的提示队列；从请求到达起 30 秒无回应即拒绝，导航、渲染进程退出和窗口关闭会取消待处理请求。
- 下载：`will-download` 同步验证 scene、用户手势、URL 链和大小，暂停至私有 UUID 暂存文件；可信 UI 允许后继续，完成时以硬链接排他发布。
- 截图：可信 IPC 或主进程快捷键触发；同一时间仅一项，限制当前 View 尺寸与 PNG 大小，不把像素回传网页。
- 升级：仅已打包 macOS 启用，feed 固定为 `ConteMan/foscen`；检查与下载可自动进行，重启安装需要可信 UI 动作。

## 源码结构

- `src/main/`：Electron 生命周期、View 组合、能力控制器与安全策略。
- `src/preload/`：可信 UI 的最小能力桥。
- `src/window-chrome/`：无脚本、无 IPC 的可信窗口外框。
- `src/renderer/`：按需浮现的本地控制面。
- `src/scene/`：无权限的离线落地页。
- `src/shared/`：IPC、状态与持久数据合同。
- `test/`：不依赖 GUI 的策略和状态机单元测试。
- `build/`、`forge.config.cjs`：macOS 签名、公证与制品合同。

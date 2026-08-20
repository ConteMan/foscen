# ADR-0003：桌面窗口外壳采用独立可信拖动条与版本化设置

- 状态：已接受
- 日期：2026-08-20
- 关联 Issue：[#8](https://github.com/ConteMan/foscen/issues/8)、[#9](https://github.com/ConteMan/foscen/issues/9)、[#10](https://github.com/ConteMan/foscen/issues/10)、[#11](https://github.com/ConteMan/foscen/issues/11)
- 扩展决策：[ADR-0001](0001-electron-view-boundaries.md)、[ADR-0002](0002-trusted-capabilities.md)

## 背景

Foscen 使用 `BaseWindow + WebContentsView` 隐藏系统标题栏并让网页尽量占据窗口。当前 scene View 覆盖整个内容区，可信控制面完全隐藏时没有可拖动区域；`⌘ ,` 直接打开权限面板，也没有统一设置模型；macOS 交通灯只能保持构造时的默认状态。仓库已有正式品牌资产和打包名称，但应用内仍使用文字占位，开发宿主与打包应用的身份差异也没有形成验收合同。

这些问题都属于桌面窗口外壳。解决方案必须保持网页与桌面能力隔离，不能让不受信任网页获得窗口控制、设置 IPC 或本地文件能力。

## 决策

### 独立可信窗口条

在现有 scene View 与按需控制面 View 之外，新增一个独立的 window chrome `WebContentsView`：

```text
BaseWindow
├── window chrome WebContentsView（常驻，36px）
│   └── 随包本地文档 / 无 preload / 无 Node / 无 IPC
├── scene WebContentsView（从 y=36 开始）
│   └── 不受信任 HTTPS 网页
└── control WebContentsView（按需显示）
    └── 随包本地控制面 / 最小 preload / 白名单 IPC
```

- window chrome 固定占用顶部 36px，不覆盖 scene，避免透明 View 吞掉网页点击。
- 可拖动空白区使用 `app-region: drag`；如以后加入可交互控件，必须逐项标记 `app-region: no-drag`。
- 交通灯显示时为左侧系统控件保留安全区；隐藏后仍保留整条可靠的拖动入口。
- 默认以低对比顶部分隔线和居中短条表达可拖动性，不依赖文字提示；目标光标为 `grab`，若 Electron 原生命中测试覆盖 CSS 光标，静态短条仍是可发现性兜底。
- 不实现“进入顶边后才切换为拖动区”。Electron 的 drag 区域不接收常规鼠标进入、退出和点击事件；为追踪 hover 而轮询全局鼠标位置会增加平台耦合、能耗和失效状态。首版采用始终可拖动的静态区域，真实拖动期间可由主进程根据窗口移动事件增强 window chrome View 的背景反馈，不为此增加 renderer IPC。
- window chrome 使用独立本地入口和严格导航保护；窗口关闭时与另外两个 View 一样显式关闭 `webContents`。

### 通用设置框架

设置继续承载在现有可信控制面中，不创建第二个应用窗口。`⌘ ,` 和 macOS 应用菜单的“设置…”统一打开设置入口。

控制面的一级分类收敛为“命令、场景、下载、设置”；当前“权限”和“升级”迁入设置内部。现有 `⌘ J` 继续打开下载，`⌘ U` 直接打开“设置 / 更新”。

首版只展示已有真实能力：

- 窗口：显示 macOS 系统窗口控制按钮；
- 隐私与权限：迁移现有权限记录与撤销入口；
- 更新：迁移现有升级状态与操作；
- 关于：品牌、版本、许可证和开发/打包身份说明。

设置框架允许以后增加分区，但不预置没有行为的空开关。任意下载或截图路径配置不进入本次范围。

持久设置写入固定的 `app.getPath('userData')/settings.json`：

- 使用 `schemaVersion: 1` 和精确 schema；首个持久字段为 `window.showTrafficLights: boolean`；
- 默认值为 `true`，确保系统控件默认可见；
- 限制读取大小，采用致命 UTF-8 解码、私有目录/文件权限、临时文件 `fsync` 和原子替换；
- 损坏、不支持版本、未知字段或越界值先隔离，再恢复安全默认值；
- 业务 API 不接受文件路径，网页不能读取或修改设置。

控制面通过现有 `ChromeState` 接收设置快照。更新使用逐项白名单合同，不接受任意对象合并；主进程验证 sender、主 frame、精确本地 URL、字段和值后再持久化并调用 `BaseWindow.setWindowButtonVisibility`。非 macOS 平台不展示交通灯设置，主进程调用保持无副作用。

隐藏交通灯后，用户仍可通过 `⌘ ,`、应用菜单和设置页恢复；关闭、最小化与全屏继续保留系统菜单和键盘路径。设置在窗口首次显示前应用，避免启动时按钮闪烁。

### 品牌身份合同

- 可信控制面、内置落地页和关于页使用随包的 `foscen-icon.svg` 或 `foscen-wordmark.svg`，不再使用文字 `F` 作为品牌占位。
- 打包应用继续以 `Foscen`、`com.conteman.foscen` 和 `foscen.icns` 为唯一系统身份。
- `pnpm start` 运行 Electron 开发宿主，只用于开发验证；Dock、Finder、菜单栏、窗口切换器和活动监视器的品牌验收必须针对打包后的 `Foscen.app`。
- 品牌资源只从随包本地路径加载，不引入远程图片、外部脚本或宽松 CSP。

## 后果

优点：窗口始终可移动，网页不会控制窗口外壳；设置获得统一入口和严格持久边界；交通灯隐藏后有明确恢复路径；开发宿主与正式应用身份不再混为一谈。

代价：常驻窗口条占用 36px 垂直空间，并新增一个 renderer/WebContents 生命周期；三个 View 的布局、层级、焦点、全屏和销毁都必须覆盖测试。静态拖动提示没有完全复现“hover 后整窗反馈”的设想，但状态更少、行为更可靠。

## 被否决的方案

- **让 scene 网页声明拖动区**：网页不受信任，且不同站点布局不可控。
- **将现有控制面 View 透明覆盖在网页顶边**：透明 View 仍会截获输入，容易破坏网页顶部控件。
- **通过全局鼠标轮询实现 hover 激活**：增加持续工作、平台耦合和窗口边界竞态，收益不足。
- **新建独立设置窗口**：扩大窗口与生命周期复杂度，不符合当前单窗口定位。
- **默认隐藏交通灯**：降低首次使用的可发现性和系统一致性；由用户显式选择更稳妥。

## 实施与复审

本 ADR 已完成设计确认，由 #9、#10、#11 分别在独立分支和 PR 中实现。在对应实现合入前，本文描述的是已接受的目标架构，不代表相关能力已经交付。实现时同步 `docs/architecture.md`、`docs/security.md`、README、CHANGELOG 和相应测试。

若真实原型证明独立 window chrome View 无法稳定提供拖动命中、交通灯安全区或全屏行为，应暂停实现并复审 View 组合，而不是放宽 scene 安全边界。

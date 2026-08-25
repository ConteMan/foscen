# ADR-0003：桌面窗口外壳采用可切换可信边框与版本化设置

- 状态：已接受
- 日期：2026-08-20
- 关联 Issue：[#8](https://github.com/ConteMan/foscen/issues/8)、[#9](https://github.com/ConteMan/foscen/issues/9)、[#10](https://github.com/ConteMan/foscen/issues/10)、[#11](https://github.com/ConteMan/foscen/issues/11)
- 扩展决策：[ADR-0001](0001-electron-view-boundaries.md)、[ADR-0002](0002-trusted-capabilities.md)

## 背景

Foscen 使用 `BaseWindow + WebContentsView` 隐藏系统标题栏并让网页尽量占据窗口。当前 scene View 覆盖整个内容区，可信控制面完全隐藏时没有可拖动区域；`⌘ ,` 直接打开权限面板，也没有统一设置模型；macOS 交通灯只能保持构造时的默认状态。仓库已有正式品牌资产和打包名称，但应用内仍使用文字占位，开发宿主与打包应用的身份差异也没有形成验收合同。

这些问题都属于桌面窗口外壳。解决方案必须保持网页与桌面能力隔离，不能让不受信任网页获得窗口控制、设置 IPC 或本地文件能力。

## 决策

### 可切换可信窗口外壳

在现有 scene View 与按需控制面 View 之外，新增一个独立的 window chrome `WebContentsView`：

```text
BaseWindow
├── window chrome WebContentsView（边框模式位于最底层）
│   └── 随包本地文档 / 无 preload / 无 Node / 无 IPC
├── scene WebContentsView（边框模式内缩；极简模式铺满）
│   └── 不受信任 HTTPS 网页
└── control WebContentsView（按需显示）
    └── 随包本地控制面 / 最小 preload / 白名单 IPC
```

- **边框模式是默认值**：scene 从四边等距内缩，露出一圈克制的可信外框。window chrome 位于 scene 下方，只有露出的顶部外框使用 `app-region: drag`；网页与拖动入口不存在覆盖关系。
- 外框只表达窗口与网页的空间边界，不加入工具栏、文字、把手、阴影或持续动画；scene 使用轻微圆角与外框形成清晰但低干扰的层次。
- **极简模式是显式选择**：scene 铺满窗口，window chrome 整体隐藏，不保留任何常驻拖动命中区。控制面显示后，其顶部标题区提供 `app-region: drag`，按钮、输入和其他控件必须使用 `app-region: no-drag`。
- macOS 继续使用 `titleBarStyle: hiddenInset`，但交通灯在窗口首次显示前默认隐藏，保持外框纯净；设置框架交付后允许用户重新显示。极简模式与隐藏交通灯同时启用时，菜单和键盘入口必须仍可打开控制面并恢复设置。
- 不实现“进入顶边后才切换为拖动区”。一个覆盖 scene 的 View 无法同时接收 hover 又把点击交给下层网页；全局鼠标轮询会增加平台耦合、能耗和失效状态。
- window chrome 使用独立本地入口和严格导航保护；窗口关闭时与另外两个 View 一样显式关闭 `webContents`。

该交互遵循 Electron 的标准自定义标题栏模型：容器使用 `app-region: drag`，容器内按钮使用 `app-region: no-drag`。参考[自定义窗口交互](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)与[自定义标题栏](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)。

### 通用设置框架

设置继续承载在现有可信控制面中，不创建第二个应用窗口。`⌘ ,` 和 macOS 应用菜单的“设置…”统一打开设置入口。

控制面的一级分类收敛为“命令、场景、下载、设置”；当前“权限”和“升级”迁入设置内部。现有 `⌘ J` 继续打开下载，`⌘ U` 直接打开“设置 / 更新”。

首版只展示已有真实能力：

- 窗口：边框／极简呈现模式，以及是否显示 macOS 系统窗口控制按钮；
- 隐私与权限：迁移现有权限记录与撤销入口；
- 更新：迁移现有升级状态与操作；
- 关于：品牌、版本、许可证和开发/打包身份说明。

设置框架允许以后增加分区，但不预置没有行为的空开关。任意下载或截图路径配置不进入本次范围。

持久设置写入固定的 `app.getPath('userData')/settings.json`：

- 使用 `schemaVersion: 1` 和精确 schema；首批持久字段为 `window.presentationMode: 'frame' | 'minimal'` 与 `window.showTrafficLights: boolean`；
- 默认值为边框模式且隐藏交通灯；顶部外框提供可靠移动入口，菜单和键盘入口承担关闭、全屏与恢复设置的兜底；
- 限制读取大小，采用致命 UTF-8 解码、私有目录/文件权限、临时文件 `fsync` 和原子替换；
- 损坏、不支持版本、未知字段或越界值先隔离，再恢复安全默认值；
- 业务 API 不接受文件路径，网页不能读取或修改设置。

控制面通过现有 `ChromeState` 接收设置快照。更新使用逐项白名单合同，不接受任意对象合并；主进程验证 sender、主 frame、精确本地 URL、字段和值后再持久化，切换 View 布局或调用 `BaseWindow.setWindowButtonVisibility`。非 macOS 平台不展示交通灯设置，主进程调用保持无副作用。

隐藏交通灯后，用户仍可通过 `⌘ ,`、应用菜单和设置页恢复；关闭、最小化与全屏继续保留系统菜单和键盘路径。设置在窗口首次显示前应用，避免启动时按钮闪烁。

### 品牌身份合同

- 可信控制面、内置落地页和关于页使用随包的 `foscen-mark.svg`（应用内脱板字形）或 `foscen-wordmark.svg`，不再使用文字 `F` 作为品牌占位。`foscen-icon.svg` 是带底板的应用图标源，只用于生成 `foscen.icns`，不在界面里缩放。
- 打包应用继续以 `Foscen`、`com.conteman.foscen` 和 `foscen.icns` 为唯一系统身份。
- `pnpm start` 运行 Electron 开发宿主，只用于开发验证；Dock、Finder、菜单栏、窗口切换器和活动监视器的品牌验收必须针对打包后的 `Foscen.app`。
- 品牌资源只从随包本地路径加载，不引入远程图片、外部脚本或宽松 CSP。

## 后果

优点：默认模式下窗口始终可移动且网页控件不会被透明层遮挡；极简模式保留真正的全幅网页呈现；两种模式都不向网页开放窗口能力。设置获得统一入口和严格持久边界；交通灯隐藏后有明确恢复路径；开发宿主与正式应用身份不再混为一谈。

代价：边框模式会略微缩小网页视口，可能影响临界宽度处的响应式布局；极简模式在控制面收起后不能直接用鼠标拖动。新增一个 renderer/WebContents 生命周期，三个 View 的布局、层级、焦点、全屏和销毁都必须覆盖测试。

## 被否决的方案

- **让 scene 网页声明拖动区**：网页不受信任，且不同站点布局不可控。
- **透明可信 View 常驻覆盖 scene 顶部**：真实原型证明它会形成不可见输入死区，破坏网页顶部导航和按钮；视觉透明不能解决命中冲突。
- **使用有底色、分隔线或把手的独立工具条**：会形成显眼的应用 chrome，偏离低干扰呈现目标；边框只保留必要的空间边界。
- **把现有控制面 View 扩展为全窗透明层**：透明 View 会截获整个网页输入，影响范围比独立外框更大。
- **将不受信任网页放入可信 renderer 的 `<webview>`**：扩大可信渲染面和攻击面，违背 ADR-0001 的进程、Session 与 preload 隔离。
- **通过全局鼠标轮询实现 hover 激活**：增加持续工作、平台耦合和窗口边界竞态，收益不足。
- **新建独立设置窗口**：扩大窗口与生命周期复杂度，不符合当前单窗口定位。
- **隐藏交通灯且没有恢复入口**：会让极简模式失去必要的窗口控制兜底；默认隐藏必须与顶部外框、应用菜单和稳定的控制面快捷键同时成立。

## 实施与复审

本 ADR 已完成设计确认，由 #9、#10、#11 分别在独立分支和 PR 中实现。在对应实现合入前，本文描述的是已接受的目标架构，不代表相关能力已经交付。实现时同步 `docs/architecture.md`、`docs/security.md`、README、CHANGELOG 和相应测试。

首轮透明覆盖原型已因网页输入死区触发复审，并由本次修订替代。若边框原型无法稳定提供拖动命中、交通灯安全区或全屏行为，或内缩对目标网页造成不可接受的响应式变化，应暂停实现并复审边框尺寸与 View 组合，而不是覆盖 scene 或放宽其安全边界。

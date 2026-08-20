# 安全边界

## 威胁模型

scene 中的任何网页都视为不受信任：页面可能被入侵、重定向、构造恶意 URL/文件名/IPC 参数、申请敏感权限或诱导下载。Foscen 不替网页背书；它阻止网页跨越到桌面应用权限域，并让每次越界都有可信 UI 或主进程快捷键作为明确用户动作。

## 进程与导航基线

| 边界          | 策略                                                                |
| ------------- | ------------------------------------------------------------------- |
| Node.js       | 所有 View `nodeIntegration: false`                                  |
| 上下文        | `contextIsolation: true`                                            |
| 沙箱          | `app.enableSandbox()` 且所有 View `sandbox: true`                   |
| Web 安全      | `webSecurity: true`、禁止不安全混合内容和 `<webview>`               |
| preload       | scene/window chrome 无 preload；control 只暴露逐项方法              |
| IPC           | 固定 channel；验证 sender、主 frame、精确本地 URL 与运行时参数      |
| 导航          | scene 只允许无凭据 HTTPS 与精确落地页；可信 View 只允许各自本地文档 |
| 新窗口/协议   | `setWindowOpenHandler` 默认拒绝；网页 URL 不交给系统 shell          |
| Session       | scene 使用独立持久分区；window chrome/control 使用独立内存分区      |
| 实例/生命周期 | 单实例锁；窗口关闭时卸载 Session 监听器并显式关闭三个 `webContents` |

## 桌面能力

### 窗口交互层

默认边框模式的拖动只由随包本地 window chrome 顶部外框提供。该 View 无脚本、preload、Node 和 IPC，位于 scene 下方；导航与重定向只允许自身精确 `file:` URL，新窗口默认拒绝。scene 不获得 `app-region` 或窗口 API。

边框模式通过 scene 内缩让可信外框与网页输入在空间上分离；极简模式隐藏 window chrome 并让 scene 铺满窗口。macOS 交通灯默认隐藏不改变权限边界，应用菜单和可信控制面快捷键必须保留恢复路径。控制面顶部属于可信拖动区，其按钮、输入和其他控件必须显式 `no-drag`。不得把任意网页 DOM、URL 或输入映射成拖动／非拖动区域；若边框影响目标网页，应复审布局或尺寸，而不是覆盖 scene 或向其注入能力。

### 权限

仅支持摄像头、麦克风、位置、通知和净化后的剪贴板写入。决定绑定当前主 frame 的规范 HTTPS origin，可选择一次、本次会话或持久；持久决定可在控制面撤销。check 与 request handler 都执行策略；请求自到达起最多等待 30 秒，队列最多 32 项，导航、渲染进程退出或窗口关闭会拒绝所有待处理回调。

以下能力保持默认拒绝：未知权限、跨来源/子 frame 请求、HID/Serial/USB/Bluetooth 设备选择、屏幕捕获、客户端证书、外部打开、文件系统、MIDI 和宽泛剪贴板读取。Electron/macOS 的系统提示仍是额外边界，Foscen 的允许不绕过系统授权。

### 下载

- 只接受当前 scene `webContents` 且 `hasUserGesture()` 为真；
- 最终 URL 与完整重定向链必须为无凭据 HTTPS；
- 最多 5 个活动任务，单文件最多 2 GiB，未知长度也监控已接收字节；
- 审批前暂停到 `Downloads/Foscen/.foscen-staging/<uuid>.part`，60 秒无回应即拒绝；
- 用户文件名只作显示和最终建议名，清理路径/控制字符并限制长度；
- 完成后使用排他硬链接发布，绝不覆盖既有文件；失败或拒绝只清理本任务的 UUID 暂存文件；
- 不自动打开文件，不记录可能含凭据的完整下载 URL。

### 截图

截图仅由可信控制面 IPC 或主进程快捷键触发，捕获当前可见 scene View。服务串行化操作、限制频率、捕获矩形不超过 5000 万像素且 PNG 不超过 64 MiB；输出使用排他创建，不覆盖文件，也不把图像传回网页。

### 场景与本地数据

场景和权限仓库只从 Electron 的 `app.getPath('userData')` 派生固定文件，业务 API 不能传路径。数据使用版本化精确 schema、长度/数量上限、致命 UTF-8 解码、私有目录/文件权限、临时文件 `fsync` 和原子替换；损坏文件先隔离再按默认拒绝/空仓库恢复。单实例锁避免跨进程写竞争。

### 升级与发布

自动升级只在已打包 macOS 应用启用，源固定为 `https://update.electronjs.org/ConteMan/foscen/...`，不接受网页或本地配置覆盖。正式产物必须使用稳定 bundle id `com.conteman.foscen`、Developer ID、按进程收敛的 entitlement、Hardened Runtime、Apple 公证及最终非 draft GitHub Release；ZIP 用于升级，DMG 用于首次安装。质量门禁和凭据导入分属不同任务/阶段，证书/API key 仅存在于受保护 environment 的临时 keychain/文件并在制品验证后清理。

## 变更要求

- 新权限必须同时限定 origin、frame、用户动作和有效期，并覆盖允许/拒绝测试。
- 新 IPC 必须有共享合同、运行时参数校验和可信 sender 校验。
- 外部打开能力只允许由可信 UI 明确触发，并在主进程重新解析、限定协议。
- 不得关闭 `webSecurity`、沙箱、上下文隔离或 URL 检查来兼容网页。
- 新文件能力不得接受网页控制的绝对路径；必须定义大小、覆盖、清理和隐私策略。
- 依赖、签名 entitlement、更新源或 release 权限变化必须同步发布文档并进入 selftest。

## 评审清单

- 不受信任输入是否只在最小权限域处理？
- 重定向、新窗口、权限、设备、下载和外部协议是否默认拒绝？
- 是否有任意 channel、任意 URL、任意路径或原始 Electron API 暴露？
- 异步审批是否会在导航、关闭、超时或重复回应时 fail closed？
- View 移除和窗口关闭是否释放 `webContents` 与 Session 监听器？
- 日志、fixture、截图、包内容和 Actions 是否可能携带敏感数据？

Electron 安全建议以官方文档为准：<https://www.electronjs.org/docs/latest/tutorial/security>。

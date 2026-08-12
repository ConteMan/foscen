# 安全边界

## 威胁模型

scene 中的任何网页都视为不受信任：页面可能被入侵、重定向、尝试打开新窗口或外部协议、申请敏感权限，或构造恶意 IPC 参数。Foscen 的目标不是替网页背书，而是阻止网页跨越到桌面应用权限域。

## 当前基线

| 边界        | 策略                                                              |
| ----------- | ----------------------------------------------------------------- |
| Node.js     | 所有 View `nodeIntegration: false`                                |
| 上下文      | `contextIsolation: true`                                          |
| 沙箱        | `app.enableSandbox()` 且所有 View `sandbox: true`                 |
| Web 安全    | `webSecurity: true`、禁止不安全混合内容和 `<webview>`             |
| preload     | scene 无 preload；chrome 只暴露逐项方法，不暴露原始 `ipcRenderer` |
| IPC         | 固定 channel；验证 sender、frame URL 和输入类型/长度/协议         |
| 导航        | 用户输入与页面跳转只允许 HTTPS；唯一例外是精确的内置落地页        |
| 新窗口/协议 | `setWindowOpenHandler` 默认拒绝；不把网页 URL 直接交给系统 shell  |
| 权限        | scene 与 chrome 的 check/request handler 均默认拒绝               |
| Session     | scene 使用独立持久分区，chrome 使用独立内存分区                   |
| 生命周期    | 窗口关闭时显式关闭两个 `webContents`                              |

## 变更要求

- 新权限必须同时限定 origin、权限类型、用户动作和有效期，并覆盖允许/拒绝测试。
- 新 IPC 必须有共享合同、运行时参数校验和可信 sender 校验。
- 外部打开能力只允许由可信 UI 明确触发，并在主进程重新解析、限定协议。
- 不得用关闭 `webSecurity`、沙箱或隔离来兼容网页。
- 下载、截图、场景持久化和恢复落地前必须补充路径、文件覆盖、隐私和数据清理策略。

## 评审清单

- 不受信任输入是否只在最小权限域处理？
- 重定向、新窗口、权限和外部协议是否默认拒绝？
- 是否有任意 channel、任意 URL、任意路径或原始 Electron API 暴露？
- View 移除和窗口关闭是否释放 `webContents`？
- 日志、fixture、截图和配置是否可能携带敏感数据？

Electron 安全建议以官方文档为准：<https://www.electronjs.org/docs/latest/tutorial/security>。

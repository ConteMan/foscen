import type { PermissionDecision, PermissionLifetime, SupportedPermission } from './permissions.js'
import type { ChromeState, ControlPresentation } from './ui-state.js'

export const IPC_CHANNELS = {
  dismissChrome: 'chrome:dismiss',
  rendererReady: 'chrome:renderer-ready',
  showChrome: 'chrome:show',
  requestControlSize: 'chrome:request-size',
  navigate: 'scene:navigate',
  goBack: 'scene:go-back',
  goForward: 'scene:go-forward',
  reload: 'scene:reload',
  saveScene: 'scene:save',
  openScene: 'scene:open',
  deleteScene: 'scene:delete',
  captureScreenshot: 'scene:capture-screenshot',
  showToast: 'chrome:toast',
  approveDownload: 'download:approve',
  rejectDownload: 'download:reject',
  respondPermission: 'permission:respond',
  revokePermission: 'permission:revoke',
  checkForUpdates: 'update:check',
  installUpdate: 'update:install',
} as const

export type NavigateResult = { ok: true; url: string } | { ok: false; error: string }

export type ActionResult = { ok: true; message: string } | { ok: false; error: string }

/**
 * chrome 隐藏时捕获截图完成后的一次性提示。只在捕获完成之后推送，绝不在截图
 * 画面仍可见时出现；`message` 只携带文件名或具体失败原因，不含完整路径。
 */
export type ToastKind = 'success' | 'error'
export interface ToastState {
  readonly kind: ToastKind
  readonly message: string
}

export interface ControlSizeRequest {
  readonly presentation: ControlPresentation
  readonly rowCount: number
}

export interface FoscenBridge {
  dismissChrome: () => Promise<void>
  rendererReady: () => Promise<void>
  requestControlSize: (request: ControlSizeRequest) => Promise<void>
  navigate: (target: string) => Promise<NavigateResult>
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  reload: () => Promise<void>
  saveScene: (name: string) => Promise<ActionResult>
  openScene: (id: string) => Promise<ActionResult>
  deleteScene: (id: string) => Promise<ActionResult>
  captureScreenshot: () => Promise<ActionResult>
  approveDownload: (id: string) => Promise<ActionResult>
  rejectDownload: (id: string) => Promise<ActionResult>
  respondPermission: (
    requestId: string,
    decision: PermissionDecision,
    lifetime: PermissionLifetime,
  ) => Promise<ActionResult>
  revokePermission: (origin: string, permission: SupportedPermission) => Promise<ActionResult>
  checkForUpdates: () => Promise<ActionResult>
  installUpdate: () => Promise<ActionResult>
  onShowChrome: (listener: (state: ChromeState) => void) => () => void
  onShowToast: (listener: (toast: ToastState) => void) => () => void
}

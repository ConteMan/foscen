import { contextBridge, ipcRenderer } from 'electron'

import {
  IPC_CHANNELS,
  type ActionResult,
  type ControlSizeRequest,
  type FoscenBridge,
  type NavigateResult,
  type ToastState,
} from '../shared/ipc.js'
import type {
  PermissionDecision,
  PermissionLifetime,
  SupportedPermission,
} from '../shared/permissions.js'
import type { ChromeState } from '../shared/ui-state.js'

const invokeAction = async (channel: string, ...args: readonly unknown[]): Promise<ActionResult> =>
  (await ipcRenderer.invoke(channel, ...args)) as ActionResult

const bridge: FoscenBridge = Object.freeze({
  dismissChrome: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.dismissChrome)
  },
  rendererReady: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.rendererReady)
  },
  requestControlSize: async (request: ControlSizeRequest) => {
    await ipcRenderer.invoke(IPC_CHANNELS.requestControlSize, request)
  },
  navigate: async (target: string) =>
    (await ipcRenderer.invoke(IPC_CHANNELS.navigate, target)) as NavigateResult,
  goBack: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.goBack)
  },
  goForward: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.goForward)
  },
  reload: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.reload)
  },
  saveScene: async (name: string) => invokeAction(IPC_CHANNELS.saveScene, name),
  openScene: async (id: string) => invokeAction(IPC_CHANNELS.openScene, id),
  deleteScene: async (id: string) => invokeAction(IPC_CHANNELS.deleteScene, id),
  captureScreenshot: async () => invokeAction(IPC_CHANNELS.captureScreenshot),
  approveDownload: async (id: string) => invokeAction(IPC_CHANNELS.approveDownload, id),
  rejectDownload: async (id: string) => invokeAction(IPC_CHANNELS.rejectDownload, id),
  respondPermission: async (
    requestId: string,
    decision: PermissionDecision,
    lifetime: PermissionLifetime,
  ) => invokeAction(IPC_CHANNELS.respondPermission, requestId, decision, lifetime),
  revokePermission: async (origin: string, permission: SupportedPermission) =>
    invokeAction(IPC_CHANNELS.revokePermission, origin, permission),
  checkForUpdates: async () => invokeAction(IPC_CHANNELS.checkForUpdates),
  installUpdate: async () => invokeAction(IPC_CHANNELS.installUpdate),
  onShowChrome: (listener: (state: ChromeState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown): void => {
      listener(state as ChromeState)
    }

    ipcRenderer.on(IPC_CHANNELS.showChrome, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.showChrome, handler)
    }
  },
  onShowToast: (listener: (toast: ToastState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, toast: unknown): void => {
      listener(toast as ToastState)
    }

    ipcRenderer.on(IPC_CHANNELS.showToast, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.showToast, handler)
    }
  },
})

contextBridge.exposeInMainWorld('foscen', bridge)

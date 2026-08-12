import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS, type FoscenBridge, type NavigateResult } from '../shared/ipc.js'

const bridge: FoscenBridge = Object.freeze({
  dismissChrome: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.dismissChrome)
  },
  rendererReady: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.rendererReady)
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
  onShowChrome: (listener: (currentUrl: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, currentUrl: unknown): void => {
      listener(typeof currentUrl === 'string' ? currentUrl : '')
    }

    ipcRenderer.on(IPC_CHANNELS.showChrome, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.showChrome, handler)
    }
  },
})

contextBridge.exposeInMainWorld('foscen', bridge)

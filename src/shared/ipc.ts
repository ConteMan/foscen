export const IPC_CHANNELS = {
  dismissChrome: 'chrome:dismiss',
  rendererReady: 'chrome:renderer-ready',
  showChrome: 'chrome:show',
  navigate: 'scene:navigate',
  goBack: 'scene:go-back',
  goForward: 'scene:go-forward',
  reload: 'scene:reload',
} as const

export type NavigateResult = { ok: true; url: string } | { ok: false; error: string }

export interface FoscenBridge {
  dismissChrome: () => Promise<void>
  rendererReady: () => Promise<void>
  navigate: (target: string) => Promise<NavigateResult>
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  reload: () => Promise<void>
  onShowChrome: (listener: (currentUrl: string) => void) => () => void
}

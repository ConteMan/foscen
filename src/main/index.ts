import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  app,
  BaseWindow,
  ipcMain,
  Menu,
  session,
  WebContentsView,
  type IpcMainInvokeEvent,
  type Input,
  type Session,
  type WebContents,
} from 'electron'

import { IPC_CHANNELS, type NavigateResult } from '../shared/ipc.js'
import {
  InvalidSceneUrlError,
  displayableSceneUrl,
  isAllowedSceneNavigation,
  normalizeSceneUrl,
} from './url-policy.js'

const CHROME_HEIGHT = 76
const CHROME_SIDE_INSET = 72
const UI_PARTITION = 'foscen-ui'
const SCENE_PARTITION = 'persist:foscen-scenes'

const chromeDocument = join(__dirname, '../renderer/index.html')
const landingDocument = join(__dirname, '../scene/index.html')
const chromeDocumentUrl = pathToFileURL(chromeDocument).href
const landingDocumentUrl = pathToFileURL(landingDocument).href

app.setName('Foscen')
app.enableSandbox()

function denyPermissions(targetSession: Session): void {
  targetSession.setPermissionCheckHandler(() => false)
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}

function closeWebContents(webContents: WebContents): void {
  if (!webContents.isDestroyed()) {
    webContents.close()
  }
}

class FoscenWindow {
  readonly window: BaseWindow
  readonly sceneView: WebContentsView
  readonly chromeView: WebContentsView

  private chromeVisible = false
  private readonly rendererReady: Promise<void>
  private resolveRendererReady: (() => void) | undefined

  constructor(onClosed: () => void) {
    this.rendererReady = new Promise((resolve) => {
      this.resolveRendererReady = resolve
    })

    const sceneSession = session.fromPartition(SCENE_PARTITION)
    const uiSession = session.fromPartition(UI_PARTITION)

    denyPermissions(sceneSession)
    denyPermissions(uiSession)

    this.window = new BaseWindow({
      width: 1280,
      height: 800,
      minWidth: 720,
      minHeight: 480,
      show: false,
      title: 'Foscen',
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#111713',
    })

    this.sceneView = new WebContentsView({
      webPreferences: {
        session: sceneSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        allowRunningInsecureContent: false,
        spellcheck: false,
      },
    })

    this.chromeView = new WebContentsView({
      webPreferences: {
        session: uiSession,
        preload: join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        allowRunningInsecureContent: false,
        spellcheck: false,
      },
    })

    this.window.contentView.addChildView(this.sceneView)
    this.window.contentView.addChildView(this.chromeView)
    this.chromeView.setVisible(false)

    this.installNavigationGuards()
    this.installKeyboardControls()
    this.layout()

    this.window.on('resize', () => {
      this.layout()
    })

    this.window.on('closed', () => {
      closeWebContents(this.chromeView.webContents)
      closeWebContents(this.sceneView.webContents)
      onClosed()
    })
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.chromeView.webContents.loadFile(chromeDocument),
      this.sceneView.webContents.loadFile(landingDocument),
    ])
    await this.waitForRendererReady()

    if (process.env.FOSCEN_SMOKE_TEST === '1') {
      console.log('FOSCEN_SMOKE_READY')
      app.quit()
      return
    }

    this.window.show()
    this.sceneView.webContents.focus()
  }

  ownsChromeSender(event: IpcMainInvokeEvent): boolean {
    return (
      event.sender === this.chromeView.webContents && event.senderFrame?.url === chromeDocumentUrl
    )
  }

  markRendererReady(): void {
    this.resolveRendererReady?.()
    this.resolveRendererReady = undefined
  }

  async navigate(candidate: unknown): Promise<NavigateResult> {
    let target: string

    try {
      target = normalizeSceneUrl(candidate)
    } catch (error) {
      return {
        ok: false,
        error: error instanceof InvalidSceneUrlError ? error.message : '地址无效',
      }
    }

    try {
      await this.sceneView.webContents.loadURL(target)
      this.hideChrome()
      return { ok: true, url: target }
    } catch {
      return { ok: false, error: '页面加载失败，请检查网络或地址' }
    }
  }

  goBack(): void {
    const history = this.sceneView.webContents.navigationHistory
    if (history.canGoBack()) {
      history.goBack()
    }
  }

  goForward(): void {
    const history = this.sceneView.webContents.navigationHistory
    if (history.canGoForward()) {
      history.goForward()
    }
  }

  reload(): void {
    this.sceneView.webContents.reload()
  }

  showChrome(): void {
    this.chromeVisible = true
    this.chromeView.setVisible(true)
    this.chromeView.webContents.focus()
    this.chromeView.webContents.send(
      IPC_CHANNELS.showChrome,
      displayableSceneUrl(this.sceneView.webContents.getURL()),
    )
  }

  hideChrome(): void {
    this.chromeVisible = false
    this.chromeView.setVisible(false)
    this.sceneView.webContents.focus()
  }

  private layout(): void {
    const [width = 0, height = 0] = this.window.getContentSize()
    this.sceneView.setBounds({ x: 0, y: 0, width, height })
    this.chromeView.setBounds({
      x: CHROME_SIDE_INSET,
      y: 8,
      width: Math.max(1, width - CHROME_SIDE_INSET * 2),
      height: CHROME_HEIGHT,
    })
  }

  private installNavigationGuards(): void {
    const guardSceneNavigation = (details: { url: string; preventDefault: () => void }): void => {
      if (!isAllowedSceneNavigation(details.url, landingDocumentUrl)) {
        details.preventDefault()
      }
    }

    this.sceneView.webContents.on('will-navigate', guardSceneNavigation)
    this.sceneView.webContents.on('will-redirect', guardSceneNavigation)
    this.sceneView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    this.chromeView.webContents.on('will-navigate', (details) => {
      if (details.url !== chromeDocumentUrl) {
        details.preventDefault()
      }
    })
    this.chromeView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  }

  private installKeyboardControls(): void {
    const handleInput = (event: Electron.Event, input: Input): void => {
      if (input.type !== 'keyDown') {
        return
      }

      const key = input.key.toLowerCase()
      const commandModifier = process.platform === 'darwin' ? input.meta : input.control

      if (commandModifier && key === 'l') {
        event.preventDefault()
        this.showChrome()
        return
      }

      if (commandModifier && key === 'r') {
        event.preventDefault()
        this.reload()
        return
      }

      if (input.alt && input.key === 'ArrowLeft') {
        event.preventDefault()
        this.goBack()
        return
      }

      if (input.alt && input.key === 'ArrowRight') {
        event.preventDefault()
        this.goForward()
        return
      }

      if (input.key === 'Escape' && this.chromeVisible) {
        event.preventDefault()
        this.hideChrome()
      }
    }

    this.sceneView.webContents.on('before-input-event', handleInput)
    this.chromeView.webContents.on('before-input-event', handleInput)
  }

  private async waitForRendererReady(): Promise<void> {
    let timeout: NodeJS.Timeout | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject(new Error('可信 UI 未在 5 秒内完成初始化'))
      }, 5_000)
    })

    try {
      await Promise.race([this.rendererReady, deadline])
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }
}

let activeWindow: FoscenWindow | undefined

function trustedWindowFor(event: IpcMainInvokeEvent): FoscenWindow {
  if (!activeWindow || !activeWindow.ownsChromeSender(event)) {
    throw new Error('拒绝来自非受信任页面的 IPC 请求')
  }

  return activeWindow
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.dismissChrome, (event) => {
    trustedWindowFor(event).hideChrome()
  })

  ipcMain.handle(IPC_CHANNELS.rendererReady, (event) => {
    trustedWindowFor(event).markRendererReady()
  })

  ipcMain.handle(IPC_CHANNELS.navigate, async (event, candidate: unknown) =>
    trustedWindowFor(event).navigate(candidate),
  )

  ipcMain.handle(IPC_CHANNELS.goBack, (event) => {
    trustedWindowFor(event).goBack()
  })

  ipcMain.handle(IPC_CHANNELS.goForward, (event) => {
    trustedWindowFor(event).goForward()
  })

  ipcMain.handle(IPC_CHANNELS.reload, (event) => {
    trustedWindowFor(event).reload()
  })
}

async function createWindow(): Promise<void> {
  const nextWindow = new FoscenWindow(() => {
    if (activeWindow === nextWindow) {
      activeWindow = undefined
    }
  })

  activeWindow = nextWindow
  await nextWindow.initialize()
}

function failStartup(error: unknown): void {
  console.error('Foscen failed to start:', error instanceof Error ? error.message : error)
  app.exit(1)
}

void app
  .whenReady()
  .then(async () => {
    Menu.setApplicationMenu(null)
    registerIpcHandlers()
    await createWindow()

    app.on('activate', () => {
      if (!activeWindow) {
        void createWindow().catch(failStartup)
      }
    })
  })
  .catch(failStartup)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

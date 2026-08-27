import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  app,
  autoUpdater,
  BaseWindow,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  session,
  WebContentsView,
  type BaseWindowConstructorOptions,
  type IpcMainInvokeEvent,
  type Input,
  type Session,
  type WebContents,
} from 'electron'

import { IPC_CHANNELS, type ActionResult, type NavigateResult } from '../shared/ipc.js'
import type { PermissionRecord } from '../shared/permissions.js'
import type { Scene } from '../shared/scenes.js'
import {
  CONTROL_PRESENTATIONS,
  presentationForFocusMode,
  type ChromeState,
  type ControlPresentation,
  type FocusMode,
  type PermissionPrompt,
} from '../shared/ui-state.js'
import type { UpdateSnapshot } from '../shared/updates.js'
import { DownloadManager } from './download-manager.js'
import { PermissionController } from './permission-controller.js'
import { createPermissionStore, type PermissionStore } from './permission-store.js'
import { createSceneStore, type SceneStore } from './scene-store.js'
import { ScreenshotService } from './screenshot-service.js'
import { UpdateService } from './update-service.js'
import {
  InvalidSceneUrlError,
  displayableSceneUrl,
  isAllowedSceneNavigation,
  normalizeSceneUrl,
} from './url-policy.js'
import {
  DEFAULT_WINDOW_PRESENTATION_MODE,
  calculateWindowViewLayout,
  clampRowCount,
  maxVisibleRowsFor,
  type WindowPresentationMode,
} from './window-layout.js'

const UI_PARTITION = 'foscen-ui'
const SCENE_PARTITION = 'persist:foscen-scenes'
const WINDOW_BOUNDS_DEBOUNCE_MS = 300
const CURRENT_SCENE_URL_DEBOUNCE_MS = 250
/**
 * ⌘L/⌘⇧P 等打开面板时，renderer 要在拿到 showChrome 状态后量出真实行数才会
 * 回报 requestControlSize（正常在同一两帧内）。打开瞬间先按 rowCount=0 布局但
 * 不显示，等回报后再显示，避免用户看到 90px 空壳跳到最终高度。
 * 如果 renderer 迟迟不回报（卡死、崩溃、被另一 agent 改坏），这个兜底超时会
 * 强制显示当前（可能仍是 0 行）的布局——保证面板总能打开，代价是极端情况下
 * 仍可能有一次可见跳变，但这比“再也打不开”好。
 */
const REVEAL_FALLBACK_MS = 48
const LIGHT_WINDOW_FRAME_COLOR = '#d9dcda'
const DARK_WINDOW_FRAME_COLOR = '#1c211e'

const chromeDocument = join(__dirname, '../renderer/index.html')
const landingDocument = join(__dirname, '../scene/index.html')
const windowChromeDocument = join(__dirname, '../window-chrome/index.html')
const chromeDocumentUrl = pathToFileURL(chromeDocument).href
const landingDocumentUrl = pathToFileURL(landingDocument).href
const windowChromeDocumentUrl = pathToFileURL(windowChromeDocument).href

app.setName('Foscen')
app.enableSandbox()

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}

function denyAllSessionCapabilities(targetSession: Session): void {
  targetSession.setPermissionCheckHandler(() => false)
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  targetSession.setDevicePermissionHandler(() => false)
  targetSession.setDisplayMediaRequestHandler((_request, callback) => callback({}), {
    useSystemPicker: false,
  })
}

function closeWebContents(webContents: WebContents): void {
  if (!webContents.isDestroyed()) {
    webContents.close()
  }
}

function windowFrameColor(): string {
  return nativeTheme.shouldUseDarkColors ? DARK_WINDOW_FRAME_COLOR : LIGHT_WINDOW_FRAME_COLOR
}

function actionSucceeded(message: string): ActionResult {
  return { ok: true, message }
}

function actionFailed(error: unknown, fallback = '操作失败，请重试'): ActionResult {
  return {
    ok: false,
    error: error instanceof Error && error.message ? error.message : fallback,
  }
}

function installApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      role: 'appMenu',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: '显示',
      submenu: [{ role: 'togglefullscreen' }],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

interface FoscenWindowOptions {
  readonly sceneStore: SceneStore
  readonly permissionStore: PermissionStore
  readonly onClosed: () => void
}

class FoscenWindow {
  readonly window: BaseWindow
  readonly sceneView: WebContentsView
  readonly windowChromeView: WebContentsView
  readonly chromeView: WebContentsView

  private chromeVisible = false
  private readonly presentationMode: WindowPresentationMode = DEFAULT_WINDOW_PRESENTATION_MODE
  private focusMode: FocusMode = 'navigate'
  private controlPresentation: ControlPresentation = presentationForFocusMode('navigate')
  private controlRowCount = 0
  private revealTimer: NodeJS.Timeout | undefined
  private readonly rendererReady: Promise<void>
  private resolveRendererReady: (() => void) | undefined
  private boundsTimer: NodeJS.Timeout | undefined
  private currentUrlTimer: NodeJS.Timeout | undefined
  private currentUrlWriteInFlight: Promise<void> | undefined
  private pendingCurrentUrl: string | null | undefined
  private closing = false
  private readonly downloadManager: DownloadManager
  private readonly screenshotService: ScreenshotService
  private readonly updateService: UpdateService
  private permissionController: PermissionController | undefined
  private permissionRecords: readonly PermissionRecord[] = []
  private permissionPrompt: PermissionPrompt | null = null
  private downloads: ChromeState['downloads'] = []
  private scenes: readonly Scene[]
  private update: UpdateSnapshot
  private stateSendImmediate: NodeJS.Immediate | undefined
  private closePersistenceStarted = false

  private constructor(
    private readonly options: FoscenWindowOptions,
    sceneSession: Session,
    uiSession: Session,
    permissionPolicy: Awaited<ReturnType<PermissionStore['load']>>,
    initialScenes: readonly Scene[],
    windowOptions: BaseWindowConstructorOptions,
  ) {
    this.rendererReady = new Promise((resolve) => {
      this.resolveRendererReady = resolve
    })
    this.scenes = initialScenes

    denyAllSessionCapabilities(uiSession)

    this.window = new BaseWindow(windowOptions)
    if (process.platform === 'darwin') {
      this.window.setWindowButtonVisibility(false)
    }
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
    this.windowChromeView = new WebContentsView({
      webPreferences: {
        session: uiSession,
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

    this.window.contentView.addChildView(this.windowChromeView)
    this.window.contentView.addChildView(this.sceneView)
    this.window.contentView.addChildView(this.chromeView)
    this.windowChromeView.setBackgroundColor(windowFrameColor())
    this.chromeView.setVisible(false)

    this.downloadManager = new DownloadManager({
      session: sceneSession,
      sceneContents: this.sceneView.webContents,
      downloadDirectory: join(app.getPath('downloads'), 'Foscen'),
      onChanged: (downloads, requestAttention) => {
        this.downloads = downloads
        this.sendState(requestAttention ? 'downloads' : undefined)
      },
    })
    this.screenshotService = new ScreenshotService(this.sceneView, app.getPath('pictures'))
    this.updateService = new UpdateService(app, autoUpdater, (update) => {
      this.update = update
      this.sendState(update.status === 'downloaded' && !this.chromeVisible ? 'update' : undefined)
    })
    this.update = this.updateService.snapshot()
    this.permissionController = new PermissionController({
      session: sceneSession,
      sceneContents: this.sceneView.webContents,
      policy: permissionPolicy,
      store: options.permissionStore,
      onChanged: (records, prompt, requestAttention) => {
        this.permissionRecords = records
        this.permissionPrompt = prompt ?? null
        this.sendState(requestAttention ? 'permissions' : undefined)
      },
    })
    this.permissionRecords = this.permissionController.records()

    this.installNavigationGuards()
    this.installKeyboardControls()
    this.installWindowLifecycle()
    this.layout()
  }

  static async create(options: FoscenWindowOptions): Promise<FoscenWindow> {
    const [savedBounds, permissionPolicy, initialScenes] = await Promise.all([
      options.sceneStore.getWindowBounds(),
      options.permissionStore.load(),
      options.sceneStore.list(),
    ])
    const sceneSession = session.fromPartition(SCENE_PARTITION)
    const uiSession = session.fromPartition(UI_PARTITION)
    const windowOptions: BaseWindowConstructorOptions = {
      width: 1280,
      height: 800,
      minWidth: 720,
      minHeight: 540,
      show: false,
      title: 'Foscen',
      titleBarStyle: 'hiddenInset',
      backgroundColor: windowFrameColor(),
      ...(savedBounds && isVisibleBounds(savedBounds) ? savedBounds : {}),
    }

    return new FoscenWindow(
      options,
      sceneSession,
      uiSession,
      permissionPolicy,
      initialScenes,
      windowOptions,
    )
  }

  async initialize(): Promise<void> {
    const restoredUrl = await this.options.sceneStore.getCurrentSceneUrl()
    await Promise.all([
      this.chromeView.webContents.loadFile(chromeDocument),
      this.windowChromeView.webContents.loadFile(windowChromeDocument),
      restoredUrl
        ? this.sceneView.webContents.loadURL(restoredUrl).catch(async () => {
            await this.options.sceneStore.setCurrentSceneUrl(null)
            return this.sceneView.webContents.loadFile(landingDocument)
          })
        : this.sceneView.webContents.loadFile(landingDocument),
    ])
    await this.waitForRendererReady()

    if (process.env.FOSCEN_SMOKE_TEST === '1') {
      console.log('FOSCEN_SMOKE_READY')
      app.quit()
      return
    }

    this.updateService.start()
    this.window.show()
    this.sceneView.webContents.focus()
  }

  ownsChromeSender(event: IpcMainInvokeEvent): boolean {
    return (
      event.sender === this.chromeView.webContents &&
      event.senderFrame === this.chromeView.webContents.mainFrame &&
      event.senderFrame.url === chromeDocumentUrl
    )
  }

  markRendererReady(): void {
    this.resolveRendererReady?.()
    this.resolveRendererReady = undefined
    this.sendState()
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

  showChrome(mode: FocusMode = 'navigate'): void {
    const isFreshOpen = !this.chromeVisible
    this.focusMode = mode
    this.controlPresentation = presentationForFocusMode(mode)
    if (isFreshOpen) {
      this.controlRowCount = 0
    }
    this.chromeVisible = true
    this.layout()
    if (isFreshOpen) {
      this.beginReveal()
    } else {
      this.chromeView.setVisible(true)
    }
    this.chromeView.webContents.focus()
    this.sendState()
  }

  hideChrome(): void {
    this.chromeVisible = false
    this.controlRowCount = 0
    this.clearRevealTimer()
    this.chromeView.setVisible(false)
    this.sceneView.webContents.focus()
  }

  requestControlSize(request: unknown): void {
    if (typeof request !== 'object' || request === null) {
      return
    }

    const { presentation, rowCount } = request as { presentation?: unknown; rowCount?: unknown }
    if (
      typeof presentation !== 'string' ||
      !CONTROL_PRESENTATIONS.includes(presentation as ControlPresentation)
    ) {
      return
    }
    if (typeof rowCount !== 'number') {
      return
    }

    this.controlPresentation = presentation as ControlPresentation
    const [width = 0, height = 0] = this.window.getContentSize()
    this.controlRowCount = clampRowCount(rowCount, maxVisibleRowsFor(width, height))
    this.layout()
    if (this.revealTimer) {
      // renderer 已经报回真实行数：布局已经是最终尺寸，现在显示不会跳变。
      this.clearRevealTimer()
      this.chromeView.setVisible(true)
    }
  }

  private beginReveal(): void {
    this.clearRevealTimer()
    this.revealTimer = setTimeout(() => {
      this.revealTimer = undefined
      this.chromeView.setVisible(true)
    }, REVEAL_FALLBACK_MS)
    this.revealTimer.unref()
  }

  private clearRevealTimer(): void {
    if (this.revealTimer) {
      clearTimeout(this.revealTimer)
      this.revealTimer = undefined
    }
  }

  async saveScene(name: unknown): Promise<ActionResult> {
    try {
      const currentUrl = normalizeSceneUrl(this.sceneView.webContents.getURL())
      const scene = await this.options.sceneStore.save({ name: name as string, url: currentUrl })
      this.scenes = [...this.scenes, scene]
      this.sendState('scenes')
      return actionSucceeded('当前网页已保存为场景')
    } catch (error) {
      return actionFailed(error, '当前页面不能保存为场景')
    }
  }

  async openScene(id: unknown): Promise<ActionResult> {
    try {
      if (typeof id !== 'string') {
        throw new TypeError('场景 ID 无效')
      }
      const scene = await this.options.sceneStore.get(id)
      if (!scene) {
        return actionFailed('missing', '场景不存在或已删除')
      }
      const result = await this.navigate(scene.url)
      return result.ok ? actionSucceeded(`已打开“${scene.name}”`) : result
    } catch (error) {
      return actionFailed(error, '无法打开场景')
    }
  }

  async deleteScene(id: unknown): Promise<ActionResult> {
    try {
      if (typeof id !== 'string' || !(await this.options.sceneStore.delete(id))) {
        return actionFailed('missing', '场景不存在或已删除')
      }
      this.scenes = this.scenes.filter((scene) => scene.id !== id)
      this.sendState('scenes')
      return actionSucceeded('场景已删除')
    } catch (error) {
      return actionFailed(error, '无法删除场景')
    }
  }

  async captureScreenshot(): Promise<ActionResult> {
    try {
      await this.screenshotService.capture()
      return actionSucceeded('当前可见网页已保存为 PNG 截图')
    } catch (error) {
      return actionFailed(error, '截图失败')
    }
  }

  approveDownload(id: unknown): ActionResult {
    return this.downloadManager.approve(id)
      ? actionSucceeded('下载已允许')
      : actionFailed('expired', '下载审批无效或已过期')
  }

  rejectDownload(id: unknown): ActionResult {
    return this.downloadManager.reject(id)
      ? actionSucceeded('下载已拒绝')
      : actionFailed('expired', '下载审批无效或已过期')
  }

  async respondPermission(
    id: unknown,
    decision: unknown,
    lifetime: unknown,
  ): Promise<ActionResult> {
    const result = await this.permissionController?.respond(id, decision, lifetime)
    return result?.ok
      ? actionSucceeded('权限决定已应用')
      : actionFailed(result?.error, '权限回应失败')
  }

  async revokePermission(origin: unknown, permission: unknown): Promise<ActionResult> {
    const result = await this.permissionController?.revoke(origin, permission)
    return result?.ok
      ? actionSucceeded('权限决定已撤销')
      : actionFailed(result?.error, '权限撤销失败')
  }

  checkForUpdates(): ActionResult {
    return this.updateService.check()
      ? actionSucceeded('正在检查升级')
      : actionFailed('unavailable', '当前状态不能检查升级')
  }

  installUpdate(): ActionResult {
    return this.updateService.install()
      ? actionSucceeded('正在重启并安装升级')
      : actionFailed('unavailable', '尚无可安装的升级')
  }

  focus(): void {
    this.window.show()
    this.window.focus()
  }

  private installWindowLifecycle(): void {
    this.window.on('resize', () => {
      this.layout()
      this.scheduleBoundsPersistence()
    })
    this.window.on('move', () => {
      this.scheduleBoundsPersistence()
    })
    this.window.on('close', (event) => {
      if (this.closePersistenceStarted) {
        return
      }

      event.preventDefault()
      this.closePersistenceStarted = true
      this.closing = true
      this.clearRevealTimer()
      if (this.boundsTimer) {
        clearTimeout(this.boundsTimer)
        this.boundsTimer = undefined
      }
      if (this.currentUrlTimer) {
        clearTimeout(this.currentUrlTimer)
        this.currentUrlTimer = undefined
      }

      void Promise.all([
        this.drainCurrentUrlPersistence(),
        this.options.sceneStore.setWindowBounds(this.window.getBounds()),
      ])
        .catch(() => {
          console.warn('窗口状态未能在关闭前完整持久化')
        })
        .finally(() => {
          this.window.destroy()
          if (isQuitting) {
            app.quit()
          }
        })
    })
    this.window.on('closed', () => {
      this.closing = true
      this.clearRevealTimer()
      if (this.boundsTimer) {
        clearTimeout(this.boundsTimer)
      }
      if (this.currentUrlTimer) {
        clearTimeout(this.currentUrlTimer)
        this.currentUrlTimer = undefined
      }
      if (this.stateSendImmediate) {
        clearImmediate(this.stateSendImmediate)
        this.stateSendImmediate = undefined
      }
      this.flushCurrentUrlPersistence()
      this.permissionController?.dispose()
      this.permissionController = undefined
      this.downloadManager.dispose()
      this.updateService.dispose()
      closeWebContents(this.chromeView.webContents)
      closeWebContents(this.windowChromeView.webContents)
      closeWebContents(this.sceneView.webContents)
      this.options.onClosed()
    })
  }

  private layout(): void {
    const [width = 0, height = 0] = this.window.getContentSize()
    const layout = calculateWindowViewLayout(width, height, this.presentationMode, {
      presentation: this.controlPresentation,
      rowCount: this.controlRowCount,
    })
    this.windowChromeView.setBounds(layout.windowChrome)
    this.windowChromeView.setVisible(layout.windowChromeVisible)
    this.sceneView.setBounds(layout.scene)
    this.sceneView.setBorderRadius(layout.sceneBorderRadius)
    this.chromeView.setBounds(layout.control)
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
    this.sceneView.webContents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) {
        this.permissionController?.cancelPendingRequests()
      }
    })
    this.sceneView.webContents.on('did-navigate', (_event, url) => {
      this.handleCommittedNavigation(url)
    })
    this.sceneView.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) {
        this.handleCommittedNavigation(url)
      }
    })

    this.chromeView.webContents.on('will-navigate', (details) => {
      if (details.url !== chromeDocumentUrl) {
        details.preventDefault()
      }
    })
    this.chromeView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    const guardWindowChromeNavigation = (details: {
      url: string
      preventDefault: () => void
    }): void => {
      if (details.url !== windowChromeDocumentUrl) {
        details.preventDefault()
      }
    }
    this.windowChromeView.webContents.on('will-navigate', guardWindowChromeNavigation)
    this.windowChromeView.webContents.on('will-redirect', guardWindowChromeNavigation)
    this.windowChromeView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  }

  private handleCommittedNavigation(url: string): void {
    this.permissionController?.cancelPendingRequests()
    const displayUrl = displayableSceneUrl(url)
    this.scheduleCurrentUrlPersistence(displayUrl || null)
    this.sendState()
  }

  private scheduleCurrentUrlPersistence(url: string | null): void {
    this.pendingCurrentUrl = url
    if (this.currentUrlTimer || this.currentUrlWriteInFlight || this.closing) {
      return
    }
    this.currentUrlTimer = setTimeout(() => {
      this.currentUrlTimer = undefined
      this.flushCurrentUrlPersistence()
    }, CURRENT_SCENE_URL_DEBOUNCE_MS)
    this.currentUrlTimer.unref()
  }

  private flushCurrentUrlPersistence(): void {
    if (this.currentUrlWriteInFlight || this.pendingCurrentUrl === undefined) {
      return
    }
    const url = this.pendingCurrentUrl
    this.pendingCurrentUrl = undefined
    const operation = this.options.sceneStore.setCurrentSceneUrl(url).then(() => undefined)
    this.currentUrlWriteInFlight = operation
    void operation
      .catch(() => {
        console.warn('当前场景地址未能持久化')
      })
      .finally(() => {
        if (this.currentUrlWriteInFlight === operation) {
          this.currentUrlWriteInFlight = undefined
        }
        if (this.pendingCurrentUrl !== undefined) {
          if (this.closing) {
            this.flushCurrentUrlPersistence()
          } else {
            this.currentUrlTimer = setTimeout(() => {
              this.currentUrlTimer = undefined
              this.flushCurrentUrlPersistence()
            }, CURRENT_SCENE_URL_DEBOUNCE_MS)
            this.currentUrlTimer.unref()
          }
        }
      })
  }

  private async drainCurrentUrlPersistence(): Promise<void> {
    while (this.pendingCurrentUrl !== undefined || this.currentUrlWriteInFlight) {
      this.flushCurrentUrlPersistence()
      const operation = this.currentUrlWriteInFlight
      if (operation) {
        await operation.catch(() => undefined)
      }
    }
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
        this.showChrome('navigate')
      } else if (commandModifier && input.shift && key === 'p') {
        event.preventDefault()
        this.showChrome('command')
      } else if (commandModifier && input.shift && key === 's') {
        event.preventDefault()
        void this.captureScreenshot()
      } else if (commandModifier && key === 's') {
        event.preventDefault()
        this.showChrome('scenes')
      } else if (commandModifier && key === ',') {
        event.preventDefault()
        this.showChrome('permissions')
      } else if (commandModifier && key === 'j') {
        event.preventDefault()
        this.showChrome('downloads')
      } else if (commandModifier && key === 'u') {
        event.preventDefault()
        this.showChrome('update')
      } else if (commandModifier && key === 'r') {
        event.preventDefault()
        this.reload()
      } else if (input.alt && input.key === 'ArrowLeft') {
        event.preventDefault()
        this.goBack()
      } else if (input.alt && input.key === 'ArrowRight') {
        event.preventDefault()
        this.goForward()
      } else if (input.key === 'Escape' && this.chromeVisible) {
        event.preventDefault()
        this.hideChrome()
      }
    }

    this.sceneView.webContents.on('before-input-event', handleInput)
    this.chromeView.webContents.on('before-input-event', handleInput)
  }

  private scheduleBoundsPersistence(): void {
    if (this.boundsTimer) {
      clearTimeout(this.boundsTimer)
    }
    this.boundsTimer = setTimeout(() => {
      this.boundsTimer = undefined
      void this.options.sceneStore.setWindowBounds(this.window.getBounds()).catch(() => {
        console.warn('窗口位置未能持久化')
      })
    }, WINDOW_BOUNDS_DEBOUNCE_MS)
    this.boundsTimer.unref()
  }

  private sendState(focusMode?: FocusMode): void {
    if (focusMode) {
      this.focusMode = focusMode
      if (!this.chromeVisible) {
        this.showChrome(focusMode)
        return
      }
    }
    if (!this.chromeVisible || this.chromeView.webContents.isDestroyed()) {
      return
    }
    if (this.stateSendImmediate) {
      return
    }

    this.stateSendImmediate = setImmediate(() => {
      this.stateSendImmediate = undefined
      if (!this.chromeVisible || this.chromeView.webContents.isDestroyed()) {
        return
      }
      const history = this.sceneView.webContents.navigationHistory
      const state: ChromeState = {
        currentUrl: displayableSceneUrl(this.sceneView.webContents.getURL()),
        canGoBack: history.canGoBack(),
        canGoForward: history.canGoForward(),
        scenes: this.scenes,
        downloads: this.downloads,
        permissionRecords: this.permissionRecords,
        permissionPrompt: this.permissionPrompt,
        update: this.update,
        focusMode: this.focusMode,
      }
      this.chromeView.webContents.send(IPC_CHANNELS.showChrome, state)
    })
    this.stateSendImmediate.unref()
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
let isQuitting = false

function isVisibleBounds(bounds: Electron.Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return (
      bounds.x < area.x + area.width &&
      bounds.x + bounds.width > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + bounds.height > area.y
    )
  })
}

function trustedWindowFor(event: IpcMainInvokeEvent): FoscenWindow {
  if (!activeWindow || !activeWindow.ownsChromeSender(event)) {
    throw new Error('拒绝来自非受信任页面的 IPC 请求')
  }
  return activeWindow
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.dismissChrome, (event) => trustedWindowFor(event).hideChrome())
  ipcMain.handle(IPC_CHANNELS.rendererReady, (event) => trustedWindowFor(event).markRendererReady())
  ipcMain.handle(IPC_CHANNELS.requestControlSize, (event, request) =>
    trustedWindowFor(event).requestControlSize(request),
  )
  ipcMain.handle(IPC_CHANNELS.navigate, (event, candidate) =>
    trustedWindowFor(event).navigate(candidate),
  )
  ipcMain.handle(IPC_CHANNELS.goBack, (event) => trustedWindowFor(event).goBack())
  ipcMain.handle(IPC_CHANNELS.goForward, (event) => trustedWindowFor(event).goForward())
  ipcMain.handle(IPC_CHANNELS.reload, (event) => trustedWindowFor(event).reload())
  ipcMain.handle(IPC_CHANNELS.saveScene, (event, name) => trustedWindowFor(event).saveScene(name))
  ipcMain.handle(IPC_CHANNELS.openScene, (event, id) => trustedWindowFor(event).openScene(id))
  ipcMain.handle(IPC_CHANNELS.deleteScene, (event, id) => trustedWindowFor(event).deleteScene(id))
  ipcMain.handle(IPC_CHANNELS.captureScreenshot, (event) =>
    trustedWindowFor(event).captureScreenshot(),
  )
  ipcMain.handle(IPC_CHANNELS.approveDownload, (event, id) =>
    trustedWindowFor(event).approveDownload(id),
  )
  ipcMain.handle(IPC_CHANNELS.rejectDownload, (event, id) =>
    trustedWindowFor(event).rejectDownload(id),
  )
  ipcMain.handle(IPC_CHANNELS.respondPermission, (event, id, decision, lifetime) =>
    trustedWindowFor(event).respondPermission(id, decision, lifetime),
  )
  ipcMain.handle(IPC_CHANNELS.revokePermission, (event, origin, permission) =>
    trustedWindowFor(event).revokePermission(origin, permission),
  )
  ipcMain.handle(IPC_CHANNELS.checkForUpdates, (event) => trustedWindowFor(event).checkForUpdates())
  ipcMain.handle(IPC_CHANNELS.installUpdate, (event) => trustedWindowFor(event).installUpdate())
}

async function createWindow(): Promise<void> {
  if (activeWindow) {
    activeWindow.focus()
    return
  }

  const sceneStore = createSceneStore(app)
  const permissionStore = createPermissionStore(app)
  const nextWindow = await FoscenWindow.create({
    sceneStore,
    permissionStore,
    onClosed: () => {
      activeWindow = undefined
    },
  })
  activeWindow = nextWindow
  await nextWindow.initialize()
}

function failStartup(error: unknown): void {
  console.error('Foscen failed to start:', error instanceof Error ? error.message : error)
  app.exit(1)
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    activeWindow?.focus()
  })

  void app
    .whenReady()
    .then(async () => {
      app.setAboutPanelOptions({
        applicationName: 'Foscen',
        applicationVersion: app.getVersion(),
        copyright: 'Copyright © 2026 ConteMan',
        website: 'https://github.com/ConteMan/foscen',
      })
      installApplicationMenu()
      registerIpcHandlers()
      await createWindow()

      app.on('activate', () => {
        void createWindow().catch(failStartup)
      })
    })
    .catch(failStartup)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
})

app.on('select-client-certificate', (event, _contents, _url, _certificates, callback) => {
  event.preventDefault()
  callback()
})

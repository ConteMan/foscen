import type { DownloadSnapshot, DownloadStatus } from '../shared/downloads.js'
import type { ActionResult } from '../shared/ipc.js'
import type {
  PermissionDecision,
  PermissionLifetime,
  PermissionRecord,
  SupportedPermission,
} from '../shared/permissions.js'
import type { Scene } from '../shared/scenes.js'
import type { ChromeState, FocusMode } from '../shared/ui-state.js'

const PANEL_NAMES = ['command', 'scenes', 'downloads', 'permissions', 'update'] as const
type PanelName = (typeof PANEL_NAMES)[number]
type StatusTone = 'neutral' | 'success' | 'error'

const permissionLabels: Record<SupportedPermission, string> = {
  camera: '摄像头',
  microphone: '麦克风',
  geolocation: '位置',
  notifications: '通知',
  'clipboard-sanitized-write': '写入剪贴板',
}

const permissionDecisionLabels: Record<PermissionDecision, string> = {
  allow: '允许',
  deny: '拒绝',
}

const permissionLifetimeLabels: Record<PermissionLifetime, string> = {
  once: '一次',
  session: '本次会话',
  persistent: '始终',
}

const downloadStatusLabels: Record<DownloadStatus, string> = {
  'awaiting-approval': '等待审批',
  downloading: '下载中',
  paused: '已暂停',
  completed: '已完成',
  cancelled: '已取消',
  interrupted: '已中断',
  rejected: '已拒绝',
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Foscen chrome markup is incomplete: ${selector}`)
  }
  return element
}

const navigationForm = requiredElement<HTMLFormElement>('[data-navigation-form]')
const urlInput = requiredElement<HTMLInputElement>('[data-url-input]')
const sceneForm = requiredElement<HTMLFormElement>('[data-scene-form]')
const sceneNameInput = requiredElement<HTMLInputElement>('[data-scene-name]')
const statusElement = requiredElement<HTMLElement>('[data-status]')
const backButton = requiredElement<HTMLButtonElement>('[data-back]')
const forwardButton = requiredElement<HTMLButtonElement>('[data-forward]')
const sceneList = requiredElement<HTMLElement>('[data-scene-list]')
const sceneEmpty = requiredElement<HTMLElement>('[data-scene-empty]')
const sceneCount = requiredElement<HTMLElement>('[data-scene-count]')
const downloadList = requiredElement<HTMLElement>('[data-download-list]')
const downloadEmpty = requiredElement<HTMLElement>('[data-download-empty]')
const downloadCount = requiredElement<HTMLElement>('[data-download-count]')
const permissionPrompt = requiredElement<HTMLElement>('[data-permission-prompt]')
const permissionTitle = requiredElement<HTMLElement>('[data-permission-title]')
const permissionOrigin = requiredElement<HTMLElement>('[data-permission-origin]')
const permissionList = requiredElement<HTMLElement>('[data-permission-list]')
const permissionEmpty = requiredElement<HTMLElement>('[data-permission-empty]')
const permissionCount = requiredElement<HTMLElement>('[data-permission-count]')
const updateTitle = requiredElement<HTMLElement>('[data-update-title]')
const updateMessage = requiredElement<HTMLElement>('[data-update-message]')
const updateVersion = requiredElement<HTMLElement>('[data-update-version]')
const updateCheckButton = requiredElement<HTMLButtonElement>('[data-update-check]')
const updateInstallButton = requiredElement<HTMLButtonElement>('[data-update-install]')
const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-panel-target]'))
const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'))

let latestState: ChromeState | undefined
let activePanel: PanelName = 'command'
let lastFocusedMode: FocusMode | undefined

function isPanelName(value: unknown): value is PanelName {
  return typeof value === 'string' && PANEL_NAMES.some((candidate) => candidate === value)
}

function setStatus(message: string, tone: StatusTone = 'neutral'): void {
  statusElement.textContent = message
  statusElement.dataset.tone = tone
}

async function runAction(operation: () => Promise<ActionResult>): Promise<boolean> {
  try {
    const result = await operation()
    if (!result.ok) {
      setStatus(result.error, 'error')
      return false
    }

    setStatus(result.message, 'success')
    return true
  } catch {
    setStatus('操作失败，请重试', 'error')
    return false
  }
}

function switchPanel(name: PanelName, focusTab = false): void {
  activePanel = name

  for (const panel of panels) {
    panel.hidden = panel.dataset.panel !== name
  }

  for (const tab of tabButtons) {
    const selected = tab.dataset.panelTarget === name
    tab.setAttribute('aria-selected', selected ? 'true' : 'false')
    tab.tabIndex = selected ? 0 : -1
    if (selected && focusTab) {
      tab.focus()
    }
  }
}

function button(label: string, action: () => void, className?: string): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = label
  if (className) {
    element.className = className
  }
  element.addEventListener('click', action)
  return element
}

function itemShell(
  title: string,
  metadata: readonly string[],
): {
  item: HTMLElement
  actions: HTMLElement
} {
  const item = document.createElement('article')
  item.className = 'list-item'

  const copy = document.createElement('div')
  copy.className = 'item-copy'
  const heading = document.createElement('strong')
  heading.textContent = title
  copy.append(heading)

  const meta = document.createElement('p')
  meta.className = 'item-meta'
  for (const value of metadata) {
    const part = document.createElement('span')
    part.textContent = value
    part.title = value
    meta.append(part)
  }
  copy.append(meta)

  const actions = document.createElement('div')
  actions.className = 'item-actions'
  item.append(copy, actions)
  return { item, actions }
}

function renderScenes(scenes: readonly Scene[]): void {
  sceneList.replaceChildren()
  sceneCount.textContent = String(scenes.length)
  sceneEmpty.hidden = scenes.length > 0

  for (const scene of scenes) {
    const { item, actions } = itemShell(scene.name, [scene.url])
    actions.append(
      button(
        '打开',
        () => {
          void runAction(() => window.foscen.openScene(scene.id))
        },
        'primary-button',
      ),
      button(
        '删除',
        () => {
          if (!window.confirm(`删除场景“${scene.name}”？`)) {
            return
          }
          void runAction(() => window.foscen.deleteScene(scene.id))
        },
        'danger-button',
      ),
    )
    sceneList.append(item)
  }
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB'] as const
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const divisor = 1024 ** unitIndex
  const precision = unitIndex === 0 ? 0 : 1
  return `${(value / divisor).toFixed(precision)} ${units[unitIndex]}`
}

function downloadProgress(download: DownloadSnapshot): string {
  if (download.totalBytes > 0) {
    return `${formatBytes(download.receivedBytes)} / ${formatBytes(download.totalBytes)}`
  }
  return formatBytes(download.receivedBytes)
}

function renderDownloads(downloads: readonly DownloadSnapshot[]): void {
  downloadList.replaceChildren()
  downloadCount.textContent = String(downloads.length)
  downloadEmpty.hidden = downloads.length > 0

  for (const download of downloads) {
    const metadata = [
      download.sourceOrigin,
      downloadStatusLabels[download.status],
      downloadProgress(download),
    ]
    if (download.error) {
      metadata.push(download.error)
    }

    const { item, actions } = itemShell(download.filename, metadata)
    if (download.status === 'awaiting-approval') {
      actions.append(
        button(
          '允许下载',
          () => {
            void runAction(() => window.foscen.approveDownload(download.id))
          },
          'primary-button',
        ),
        button(
          '拒绝',
          () => {
            void runAction(() => window.foscen.rejectDownload(download.id))
          },
          'danger-button',
        ),
      )
    }
    downloadList.append(item)
  }
}

function renderPermissionRecords(records: readonly PermissionRecord[]): void {
  permissionList.replaceChildren()
  permissionEmpty.hidden = records.length > 0

  for (const record of records) {
    const { item, actions } = itemShell(permissionLabels[record.permission], [
      record.origin,
      permissionDecisionLabels[record.decision],
      permissionLifetimeLabels[record.lifetime],
    ])
    actions.append(
      button(
        '撤销',
        () => {
          void runAction(() => window.foscen.revokePermission(record.origin, record.permission))
        },
        'danger-button',
      ),
    )
    permissionList.append(item)
  }
}

function renderPermissionPrompt(state: ChromeState): void {
  const prompt = state.permissionPrompt
  permissionPrompt.hidden = prompt === null
  permissionCount.hidden = prompt === null
  permissionCount.textContent = prompt === null ? '0' : '1'

  if (!prompt) {
    permissionTitle.textContent = '权限请求'
    permissionOrigin.textContent = ''
    return
  }

  permissionTitle.textContent = `请求${prompt.permissions
    .map((permission) => permissionLabels[permission])
    .join('、')}`
  permissionOrigin.textContent = prompt.origin
}

function renderUpdate(state: ChromeState): void {
  const update = state.update
  const availableVersion = update.availableVersion ?? ''
  updateVersion.textContent = availableVersion
    ? `当前 ${update.currentVersion} · 可用 ${availableVersion}`
    : `当前 ${update.currentVersion}`
  updateMessage.textContent = update.message ?? ''
  updateCheckButton.disabled = update.status === 'unsupported' || update.status === 'checking'
  updateInstallButton.hidden = update.status !== 'downloaded'

  const titles: Record<typeof update.status, string> = {
    unsupported: '此构建不支持自动升级',
    idle: '可以检查新版本',
    checking: '正在检查新版本',
    available: '发现新版本',
    downloaded: '新版本已准备好',
    'up-to-date': '已经是最新版本',
    error: '检查升级失败',
  }
  updateTitle.textContent = titles[update.status]
}

function focusMode(mode: FocusMode): void {
  if (mode === 'navigate') {
    urlInput.focus()
    urlInput.select()
    return
  }

  switchPanel(mode)
  const focusTargets: Record<PanelName, string> = {
    command: '[data-command]',
    scenes: '[data-scene-name]',
    downloads: '[data-download-list] button, [data-panel="downloads"]',
    permissions:
      '[data-permission-prompt]:not([hidden]) button, [data-permission-list] button, [data-panel="permissions"]',
    update: '[data-update-check]',
  }
  document.querySelector<HTMLElement>(focusTargets[mode])?.focus()
}

function renderState(state: ChromeState): void {
  latestState = state
  if (document.activeElement !== urlInput) {
    urlInput.value = state.currentUrl
  }
  backButton.disabled = !state.canGoBack
  forwardButton.disabled = !state.canGoForward
  renderScenes(state.scenes)
  renderDownloads(state.downloads)
  renderPermissionPrompt(state)
  renderPermissionRecords(state.permissionRecords)
  renderUpdate(state)

  const shouldFocus =
    lastFocusedMode !== state.focusMode || document.activeElement === document.body
  lastFocusedMode = state.focusMode
  if (shouldFocus) {
    window.requestAnimationFrame(() => focusMode(state.focusMode))
  } else if (state.focusMode !== 'navigate') {
    switchPanel(state.focusMode)
  }
}

navigationForm.addEventListener('submit', (event) => {
  event.preventDefault()
  void (async () => {
    try {
      const result = await window.foscen.navigate(urlInput.value)
      if (!result.ok) {
        setStatus(result.error, 'error')
        urlInput.focus()
        return
      }
      setStatus('正在打开网页', 'success')
    } catch {
      setStatus('导航失败，请重试', 'error')
    }
  })()
})

sceneForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const name = sceneNameInput.value.trim()
  if (!name) {
    setStatus('请输入场景名称', 'error')
    sceneNameInput.focus()
    return
  }

  void (async () => {
    if (await runAction(() => window.foscen.saveScene(name))) {
      sceneNameInput.value = ''
    }
  })()
})

backButton.addEventListener('click', () => {
  void window.foscen.goBack()
})

forwardButton.addEventListener('click', () => {
  void window.foscen.goForward()
})

requiredElement<HTMLButtonElement>('[data-reload]').addEventListener('click', () => {
  void window.foscen.reload()
})

requiredElement<HTMLButtonElement>('[data-dismiss]').addEventListener('click', () => {
  void window.foscen.dismissChrome()
})

for (const tab of tabButtons) {
  tab.addEventListener('click', () => {
    const name = tab.dataset.panelTarget
    if (isPanelName(name)) {
      switchPanel(name)
    }
  })

  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return
    }

    event.preventDefault()
    const currentIndex = tabButtons.indexOf(tab)
    let nextIndex: number
    if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = tabButtons.length - 1
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length
    } else {
      nextIndex = (currentIndex + 1) % tabButtons.length
    }

    const nextTab = tabButtons[nextIndex]
    const name = nextTab?.dataset.panelTarget
    if (nextTab && isPanelName(name)) {
      switchPanel(name, true)
    }
  })
}

for (const command of document.querySelectorAll<HTMLButtonElement>('[data-command]')) {
  command.addEventListener('click', () => {
    const name = command.dataset.command
    if (name === 'navigate') {
      urlInput.focus()
      urlInput.select()
    } else if (name === 'screenshot') {
      void runAction(() => window.foscen.captureScreenshot())
    } else if (isPanelName(name)) {
      switchPanel(name)
      focusMode(name)
    }
  })
}

for (const lifetimeButton of document.querySelectorAll<HTMLButtonElement>(
  '[data-permission-lifetime]',
)) {
  lifetimeButton.addEventListener('click', () => {
    const prompt = latestState?.permissionPrompt
    const lifetime = lifetimeButton.dataset.permissionLifetime
    if (!prompt || (lifetime !== 'once' && lifetime !== 'session' && lifetime !== 'persistent')) {
      return
    }
    void runAction(() => window.foscen.respondPermission(prompt.id, 'allow', lifetime))
  })
}

requiredElement<HTMLButtonElement>('[data-permission-reject]').addEventListener('click', () => {
  const prompt = latestState?.permissionPrompt
  if (prompt) {
    void runAction(() => window.foscen.respondPermission(prompt.id, 'deny', 'once'))
  }
})

updateCheckButton.addEventListener('click', () => {
  void runAction(() => window.foscen.checkForUpdates())
})

updateInstallButton.addEventListener('click', () => {
  void runAction(() => window.foscen.installUpdate())
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    void window.foscen.dismissChrome()
  }
})

window.foscen.onShowChrome((state) => {
  setStatus('控制面已就绪')
  renderState(state)
})

switchPanel(activePanel)
void window.foscen.rendererReady()

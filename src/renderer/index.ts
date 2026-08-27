import type { DownloadSnapshot, DownloadStatus } from '../shared/downloads.js'
import type { ActionResult } from '../shared/ipc.js'
import type {
  PermissionDecision,
  PermissionLifetime,
  PermissionRecord,
  SupportedPermission,
} from '../shared/permissions.js'
import type { Scene } from '../shared/scenes.js'
import type { ChromeState, ControlPresentation, FocusMode } from '../shared/ui-state.js'
import { presentationForFocusMode } from '../shared/ui-state.js'
import { buildOmnibarSuggestions, tryNormalize, type OmnibarSuggestion } from './omnibar-suggest.js'

const SURFACE_PANELS = ['scenes', 'downloads', 'permissions', 'update'] as const
type SurfacePanel = (typeof SURFACE_PANELS)[number]

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

const COMMANDS = [
  { id: 'navigate', title: '打开网页', shortcut: '⌘ L' },
  { id: 'screenshot', title: '保存截图', shortcut: '⌘ ⇧ S' },
  { id: 'scenes', title: '保存场景', shortcut: '⌘ S' },
  { id: 'downloads', title: '下载', shortcut: '⌘ J' },
  { id: 'permissions', title: '设置', shortcut: '⌘ ,' },
  { id: 'update', title: '检查更新', shortcut: '⌘ U' },
] as const

type CommandId = (typeof COMMANDS)[number]['id']

type Suggestion =
  OmnibarSuggestion | { kind: 'command'; title: string; subtitle: string; id: CommandId }

const ICON_PATHS: Record<string, string> = {
  'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  'rotate-cw': 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5',
  x: 'M18 6 6 18M6 6l12 12',
  globe:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2c3 3.5 3 16.5 0 20M12 2c-3 3.5-3 16.5 0 20',
  frame:
    'M5 8V6a1 1 0 0 1 1-1h2M16 5h2a1 1 0 0 1 1 1v2M19 16v2a1 1 0 0 1-1 1h-2M8 19H6a1 1 0 0 1-1-1v-2',
  zap: 'M4 14 14 4l-2 8h8L10 20l2-8H4Z',
  'alert-triangle':
    'm10.3 4.7-8.1 14a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3l-8.1-14a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01',
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Foscen chrome markup is incomplete: ${selector}`)
  }
  return element
}

function lucide(name: keyof typeof ICON_PATHS): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  const d = ICON_PATHS[name]
  if (!d) {
    throw new Error(`Foscen icon is missing: ${name}`)
  }
  path.setAttribute('d', d)
  svg.append(path)
  return svg
}

function maxVisibleRows(): number {
  const heightBudget = Math.floor((window.innerHeight - 90) / 40)
  return Math.min(6, Math.max(0, heightBudget || 6))
}

const omnibarRoot = requiredElement<HTMLElement>('[data-omnibar-root]')
const surfaceRoot = requiredElement<HTMLElement>('[data-surface-root]')
const omnibarInput = requiredElement<HTMLInputElement>('[data-omnibar-input]')
const omnibarLabel = requiredElement<HTMLElement>('#omnibar-label')
const field = requiredElement<HTMLElement>('[data-field]')
const list = requiredElement<HTMLElement>('#omnibar-list')
const live = requiredElement<HTMLElement>('[data-omnibar-live]')
const empty = requiredElement<HTMLElement>('[data-omnibar-empty]')
const foot = requiredElement<HTMLElement>('[data-omnibar-foot]')
const nav = requiredElement<HTMLElement>('[data-omnibar-nav]')
const backButton = requiredElement<HTMLButtonElement>('[data-back]')
const forwardButton = requiredElement<HTMLButtonElement>('[data-forward]')
const reloadButton = requiredElement<HTMLButtonElement>('[data-reload]')
const dismissOmnibar = requiredElement<HTMLButtonElement>('[data-dismiss]')
const sceneForm = requiredElement<HTMLFormElement>('[data-scene-form]')
const sceneNameInput = requiredElement<HTMLInputElement>('[data-scene-name]')
const sceneError = requiredElement<HTMLElement>('[data-scene-error]')
const statusElement = requiredElement<HTMLElement>('[data-status]')
const surfaceTitle = requiredElement<HTMLElement>('[data-surface-title]')
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
let lastOpenGeneration = -1
let lastFocusedMode: FocusMode | undefined
let localMode: FocusMode = 'navigate'
let suggestions: Suggestion[] = []
let activeIndex = 0
let overlayBusy: 'navigate' | 'screenshot' | undefined
let pendingSize: { presentation: ControlPresentation; rowCount: number } | undefined
let sizeFrame = 0

function isSurfacePanel(value: unknown): value is SurfacePanel {
  return typeof value === 'string' && SURFACE_PANELS.some((name) => name === value)
}

function scheduleControlSize(presentation: ControlPresentation, rowCount: number): void {
  pendingSize = { presentation, rowCount }
  if (sizeFrame !== 0) {
    return
  }
  sizeFrame = window.requestAnimationFrame(() => {
    sizeFrame = 0
    const request = pendingSize
    if (!request) {
      return
    }
    void window.foscen.requestControlSize(request)
  })
}

function setSurfaceStatus(message: string): void {
  statusElement.textContent = message
}

async function runAction(operation: () => Promise<ActionResult>): Promise<boolean> {
  try {
    const result = await operation()
    if (!result.ok) {
      setSurfaceStatus(result.error)
      return false
    }
    setSurfaceStatus(result.message)
    return true
  } catch {
    setSurfaceStatus('操作失败，请重试')
    return false
  }
}

function switchSurfacePanel(name: SurfacePanel, focusTab = false): void {
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
  const titles: Record<SurfacePanel, string> = {
    scenes: '场景',
    downloads: '下载',
    permissions: '权限',
    update: '升级',
  }
  surfaceTitle.textContent = titles[name]
}

function showPresentation(mode: FocusMode): void {
  localMode = mode
  const presentation = presentationForFocusMode(mode)
  const omnibar = presentation === 'omnibar'
  omnibarRoot.hidden = !omnibar
  surfaceRoot.hidden = omnibar
  omnibarRoot.classList.toggle('is-palette', mode === 'command')
  omnibarRoot.classList.toggle('is-compact', window.innerWidth < 480)
  omnibarRoot.setAttribute('aria-label', mode === 'command' ? '命令' : '打开场景')
  list.setAttribute('aria-label', mode === 'command' ? '命令' : '建议')
  omnibarLabel.textContent = mode === 'command' ? '搜索命令' : 'HTTPS 地址或场景'
  omnibarInput.placeholder = mode === 'command' ? '搜索命令' : '输入 HTTPS 地址或搜索场景'
  nav.hidden = mode === 'command'
}

function buildCommandSuggestions(query: string): Suggestion[] {
  const needle = query.trim().toLowerCase()
  return COMMANDS.filter(
    (command) =>
      !needle ||
      command.title.toLowerCase().includes(needle) ||
      command.shortcut.toLowerCase().includes(needle),
  )
    .slice(0, maxVisibleRows())
    .map((command) => ({
      kind: 'command' as const,
      title: command.title,
      subtitle: command.shortcut,
      id: command.id,
    }))
}

function iconFor(kind: Suggestion['kind']): keyof typeof ICON_PATHS {
  if (kind === 'command') {
    return 'zap'
  }
  if (kind === 'go') {
    return 'globe'
  }
  return 'frame'
}

function renderSuggestions(): void {
  list.replaceChildren()
  const busy = overlayBusy !== undefined
  empty.hidden = suggestions.length > 0 || live.textContent !== '' || busy
  list.hidden = suggestions.length === 0
  suggestions.forEach((item, index) => {
    const option = document.createElement('div')
    option.className = 'option'
    option.id = `opt-${index}`
    option.setAttribute('role', 'option')
    option.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false')
    const glyph = document.createElement('span')
    glyph.className = 'glyph'
    glyph.append(lucide(iconFor(item.kind)))
    const copy = document.createElement('span')
    copy.className = 'copy'
    const title = document.createElement('strong')
    title.textContent = item.title
    const subtitle = document.createElement('span')
    subtitle.textContent = item.subtitle
    copy.append(title, subtitle)
    option.append(glyph, copy)
    if (item.kind === 'command') {
      const key = document.createElement('kbd')
      key.textContent = item.subtitle
      option.append(key)
    }
    option.addEventListener('mouseenter', () => {
      activeIndex = index
      syncActive()
    })
    option.addEventListener('mousedown', (event) => {
      event.preventDefault()
      activeIndex = index
      void activate()
    })
    list.append(option)
  })
  syncActive()
}

function syncActive(): void {
  const options = list.querySelectorAll<HTMLElement>('[role="option"]')
  options.forEach((option, index) => {
    option.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false')
  })
  const selected = suggestions[activeIndex]
  omnibarInput.setAttribute('aria-activedescendant', selected ? `opt-${activeIndex}` : '')
}

function setLive(message: string, error = false): void {
  live.replaceChildren()
  live.classList.toggle('is-error', error)
  if (!message) {
    return
  }
  if (error) {
    live.append(lucide('alert-triangle'))
  }
  const text = document.createElement('span')
  text.textContent = message
  live.append(text)
}

function setOmnibarFoot(mode: FocusMode): void {
  foot.replaceChildren()
  const parts =
    mode === 'command' ? ['Esc 关闭', '⌘L 打开地址条'] : ['Esc 关闭', '⌘⇧P 命令', '仅 HTTPS']
  for (const part of parts) {
    const span = document.createElement('span')
    span.textContent = part
    foot.append(span)
  }
}

function refreshOmnibar(state: ChromeState): void {
  const query = omnibarInput.value
  overlayBusy = undefined
  omnibarInput.readOnly = false
  field.classList.remove('is-invalid')
  setLive('')
  setOmnibarFoot(localMode)
  if (localMode === 'command') {
    suggestions = buildCommandSuggestions(query)
    empty.textContent = '没有匹配的命令。'
  } else {
    const parsed = tryNormalize(query)
    if (query.trim() && parsed.ok === false && parsed.reason === 'https') {
      suggestions = []
      field.classList.add('is-invalid')
      setLive('仅支持 HTTPS 网页地址', true)
      empty.textContent = ''
    } else {
      suggestions = buildOmnibarSuggestions(query, state, maxVisibleRows())
      empty.textContent = '没有匹配的场景。补全 HTTPS 地址后回车。'
      if (
        query.trim() &&
        parsed.ok === false &&
        parsed.reason === 'invalid' &&
        suggestions.length === 0
      ) {
        setLive('地址格式无效', true)
      }
    }
  }
  activeIndex = 0
  renderSuggestions()
  const rows =
    suggestions.length > 0 ? suggestions.length : live.textContent || !empty.hidden ? 1 : 0
  scheduleControlSize('omnibar', rows)
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
): { item: HTMLElement; actions: HTMLElement } {
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
      button('删除', () => {
        if (!window.confirm(`删除场景“${scene.name}”？`)) {
          return
        }
        void runAction(() => window.foscen.deleteScene(scene.id))
      }),
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
  return `${(value / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
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
        button('拒绝', () => {
          void runAction(() => window.foscen.rejectDownload(download.id))
        }),
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
      button('撤销', () => {
        void runAction(() => window.foscen.revokePermission(record.origin, record.permission))
      }),
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

function focusSurface(mode: SurfacePanel): void {
  switchSurfacePanel(mode)
  const focusTargets: Record<SurfacePanel, string> = {
    scenes: '[data-scene-name]',
    downloads: '[data-download-list] button, [data-panel="downloads"]',
    permissions:
      '[data-permission-prompt]:not([hidden]) button, [data-permission-list] button, [data-panel="permissions"]',
    update: '[data-update-check]',
  }
  document.querySelector<HTMLElement>(focusTargets[mode])?.focus()
}

function applyFocus(mode: FocusMode): void {
  showPresentation(mode)
  if (presentationForFocusMode(mode) === 'omnibar') {
    scheduleControlSize('omnibar', suggestions.length || 1)
    window.requestAnimationFrame(() => {
      omnibarInput.focus()
      if (mode === 'navigate') {
        omnibarInput.select()
      }
    })
    return
  }
  scheduleControlSize('surface', 0)
  if (isSurfacePanel(mode)) {
    window.requestAnimationFrame(() => focusSurface(mode))
  }
}

function renderState(state: ChromeState): void {
  latestState = state
  backButton.disabled = !state.canGoBack
  forwardButton.disabled = !state.canGoForward
  renderScenes(state.scenes)
  renderDownloads(state.downloads)
  renderPermissionPrompt(state)
  renderPermissionRecords(state.permissionRecords)
  renderUpdate(state)
  const generationChanged = state.openGeneration !== lastOpenGeneration
  lastOpenGeneration = state.openGeneration
  const modeChanged = lastFocusedMode !== state.focusMode
  lastFocusedMode = state.focusMode
  localMode = state.focusMode
  showPresentation(state.focusMode)
  const shouldResetInput =
    generationChanged || modeChanged || document.activeElement !== omnibarInput
  if (shouldResetInput) {
    omnibarInput.value = state.focusMode === 'command' ? '' : state.currentUrl
  }
  if (presentationForFocusMode(state.focusMode) === 'omnibar') {
    refreshOmnibar(state)
  } else if (isSurfacePanel(state.focusMode)) {
    switchSurfacePanel(state.focusMode)
    scheduleControlSize('surface', 0)
  }
  const shouldFocus = generationChanged || modeChanged || document.activeElement === document.body
  if (shouldFocus) {
    window.requestAnimationFrame(() => applyFocus(state.focusMode))
  }
}

async function activate(): Promise<void> {
  const item = suggestions[activeIndex]
  if (overlayBusy === 'navigate' || overlayBusy === 'screenshot') {
    return
  }
  if (!item) {
    if (localMode !== 'navigate') {
      return
    }
    const parsed = tryNormalize(omnibarInput.value)
    if (!parsed.ok) {
      if (parsed.reason === 'https' || parsed.reason === 'invalid') {
        field.classList.add('is-invalid')
        setLive(parsed.reason === 'https' ? '仅支持 HTTPS 网页地址' : '地址格式无效', true)
        scheduleControlSize('omnibar', 1)
      }
      return
    }
    overlayBusy = 'navigate'
    omnibarInput.readOnly = true
    suggestions = []
    renderSuggestions()
    setLive('正在打开网页')
    scheduleControlSize('omnibar', 1)
    try {
      const result = await window.foscen.navigate(parsed.href)
      if (!result.ok) {
        overlayBusy = undefined
        omnibarInput.readOnly = false
        field.classList.add('is-invalid')
        setLive(
          result.error === '仅支持 HTTPS 网页地址'
            ? result.error
            : '页面加载失败，请检查网络或地址',
          true,
        )
        scheduleControlSize('omnibar', 1)
        omnibarInput.focus()
      }
    } catch {
      overlayBusy = undefined
      omnibarInput.readOnly = false
      setLive('页面加载失败，请检查网络或地址', true)
    }
    return
  }
  if (item.kind === 'go') {
    omnibarInput.value = item.href
    suggestions = []
    activeIndex = 0
    await activate()
    return
  }
  if (item.kind === 'current') {
    void window.foscen.dismissChrome()
    return
  }
  if (item.kind === 'scene') {
    overlayBusy = 'navigate'
    setLive('正在打开网页')
    scheduleControlSize('omnibar', 1)
    const result = await runAction(() => window.foscen.openScene(item.id))
    if (!result) {
      overlayBusy = undefined
    }
    return
  }
  if (item.id === 'navigate') {
    localMode = 'navigate'
    showPresentation('navigate')
    if (latestState) {
      omnibarInput.value = latestState.currentUrl
      refreshOmnibar(latestState)
      omnibarInput.focus()
      omnibarInput.select()
    }
    return
  }
  if (item.id === 'screenshot') {
    overlayBusy = 'screenshot'
    setLive('正在保存截图…')
    scheduleControlSize('omnibar', 1)
    const ok = await runAction(() => window.foscen.captureScreenshot())
    overlayBusy = undefined
    if (ok) {
      void window.foscen.dismissChrome()
    }
    return
  }
  if (isSurfacePanel(item.id)) {
    showPresentation(item.id)
    switchSurfacePanel(item.id)
    scheduleControlSize('surface', 0)
    focusSurface(item.id)
  }
}

function fillFromActive(): void {
  const item = suggestions[activeIndex]
  if (!item) {
    return
  }
  omnibarInput.value = item.kind === 'command' ? item.title : item.subtitle
  if (latestState) {
    refreshOmnibar(latestState)
  }
}

backButton.append(lucide('arrow-left'))
forwardButton.append(lucide('arrow-right'))
reloadButton.append(lucide('rotate-cw'))
dismissOmnibar.append(lucide('x'))
requiredElement<HTMLButtonElement>('[data-surface-dismiss]').append(lucide('x'))

omnibarInput.addEventListener('input', () => {
  if (latestState) {
    refreshOmnibar(latestState)
  }
})

omnibarInput.addEventListener('keydown', (event) => {
  if (omnibarRoot.hidden) {
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (suggestions.length === 0) {
      return
    }
    activeIndex = (activeIndex + 1) % suggestions.length
    syncActive()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (suggestions.length === 0) {
      return
    }
    activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length
    syncActive()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    void activate()
  } else if (event.key === 'Tab') {
    event.preventDefault()
    fillFromActive()
  }
})

backButton.addEventListener('click', () => {
  void window.foscen.goBack()
})
forwardButton.addEventListener('click', () => {
  void window.foscen.goForward()
})
reloadButton.addEventListener('click', () => {
  void window.foscen.reload()
})
dismissOmnibar.addEventListener('click', () => {
  void window.foscen.dismissChrome()
})
requiredElement<HTMLButtonElement>('[data-surface-dismiss]').addEventListener('click', () => {
  void window.foscen.dismissChrome()
})

sceneForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const name = sceneNameInput.value.trim()
  if (!name) {
    sceneNameInput.classList.add('is-invalid')
    sceneError.hidden = false
    sceneNameInput.focus()
    return
  }
  sceneNameInput.classList.remove('is-invalid')
  sceneError.hidden = true
  void (async () => {
    if (await runAction(() => window.foscen.saveScene(name))) {
      sceneNameInput.value = ''
    }
  })()
})

for (const tab of tabButtons) {
  tab.addEventListener('click', () => {
    const name = tab.dataset.panelTarget
    if (isSurfacePanel(name)) {
      switchSurfacePanel(name)
    }
  })
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return
    }
    event.preventDefault()
    const currentIndex = tabButtons.indexOf(tab)
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabButtons.length - 1
          : event.key === 'ArrowLeft'
            ? (currentIndex - 1 + tabButtons.length) % tabButtons.length
            : (currentIndex + 1) % tabButtons.length
    const nextTab = tabButtons[nextIndex]
    const name = nextTab?.dataset.panelTarget
    if (nextTab && isSurfacePanel(name)) {
      switchSurfacePanel(name, true)
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

window.addEventListener('resize', () => {
  omnibarRoot.classList.toggle('is-compact', window.innerWidth < 480)
  if (latestState && presentationForFocusMode(localMode) === 'omnibar') {
    refreshOmnibar(latestState)
  }
})

window.foscen.onShowChrome((state) => {
  setSurfaceStatus('')
  renderState(state)
})

void window.foscen.rendererReady()

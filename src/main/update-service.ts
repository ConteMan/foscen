import type { App, AutoUpdater, Event } from 'electron'

import type { UpdateSnapshot } from '../shared/updates.js'

const UPDATE_INTERVAL_MS = 10 * 60 * 1_000
const REPOSITORY = 'ConteMan/foscen'

type AppUpdateInfo = Pick<App, 'getVersion' | 'isPackaged'>

export class UpdateService {
  private state: UpdateSnapshot
  private interval: NodeJS.Timeout | undefined
  private started = false

  private readonly handleCheckingForUpdate = (): void => {
    this.setState({ status: 'checking', message: '正在检查更新…' })
  }

  private readonly handleUpdateAvailable = (): void => {
    this.setState({ status: 'available', message: '发现新版本，正在安全下载…' })
  }

  private readonly handleUpdateNotAvailable = (): void => {
    this.setState({ status: 'up-to-date', message: '当前已是最新版本' })
  }

  private readonly handleUpdateDownloaded = (
    _event: Event,
    _notes: string,
    releaseName: string,
  ): void => {
    const availableVersion = normalizeReleaseName(releaseName)
    this.setState({
      status: 'downloaded',
      message: availableVersion ? `Foscen ${availableVersion} 已准备好安装` : '新版本已准备好安装',
      ...(availableVersion ? { availableVersion } : {}),
    })
  }

  private readonly handleError = (): void => {
    this.setState({ status: 'error', message: '无法检查更新，请稍后重试' })
  }

  constructor(
    private readonly appInfo: AppUpdateInfo,
    private readonly updater: AutoUpdater,
    private readonly onChanged: (snapshot: UpdateSnapshot) => void,
    private readonly platform = process.platform,
    private readonly architecture = process.arch,
  ) {
    this.state = {
      status: this.isSupported() ? 'idle' : 'unsupported',
      currentVersion: appInfo.getVersion(),
      message: this.isSupported() ? '尚未检查更新' : '自动升级仅在已安装的 macOS 版本中可用',
    }
  }

  start(): void {
    if (this.started) {
      return
    }
    this.started = true

    if (!this.isSupported()) {
      this.emit()
      return
    }

    this.updater.on('checking-for-update', this.handleCheckingForUpdate)
    this.updater.on('update-available', this.handleUpdateAvailable)
    this.updater.on('update-not-available', this.handleUpdateNotAvailable)
    this.updater.on('update-downloaded', this.handleUpdateDownloaded)
    this.updater.on('error', this.handleError)

    try {
      this.updater.setFeedURL({ url: this.feedUrl() })
    } catch {
      this.setState({ status: 'error', message: '自动升级初始化失败' })
      return
    }

    this.check()
    this.interval = setInterval(() => {
      this.check()
    }, UPDATE_INTERVAL_MS)
    this.interval.unref()
  }

  snapshot(): UpdateSnapshot {
    return { ...this.state }
  }

  dispose(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = undefined
    }
    this.updater.off('checking-for-update', this.handleCheckingForUpdate)
    this.updater.off('update-available', this.handleUpdateAvailable)
    this.updater.off('update-not-available', this.handleUpdateNotAvailable)
    this.updater.off('update-downloaded', this.handleUpdateDownloaded)
    this.updater.off('error', this.handleError)
  }

  check(): boolean {
    if (
      !this.isSupported() ||
      ['checking', 'available', 'downloaded'].includes(this.state.status)
    ) {
      return false
    }

    try {
      this.setState({ status: 'checking', message: '正在检查更新…' })
      this.updater.checkForUpdates()
      return true
    } catch {
      this.setState({ status: 'error', message: '无法检查更新，请稍后重试' })
      return false
    }
  }

  install(): boolean {
    if (this.state.status !== 'downloaded') {
      return false
    }

    this.updater.quitAndInstall()
    return true
  }

  private isSupported(): boolean {
    return this.platform === 'darwin' && this.appInfo.isPackaged
  }

  private feedUrl(): string {
    return `https://update.electronjs.org/${REPOSITORY}/darwin-${this.architecture}/${this.appInfo.getVersion()}`
  }

  private setState(next: Omit<UpdateSnapshot, 'currentVersion'>): void {
    this.state = {
      ...next,
      currentVersion: this.appInfo.getVersion(),
    }
    this.emit()
  }

  private emit(): void {
    this.onChanged(this.snapshot())
  }
}

function normalizeReleaseName(candidate: unknown): string | undefined {
  if (typeof candidate !== 'string') {
    return undefined
  }

  const trimmed = candidate.trim().replace(/^v/, '')
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(trimmed) ? trimmed : undefined
}

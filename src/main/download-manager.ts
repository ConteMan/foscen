import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import { chmod, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import type { DownloadItem, Event, Session, WebContents } from 'electron'

import type { DownloadSnapshot } from '../shared/downloads.js'
import { httpsOrigin, isSafeHttpsUrl, publishStagedFile, sanitizeFilename } from './safe-files.js'

const MAX_ACTIVE_DOWNLOADS = 5
const MAX_DOWNLOAD_HISTORY = 20
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024
const APPROVAL_TIMEOUT_MS = 60_000

interface ManagedDownload {
  readonly item: DownloadItem
  readonly stagingPath: string
  completedPath: string | undefined
  readonly snapshot: DownloadSnapshot
  approvalTimeout: NodeJS.Timeout | undefined
}

export interface DownloadManagerOptions {
  readonly session: Session
  readonly sceneContents: WebContents
  readonly downloadDirectory: string
  readonly onChanged: (downloads: DownloadSnapshot[], requestAttention: boolean) => void
}

export class DownloadManager {
  private readonly downloads = new Map<string, ManagedDownload>()
  private readonly stagingDirectory: string
  private disposed = false

  constructor(private readonly options: DownloadManagerOptions) {
    mkdirSync(options.downloadDirectory, { mode: 0o700, recursive: true })
    this.stagingDirectory = join(options.downloadDirectory, '.foscen-staging')
    mkdirSync(this.stagingDirectory, { mode: 0o700, recursive: true })
    chmodSync(this.stagingDirectory, 0o700)
    options.session.on('will-download', this.onWillDownload)
  }

  list(): DownloadSnapshot[] {
    return [...this.downloads.values()]
      .map(({ snapshot }) => ({ ...snapshot }))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  }

  approve(id: unknown): boolean {
    const managed = this.find(id)
    if (!managed || managed.snapshot.status !== 'awaiting-approval') {
      return false
    }

    this.clearApprovalTimeout(managed)
    managed.snapshot.status = 'downloading'
    managed.item.resume()
    this.emit(false)
    return true
  }

  reject(id: unknown): boolean {
    const managed = this.find(id)
    if (!managed || managed.snapshot.status !== 'awaiting-approval') {
      return false
    }

    this.clearApprovalTimeout(managed)
    managed.snapshot.status = 'rejected'
    managed.snapshot.completedAt = new Date().toISOString()
    this.emit(false)
    managed.item.cancel()
    return true
  }

  cancel(id: unknown): boolean {
    const managed = this.find(id)
    if (
      !managed ||
      !['awaiting-approval', 'downloading', 'paused'].includes(managed.snapshot.status)
    ) {
      return false
    }

    this.clearApprovalTimeout(managed)
    managed.snapshot.status = 'cancelled'
    managed.snapshot.completedAt = new Date().toISOString()
    this.emit(false)
    managed.item.cancel()
    return true
  }

  completedPath(id: unknown): string | undefined {
    const managed = this.find(id)
    return managed?.snapshot.status === 'completed' ? managed.completedPath : undefined
  }

  dispose(): void {
    this.disposed = true
    this.options.session.off('will-download', this.onWillDownload)
    for (const managed of this.downloads.values()) {
      this.clearApprovalTimeout(managed)
      if (
        ['awaiting-approval', 'downloading', 'paused', 'interrupted'].includes(
          managed.snapshot.status,
        )
      ) {
        managed.snapshot.status = 'cancelled'
        managed.item.cancel()
      }
      void this.removeStagingFile(managed.stagingPath)
    }
  }

  private readonly onWillDownload = (
    event: Event,
    item: DownloadItem,
    webContents: WebContents,
  ): void => {
    if (webContents !== this.options.sceneContents) {
      event.preventDefault()
      return
    }

    this.handleDownload(item)
  }

  private handleDownload(item: DownloadItem): void {
    const sourceUrl = item.getURL()
    const sourceOrigin = httpsOrigin(sourceUrl)
    const urlChain = [...item.getURLChain(), sourceUrl]
    const activeCount = [...this.downloads.values()].filter(({ snapshot }) =>
      ['awaiting-approval', 'downloading', 'paused'].includes(snapshot.status),
    ).length
    const totalBytes = item.getTotalBytes()

    if (
      !sourceOrigin ||
      !urlChain.every(isSafeHttpsUrl) ||
      !item.hasUserGesture() ||
      activeCount >= MAX_ACTIVE_DOWNLOADS ||
      totalBytes > MAX_DOWNLOAD_BYTES
    ) {
      item.cancel()
      return
    }

    const id = randomUUID()
    const filename = sanitizeFilename(item.getFilename())
    const stagingPath = join(this.stagingDirectory, `${id}.part`)
    item.setSavePath(stagingPath)
    item.pause()

    const managed: ManagedDownload = {
      item,
      stagingPath,
      completedPath: undefined,
      approvalTimeout: undefined,
      snapshot: {
        id,
        filename,
        sourceOrigin,
        receivedBytes: item.getReceivedBytes(),
        totalBytes,
        status: 'awaiting-approval',
        startedAt: new Date().toISOString(),
      },
    }

    managed.approvalTimeout = setTimeout(() => {
      if (managed.snapshot.status === 'awaiting-approval') {
        this.reject(id)
      }
    }, APPROVAL_TIMEOUT_MS)
    managed.approvalTimeout.unref()

    item.on('updated', (_event, state) => {
      if (isTerminalStatus(managed.snapshot.status)) {
        return
      }
      managed.snapshot.receivedBytes = item.getReceivedBytes()
      managed.snapshot.totalBytes = item.getTotalBytes()
      if (exceedsDownloadLimit(managed.snapshot)) {
        this.clearApprovalTimeout(managed)
        managed.snapshot.error = '文件超过 2 GiB 安全限制'
        managed.snapshot.status = 'cancelled'
        managed.item.cancel()
        this.emit(false)
        return
      }
      if (['downloading', 'paused', 'interrupted'].includes(managed.snapshot.status)) {
        managed.snapshot.status =
          state === 'interrupted'
            ? item.canResume()
              ? 'paused'
              : 'interrupted'
            : item.isPaused()
              ? 'paused'
              : 'downloading'
      }
      this.emit(false)
    })

    item.once('done', (_event, state) => {
      void this.finishDownload(managed, state)
    })

    this.downloads.set(id, managed)
    this.emit(true)
  }

  private async finishDownload(
    managed: ManagedDownload,
    state: 'completed' | 'cancelled' | 'interrupted',
  ): Promise<void> {
    this.clearApprovalTimeout(managed)
    managed.snapshot.receivedBytes = managed.item.getReceivedBytes()
    managed.snapshot.totalBytes = managed.item.getTotalBytes()
    managed.snapshot.completedAt = new Date().toISOString()

    if (isTerminalStatus(managed.snapshot.status)) {
      await this.removeStagingFile(managed.stagingPath)
    } else if (exceedsDownloadLimit(managed.snapshot)) {
      managed.snapshot.status = 'cancelled'
      managed.snapshot.error = '文件超过 2 GiB 安全限制'
      await this.removeStagingFile(managed.stagingPath)
    } else if (state === 'completed') {
      try {
        await waitForStagingFile(managed.stagingPath)
        if ((await stat(managed.stagingPath)).size > MAX_DOWNLOAD_BYTES) {
          managed.snapshot.status = 'cancelled'
          managed.snapshot.error = '文件超过 2 GiB 安全限制'
          await this.removeStagingFile(managed.stagingPath)
          this.trimHistory()
          this.emit(false)
          return
        }
        managed.completedPath = await publishStagedFile(
          managed.stagingPath,
          this.options.downloadDirectory,
          managed.snapshot.filename,
        )
        managed.snapshot.status = 'completed'
      } catch {
        managed.snapshot.status = 'interrupted'
        managed.snapshot.error = '下载完成，但未能安全保存文件'
        await this.removeStagingFile(managed.stagingPath)
      }
    } else {
      if (!['rejected', 'cancelled'].includes(managed.snapshot.status)) {
        managed.snapshot.status = state
      }
      await this.removeStagingFile(managed.stagingPath)
    }

    this.trimHistory()
    this.emit(false)
  }

  private find(id: unknown): ManagedDownload | undefined {
    return typeof id === 'string' ? this.downloads.get(id) : undefined
  }

  private clearApprovalTimeout(managed: ManagedDownload): void {
    if (managed.approvalTimeout) {
      clearTimeout(managed.approvalTimeout)
      managed.approvalTimeout = undefined
    }
  }

  private emit(requestAttention: boolean): void {
    if (!this.disposed) {
      this.options.onChanged(this.list(), requestAttention)
    }
  }

  private trimHistory(): void {
    const terminal = [...this.downloads.entries()]
      .filter(([, { snapshot }]) =>
        ['completed', 'cancelled', 'interrupted', 'rejected'].includes(snapshot.status),
      )
      .sort(([, left], [, right]) =>
        right.snapshot.startedAt.localeCompare(left.snapshot.startedAt),
      )

    for (const [id] of terminal.slice(MAX_DOWNLOAD_HISTORY)) {
      this.downloads.delete(id)
    }
  }

  private async removeStagingFile(path: string): Promise<void> {
    try {
      await unlink(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('未能清理未完成的下载文件')
      }
    }
  }
}

function exceedsDownloadLimit(snapshot: DownloadSnapshot): boolean {
  return snapshot.receivedBytes > MAX_DOWNLOAD_BYTES || snapshot.totalBytes > MAX_DOWNLOAD_BYTES
}

function isTerminalStatus(status: DownloadSnapshot['status']): boolean {
  return ['completed', 'cancelled', 'interrupted', 'rejected'].includes(status)
}

async function waitForStagingFile(path: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await chmod(path, 0o600)
      return
    } catch (error) {
      lastError = error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 1))
    }
  }
  throw lastError
}

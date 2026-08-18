import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import type { DownloadItem, Event, Session, WebContents } from 'electron'

import { DownloadManager } from '../src/main/download-manager.js'
import type { DownloadSnapshot } from '../src/shared/downloads.js'

const TWO_GIB = 2 * 1024 * 1024 * 1024

class FakeSession extends EventEmitter {}

class FakeDownloadItem extends EventEmitter {
  savePath: string | undefined
  pauseCalls = 0
  resumeCalls = 0
  cancelCalls = 0
  receivedBytes = 0
  totalBytes = 1024
  paused = false
  resumable = true

  constructor(
    readonly url = 'https://download.example/files/artifact.pdf',
    readonly urlChain: string[] = ['https://download.example/start'],
    readonly gesture = true,
    readonly filename = 'artifact.pdf',
  ) {
    super()
  }

  getURL(): string {
    return this.url
  }

  getURLChain(): string[] {
    return [...this.urlChain]
  }

  hasUserGesture(): boolean {
    return this.gesture
  }

  getFilename(): string {
    return this.filename
  }

  getReceivedBytes(): number {
    return this.receivedBytes
  }

  getTotalBytes(): number {
    return this.totalBytes
  }

  setSavePath(path: string): void {
    this.savePath = path
  }

  pause(): void {
    this.pauseCalls += 1
    this.paused = true
  }

  resume(): void {
    this.resumeCalls += 1
    this.paused = false
  }

  cancel(): void {
    this.cancelCalls += 1
  }

  isPaused(): boolean {
    return this.paused
  }

  canResume(): boolean {
    return this.resumable
  }
}

interface FakeDownloadEvent {
  prevented: boolean
  preventDefault(): void
}

interface DownloadHarness {
  readonly directory: string
  readonly session: FakeSession
  readonly sceneContents: WebContents
  readonly manager: DownloadManager
  readonly notifications: Array<{
    downloads: DownloadSnapshot[]
    requestAttention: boolean
  }>
}

async function withManager(run: (harness: DownloadHarness) => Promise<void> | void): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'foscen-download-manager-'))
  const directory = join(root, 'downloads')
  const session = new FakeSession()
  const sceneContents = {} as WebContents
  const notifications: DownloadHarness['notifications'] = []
  const manager = new DownloadManager({
    session: session as unknown as Session,
    sceneContents,
    downloadDirectory: directory,
    onChanged(downloads, requestAttention) {
      notifications.push({ downloads, requestAttention })
    },
  })

  try {
    await run({ directory, session, sceneContents, manager, notifications })
  } finally {
    manager.dispose()
    await rm(root, { recursive: true, force: true })
  }
}

function downloadEvent(): FakeDownloadEvent {
  return {
    prevented: false,
    preventDefault() {
      this.prevented = true
    },
  }
}

function emitDownload(
  harness: DownloadHarness,
  item: FakeDownloadItem,
  webContents = harness.sceneContents,
): FakeDownloadEvent {
  const event = downloadEvent()
  harness.session.emit(
    'will-download',
    event as unknown as Event,
    item as unknown as DownloadItem,
    webContents,
  )
  return event
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (predicate()) {
      return
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
  }
  assert.fail('等待异步下载状态超时')
}

async function waitForSettled(
  harness: DownloadHarness,
  status: DownloadSnapshot['status'],
): Promise<void> {
  await waitFor(() =>
    harness.notifications.some(({ downloads }) => downloads[0]?.status === status),
  )
}

test('只接收 scene WebContents 发起的下载', async () => {
  await withManager((harness) => {
    const item = new FakeDownloadItem()
    const event = emitDownload(harness, item, {} as WebContents)

    assert.equal(event.prevented, true)
    assert.equal(item.pauseCalls, 0)
    assert.equal(item.cancelCalls, 0)
    assert.deepEqual(harness.manager.list(), [])
  })
})

test('完整 URL 链必须是无凭据 HTTPS 且下载必须来自用户手势', async () => {
  await withManager((harness) => {
    const valid = new FakeDownloadItem('https://cdn.example/artifact.pdf', [
      'https://app.example/export',
      'https://cdn.example/redirect',
    ])
    emitDownload(harness, valid)
    assert.equal(valid.pauseCalls, 1)
    assert.equal(valid.cancelCalls, 0)
    assert.equal(harness.manager.list()[0]?.status, 'awaiting-approval')

    const insecureRedirect = new FakeDownloadItem('https://cdn.example/file', [
      'https://app.example/export',
      'http://cdn.example/redirect',
    ])
    emitDownload(harness, insecureRedirect)
    assert.equal(insecureRedirect.cancelCalls, 1)

    const credentialedRedirect = new FakeDownloadItem('https://cdn.example/file', [
      'https://user:secret@app.example/export',
    ])
    emitDownload(harness, credentialedRedirect)
    assert.equal(credentialedRedirect.cancelCalls, 1)

    const noGesture = new FakeDownloadItem(
      'https://cdn.example/file',
      ['https://app.example/export'],
      false,
    )
    emitDownload(harness, noGesture)
    assert.equal(noGesture.cancelCalls, 1)
  })
})

test('下载审批只允许首个终态生效', async () => {
  await withManager((harness) => {
    const approved = new FakeDownloadItem()
    emitDownload(harness, approved)
    const approvedId = harness.manager.list()[0]?.id
    assert.ok(approvedId)

    assert.equal(harness.manager.approve(approvedId), true)
    assert.equal(harness.manager.reject(approvedId), false)
    assert.equal(harness.manager.approve(approvedId), false)
    assert.equal(approved.resumeCalls, 1)
    assert.equal(approved.cancelCalls, 0)

    const rejected = new FakeDownloadItem('https://download.example/second.pdf')
    emitDownload(harness, rejected)
    const rejectedId = harness.manager
      .list()
      .find((download) => download.filename === 'artifact.pdf' && download.id !== approvedId)?.id
    assert.ok(rejectedId)

    assert.equal(harness.manager.reject(rejectedId), true)
    assert.equal(harness.manager.approve(rejectedId), false)
    assert.equal(harness.manager.reject(rejectedId), false)
    assert.equal(rejected.resumeCalls, 0)
    assert.equal(rejected.cancelCalls, 1)
  })
})

test('下载过程中超过 2 GiB 会立即取消', async () => {
  await withManager((harness) => {
    const item = new FakeDownloadItem()
    emitDownload(harness, item)
    const id = harness.manager.list()[0]?.id
    assert.ok(id)
    assert.equal(harness.manager.approve(id), true)

    item.totalBytes = TWO_GIB + 1
    item.receivedBytes = TWO_GIB + 1
    item.emit('updated', {} as Event, 'progressing')

    assert.equal(item.cancelCalls, 1)
    assert.equal(harness.manager.list()[0]?.status, 'cancelled')
    assert.equal(harness.manager.list()[0]?.error, '文件超过 2 GiB 安全限制')
  })
})

test('完成下载时以排他方式发布且不覆盖同名文件', async () => {
  await withManager(async (harness) => {
    await writeFile(join(harness.directory, 'artifact.pdf'), 'existing')
    const item = new FakeDownloadItem()
    emitDownload(harness, item)
    const id = harness.manager.list()[0]?.id
    assert.ok(id)
    assert.ok(item.savePath)
    const stagingPath = item.savePath

    await writeFile(stagingPath, 'fresh')
    assert.equal(harness.manager.approve(id), true)
    item.receivedBytes = 5
    item.totalBytes = 5
    item.emit('done', {} as Event, 'completed')

    await waitForSettled(harness, 'completed')
    const completedPath = harness.manager.completedPath(id)
    assert.ok(completedPath)
    assert.equal(completedPath, join(harness.directory, 'artifact-1.pdf'))
    assert.equal(await readFile(join(harness.directory, 'artifact.pdf'), 'utf8'), 'existing')
    assert.equal(await readFile(completedPath, 'utf8'), 'fresh')
    await assert.rejects(access(stagingPath))
  })
})

test('完成事件仍会复验最终字节数并拒绝超限文件', async () => {
  await withManager(async (harness) => {
    const item = new FakeDownloadItem()
    emitDownload(harness, item)
    const id = harness.manager.list()[0]?.id
    assert.ok(id)
    assert.ok(item.savePath)
    await writeFile(item.savePath, 'oversized-by-metadata')
    assert.equal(harness.manager.approve(id), true)

    item.receivedBytes = TWO_GIB + 1
    item.totalBytes = TWO_GIB + 1
    item.emit('done', {} as Event, 'completed')

    await waitForSettled(harness, 'cancelled')
    assert.equal(harness.manager.list()[0]?.error, '文件超过 2 GiB 安全限制')
    assert.equal(harness.manager.completedPath(id), undefined)
    await assert.rejects(access(item.savePath))
  })
})

test('dispose 注销 will-download 并只取消活动下载一次', async () => {
  await withManager((harness) => {
    const item = new FakeDownloadItem()
    emitDownload(harness, item)
    assert.equal(harness.session.listenerCount('will-download'), 1)

    harness.manager.dispose()
    harness.manager.dispose()

    assert.equal(harness.session.listenerCount('will-download'), 0)
    assert.equal(item.cancelCalls, 1)
  })
})

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import type { App, AutoUpdater, FeedURLOptions } from 'electron'

import {
  UPDATE_ERROR_CHECK,
  UPDATE_ERROR_INSTALL,
  UPDATE_ERROR_PREPARE,
  UpdateService,
} from '../src/main/update-service.js'

class FakeUpdater extends EventEmitter {
  feedUrl = ''
  checks = 0
  installs = 0

  setFeedURL(options: FeedURLOptions): void {
    this.feedUrl = options.url
  }

  checkForUpdates(): void {
    this.checks += 1
  }

  quitAndInstall(): void {
    this.installs += 1
  }
}

function appInfo(packaged: boolean): Pick<App, 'getVersion' | 'isPackaged'> {
  return { isPackaged: packaged, getVersion: () => '0.2.0' }
}

test('开发环境默认禁用自动升级且不会请求网络', () => {
  const updater = new FakeUpdater()
  const service = new UpdateService(
    appInfo(false),
    updater as unknown as AutoUpdater,
    () => undefined,
    'darwin',
    'arm64',
  )

  service.start()
  assert.equal(service.snapshot().status, 'unsupported')
  assert.equal(updater.checks, 0)
  assert.equal(service.check(), false)
})

test('已打包 macOS 使用固定公共 feed 并阻止并发检查', () => {
  const updater = new FakeUpdater()
  const snapshots: string[] = []
  const service = new UpdateService(
    appInfo(true),
    updater as unknown as AutoUpdater,
    (snapshot) => snapshots.push(snapshot.status),
    'darwin',
    'arm64',
  )

  service.start()
  assert.equal(updater.feedUrl, 'https://update.electronjs.org/ConteMan/foscen/darwin-arm64/0.2.0')
  assert.equal(updater.checks, 1)
  assert.equal(service.snapshot().status, 'checking')
  assert.equal(service.check(), false)

  updater.emit('update-not-available')
  assert.equal(service.snapshot().status, 'up-to-date')
  assert.equal(service.check(), true)
  assert.equal(updater.checks, 2)
  assert.ok(snapshots.includes('checking'))
  service.dispose()
  assert.equal(updater.listenerCount('checking-for-update'), 0)
  assert.equal(updater.listenerCount('update-available'), 0)
  assert.equal(updater.listenerCount('update-not-available'), 0)
  assert.equal(updater.listenerCount('update-downloaded'), 0)
  assert.equal(updater.listenerCount('error'), 0)
})

test('只有已下载的规范版本才能触发安装', () => {
  const updater = new FakeUpdater()
  const service = new UpdateService(
    appInfo(true),
    updater as unknown as AutoUpdater,
    () => undefined,
    'darwin',
    'arm64',
  )
  service.start()

  assert.equal(service.install(), false)
  updater.emit('update-downloaded', {}, '', 'v0.3.0', new Date(), 'https://example.invalid')
  assert.deepEqual(service.snapshot(), {
    status: 'downloaded',
    currentVersion: '0.2.0',
    availableVersion: '0.3.0',
    message: 'Foscen 0.3.0 已准备好安装',
  })
  assert.equal(service.install(), true)
  assert.equal(updater.installs, 1)
  service.dispose()
})

test('检查阶段失败仍说无法检查更新，并记录真实错误', () => {
  const updater = new FakeUpdater()
  const logged: unknown[] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    logged.push(args)
  }
  const service = new UpdateService(
    appInfo(true),
    updater as unknown as AutoUpdater,
    () => undefined,
    'darwin',
    'arm64',
  )

  try {
    service.start()
    updater.emit('error', Object.assign(new Error('feed HTTP 500'), { code: 'ENOTFOUND' }))
    assert.equal(service.snapshot().status, 'error')
    assert.equal(service.snapshot().message, UPDATE_ERROR_CHECK)
    assert.ok(logged.some((entry) => String(entry).includes('feed HTTP 500')))
    assert.ok(logged.some((entry) => String(entry).includes('phase=checking')))
  } finally {
    console.error = originalError
    service.dispose()
  }
})

test('下载后失败时的文案不得是无法检查更新', () => {
  const updater = new FakeUpdater()
  const logged: unknown[] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    logged.push(args)
  }
  const service = new UpdateService(
    appInfo(true),
    updater as unknown as AutoUpdater,
    () => undefined,
    'darwin',
    'arm64',
  )

  try {
    service.start()
    updater.emit('update-available')
    const failure = Object.assign(new Error('The update is improperly signed'), { code: 8 })
    updater.emit('error', failure)
    assert.equal(service.snapshot().status, 'error')
    assert.equal(service.snapshot().message, UPDATE_ERROR_PREPARE)
    assert.notEqual(service.snapshot().message, UPDATE_ERROR_CHECK)
    assert.doesNotMatch(service.snapshot().message ?? '', /无法检查更新/)
    assert.ok(logged.some((entry) => String(entry).includes('The update is improperly signed')))
    assert.ok(logged.some((entry) => String(entry).includes('phase=downloading')))
  } finally {
    console.error = originalError
    service.dispose()
  }
})

test('已下载后再失败使用安装失败文案', () => {
  const updater = new FakeUpdater()
  const originalError = console.error
  console.error = () => undefined
  const service = new UpdateService(
    appInfo(true),
    updater as unknown as AutoUpdater,
    () => undefined,
    'darwin',
    'arm64',
  )
  try {
    service.start()
    updater.emit('update-downloaded', {}, '', 'v0.2.1', new Date(), 'https://example.invalid')
    updater.emit('error', new Error('quitAndInstall rejected'))
    assert.equal(service.snapshot().message, UPDATE_ERROR_INSTALL)
    assert.notEqual(service.snapshot().message, UPDATE_ERROR_CHECK)
  } finally {
    console.error = originalError
    service.dispose()
  }
})

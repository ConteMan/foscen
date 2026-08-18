import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import type { App, AutoUpdater, FeedURLOptions } from 'electron'

import { UpdateService } from '../src/main/update-service.js'

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

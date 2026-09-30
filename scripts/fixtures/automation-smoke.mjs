import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { readFile, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import electron from 'electron'

async function run() {
  const { app, BaseWindow, ipcMain, session } = electron
  const dataArgument = process.argv.find((argument) => argument.startsWith('--user-data-dir='))
  assert.ok(dataArgument)
  app.setPath('userData', dataArgument.slice('--user-data-dir='.length))
  const require = createRequire(import.meta.url)
  const home = mkdtempSync(join(tmpdir(), 'foscen-automation-home-'))
  const originalGetPath = app.getPath.bind(app)
  app.getPath = (name) => (name === 'home' ? home : originalGetPath(name))
  app.setAsDefaultProtocolClient = () => true
  const focusCalls = []
  const contents = []
  const navigations = []
  const handlers = new Map()
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, handler) => {
    handlers.set(channel, handler)
    originalHandle(channel, handler)
  }
  app.focus = () => focusCalls.push('app.focus')
  BaseWindow.prototype.focus = () => focusCalls.push('window.focus')
  const originalShow = BaseWindow.prototype.show
  BaseWindow.prototype.show = function () {
    focusCalls.push('window.show')
    return originalShow.call(this)
  }
  app.on('web-contents-created', (_event, target) => {
    contents.push(target)
    target.focus = () => focusCalls.push('webContents.focus')
    target.on('did-navigate', (_navigation, url) => {
      if (url.startsWith('https://')) navigations.push(url)
    })
  })
  app.whenReady().then(() => {
    session.fromPartition('persist:foscen-scenes').protocol.handle(
      'https',
      () =>
        new Response('<!doctype html><title>Automation fixture</title><p>HTTPS fixture</p>', {
          headers: { 'content-type': 'text/html' },
        }),
    )
  })

  async function until(predicate) {
    const deadline = Date.now() + 12_000
    while (!predicate()) {
      assert.ok(
        Date.now() < deadline,
        `Electron automation fixture timed out: ${JSON.stringify({ argv: process.argv, navigations, documents: contents.map((target) => target.getURL()), handlers: [...handlers.keys()] })}`,
      )
      await delay(20)
    }
    await delay(40)
  }

  async function emitUrl(url) {
    let prevented = false
    app.emit(
      'open-url',
      {
        preventDefault: () => {
          prevented = true
        },
      },
      url,
    )
    assert.equal(prevented, true)
  }

  try {
    const dataDirectory = app.getPath('userData')
    mkdirSync(dataDirectory, { recursive: true })
    const timestamp = '2026-09-30T00:00:00.000Z'
    writeFileSync(
      join(dataDirectory, 'scenes.json'),
      JSON.stringify({
        schemaVersion: 1,
        scenes: [
          {
            id: 'saved-smoke',
            name: 'Smoke',
            url: 'https://example.test/saved',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        currentSceneUrl: null,
        windowBounds: null,
      }),
    )
    require('../../dist/main/index.js')
    await emitUrl('foscen://scene/saved-smoke')
    await until(() => navigations.includes('https://example.test/saved'))
    assert.deepEqual(navigations, ['https://example.test/cli', 'https://example.test/saved'])
    assert.deepEqual(focusCalls, [])

    await emitUrl('foscen://open?url=https%3A%2F%2Fexample.test%2Fwarm&form=reserved')
    await until(() => navigations.includes('https://example.test/warm'))
    app.emit('activate', {}, true)
    assert.deepEqual(focusCalls, [])
    const beforeRejected = [...navigations]
    for (const url of [
      'foscen://open?url=http://example.test',
      'foscen://scene/missing',
      'foscen://macro/saved-smoke',
      'foscen://unknown',
    ])
      await emitUrl(url)
    await delay(100)
    assert.deepEqual(navigations, beforeRejected)
    assert.deepEqual(focusCalls, [])

    app.emit('second-instance', {}, ['Foscen', 'foscen://open?url=https://example.test/second'])
    await until(() => navigations.includes('https://example.test/second'))
    assert.deepEqual(focusCalls, [])

    const control = contents.find((target) => target.getURL().endsWith('/renderer/index.html'))
    const scene = contents.find((target) => target.getURL().startsWith('https://'))
    assert.ok(control && scene)
    const trustedEvent = { sender: control, senderFrame: control.mainFrame }
    const providerDirectory = join(home, 'Library', 'Application Support', 'Kinvo', 'providers')
    const register = handlers.get('kinvo:register')
    const unregister = handlers.get('kinvo:unregister')
    for (const handler of [register, unregister]) {
      await assert.rejects(
        () => handler({ sender: scene, senderFrame: scene.mainFrame }),
        /非受信任/,
      )
      await assert.rejects(
        () => handler({ sender: control, senderFrame: { url: control.getURL() } }),
        /非受信任/,
      )
      assert.equal((await handler(trustedEvent, '/tmp/untrusted')).ok, false)
    }
    assert.deepEqual(await readdir(home), [])
    assert.equal((await register(trustedEvent)).ok, true)
    const manifest = JSON.parse(await readFile(join(providerDirectory, 'foscen.json'), 'utf8'))
    assert.equal(manifest.protocol, 'kinvo.actions/0')
    assert.equal(await scene.executeJavaScript('typeof window.foscen'), 'undefined')
    assert.equal(await control.executeJavaScript('typeof window.foscen.registerKinvo'), 'function')
    assert.equal((await unregister(trustedEvent)).ok, true)
    assert.deepEqual(await readdir(providerDirectory), [])

    app.emit('second-instance', {}, ['Foscen'])
    assert.ok(focusCalls.includes('window.focus'))
    console.log('FOSCEN_AUTOMATION_SMOKE_OK')
    app.quit()
  } catch (error) {
    console.error(error)
    app.exit(1)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

void run().catch((error) => {
  console.error(error)
  electron.app.exit(1)
})

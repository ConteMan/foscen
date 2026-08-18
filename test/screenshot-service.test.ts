import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { ScreenshotService } from '../src/main/screenshot-service.js'

type Bounds = { x: number; y: number; width: number; height: number }
type SceneView = ConstructorParameters<typeof ScreenshotService>[0]
type FakeImage = {
  isEmpty(): boolean
  getSize(): { width: number; height: number }
  toPNG(): Buffer
}

const DEFAULT_BOUNDS: Bounds = { x: 0, y: 76, width: 1280, height: 724 }

function fakeImage(
  content: Buffer,
  options: {
    empty?: boolean
    size?: { width: number; height: number }
  } = {},
): FakeImage {
  return {
    isEmpty: () => options.empty ?? false,
    getSize: () => options.size ?? { width: 1280, height: 724 },
    toPNG: () => content,
  }
}

function fakeSceneView(
  capturePage: (bounds: Bounds) => Promise<FakeImage>,
  bounds: Bounds = DEFAULT_BOUNDS,
): SceneView {
  return {
    getBounds: () => bounds,
    webContents: {
      getURL: () => 'https://example.com/scene',
      capturePage,
    },
  } as unknown as SceneView
}

async function temporaryPicturesDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'foscen-screenshot-service-'))
}

test('保存当前可见区域到 Pictures/Foscen 且不覆盖同名文件', async (t) => {
  const picturesDirectory = await temporaryPicturesDirectory()
  t.after(() => rm(picturesDirectory, { recursive: true, force: true }))

  const originalToISOString = Date.prototype.toISOString
  Date.prototype.toISOString = () => '2026-08-13T10:11:12.345Z'
  t.after(() => {
    Date.prototype.toISOString = originalToISOString
  })

  const requestedBounds: Bounds[] = []
  const images = [
    fakeImage(Buffer.from('first screenshot')),
    fakeImage(Buffer.from('second screenshot')),
  ]
  const sceneView = fakeSceneView(async (bounds) => {
    requestedBounds.push(bounds)
    const image = images.shift()
    assert.ok(image)
    return image
  })
  const service = new ScreenshotService(sceneView, picturesDirectory)

  const firstPath = await service.capture()
  const secondPath = await service.capture()

  assert.deepEqual(requestedBounds, [
    { x: 0, y: 0, width: DEFAULT_BOUNDS.width, height: DEFAULT_BOUNDS.height },
    { x: 0, y: 0, width: DEFAULT_BOUNDS.width, height: DEFAULT_BOUNDS.height },
  ])
  assert.equal(dirname(firstPath), join(picturesDirectory, 'Foscen'))
  assert.equal(dirname(secondPath), join(picturesDirectory, 'Foscen'))
  assert.equal(extname(firstPath), '.png')
  assert.notEqual(secondPath, firstPath)
  assert.equal(await readFile(firstPath, 'utf8'), 'first screenshot')
  assert.equal(await readFile(secondPath, 'utf8'), 'second screenshot')
  assert.equal(service.lastPath(), secondPath)
})

test('并发截图请求会拒绝第二次调用', async (t) => {
  const picturesDirectory = await temporaryPicturesDirectory()
  t.after(() => rm(picturesDirectory, { recursive: true, force: true }))

  let resolveCapture!: (image: FakeImage) => void
  const pendingCapture = new Promise<FakeImage>((resolve) => {
    resolveCapture = resolve
  })
  const service = new ScreenshotService(
    fakeSceneView(() => pendingCapture),
    picturesDirectory,
  )

  const firstCapture = service.capture()
  await assert.rejects(service.capture())

  resolveCapture(fakeImage(Buffer.from('accepted screenshot')))
  await firstCapture
})

test('可见区域超过五千万像素时在 capturePage 前拒绝', async (t) => {
  const picturesDirectory = await temporaryPicturesDirectory()
  t.after(() => rm(picturesDirectory, { recursive: true, force: true }))

  let captureCalls = 0
  const service = new ScreenshotService(
    fakeSceneView(
      async () => {
        captureCalls += 1
        return fakeImage(Buffer.from('unexpected'))
      },
      { x: 0, y: 0, width: 10_000, height: 5_001 },
    ),
    picturesDirectory,
  )

  await assert.rejects(service.capture())
  assert.equal(captureCalls, 0)
  assert.equal(service.lastPath(), undefined)
})

test('拒绝空截图', async (t) => {
  const picturesDirectory = await temporaryPicturesDirectory()
  t.after(() => rm(picturesDirectory, { recursive: true, force: true }))

  const service = new ScreenshotService(
    fakeSceneView(async () =>
      fakeImage(Buffer.alloc(0), {
        empty: true,
        size: { width: 0, height: 0 },
      }),
    ),
    picturesDirectory,
  )

  await assert.rejects(service.capture())
  assert.equal(service.lastPath(), undefined)
})

test('拒绝超过 64 MiB 的 PNG', async (t) => {
  const picturesDirectory = await temporaryPicturesDirectory()
  t.after(() => rm(picturesDirectory, { recursive: true, force: true }))

  const oversizedPng = Buffer.allocUnsafe(64 * 1024 * 1024 + 1)
  const service = new ScreenshotService(
    fakeSceneView(async () => fakeImage(oversizedPng)),
    picturesDirectory,
  )

  await assert.rejects(service.capture())
  assert.equal(service.lastPath(), undefined)
})

import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ScreenshotService } from '../src/main/screenshot-service.js'
import { calculateControlBounds } from '../src/main/window-layout.js'

// Issue #6：⌘⇧S 走的是主进程键盘分支，之前把 ActionResult 直接丢弃，chrome
// 隐藏时用户拿不到任何反馈。FoscenWindow 依赖真实 Electron，无法在
// node:test 里实例化，所以主进程接线用源码断言锁死（与
// window-chrome-contract.test.ts 同一手法）；ScreenshotService 部分用真实
// 实例验证五种失败原因互相可区分、成功只暴露文件名不暴露完整路径。

test('⌘⇧S 分支不再丢弃 ActionResult，而是转交 toast 展示流程', async () => {
  const main = await readFile('src/main/index.ts', 'utf8')

  assert.doesNotMatch(
    main,
    /key === 's'\) \{\s*event\.preventDefault\(\)\s*void this\.captureScreenshot\(\)/,
    '快捷键分支不得继续直接调用 captureScreenshot() 并丢弃结果',
  )
  assert.match(main, /void this\.captureScreenshotFromShortcut\(\)/)
  assert.match(
    main,
    /private async captureScreenshotFromShortcut\(\): Promise<void> \{\s*const result = await this\.captureScreenshot\(\)/,
  )
  assert.match(main, /captureScreenshotFromShortcut[\s\S]*?this\.showToast\(\s*result\.ok/)
})

test('面板已经可见时截图完成不弹 toast，交给现有面板内状态处理', async () => {
  const main = await readFile('src/main/index.ts', 'utf8')

  assert.match(
    main,
    /private async captureScreenshotFromShortcut\(\): Promise<void> \{[\s\S]{0,200}?if \(this\.closing \|\| this\.chromeVisible \|\| this\.chromeView\.webContents\.isDestroyed\(\)\) \{\s*return\s*\}/,
  )
  assert.match(
    main,
    /private showToast\(toast: ToastState\): void \{\s*if \(this\.chromeVisible \|\| this\.closing\) \{\s*return\s*\}/,
  )
})

test('toast 不抢焦点：showToast 不调用 chromeView.webContents.focus()', async () => {
  const main = await readFile('src/main/index.ts', 'utf8')
  const start = main.indexOf('private showToast(toast: ToastState): void {')
  const end = main.indexOf('\n  }', start)
  assert.ok(start >= 0 && end > start)
  const body = main.slice(start, end)

  assert.doesNotMatch(body, /webContents\.focus\(\)/)
  assert.match(body, /chromeView\.setVisible\(true\)/)
})

test('Esc 在 toast 展示期间立即关闭，且 showChrome 会让 toast 让位', async () => {
  const main = await readFile('src/main/index.ts', 'utf8')

  assert.match(
    main,
    /input\.key === 'Escape' && this\.toastVisible\) \{\s*event\.preventDefault\(\)\s*this\.hideToast\(\)/,
  )
  assert.match(
    main,
    /showChrome\(mode: FocusMode = 'navigate'\): void \{\s*this\.hideToastImmediate\(\)/,
  )
})

test('toast 3200ms 后自动隐藏', async () => {
  const main = await readFile('src/main/index.ts', 'utf8')

  assert.match(main, /const TOAST_DURATION_MS = 3200/)
  assert.match(
    main,
    /setTimeout\(\(\) => \{\s*this\.toastHideTimer = undefined\s*this\.hideToast\(\)\s*\}, TOAST_DURATION_MS\)/,
  )
})

test('截图成功反馈只包含文件名（basename），不包含完整路径', async () => {
  const main = await readFile('src/main/index.ts', 'utf8')

  assert.match(main, /actionSucceeded\(`已保存：\$\{basename\(savedPath\)\}`\)/)
  assert.doesNotMatch(main, /actionSucceeded\(`[^`]*\$\{savedPath\}/)
})

test('window-layout 支持 toast 布局且几何锁死（1280×800 下 420×58，y=112）', () => {
  const bounds = calculateControlBounds(1280, 800, { presentation: 'toast', rowCount: 0 })

  assert.deepEqual(bounds, { x: 430, y: 112, width: 420, height: 58 })
})

test('ScreenshotService 五种失败原因两两可区分（至少并发与尺寸超限不同）', async (t) => {
  const picturesDirectory = await mkdtemp(join(tmpdir(), 'foscen-toast-copy-'))
  t.after(() => rm(picturesDirectory, { recursive: true, force: true }))

  type SceneView = ConstructorParameters<typeof ScreenshotService>[0]

  const oversizedService = new ScreenshotService(
    {
      getBounds: () => ({ x: 0, y: 0, width: 10_000, height: 5_001 }),
      webContents: {
        getURL: () => 'https://example.com',
        capturePage: async () => {
          throw new Error('不应被调用：越界检查应在 capturePage 前拒绝')
        },
      },
    } as unknown as SceneView,
    picturesDirectory,
  )

  let sizeError: string | undefined
  try {
    await oversizedService.capture()
  } catch (error) {
    sizeError = error instanceof Error ? error.message : String(error)
  }

  let resolvePending!: (value: unknown) => void
  const pending = new Promise((resolve) => {
    resolvePending = resolve
  })
  const concurrentService = new ScreenshotService(
    {
      getBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      webContents: { getURL: () => 'https://example.com', capturePage: () => pending },
    } as unknown as SceneView,
    picturesDirectory,
  )
  const first = concurrentService.capture()
  let concurrentError: string | undefined
  try {
    await concurrentService.capture()
  } catch (error) {
    concurrentError = error instanceof Error ? error.message : String(error)
  }
  resolvePending({
    isEmpty: () => false,
    getSize: () => ({ width: 100, height: 100 }),
    toPNG: () => Buffer.from('ok'),
  })
  await first

  assert.ok(sizeError)
  assert.ok(concurrentError)
  assert.notEqual(sizeError, concurrentError)
})

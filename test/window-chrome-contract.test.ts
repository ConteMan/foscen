import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const htmlPath = 'src/window-chrome/index.html'
const cssPath = 'src/window-chrome/styles.css'

test('窗口外框只加载本地样式且不包含脚本', async () => {
  const html = await readFile(htmlPath, 'utf8')

  assert.match(html, /default-src 'none'/)
  assert.match(html, /style-src 'self'/)
  assert.doesNotMatch(html, /<script\b/i)
  assert.doesNotMatch(html, /https?:\/\//i)
})

test('只有外框顶部提供克制的 10px 拖动入口', async () => {
  const [html, css] = await Promise.all([readFile(htmlPath, 'utf8'), readFile(cssPath, 'utf8')])

  assert.match(html, /class="window-frame__drag-region"/)
  assert.match(css, /\.window-frame__drag-region\s*{[\s\S]*?height:\s*10px/)
  assert.match(css, /\.window-frame__drag-region\s*{[\s\S]*?-webkit-app-region:\s*drag/)
  assert.match(css, /\.window-frame__drag-region\s*{[\s\S]*?app-region:\s*drag/)
  assert.match(css, /cursor:\s*grab/)
  assert.doesNotMatch(css, /linear-gradient|border-bottom|box-shadow/)
})

test('窗口外框位于 scene 下方且按布局切换可见性与圆角', async () => {
  const main = await readFile('src/main/index.ts', 'utf8')
  const windowChromeIndex = main.indexOf('addChildView(this.windowChromeView)')
  const sceneIndex = main.indexOf('addChildView(this.sceneView)')
  const controlIndex = main.indexOf('addChildView(this.chromeView)')

  assert.ok(windowChromeIndex >= 0)
  assert.ok(windowChromeIndex < sceneIndex)
  assert.ok(sceneIndex < controlIndex)
  assert.match(main, /windowChromeView\.setVisible\(layout\.windowChromeVisible\)/)
  assert.match(main, /sceneView\.setBorderRadius\(layout\.sceneBorderRadius\)/)
})

test('macOS 交通灯在窗口首次显示前默认隐藏', async () => {
  const main = await readFile('src/main/index.ts', 'utf8')
  const hideButtonsIndex = main.indexOf('setWindowButtonVisibility(false)')
  const showWindowIndex = main.indexOf('this.window.show()')

  assert.ok(hideButtonsIndex >= 0)
  assert.ok(hideButtonsIndex < showWindowIndex)
})

test('控制面顶部可拖动且所有按钮与输入保持 no-drag', async () => {
  const [html, css] = await Promise.all([
    readFile('src/renderer/index.html', 'utf8'),
    readFile('src/renderer/styles.css', 'utf8'),
  ])

  assert.match(html, /<header class="panel-header">/)
  assert.match(css, /\.panel-header\s*{[\s\S]*?-webkit-app-region:\s*drag/)
  assert.match(css, /\.panel-header\s*{[\s\S]*?app-region:\s*drag/)
  assert.match(css, /button,\s*\ninput\s*{[\s\S]*?-webkit-app-region:\s*no-drag/)
  assert.match(css, /button,\s*\ninput\s*{[\s\S]*?app-region:\s*no-drag/)
})

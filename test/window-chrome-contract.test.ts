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

test('控制面 View 使用 12px 圆角，与风格乙面板一致', async () => {
  const [main, layout, css] = await Promise.all([
    readFile('src/main/index.ts', 'utf8'),
    readFile('src/main/window-layout.ts', 'utf8'),
    readFile('src/renderer/styles.css', 'utf8'),
  ])

  assert.match(layout, /CONTROL_CORNER_RADIUS = 12/)
  assert.match(main, /chromeView\.setBorderRadius\(CONTROL_CORNER_RADIUS\)/)
  assert.match(main, /chromeView\.setBackgroundColor\(CONTROL_PANEL_COLOR\)/)
  assert.match(css, /--radius:\s*12px/)
})

test('地址输入焦点环画在圆角输入壳上，而不是内层矩形 input', async () => {
  const css = await readFile('src/renderer/styles.css', 'utf8')

  assert.match(css, /\.field:focus-within\s*{[\s\S]*?outline:\s*2px solid var\(--focus\)/)
  assert.match(css, /\.field:focus-within\s*{[\s\S]*?outline-offset:\s*2px/)
  assert.match(css, /\.field input:focus-visible\s*{[\s\S]*?outline:\s*none/)
  assert.match(css, /\.omnibar\s*{[\s\S]*?grid-template-areas:/)
  assert.match(css, /\.omnibar\s*{[\s\S]*?padding-bottom:\s*8px/)
})

test('工作面焦点按选择器列表逐个尝试，不用逗号选择器抢到 tabpanel', async () => {
  const [renderer, css] = await Promise.all([
    readFile('src/renderer/index.ts', 'utf8'),
    readFile('src/renderer/styles.css', 'utf8'),
  ])

  assert.match(renderer, /function focusPreferred\(/)
  assert.match(renderer, /getAttribute\('role'\) !== 'tabpanel'/)
  assert.doesNotMatch(
    renderer,
    /querySelector<HTMLElement>\(focusTargets\[mode\]\)/,
    '不得把逗号选择器一次性交给 querySelector',
  )
  assert.doesNotMatch(css, /\[role=['"]tabpanel['"]\]:focus-visible/)
})

test('保存当前场景按钮不换行，名称输入可收缩', async () => {
  const css = await readFile('src/renderer/styles.css', 'utf8')

  assert.match(css, /\.inline-form input\s*{[\s\S]*?flex:\s*1 1 0/)
  assert.match(css, /\.inline-form input\s*{[\s\S]*?min-width:\s*0/)
  assert.match(css, /\.primary-button\s*{[\s\S]*?white-space:\s*nowrap/)
  assert.match(css, /\.primary-button\s*{[\s\S]*?flex:\s*none/)
})

test('控制面顶部有 10px 拖动条，button/input 保持 no-drag', async () => {
  const [html, css] = await Promise.all([
    readFile('src/renderer/index.html', 'utf8'),
    readFile('src/renderer/styles.css', 'utf8'),
  ])

  assert.match(html, /class="drag-strip"/)
  assert.match(css, /\.drag-strip\s*{[\s\S]*?height:\s*10px/)
  assert.match(css, /\.drag-strip\s*{[\s\S]*?-webkit-app-region:\s*drag/)
  assert.match(css, /\.drag-strip\s*{[\s\S]*?app-region:\s*drag/)
  assert.match(css, /button,\s*\ninput\s*{[\s\S]*?-webkit-app-region:\s*no-drag/)
  assert.match(css, /button,\s*\ninput\s*{[\s\S]*?app-region:\s*no-drag/)
})

test('覆盖层不放品牌标，foscen-mark.svg 只出现在关于页', async () => {
  const html = await readFile('src/renderer/index.html', 'utf8')

  const marks = html.match(/foscen-mark\.svg/g) ?? []
  assert.equal(marks.length, 1, '品牌标只能出现一次')

  const markIndex = html.indexOf('foscen-mark.svg')
  const aboutIndex = html.indexOf('class="about"')
  const omnibarIndex = html.indexOf('class="omnibar"')
  const surfaceHeaderIndex = html.indexOf('class="surface-header"')

  assert.ok(aboutIndex >= 0 && aboutIndex < markIndex, '品牌标必须在关于页区块内')
  assert.ok(omnibarIndex >= 0, '地址条区域必须存在')
  assert.ok(surfaceHeaderIndex >= 0, '工作面 header 必须存在')
  assert.ok(
    markIndex > surfaceHeaderIndex,
    '品牌标不得出现在地址条或工作面 header，只能在其后的关于页内容里',
  )
})

test('CSP 保持收紧且整份文档没有网络地址引用', async () => {
  const html = await readFile('src/renderer/index.html', 'utf8')

  assert.match(html, /default-src 'none'/)
  assert.match(html, /img-src 'self'/)
  assert.match(html, /connect-src 'none'/)
  assert.doesNotMatch(html, /https?:\/\//i)
})

test('建议行数上限按窗口宽度取 6 或 4，不由控制面自身高度反推', async () => {
  const renderer = await readFile('src/renderer/index.ts', 'utf8')

  assert.match(renderer, /MAX_VISIBLE_ROWS_COMPACT/)
  assert.match(renderer, /innerWidth < 520/)
  assert.doesNotMatch(renderer, /innerHeight\s*-\s*90/)
})

test('打开面板的兜底定时器与状态推送必须保持引用，避免二次 ⌘L 不显示', async () => {
  const main = await readFile('src/main/index.ts', 'utf8')

  assert.match(main, /private beginReveal\(/)
  assert.match(main, /this\.chromeOpenGeneration \+= 1/)
  assert.match(main, /hideChrome\(\): void \{[\s\S]*?clearStateSendImmediate\(\)/)
  assert.match(
    main,
    /requestControlSize\([\s\S]*?if \(this\.chromeVisible\) \{[\s\S]*?setVisible\(true\)/,
  )
  assert.doesNotMatch(main, /this\.revealTimer\.unref\(\)/)
  assert.doesNotMatch(main, /this\.stateSendImmediate\.unref\(\)/)
})

test('品牌红 #D05954 不得出现在 src/renderer 的任何文件里', async () => {
  const rendererFiles = ['index.ts', 'global.d.ts', 'styles.css', 'index.html']
  const contents = await Promise.all(
    rendererFiles.map((name) => readFile(`src/renderer/${name}`, 'utf8')),
  )

  contents.forEach((content, index) => {
    assert.doesNotMatch(
      content,
      /#D05954/i,
      `${rendererFiles[index]} 不得包含品牌红（覆盖层无强调色）`,
    )
  })
})

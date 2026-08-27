import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_WINDOW_PRESENTATION_MODE,
  CONTROL_CORNER_RADIUS,
  WINDOW_FRAME_INSET,
  WINDOW_SCENE_CORNER_RADIUS,
  calculateControlBounds,
  calculateWindowViewLayout,
  clampRowCount,
  maxVisibleRowsFor,
} from '../src/main/window-layout.js'

test('默认边框模式将 scene 四边等距内缩且窗口外框位于完整内容区', () => {
  const layout = calculateWindowViewLayout(1280, 800)

  assert.equal(DEFAULT_WINDOW_PRESENTATION_MODE, 'frame')
  assert.equal(WINDOW_FRAME_INSET, 10)
  assert.equal(layout.windowChromeVisible, true)
  assert.deepEqual(layout.windowChrome, { x: 0, y: 0, width: 1280, height: 800 })
  assert.deepEqual(layout.scene, { x: 10, y: 10, width: 1260, height: 780 })
  assert.equal(layout.sceneBorderRadius, WINDOW_SCENE_CORNER_RADIUS)
  assert.equal(CONTROL_CORNER_RADIUS, 12)
})

test('极简模式铺满 scene 并彻底隐藏常驻窗口外框', () => {
  const layout = calculateWindowViewLayout(1280, 800, 'minimal')

  assert.equal(layout.windowChromeVisible, false)
  assert.deepEqual(layout.scene, { x: 0, y: 0, width: 1280, height: 800 })
  assert.equal(layout.sceneBorderRadius, 0)
})

test('异常小的输入会收缩边框但仍返回非空布局', () => {
  const layout = calculateWindowViewLayout(0, 0)

  assert.deepEqual(layout.windowChrome, { x: 0, y: 0, width: 1, height: 1 })
  assert.deepEqual(layout.scene, { x: 0, y: 0, width: 1, height: 1 })
  assert.equal(layout.sceneBorderRadius, 0)
  assert.ok(layout.control.width >= 1)
  assert.ok(layout.control.height >= 1)
})

test('1280×800 下契约锁死的五个验收数字全部命中', () => {
  const cases: ReadonlyArray<{
    readonly label: string
    readonly presentation: 'omnibar' | 'surface'
    readonly rowCount: number
    readonly expected: { width: number; height: number; y: number }
  }> = [
    {
      label: 'omnibar 4 行',
      presentation: 'omnibar',
      rowCount: 4,
      expected: { width: 640, height: 250, y: 112 },
    },
    {
      label: 'omnibar 3 行',
      presentation: 'omnibar',
      rowCount: 3,
      expected: { width: 640, height: 210, y: 112 },
    },
    {
      label: 'omnibar 1 行',
      presentation: 'omnibar',
      rowCount: 1,
      expected: { width: 640, height: 130, y: 112 },
    },
    {
      label: 'omnibar 6 行',
      presentation: 'omnibar',
      rowCount: 6,
      expected: { width: 640, height: 330, y: 112 },
    },
    {
      label: 'surface',
      presentation: 'surface',
      rowCount: 0,
      expected: { width: 720, height: 420, y: 80 },
    },
  ]

  for (const { label, presentation, rowCount, expected } of cases) {
    const bounds = calculateControlBounds(1280, 800, { presentation, rowCount })
    assert.equal(bounds.width, expected.width, `${label} 宽度`)
    assert.equal(bounds.height, expected.height, `${label} 高度`)
    assert.equal(bounds.y, expected.y, `${label} y`)
    assert.equal(bounds.x, Math.round((1280 - expected.width) / 2), `${label} x 居中`)
  }
})

test('窄窗 W<520 时行数上限降到 4 且尺寸不越界', () => {
  assert.equal(maxVisibleRowsFor(519, 800), 4)
  assert.equal(maxVisibleRowsFor(520, 800), 6)

  const bounds = calculateControlBounds(400, 800, { presentation: 'omnibar', rowCount: 6 })
  assert.equal(bounds.height, 90 + 4 * 40)
  assert.ok(bounds.width <= 400)
  assert.ok(bounds.x >= 0)
})

test('矮窗 H<400 时行数上限降到 4 且尺寸不越界', () => {
  assert.equal(maxVisibleRowsFor(1280, 399), 4)
  assert.equal(maxVisibleRowsFor(1280, 400), 6)

  const bounds = calculateControlBounds(1280, 300, { presentation: 'omnibar', rowCount: 6 })
  assert.equal(bounds.height, 90 + 4 * 40)
  assert.ok(bounds.y >= 0)
})

test('rowCount 越界（负数、超上限、小数、NaN）一律被主进程钳制', () => {
  assert.equal(clampRowCount(-3, 6), 0)
  assert.equal(clampRowCount(7, 6), 6)
  assert.equal(clampRowCount(3.9, 6), 3)
  assert.equal(clampRowCount(Number.NaN, 6), 0)
  assert.equal(clampRowCount(2, 6), 2)

  const overLimit = calculateControlBounds(1280, 800, { presentation: 'omnibar', rowCount: 99 })
  assert.equal(overLimit.height, 90 + 6 * 40)

  const negative = calculateControlBounds(1280, 800, { presentation: 'omnibar', rowCount: -1 })
  assert.equal(negative.height, 90)

  const fractional = calculateControlBounds(1280, 800, { presentation: 'omnibar', rowCount: 3.9 })
  assert.equal(fractional.height, 90 + 3 * 40)

  const notANumber = calculateControlBounds(1280, 800, {
    presentation: 'omnibar',
    rowCount: Number.NaN,
  })
  assert.equal(notANumber.height, 90)
})

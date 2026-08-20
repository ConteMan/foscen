import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_WINDOW_PRESENTATION_MODE,
  WINDOW_FRAME_INSET,
  WINDOW_SCENE_CORNER_RADIUS,
  calculateWindowViewLayout,
} from '../src/main/window-layout.js'

test('默认边框模式将 scene 四边等距内缩且窗口外框位于完整内容区', () => {
  const layout = calculateWindowViewLayout(1280, 800)

  assert.equal(DEFAULT_WINDOW_PRESENTATION_MODE, 'frame')
  assert.equal(WINDOW_FRAME_INSET, 10)
  assert.equal(layout.windowChromeVisible, true)
  assert.deepEqual(layout.windowChrome, { x: 0, y: 0, width: 1280, height: 800 })
  assert.deepEqual(layout.scene, { x: 10, y: 10, width: 1260, height: 780 })
  assert.equal(layout.sceneBorderRadius, WINDOW_SCENE_CORNER_RADIUS)
})

test('极简模式铺满 scene 并彻底隐藏常驻窗口外框', () => {
  const layout = calculateWindowViewLayout(1280, 800, 'minimal')

  assert.equal(layout.windowChromeVisible, false)
  assert.deepEqual(layout.scene, { x: 0, y: 0, width: 1280, height: 800 })
  assert.equal(layout.sceneBorderRadius, 0)
})

test('控制面在两种模式下避开窗口顶部并保持既有最大尺寸与侧边距', () => {
  assert.deepEqual(calculateWindowViewLayout(1280, 800, 'frame').control, {
    x: 52,
    y: 44,
    width: 1176,
    height: 530,
  })
  assert.deepEqual(calculateWindowViewLayout(720, 540, 'frame').control, {
    x: 36,
    y: 44,
    width: 648,
    height: 488,
  })
  assert.deepEqual(calculateWindowViewLayout(720, 540, 'minimal').control, {
    x: 36,
    y: 44,
    width: 648,
    height: 488,
  })
})

test('异常小的输入会收缩边框但仍返回非空布局', () => {
  const layout = calculateWindowViewLayout(0, 0)

  assert.deepEqual(layout.windowChrome, { x: 0, y: 0, width: 1, height: 1 })
  assert.deepEqual(layout.scene, { x: 0, y: 0, width: 1, height: 1 })
  assert.equal(layout.sceneBorderRadius, 0)
  assert.equal(layout.control.width, 1)
  assert.equal(layout.control.height, 1)
})

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  InvalidSceneUrlError,
  displayableSceneUrl,
  isAllowedSceneNavigation,
  normalizeSceneUrl,
} from '../src/main/url-policy.js'

test('为裸域名补齐 HTTPS 协议', () => {
  assert.equal(normalizeSceneUrl('example.com/path'), 'https://example.com/path')
})

test('规范化合法的 HTTPS 地址', () => {
  assert.equal(normalizeSceneUrl(' https://example.com/a?q=1 '), 'https://example.com/a?q=1')
})

test('拒绝 HTTP、外部协议和带凭据的地址', () => {
  for (const candidate of [
    'http://example.com',
    'file:///tmp/a',
    'javascript:alert(1)',
    'https://user:secret@example.com',
  ]) {
    assert.throws(() => normalizeSceneUrl(candidate), InvalidSceneUrlError)
  }
})

test('拒绝非字符串、空值和超长地址', () => {
  assert.throws(() => normalizeSceneUrl(42), InvalidSceneUrlError)
  assert.throws(() => normalizeSceneUrl('   '), InvalidSceneUrlError)
  assert.throws(() => normalizeSceneUrl(`https://${'a'.repeat(2050)}.com`), InvalidSceneUrlError)
})

test('页面导航只允许 HTTPS 和精确的内置落地页', () => {
  const landing = 'file:///Applications/Foscen/scene/index.html'

  assert.equal(isAllowedSceneNavigation(landing, landing), true)
  assert.equal(isAllowedSceneNavigation('https://example.com', landing), true)
  assert.equal(isAllowedSceneNavigation('https://user:secret@example.com', landing), false)
  assert.equal(isAllowedSceneNavigation(`https://example.com/${'a'.repeat(2050)}`, landing), false)
  assert.equal(isAllowedSceneNavigation('http://example.com', landing), false)
  assert.equal(isAllowedSceneNavigation('file:///tmp/other.html', landing), false)
})

test('仅向命令栏显示 HTTPS 地址', () => {
  assert.equal(displayableSceneUrl('https://example.com'), 'https://example.com/')
  assert.equal(displayableSceneUrl('https://user:secret@example.com'), '')
  assert.equal(displayableSceneUrl('file:///internal/index.html'), '')
  assert.equal(displayableSceneUrl('not a url'), '')
})

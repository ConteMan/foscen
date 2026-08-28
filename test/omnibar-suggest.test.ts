import assert from 'node:assert/strict'
import test from 'node:test'

import { buildOmnibarSuggestions, tryNormalize } from '../src/renderer/omnibar-suggest.js'
import type { Scene } from '../src/shared/scenes.js'

const currentUrl = 'https://example.com/'

function scene(id: string, name: string, url: string, updatedAt: string): Scene {
  return { id, name, url, createdAt: updatedAt, updatedAt }
}

const catalog: readonly Scene[] = [
  scene('1', '文档', 'https://docs.example.com/', '2026-08-02T00:00:00.000Z'),
  scene('2', 'Conte 笔记', 'https://notes.example.org/conte', '2026-08-03T00:00:00.000Z'),
  scene('3', '旧站', 'https://legacy.example.net/', '2026-08-01T00:00:00.000Z'),
]

test('为带点的裸域名补齐 HTTPS 并作为前往', () => {
  assert.deepEqual(tryNormalize('example.org/path'), {
    ok: true,
    href: 'https://example.org/path',
  })
  const rows = buildOmnibarSuggestions('example.org', { currentUrl, scenes: catalog }, 6)
  assert.equal(rows[0]?.kind, 'go')
  assert.equal(rows[0] && rows[0].kind === 'go' ? rows[0].href : '', 'https://example.org/')
})

test('显式 http / 凭据 / 其它协议只返回空建议，由调用方渲染 HTTPS 错误', () => {
  for (const query of [
    'http://example.com',
    'https://user:secret@example.com',
    'javascript:alert(1)',
  ]) {
    const parsed = tryNormalize(query)
    assert.equal(parsed.ok, false)
    assert.equal(parsed.ok ? undefined : parsed.reason, 'https')
    assert.deepEqual(buildOmnibarSuggestions(query, { currentUrl, scenes: catalog }, 6), [])
  }
})

test('输入等于当前 URL 时只有当前场景，没有前往', () => {
  const rows = buildOmnibarSuggestions(currentUrl, { currentUrl, scenes: catalog }, 6)
  assert.deepEqual(
    rows.map((row) => row.kind),
    ['current', 'scene', 'scene', 'scene'],
  )
})

test('空查询列出当前和最近场景，排除当前 URL', () => {
  const rows = buildOmnibarSuggestions('', { currentUrl, scenes: catalog }, 6)
  assert.deepEqual(
    rows.map((row) => (row.kind === 'scene' ? row.title : row.kind)),
    ['current', 'Conte 笔记', '文档', '旧站'],
  )
})

test('场景按名称或 URL 子串匹配，最多 6 条', () => {
  const many = Array.from({ length: 8 }, (_, index) =>
    scene(
      String(index),
      `场景 ${index}`,
      `https://s${index}.example.com/`,
      `2026-08-0${index + 1}`,
    ),
  )
  const rows = buildOmnibarSuggestions('场景', { currentUrl, scenes: many }, 6)
  assert.equal(rows.length, 6)
  assert.ok(rows.every((row) => row.kind === 'scene' || row.kind === 'go'))
})

test('无点主机名不当作网址，走查询而不是前往', () => {
  assert.deepEqual(tryNormalize('conte'), { ok: false, reason: 'query' })
  const rows = buildOmnibarSuggestions('conte', { currentUrl, scenes: catalog }, 6)
  assert.ok(rows.every((row) => row.kind !== 'go'))
  assert.equal(
    rows.some((row) => row.kind === 'scene' && row.title === 'Conte 笔记'),
    true,
  )
})

test('带空格的输入不能规范化，无匹配时得到空列表', () => {
  assert.deepEqual(tryNormalize('foo bar'), { ok: false, reason: 'query' })
  const rows = buildOmnibarSuggestions('foo bar', { currentUrl, scenes: catalog }, 6)
  assert.deepEqual(rows, [])
})

test('显式 https 单标签主机仍可前往', () => {
  assert.deepEqual(tryNormalize('https://conte/'), { ok: true, href: 'https://conte/' })
})

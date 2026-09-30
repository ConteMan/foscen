import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ExternalUrlQueue,
  MAX_EXTERNAL_URL_LENGTH,
  MAX_PENDING_EXTERNAL_URLS,
  dispatchExternalUrl,
  parseExternalUrl,
  registerFoscenProtocol,
} from '../src/main/external-url.js'

function harness() {
  const navigations: string[] = []
  const lookups: string[] = []
  const logs: string[] = []
  const dependencies = {
    getScene: async (id: string) => {
      lookups.push(id)
      return id === 'saved-123' ? { url: 'https://example.com/saved' } : null
    },
    navigate: async (url: string) => {
      navigations.push(url)
      return { ok: true as const, url }
    },
    log: (message: string) => logs.push(message),
  }
  return { navigations, lookups, logs, dependencies }
}

test('HTTPS 打开动作规范化并仅记录被忽略的保留参数名', async () => {
  const context = harness()
  assert.deepEqual(
    await dispatchExternalUrl(
      'foscen://open?url=https%3A%2F%2Fexample.com%2Fa%3Fq%3D1%26x%3D2&form=secret&rule=private',
      context.dependencies,
    ),
    { ok: true },
  )
  assert.deepEqual(context.navigations, ['https://example.com/a?q=1&x=2'])
  assert.deepEqual(context.lookups, [])
  assert.deepEqual(context.logs, ['外部 URL：忽略保留参数 form', '外部 URL：忽略保留参数 rule'])
})

test('原始查询拒绝未编码加号，百分号编码加号保持路径不变', async () => {
  for (const candidate of [
    'foscen://open?url=https://example.com/+path',
    'foscen://open?url=https%3A%2F%2Fexample.com%2F+path',
    'foscen://open?url=https://example.com&form=a+b',
  ]) {
    const context = harness()
    assert.deepEqual(await dispatchExternalUrl(candidate, context.dependencies), {
      ok: false,
      reason: 'invalid',
    })
    assert.deepEqual(context.navigations, [])
  }
  const context = harness()
  assert.deepEqual(
    await dispatchExternalUrl(
      'foscen://open?url=https%3A%2F%2Fexample.com%2F%2Bpath',
      context.dependencies,
    ),
    { ok: true },
  )
  assert.deepEqual(context.navigations, ['https://example.com/+path'])
})

test('URL、协议、路径、凭据、未知/重复参数、控制字符及错误编码默认拒绝', async () => {
  for (const candidate of [
    undefined,
    null,
    42,
    {},
    '',
    'https://example.com',
    'foscen://open',
    'foscen://open/?url=https://example.com',
    'foscen://other?url=https://example.com',
    'foscen://user:secret@open?url=https://example.com',
    'foscen://open:9?url=https://example.com',
    'foscen://open?url=',
    'foscen://open?url=example.com',
    'foscen://open?url=http://example.com',
    'foscen://open?url=file:///tmp/a',
    'foscen://open?url=javascript:alert(1)',
    'foscen://open?url=data:text/plain,private',
    'foscen://open?url=unknown://example.com',
    'foscen://open?url=https://user:secret@example.com',
    'foscen://open?url=https://example.com&extra=private',
    'foscen://open?url=https://example.com&url=https://evil.example',
    'foscen://open?url=https://example.com&form=a&form=b',
    'foscen://open?url=https://example.com&rule=a&rule=b',
    'foscen://open?url=https://example.com&',
    'foscen://open?url=https://example.com&form',
    'foscen://open?url=https://example.com#',
    'foscen://open?url=https://example.com%0A',
    'foscen://open?url=https://example.com&rule=%00',
    'foscen://open?url=%FF',
    'foscen://open?url=https://example.com/%ZZ',
    'foscen://open?url=%20https://example.com',
    ' foscen://open?url=https://example.com',
    'foscen://open?url=https://example.com\n',
    'foscen://scene/',
    'foscen://scene/../saved-123',
    'foscen://scene/%73aved-123',
    'foscen://scene/saved_123',
    'foscen://scene/saved-123/extra',
    'foscen://scene/saved-123?extra=1',
    'foscen://macro/../saved-123',
    'foscen://macro/saved-123?url=https://example.com',
  ]) {
    const context = harness()
    assert.deepEqual(
      await dispatchExternalUrl(candidate, context.dependencies),
      { ok: false, reason: 'invalid' },
      String(candidate),
    )
    assert.deepEqual(context.navigations, [])
    assert.deepEqual(context.lookups, [])
    assert.deepEqual(context.logs, ['外部 URL：拒绝无效请求'])
  }
})

test('输入、解码后 URL、规范化后 URL 和 ID 都有硬长度上限', () => {
  const atLimit = `https://example.com/${'a'.repeat(2048 - 'https://example.com/'.length)}`
  assert.equal(parseExternalUrl(`foscen://open?url=${encodeURIComponent(atLimit)}`).action, 'open')
  assert.throws(() => parseExternalUrl(`foscen://open?url=${encodeURIComponent(`${atLimit}a`)}`))
  assert.throws(() => parseExternalUrl(`foscen://open?url=https://example.com/${'中'.repeat(300)}`))
  assert.throws(() =>
    parseExternalUrl(
      `foscen://open?url=https://example.com&rule=${'a'.repeat(MAX_EXTERNAL_URL_LENGTH)}`,
    ),
  )
  assert.equal(parseExternalUrl(`foscen://scene/${'a'.repeat(64)}`).action, 'scene')
  assert.throws(() => parseExternalUrl(`foscen://scene/${'a'.repeat(65)}`))
  assert.throws(() => parseExternalUrl(`foscen://macro/${'a'.repeat(65)}`))
})

test('已保存场景正常打开，不存在场景和未实现宏均不导航', async () => {
  const context = harness()
  assert.deepEqual(await dispatchExternalUrl('foscen://scene/saved-123', context.dependencies), {
    ok: true,
  })
  assert.deepEqual(await dispatchExternalUrl('foscen://scene/missing', context.dependencies), {
    ok: false,
    reason: 'missing-scene',
  })
  assert.deepEqual(await dispatchExternalUrl('foscen://macro/saved-123', context.dependencies), {
    ok: false,
    reason: 'not-implemented',
  })
  assert.deepEqual(context.lookups, ['saved-123', 'missing'])
  assert.deepEqual(context.navigations, ['https://example.com/saved'])
})

test('场景读取异常、非法场景地址和加载失败只返回固定失败', async () => {
  const context = harness()
  for (const getScene of [
    async () => {
      throw new Error('private')
    },
    async () => ({ url: 'http://example.com' }),
  ]) {
    assert.deepEqual(
      await dispatchExternalUrl('foscen://scene/saved-123', { ...context.dependencies, getScene }),
      { ok: false, reason: 'failed' },
    )
  }
  assert.deepEqual(
    await dispatchExternalUrl('foscen://open?url=https://example.com', {
      ...context.dependencies,
      navigate: async () => ({ ok: false, error: 'private' }),
    }),
    { ok: false, reason: 'failed' },
  )
  assert.ok(context.logs.every((message) => !message.includes('private')))
  assert.deepEqual(context.navigations, [])
})

test('就绪前缓存、就绪后按顺序回放，并继续处理执行期间的新请求', async () => {
  const context = harness()
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const queue = new ExternalUrlQueue({
    ...context.dependencies,
    navigate: async (url) => {
      await gate
      return context.dependencies.navigate(url)
    },
  })
  await queue.receive('foscen://open?url=https://example.com/first')
  await queue.receive('foscen://scene/saved-123')
  assert.equal(queue.busy, true)
  assert.deepEqual(context.navigations, [])
  const started = queue.start()
  const received = queue.receive('foscen://open?url=https://example.com/last')
  release()
  await Promise.all([started, received])
  assert.deepEqual(context.navigations, [
    'https://example.com/first',
    'https://example.com/saved',
    'https://example.com/last',
  ])
  assert.equal(queue.busy, false)
})

test('队列有界，非法请求和溢出不能留下无限待处理输入', async () => {
  const context = harness()
  const queue = new ExternalUrlQueue(context.dependencies)
  await queue.receive('foscen://invalid')
  for (let index = 0; index <= MAX_PENDING_EXTERNAL_URLS; index += 1) {
    await queue.receive(`foscen://open?url=https://example.com/${index}`)
  }
  await queue.start()
  assert.equal(context.navigations.length, MAX_PENDING_EXTERNAL_URLS)
  assert.ok(context.logs.includes('外部 URL：待处理队列已满'))
})

test('第二实例携带外部 URL（包括非法 URL）绝不 focus，显式启动保留 focus', async () => {
  const context = harness()
  const queue = new ExternalUrlQueue(context.dependencies)
  let focusCalls = 0
  const focus = () => {
    focusCalls += 1
  }
  await queue.start()
  await queue.secondInstance(['electron', '.', 'foscen://open?url=https://example.com'], focus)
  await queue.secondInstance(['Foscen', 'foscen://invalid'], focus)
  assert.equal(focusCalls, 0)
  await queue.secondInstance(['Foscen'], focus)
  assert.equal(focusCalls, 1)
})

test('打包协议注册与开发宿主可执行文件/入口参数分开处理', () => {
  const calls: unknown[][] = []
  const client = {
    setAsDefaultProtocolClient: (...args: unknown[]) => {
      calls.push(args)
      return true
    },
  }
  assert.equal(
    registerFoscenProtocol(client, { execPath: '/app/Foscen', argv: ['/app/Foscen'] }),
    true,
  )
  assert.equal(
    registerFoscenProtocol(client, {
      defaultApp: true,
      execPath: '/app/Electron',
      argv: ['/app/Electron', '/project/foscen'],
    }),
    true,
  )
  assert.equal(
    registerFoscenProtocol(client, {
      defaultApp: true,
      execPath: '/app/Electron',
      argv: ['/app/Electron'],
    }),
    false,
  )
  assert.deepEqual(calls, [['foscen'], ['foscen', '/app/Electron', ['/project/foscen']]])
})

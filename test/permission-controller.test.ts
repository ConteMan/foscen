import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import type {
  PermissionCheckHandlerHandlerDetails,
  PermissionRequest as ElectronPermissionRequest,
  Session,
  WebContents,
} from 'electron'

import { PermissionController, type PermissionPrompt } from '../src/main/permission-controller.js'
import { PermissionPolicy } from '../src/main/permission-policy.js'
import type { PermissionStore } from '../src/main/permission-store.js'
import type { PermissionRecord } from '../src/shared/permissions.js'

type PermissionCheckHandler = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>
type PermissionRequestHandler = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>
type DevicePermissionHandler = NonNullable<Parameters<Session['setDevicePermissionHandler']>[0]>
type DisplayMediaRequestHandler = NonNullable<
  Parameters<Session['setDisplayMediaRequestHandler']>[0]
>
type DisplayMediaRequestOptions = Parameters<Session['setDisplayMediaRequestHandler']>[1]
type SimplePermissionDetails = ElectronPermissionRequest & PermissionCheckHandlerHandlerDetails

class FakeSession extends EventEmitter {
  checkHandler: PermissionCheckHandler | null = null
  requestHandler: PermissionRequestHandler | null = null
  deviceHandler: DevicePermissionHandler | null = null
  displayHandler: DisplayMediaRequestHandler | null = null

  setPermissionCheckHandler(handler: PermissionCheckHandler | null): void {
    this.checkHandler = handler
  }

  setPermissionRequestHandler(handler: PermissionRequestHandler | null): void {
    this.requestHandler = handler
  }

  setDevicePermissionHandler(handler: DevicePermissionHandler | null): void {
    this.deviceHandler = handler
  }

  setDisplayMediaRequestHandler(
    handler: DisplayMediaRequestHandler | null,
    options?: DisplayMediaRequestOptions,
  ): void {
    void options
    this.displayHandler = handler
  }
}

class FakeWebContents extends EventEmitter {
  constructor(public url = 'https://scene.example/app') {
    super()
  }

  getURL(): string {
    return this.url
  }
}

class FakePermissionStore implements PermissionStore {
  saves = 0
  savedJson: string[] = []
  saveBarrier: Promise<void> | undefined

  async load(): Promise<PermissionPolicy> {
    return new PermissionPolicy()
  }

  async save(policy: PermissionPolicy): Promise<void> {
    this.saves += 1
    this.savedJson.push(policy.toPersistentJson())
    await this.saveBarrier
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

interface PermissionNotification {
  readonly records: readonly PermissionRecord[]
  readonly prompt: PermissionPrompt | undefined
  readonly requestAttention: boolean
}

interface PermissionHarness {
  readonly session: FakeSession
  readonly scene: FakeWebContents
  readonly sceneContents: WebContents
  readonly policy: PermissionPolicy
  readonly store: FakePermissionStore
  readonly controller: PermissionController
  readonly notifications: PermissionNotification[]
}

function createHarness(initialRecords: readonly PermissionRecord[] = []): PermissionHarness {
  const session = new FakeSession()
  const scene = new FakeWebContents()
  const sceneContents = scene as unknown as WebContents
  const policy = new PermissionPolicy(initialRecords)
  const store = new FakePermissionStore()
  const notifications: PermissionNotification[] = []
  const controller = new PermissionController({
    session: session as unknown as Session,
    sceneContents,
    policy,
    store,
    onChanged(records, prompt, requestAttention) {
      notifications.push({
        records: records.map((record) => ({ ...record })),
        prompt: prompt ? { ...prompt, permissions: [...prompt.permissions] } : undefined,
        requestAttention,
      })
    },
  })

  return {
    session,
    scene,
    sceneContents,
    policy,
    store,
    controller,
    notifications,
  }
}

function permissionDetails(
  overrides: Partial<ElectronPermissionRequest> = {},
): SimplePermissionDetails {
  return {
    isMainFrame: overrides.isMainFrame ?? true,
    requestingUrl: overrides.requestingUrl ?? 'https://scene.example/app',
  }
}

function request(
  harness: PermissionHarness,
  permission: Parameters<PermissionRequestHandler>[1],
  callback: (allowed: boolean) => void,
  details: Parameters<PermissionRequestHandler>[3],
  contents = harness.sceneContents,
): void {
  const handler = harness.session.requestHandler
  assert.ok(handler)
  handler(contents, permission, callback, details)
}

test('未知权限、非主 frame、错误 sender 与跨来源请求默认拒绝', () => {
  const harness = createHarness()
  const checkHandler = harness.session.checkHandler
  assert.ok(checkHandler)

  assert.equal(
    checkHandler(harness.sceneContents, 'midi', 'https://scene.example', permissionDetails()),
    false,
  )
  assert.equal(
    checkHandler(
      harness.sceneContents,
      'geolocation',
      'https://scene.example',
      permissionDetails({ isMainFrame: false }),
    ),
    false,
  )
  assert.equal(
    checkHandler(
      harness.sceneContents,
      'geolocation',
      'https://evil.example',
      permissionDetails({ requestingUrl: 'https://evil.example/frame' }),
    ),
    false,
  )

  const decisions: boolean[] = []
  request(harness, 'unknown', (allowed) => decisions.push(allowed), permissionDetails())
  request(
    harness,
    'geolocation',
    (allowed) => decisions.push(allowed),
    permissionDetails({ isMainFrame: false }),
  )
  request(
    harness,
    'geolocation',
    (allowed) => decisions.push(allowed),
    permissionDetails({ requestingUrl: 'https://evil.example/frame' }),
  )
  request(
    harness,
    'notifications',
    (allowed) => decisions.push(allowed),
    permissionDetails(),
    {} as WebContents,
  )

  assert.deepEqual(decisions, [false, false, false, false])
  assert.equal(harness.controller.prompt(), undefined)
  harness.controller.dispose()
})

test('既有 session 决定可复用，once 决定只消费一次', async () => {
  const harness = createHarness([
    {
      origin: 'https://scene.example',
      permission: 'notifications',
      decision: 'allow',
      lifetime: 'session',
    },
    {
      origin: 'https://scene.example',
      permission: 'geolocation',
      decision: 'allow',
      lifetime: 'once',
    },
  ])
  const decisions: boolean[] = []

  request(harness, 'notifications', (allowed) => decisions.push(allowed), permissionDetails())
  request(harness, 'notifications', (allowed) => decisions.push(allowed), permissionDetails())
  request(harness, 'geolocation', (allowed) => decisions.push(allowed), permissionDetails())

  assert.deepEqual(decisions, [true, true, true])
  assert.equal(
    harness.policy.getDecision('notifications', 'https://scene.example')?.lifetime,
    'session',
  )
  assert.equal(harness.policy.getDecision('geolocation', 'https://scene.example'), undefined)
  const checkHandler = harness.session.checkHandler
  assert.ok(checkHandler)
  assert.equal(
    checkHandler(null, 'notifications', 'https://scene.example', permissionDetails()),
    true,
  )
  assert.equal(
    checkHandler(null, 'notifications', 'https://evil.example', permissionDetails()),
    false,
  )
  assert.equal(
    checkHandler(
      harness.sceneContents,
      'geolocation',
      'https://scene.example',
      permissionDetails(),
    ),
    false,
  )

  await Promise.resolve()
  harness.controller.dispose()
})

test('持久回应期间导航只结算一次并回滚候选授权', async () => {
  const harness = createHarness()
  const decisions: boolean[] = []
  request(harness, 'notifications', (allowed) => decisions.push(allowed), permissionDetails())
  const prompt = harness.controller.prompt()
  assert.ok(prompt)

  const save = deferred()
  harness.store.saveBarrier = save.promise
  const response = harness.controller.respond(prompt.id, 'allow', 'persistent')
  assert.deepEqual(await harness.controller.respond(prompt.id, 'allow', 'persistent'), {
    ok: false,
    error: '权限回应无效或已过期',
  })

  harness.scene.url = 'https://other.example/page'
  harness.controller.cancelPendingRequests()
  assert.deepEqual(decisions, [false])
  save.resolve()

  assert.deepEqual(await response, {
    ok: false,
    error: '网页来源已经改变，本次权限请求已拒绝',
  })
  assert.deepEqual(decisions, [false])
  assert.equal(harness.policy.getDecision('notifications', 'https://scene.example'), undefined)
  assert.equal(harness.store.saves, 2)
  assert.deepEqual(JSON.parse(harness.store.savedJson.at(-1) ?? ''), {
    version: 1,
    decisions: [],
  })
  harness.controller.dispose()
})

test('权限提示按队列串行处理并持久保存多媒体决定', async () => {
  const harness = createHarness()
  const mediaDecisions: boolean[] = []
  const locationDecisions: boolean[] = []

  request(harness, 'media', (allowed) => mediaDecisions.push(allowed), {
    isMainFrame: true,
    requestingUrl: 'https://scene.example/call',
    securityOrigin: 'https://scene.example',
    mediaTypes: ['video', 'audio'],
  })
  request(harness, 'geolocation', (allowed) => locationDecisions.push(allowed), permissionDetails())

  const mediaPrompt = harness.controller.prompt()
  assert.ok(mediaPrompt)
  assert.deepEqual(mediaPrompt.permissions, ['camera', 'microphone'])
  assert.deepEqual(mediaDecisions, [])
  assert.deepEqual(locationDecisions, [])

  assert.deepEqual(await harness.controller.respond(mediaPrompt.id, 'allow', 'persistent'), {
    ok: true,
  })
  assert.deepEqual(mediaDecisions, [true])
  assert.equal(harness.store.saves, 1)
  assert.deepEqual(JSON.parse(harness.store.savedJson[0] ?? ''), {
    version: 1,
    decisions: [
      {
        origin: 'https://scene.example',
        permission: 'camera',
        decision: 'allow',
        lifetime: 'persistent',
      },
      {
        origin: 'https://scene.example',
        permission: 'microphone',
        decision: 'allow',
        lifetime: 'persistent',
      },
    ],
  })

  const locationPrompt = harness.controller.prompt()
  assert.ok(locationPrompt)
  assert.deepEqual(locationPrompt.permissions, ['geolocation'])
  assert.deepEqual(await harness.controller.respond(locationPrompt.id, 'deny', 'session'), {
    ok: true,
  })
  assert.deepEqual(locationDecisions, [false])
  assert.equal(harness.controller.prompt(), undefined)
  assert.ok(harness.notifications.some((notification) => notification.requestAttention))
  harness.controller.dispose()
})

test('无效回应不结算请求，来源变化会拒绝并清空活动提示', async () => {
  const harness = createHarness()
  const decisions: boolean[] = []
  request(harness, 'notifications', (allowed) => decisions.push(allowed), permissionDetails())
  const prompt = harness.controller.prompt()
  assert.ok(prompt)

  assert.deepEqual(await harness.controller.respond('wrong-id', 'allow', 'session'), {
    ok: false,
    error: '权限回应无效或已过期',
  })
  assert.deepEqual(await harness.controller.respond(prompt.id, 'invalid', 'session'), {
    ok: false,
    error: '权限回应无效或已过期',
  })
  assert.deepEqual(decisions, [])
  assert.equal(harness.controller.prompt()?.id, prompt.id)

  harness.scene.url = 'https://other.example/page'
  assert.deepEqual(await harness.controller.respond(prompt.id, 'allow', 'persistent'), {
    ok: false,
    error: '网页来源已经改变，本次权限请求已拒绝',
  })
  assert.deepEqual(decisions, [false])
  assert.equal(harness.controller.prompt(), undefined)
  assert.equal(harness.policy.getDecision('notifications', 'https://scene.example'), undefined)
  assert.equal(harness.store.saves, 0)
  harness.controller.dispose()
})

test('dispose 对活动与排队请求各回调一次并恢复默认拒绝 handler', () => {
  const harness = createHarness()
  const first: boolean[] = []
  const second: boolean[] = []
  request(harness, 'notifications', (allowed) => first.push(allowed), permissionDetails())
  request(harness, 'geolocation', (allowed) => second.push(allowed), permissionDetails())

  harness.controller.dispose()
  harness.controller.dispose()

  assert.deepEqual(first, [false])
  assert.deepEqual(second, [false])
  assert.equal(harness.session.listenerCount('select-hid-device'), 0)
  assert.equal(harness.session.listenerCount('select-serial-port'), 0)
  assert.equal(harness.session.listenerCount('select-usb-device'), 0)
  assert.equal(harness.scene.listenerCount('select-bluetooth-device'), 0)
  const requestHandler = harness.session.requestHandler
  assert.ok(requestHandler)

  const afterDispose: boolean[] = []
  requestHandler(
    harness.sceneContents,
    'notifications',
    (allowed) => afterDispose.push(allowed),
    permissionDetails(),
  )
  assert.deepEqual(afterDispose, [false])
})

test('权限队列有界且 renderer 消失时全部默认拒绝', () => {
  const harness = createHarness()
  const decisions: boolean[] = []
  for (let index = 0; index < 33; index += 1) {
    request(
      harness,
      index % 2 === 0 ? 'notifications' : 'geolocation',
      (allowed) => decisions.push(allowed),
      permissionDetails(),
    )
  }

  assert.deepEqual(decisions, [false])
  harness.scene.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
  assert.equal(decisions.length, 33)
  assert.ok(decisions.every((allowed) => allowed === false))
  assert.equal(harness.controller.prompt(), undefined)
  harness.controller.dispose()
})

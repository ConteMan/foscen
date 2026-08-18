import assert from 'node:assert/strict'
import test from 'node:test'

import {
  InvalidPermissionDecisionError,
  InvalidPermissionOriginError,
  InvalidPersistentPermissionStateError,
  PermissionPolicy,
  normalizeHttpsOrigin,
  parsePersistentPermissions,
} from '../src/main/permission-policy.js'
import { SUPPORTED_PERMISSIONS } from '../src/shared/permissions.js'

test('权限白名单保持克制且区分摄像头与麦克风', () => {
  assert.deepEqual(SUPPORTED_PERMISSIONS, [
    'camera',
    'microphone',
    'geolocation',
    'notifications',
    'clipboard-sanitized-write',
  ])
})

test('HTTPS 来源被规范化为 origin', () => {
  assert.equal(
    normalizeHttpsOrigin(' https://EXAMPLE.com:443/path?q=1#part '),
    'https://example.com',
  )
  assert.equal(normalizeHttpsOrigin('https://example.com:8443/a'), 'https://example.com:8443')
})

test('拒绝无效、非 HTTPS 和带凭据的来源', () => {
  for (const origin of [
    undefined,
    '',
    'not a url',
    'http://example.com',
    'file:///tmp/page.html',
    'https://user:secret@example.com',
  ]) {
    assert.throws(() => normalizeHttpsOrigin(origin), InvalidPermissionOriginError)
  }
})

test('没有决定、未知权限或无效来源时默认拒绝', () => {
  const policy = new PermissionPolicy()

  assert.equal(policy.isAllowed('camera', 'https://example.com'), false)
  assert.equal(policy.isAllowed('midi', 'https://example.com'), false)
  assert.equal(policy.isAllowed('camera', 'http://example.com'), false)
})

test('记录决定时规范化来源并拒绝越界输入', () => {
  const policy = new PermissionPolicy()

  assert.deepEqual(
    policy.setDecision({
      origin: 'https://EXAMPLE.com:443/page',
      permission: 'camera',
      decision: 'allow',
      lifetime: 'session',
    }),
    {
      origin: 'https://example.com',
      permission: 'camera',
      decision: 'allow',
      lifetime: 'session',
    },
  )

  for (const candidate of [
    {
      origin: 'https://example.com',
      permission: 'midi',
      decision: 'allow',
      lifetime: 'session',
    },
    {
      origin: 'http://example.com',
      permission: 'camera',
      decision: 'allow',
      lifetime: 'session',
    },
    {
      origin: 'https://example.com',
      permission: 'camera',
      decision: 'maybe',
      lifetime: 'session',
    },
  ]) {
    assert.throws(() => policy.setDecision(candidate), InvalidPermissionDecisionError)
  }
})

test('一次决定只消费一次，会话和持久决定持续有效', () => {
  const policy = new PermissionPolicy()

  policy.setDecision({
    origin: 'https://once.example',
    permission: 'camera',
    decision: 'allow',
    lifetime: 'once',
  })
  assert.equal(policy.isAllowed('camera', 'https://once.example'), true)
  assert.equal(policy.isAllowed('camera', 'https://once.example'), false)

  policy.setDecision({
    origin: 'https://session.example',
    permission: 'microphone',
    decision: 'allow',
    lifetime: 'session',
  })
  policy.setDecision({
    origin: 'https://persistent.example',
    permission: 'notifications',
    decision: 'deny',
    lifetime: 'persistent',
  })

  assert.equal(policy.isAllowed('microphone', 'https://session.example/path'), true)
  assert.equal(policy.isAllowed('microphone', 'https://session.example/other'), true)
  assert.equal(policy.isAllowed('notifications', 'https://persistent.example'), false)
  assert.equal(policy.getDecision('notifications', 'https://persistent.example')?.decision, 'deny')
})

test('可按来源、权限或两者查询决定', () => {
  const policy = populatedPolicy()

  assert.deepEqual(
    policy.queryDecisions({ origin: 'https://A.example/path' }).map((item) => item.permission),
    ['camera', 'microphone'],
  )
  assert.deepEqual(
    policy.queryDecisions({ permission: 'camera' }).map((item) => item.origin),
    ['https://a.example', 'https://b.example'],
  )
  assert.equal(
    policy.queryDecisions({
      origin: 'https://b.example',
      permission: 'camera',
    }).length,
    1,
  )
  assert.deepEqual(policy.queryDecisions({ permission: 'serial' as never }), [])
  assert.deepEqual(policy.queryDecisions({ origin: 'http://a.example' }), [])
})

test('可按来源或权限撤销，空条件不会意外清空', () => {
  const policy = populatedPolicy()

  assert.equal(policy.revokeDecisions({ origin: 'https://a.example/path' }), 2)
  assert.equal(policy.queryDecisions().length, 1)
  assert.equal(policy.revokeDecisions({ permission: 'camera' }), 1)
  assert.equal(policy.queryDecisions().length, 0)

  const another = populatedPolicy()
  assert.equal(another.revokeDecisions({}), 0)
  assert.equal(another.revokeDecisions({ permission: 'unknown' as never }), 0)
  assert.equal(another.queryDecisions().length, 3)
})

test('仅序列化持久决定并可恢复', () => {
  const policy = populatedPolicy()
  const serialized = policy.toPersistentJson()

  assert.deepEqual(JSON.parse(serialized), {
    version: 1,
    decisions: [
      {
        origin: 'https://b.example',
        permission: 'camera',
        decision: 'deny',
        lifetime: 'persistent',
      },
    ],
  })

  const restored = PermissionPolicy.fromPersistentJson(serialized)
  assert.equal(restored.getDecision('camera', 'https://b.example')?.decision, 'deny')
  assert.equal(restored.getDecision('camera', 'https://a.example'), undefined)
})

test('持久 JSON 严格拒绝损坏、越界字段与重复决定', () => {
  const invalidStates = [
    'not json',
    '{}',
    JSON.stringify({ version: 2, decisions: [] }),
    JSON.stringify({ version: 1, decisions: [], unexpected: true }),
    JSON.stringify({
      version: 1,
      decisions: [
        {
          origin: 'http://example.com',
          permission: 'camera',
          decision: 'allow',
          lifetime: 'persistent',
        },
      ],
    }),
    JSON.stringify({
      version: 1,
      decisions: [
        {
          origin: 'https://example.com',
          permission: 'serial',
          decision: 'allow',
          lifetime: 'persistent',
        },
      ],
    }),
    JSON.stringify({
      version: 1,
      decisions: [
        {
          origin: 'https://example.com',
          permission: 'camera',
          decision: 'allow',
          lifetime: 'session',
        },
      ],
    }),
    JSON.stringify({
      version: 1,
      decisions: [
        {
          origin: 'https://example.com',
          permission: 'camera',
          decision: 'allow',
          lifetime: 'persistent',
        },
        {
          origin: 'https://EXAMPLE.com:443/path',
          permission: 'camera',
          decision: 'deny',
          lifetime: 'persistent',
        },
      ],
    }),
  ]

  for (const serialized of invalidStates) {
    assert.throws(
      () => parsePersistentPermissions(serialized),
      InvalidPersistentPermissionStateError,
    )
  }
})

test('损坏的持久 JSON 恢复为空策略并保持默认拒绝', () => {
  const policy = PermissionPolicy.fromPersistentJson('{"version":1,"decisions":"bad"}')

  assert.deepEqual(policy.queryDecisions(), [])
  assert.equal(policy.isAllowed('camera', 'https://example.com'), false)
})

function populatedPolicy(): PermissionPolicy {
  return new PermissionPolicy([
    {
      origin: 'https://a.example',
      permission: 'camera',
      decision: 'allow',
      lifetime: 'once',
    },
    {
      origin: 'https://a.example',
      permission: 'microphone',
      decision: 'allow',
      lifetime: 'session',
    },
    {
      origin: 'https://b.example',
      permission: 'camera',
      decision: 'deny',
      lifetime: 'persistent',
    },
  ])
}

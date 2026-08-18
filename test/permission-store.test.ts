import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createPermissionStore, type PermissionStore } from '../src/main/permission-store.js'
import { PermissionPolicy } from '../src/main/permission-policy.js'

async function withStore(run: (store: PermissionStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'foscen-permission-store-'))
  try {
    const store = createPermissionStore({
      getPath(name) {
        assert.equal(name, 'userData')
        return directory
      },
    })
    await run(store, directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('权限仓库只持久化 persistent 决定并使用私有文件权限', async () => {
  await withStore(async (store, directory) => {
    const policy = new PermissionPolicy([
      {
        origin: 'https://persistent.example',
        permission: 'camera',
        decision: 'allow',
        lifetime: 'persistent',
      },
      {
        origin: 'https://session.example',
        permission: 'microphone',
        decision: 'allow',
        lifetime: 'session',
      },
    ])

    await store.save(policy)
    const restored = await store.load()

    assert.equal(restored.getDecision('camera', 'https://persistent.example')?.decision, 'allow')
    assert.equal(restored.getDecision('microphone', 'https://session.example'), undefined)
    assert.equal((await stat(join(directory, 'permissions.json'))).mode & 0o777, 0o600)
  })
})

test('损坏或超限权限文件会被隔离并恢复默认拒绝', async () => {
  for (const broken of ['not-json', 'x'.repeat(128 * 1024 + 1)]) {
    await withStore(async (store, directory) => {
      await writeFile(join(directory, 'permissions.json'), broken, 'utf8')

      assert.deepEqual((await store.load()).queryDecisions(), [])
      const files = await readdir(directory)
      const quarantined = files.find((file) => file.startsWith('permissions.corrupt-'))
      assert.ok(quarantined)
      assert.equal(await readFile(join(directory, quarantined), 'utf8'), broken)
    })
  }
})

test('权限仓库工厂拒绝调用方指定相对路径', () => {
  assert.throws(() => createPermissionStore({ getPath: () => '../escape' }), TypeError)
  assert.throws(() => createPermissionStore(null as never), TypeError)
})

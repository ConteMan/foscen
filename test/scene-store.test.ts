import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  InvalidSceneDataError,
  SCENE_STORE_FILE_NAME,
  createSceneStore,
  type SceneStore,
} from '../src/main/scene-store.js'
import {
  SCENE_LIMITS,
  SCENE_STORE_SCHEMA_VERSION,
  type CreateSceneInput,
  type SceneStoreData,
  type UpdateSceneInput,
  type WindowBounds,
} from '../src/shared/scenes.js'

const FIXED_TIME = '2026-08-13T00:00:00.000Z'

async function withTemporaryDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'foscen-scene-store-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function validStoreData(): SceneStoreData {
  return {
    schemaVersion: SCENE_STORE_SCHEMA_VERSION,
    scenes: [],
    currentSceneUrl: null,
    windowBounds: null,
  }
}

function createTestStore(directory: string): SceneStore {
  return createSceneStore({
    getPath(name) {
      assert.equal(name, 'userData')
      return directory
    },
  })
}

test('空目录返回带 schemaVersion 的默认仓库', async () => {
  await withTemporaryDirectory(async (directory) => {
    const store = createTestStore(directory)

    assert.deepEqual(await store.snapshot(), validStoreData())
    assert.deepEqual(await store.list(), [])
    assert.equal(await store.getCurrentSceneUrl(), null)
    assert.equal(await store.getWindowBounds(), null)
  })
})

test('保存、更新、删除和重新加载场景', async () => {
  await withTemporaryDirectory(async (directory) => {
    const store = createTestStore(directory)
    const created = await store.save({ name: '  工作台  ', url: 'https://example.com' })

    assert.match(created.id, /^[A-Za-z0-9][A-Za-z0-9_-]*$/)
    assert.equal(created.name, '工作台')
    assert.equal(created.url, 'https://example.com/')
    assert.equal(created.createdAt, created.updatedAt)
    assert.deepEqual(await store.get(created.id), created)
    assert.equal(await store.get('missing'), null)

    const updated = await store.update(created.id, {
      name: '文档',
      url: 'https://example.com/docs',
    })
    assert.ok(updated)
    assert.equal(updated.name, '文档')
    assert.equal(updated.url, 'https://example.com/docs')
    assert.equal(updated.createdAt, created.createdAt)
    assert.ok(Date.parse(updated.updatedAt) >= Date.parse(created.updatedAt))

    const reloaded = createTestStore(directory)
    assert.deepEqual(await reloaded.list(), [updated])
    assert.equal(await reloaded.update('missing', { name: '不存在' }), null)
    assert.equal(await reloaded.delete('missing'), false)
    assert.equal(await reloaded.delete(created.id), true)
    assert.deepEqual(await reloaded.list(), [])
  })
})

test('持久化当前 HTTPS 地址和窗口范围并允许显式清空', async () => {
  await withTemporaryDirectory(async (directory) => {
    const store = createTestStore(directory)
    const bounds = { x: -1200, y: 40, width: 1280, height: 800 }

    assert.equal(
      await store.setCurrentSceneUrl('https://example.com/current'),
      'https://example.com/current',
    )
    assert.deepEqual(await store.setWindowBounds(bounds), bounds)

    const reloaded = createTestStore(directory)
    assert.equal(await reloaded.getCurrentSceneUrl(), 'https://example.com/current')
    assert.deepEqual(await reloaded.getWindowBounds(), bounds)

    assert.equal(await reloaded.setCurrentSceneUrl(null), null)
    assert.equal(await reloaded.setWindowBounds(null), null)
    assert.equal(await reloaded.getCurrentSceneUrl(), null)
    assert.equal(await reloaded.getWindowBounds(), null)

    const fileMode = (await stat(join(directory, SCENE_STORE_FILE_NAME))).mode & 0o777
    assert.equal(fileMode, 0o600)
  })
})

test('严格拒绝非 HTTPS、凭据、超长字段、未知字段和非法窗口范围', async () => {
  await withTemporaryDirectory(async (directory) => {
    const store = createTestStore(directory)

    for (const url of [
      'http://example.com',
      'file:///tmp/page.html',
      'https://user:secret@example.com',
      'https://exa\nmple.com',
      `https://example.com/${'a'.repeat(SCENE_LIMITS.maxUrlLength)}`,
      `https://example.com/${'界'.repeat(300)}`,
    ]) {
      await assert.rejects(store.save({ name: '非法地址', url }), InvalidSceneDataError)
      await assert.rejects(store.setCurrentSceneUrl(url), InvalidSceneDataError)
    }

    await assert.rejects(
      store.save({ name: '   ', url: 'https://example.com' }),
      InvalidSceneDataError,
    )
    await assert.rejects(
      store.save({ name: '控制\n字符', url: 'https://example.com' }),
      InvalidSceneDataError,
    )
    await assert.rejects(
      store.save({
        name: 'a'.repeat(SCENE_LIMITS.maxNameLength + 1),
        url: 'https://example.com',
      }),
      InvalidSceneDataError,
    )

    const inputWithPath = {
      name: '不能指定文件',
      url: 'https://example.com',
      path: '/tmp/escape.json',
    } as unknown as CreateSceneInput
    await assert.rejects(store.save(inputWithPath), InvalidSceneDataError)
    await assert.rejects(store.update('missing', {} as UpdateSceneInput), InvalidSceneDataError)
    await assert.rejects(store.delete('../escape'), InvalidSceneDataError)

    for (const bounds of [
      { x: 0, y: 0, width: 0, height: 800 },
      { x: 0.5, y: 0, width: 1280, height: 800 },
      { x: 0, y: 0, width: 1280, height: 800, path: '/tmp/escape.json' },
    ]) {
      await assert.rejects(
        store.setWindowBounds(bounds as unknown as WindowBounds),
        InvalidSceneDataError,
      )
    }

    assert.deepEqual(await readdir(directory), [])
  })
})

test('场景数量达到上限后拒绝继续保存', async () => {
  await withTemporaryDirectory(async (directory) => {
    const scenes = Array.from({ length: SCENE_LIMITS.maxCount }, (_value, index) => ({
      id: `scene-${index}`,
      name: `场景 ${index}`,
      url: `https://example.com/${index}`,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    }))
    await writeFile(
      join(directory, SCENE_STORE_FILE_NAME),
      JSON.stringify({ ...validStoreData(), scenes }),
      'utf8',
    )

    const store = createTestStore(directory)
    assert.equal((await store.list()).length, SCENE_LIMITS.maxCount)
    await assert.rejects(
      store.save({ name: '超限', url: 'https://example.com/overflow' }),
      InvalidSceneDataError,
    )
  })
})

test('损坏 JSON 会先隔离原文件再恢复默认仓库', async () => {
  await withTemporaryDirectory(async (directory) => {
    const broken = '{"schemaVersion":1,"scenes":['
    await writeFile(join(directory, SCENE_STORE_FILE_NAME), broken, 'utf8')

    const store = createTestStore(directory)
    assert.deepEqual(await store.snapshot(), validStoreData())

    const files = await readdir(directory)
    const quarantined = files.filter((file) => /^scenes\.corrupt-.+\.json$/.test(file))
    assert.equal(quarantined.length, 1)
    assert.equal(await readFile(join(directory, quarantined[0] as string), 'utf8'), broken)
    assert.deepEqual(
      JSON.parse(await readFile(join(directory, SCENE_STORE_FILE_NAME), 'utf8')),
      validStoreData(),
    )
  })
})

test('不受支持的 schema、非 HTTPS 和未知字段分别触发安全隔离', async () => {
  const invalidStores: readonly Record<string, unknown>[] = [
    { ...validStoreData(), schemaVersion: SCENE_STORE_SCHEMA_VERSION + 1 },
    { ...validStoreData(), currentSceneUrl: 'http://example.com' },
    { ...validStoreData(), arbitraryPath: '/tmp/escape.json' },
  ]

  for (const invalidStore of invalidStores) {
    await withTemporaryDirectory(async (directory) => {
      await writeFile(join(directory, SCENE_STORE_FILE_NAME), JSON.stringify(invalidStore), 'utf8')

      const store = createTestStore(directory)
      assert.deepEqual(await store.snapshot(), validStoreData())

      const files = await readdir(directory)
      assert.equal(files.filter((file) => file.startsWith('scenes.corrupt-')).length, 1)
      assert.ok(files.includes(SCENE_STORE_FILE_NAME))
    })
  }
})

test('同一 userData 的多实例并发保存不会丢更新或遗留临时文件', async () => {
  await withTemporaryDirectory(async (directory) => {
    const firstStore = createTestStore(directory)
    const secondStore = createTestStore(directory)
    await Promise.all([firstStore.snapshot(), secondStore.snapshot()])

    await Promise.all(
      Array.from({ length: 16 }, (_value, index) =>
        (index % 2 === 0 ? firstStore : secondStore).save({
          name: `场景 ${index}`,
          url: `https://example.com/${index}`,
        }),
      ),
    )

    assert.equal((await createTestStore(directory).list()).length, 16)
    assert.deepEqual(await readdir(directory), [SCENE_STORE_FILE_NAME])
  })
})

test('工厂固定请求 userData 且拒绝无效路径，快照不能篡改仓库', async () => {
  assert.throws(() => createSceneStore({ getPath: () => '../relative' }), TypeError)
  assert.throws(() => createSceneStore(null as never), TypeError)

  await withTemporaryDirectory(async (directory) => {
    const store = createTestStore(directory)
    const created = await store.save({ name: '原始名称', url: 'https://example.com' })
    const snapshot = await store.snapshot()

    const snapshotScene = snapshot.scenes[0]
    assert.ok(snapshotScene)
    Object.assign(snapshotScene, { name: '外部篡改' })
    assert.equal((await store.list())[0]?.name, created.name)
  })
})

import assert from 'node:assert/strict'
import * as filesystem from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  KINVO_DIRECTORY_PARTS,
  KINVO_MANIFEST,
  KINVO_PROVIDER_FILE,
  KinvoRegistration,
} from '../src/main/kinvo-registration.js'
import { parseExternalUrl } from '../src/main/external-url.js'

async function withTemporaryHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = await filesystem.mkdtemp(join(tmpdir(), 'foscen-kinvo-'))
  try {
    await run(home)
  } finally {
    await filesystem.rm(home, { recursive: true, force: true })
  }
}

function host(home: string) {
  return {
    getPath: (name: 'home') => {
      assert.equal(name, 'home')
      return home
    },
  }
}

function validateManifest(text: string): void {
  const manifest = JSON.parse(text)
  const idPattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/
  assert.equal(manifest.protocol, 'kinvo.actions/0')
  assert.match(manifest.provider.id, idPattern)
  assert.ok(typeof manifest.provider.name === 'string' && manifest.provider.name.trim())
  assert.equal(manifest.provider.app, 'com.conteman.foscen')
  assert.ok(Array.isArray(manifest.actions))
  const ids = new Set<string>()
  for (const action of manifest.actions) {
    assert.match(action.id, idPattern)
    assert.ok(action.id.startsWith(`${manifest.provider.id}.`))
    assert.ok(!ids.has(action.id))
    ids.add(action.id)
    assert.ok(typeof action.title === 'string' && action.title.trim())
    assert.ok(typeof action.description === 'string')
    assert.equal(typeof action.needsInput, 'boolean')
    assert.equal(action.result, 'none')
    assert.equal(action.invoke.type, 'url')
    assert.ok(Array.isArray(action.params))
    const names = new Set<string>()
    const placeholders = [...action.invoke.template.matchAll(/\{\{([a-z][a-z0-9]*)\}\}/g)].map(
      (match) => match[1],
    )
    assert.doesNotMatch(action.invoke.template.replace(/\{\{[a-z][a-z0-9]*\}\}/g, 'value'), /[{}]/)
    const literalScheme = action.invoke.template.split(':')[0]
    assert.equal(literalScheme, 'foscen')
    for (const param of action.params) {
      assert.match(param.name, /^[a-z][a-z0-9]*$/)
      assert.ok(!names.has(param.name))
      names.add(param.name)
      assert.ok(typeof param.label === 'string' && param.label.trim())
      assert.ok(['text', 'url', 'enum'].includes(param.type))
      assert.equal(typeof param.required, 'boolean')
      if (param.type === 'enum') {
        assert.ok(Array.isArray(param.options) && param.options.length > 0)
        assert.ok(
          param.options.every((option: unknown) => typeof option === 'string' && option.trim()),
        )
        assert.equal(new Set(param.options).size, param.options.length)
      } else {
        assert.equal(param.options, undefined)
      }
      if (param.required) {
        assert.ok(placeholders.includes(param.name))
      }
    }
    assert.ok(placeholders.every((name: string) => names.has(name)))
  }
  assert.deepEqual([...ids], ['foscen.open', 'foscen.scene'])
}

test('静态清单通过 v0 自检，百分号编码后两个模板可由 dispatcher 接受', () => {
  validateManifest(KINVO_MANIFEST)
  const manifest = JSON.parse(KINVO_MANIFEST)
  const openTemplate = manifest.actions[0].invoke.template
  const sceneTemplate = manifest.actions[1].invoke.template
  assert.deepEqual(
    parseExternalUrl(
      openTemplate.replace('{{url}}', encodeURIComponent('https://example.com/?q=1&secret=2')),
    ),
    {
      action: 'open',
      url: 'https://example.com/?q=1&secret=2',
      ignored: [],
    },
  )
  assert.deepEqual(
    parseExternalUrl(sceneTemplate.replace('{{id}}', encodeURIComponent('saved-123'))),
    { action: 'scene', id: 'saved-123' },
  )
  for (const mutate of [
    (value: typeof manifest) => {
      value.protocol = 'kinvo.actions/1'
    },
    (value: typeof manifest) => {
      value.actions[0].invoke.template = 'https://example.com/{{url}}'
    },
    (value: typeof manifest) => {
      value.actions[0].params[0].required = 'yes'
    },
    (value: typeof manifest) => {
      value.actions[0].invoke.template += '{{undeclared}}'
    },
    (value: typeof manifest) => {
      value.actions[1].id = value.actions[0].id
    },
  ]) {
    const invalid = JSON.parse(KINVO_MANIFEST)
    mutate(invalid)
    assert.throws(() => validateManifest(JSON.stringify(invalid)))
  }
})

test('临时 HOME 内只写固定位置，所有新目录 0700，清单 0600', async () => {
  await withTemporaryHome(async (home) => {
    await new KinvoRegistration(host(home)).register()
    let directory = home
    for (const part of KINVO_DIRECTORY_PARTS) {
      directory = join(directory, part)
      assert.equal((await filesystem.stat(directory)).mode & 0o777, 0o700)
    }
    const file = join(directory, KINVO_PROVIDER_FILE)
    assert.equal((await filesystem.stat(file)).mode & 0o777, 0o600)
    validateManifest(await filesystem.readFile(file, 'utf8'))
    assert.deepEqual(await filesystem.readdir(directory), ['foscen.json'])
  })
})

test('注册不会修改已有目录权限，取消注册仅删除自己的文件', async () => {
  await withTemporaryHome(async (home) => {
    const directory = join(home, ...KINVO_DIRECTORY_PARTS)
    await filesystem.mkdir(directory, { recursive: true, mode: 0o755 })
    await filesystem.chmod(directory, 0o755)
    await filesystem.writeFile(join(directory, 'other.json'), 'other provider')
    const registration = new KinvoRegistration(host(home))
    await registration.register()
    assert.equal((await filesystem.stat(directory)).mode & 0o777, 0o755)
    await registration.unregister()
    await registration.unregister()
    assert.deepEqual(await filesystem.readdir(directory), ['other.json'])
    assert.equal(await filesystem.readFile(join(directory, 'other.json'), 'utf8'), 'other provider')
    assert.equal((await filesystem.stat(directory)).mode & 0o777, 0o755)
  })
})

test('临时文件排他创建、fsync、close、rename；发布前旧文件保持完整', async () => {
  await withTemporaryHome(async (home) => {
    const directory = join(home, ...KINVO_DIRECTORY_PARTS)
    await filesystem.mkdir(directory, { recursive: true })
    const destination = join(directory, KINVO_PROVIDER_FILE)
    await filesystem.writeFile(destination, 'old manifest')
    const events: string[] = []
    const registration = new KinvoRegistration(host(home), {
      ...filesystem,
      open: async (path, flags, mode) => {
        assert.equal(flags, 'wx')
        assert.equal(mode, 0o600)
        events.push('open')
        const file = await filesystem.open(path, flags, mode)
        const sync = file.sync.bind(file)
        const close = file.close.bind(file)
        file.sync = async () => {
          events.push('sync')
          await sync()
        }
        file.close = async () => {
          events.push('close')
          await close()
        }
        return file
      },
      rename: async (source, target) => {
        assert.equal(target, destination)
        assert.equal(await filesystem.readFile(destination, 'utf8'), 'old manifest')
        assert.equal(await filesystem.readFile(source, 'utf8'), KINVO_MANIFEST)
        assert.equal((await filesystem.stat(source)).mode & 0o777, 0o600)
        assert.deepEqual(events, ['open', 'sync', 'close'])
        events.push('rename')
        await filesystem.rename(source, target)
      },
    })
    await registration.register()
    assert.deepEqual(events, ['open', 'sync', 'close', 'rename'])
    assert.equal(await filesystem.readFile(destination, 'utf8'), KINVO_MANIFEST)
    assert.deepEqual(await filesystem.readdir(directory), ['foscen.json'])
  })
})

test('fsync 或 rename 失败保留旧文件并清理本次临时文件', async () => {
  await withTemporaryHome(async (home) => {
    const directory = join(home, ...KINVO_DIRECTORY_PARTS)
    await filesystem.mkdir(directory, { recursive: true })
    const destination = join(directory, KINVO_PROVIDER_FILE)
    await filesystem.writeFile(destination, 'old manifest')
    for (const failure of ['sync', 'rename']) {
      const registration = new KinvoRegistration(host(home), {
        ...filesystem,
        open: async (path, flags, mode) => {
          const file = await filesystem.open(path, flags, mode)
          if (failure === 'sync') {
            file.sync = async () => {
              throw new Error('injected sync failure')
            }
          }
          return file
        },
        rename: async (source, target) => {
          if (failure === 'rename') {
            throw new Error('injected rename failure')
          }
          await filesystem.rename(source, target)
        },
      })
      await assert.rejects(() => registration.register(), /injected/)
      assert.equal(await filesystem.readFile(destination, 'utf8'), 'old manifest')
      assert.deepEqual(await filesystem.readdir(directory), ['foscen.json'])
    }
  })
})

test('注册和取消按操作顺序串行化，取消缺失注册不创建目录', async () => {
  await withTemporaryHome(async (home) => {
    const registration = new KinvoRegistration(host(home))
    await registration.unregister()
    assert.deepEqual(await filesystem.readdir(home), [])
    await Promise.all([registration.register(), registration.unregister(), registration.register()])
    assert.equal(
      await filesystem.readFile(join(home, ...KINVO_DIRECTORY_PARTS, KINVO_PROVIDER_FILE), 'utf8'),
      KINVO_MANIFEST,
    )
  })
})

test('拒绝指向其他位置的目录符号链接，不覆盖或删除链接目标', async () => {
  await withTemporaryHome(async (home) => {
    const parent = join(home, ...KINVO_DIRECTORY_PARTS.slice(0, -1))
    const other = join(home, 'other')
    await filesystem.mkdir(parent, { recursive: true })
    await filesystem.mkdir(other)
    await filesystem.writeFile(join(other, 'foscen.json'), 'private')
    await filesystem.symlink(other, join(parent, 'providers'))
    const registration = new KinvoRegistration(host(home))
    await assert.rejects(() => registration.register(), /目录无效/)
    await assert.rejects(() => registration.unregister(), /目录无效/)
    assert.equal(await filesystem.readFile(join(other, 'foscen.json'), 'utf8'), 'private')
  })
})

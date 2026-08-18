import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { TextDecoder } from 'node:util'

import { PermissionPolicy, parsePersistentPermissions } from './permission-policy.js'

const FILE_NAME = 'permissions.json'
const MAX_FILE_BYTES = 128 * 1024
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })

export interface UserDataPathProvider {
  getPath(name: 'userData'): string
}

export interface PermissionStore {
  load(): Promise<PermissionPolicy>
  save(policy: PermissionPolicy): Promise<void>
}

class JsonPermissionStore implements PermissionStore {
  private readonly directory: string
  private readonly filePath: string
  private writeQueue = Promise.resolve()

  constructor(userDataDirectory: string) {
    if (!isAbsolute(userDataDirectory) || userDataDirectory.includes('\0')) {
      throw new TypeError('权限仓库目录必须是可信的绝对路径')
    }
    this.directory = resolve(userDataDirectory)
    this.filePath = join(this.directory, FILE_NAME)
  }

  async load(): Promise<PermissionPolicy> {
    try {
      const file = await open(this.filePath, 'r')
      try {
        const bytes = Buffer.allocUnsafe(MAX_FILE_BYTES + 1)
        let length = 0
        while (length < bytes.byteLength) {
          const { bytesRead } = await file.read(bytes, length, bytes.byteLength - length, null)
          if (bytesRead === 0) {
            break
          }
          length += bytesRead
        }
        if (length > MAX_FILE_BYTES) {
          throw new Error('权限配置超过大小限制')
        }
        const state = parsePersistentPermissions(UTF8_DECODER.decode(bytes.subarray(0, length)))
        return new PermissionPolicy(state.decisions)
      } finally {
        await file.close()
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return new PermissionPolicy()
      }

      console.warn('权限配置无法读取，已隔离并按默认拒绝处理')
      await this.quarantine().catch(() => undefined)
      return new PermissionPolicy()
    }
  }

  save(policy: PermissionPolicy): Promise<void> {
    const operation = this.writeQueue.then(() => this.writeAtomically(policy.toPersistentJson()))
    this.writeQueue = operation.catch(() => undefined)
    return operation
  }

  private async quarantine(): Promise<void> {
    await mkdir(this.directory, { mode: 0o700, recursive: true })
    await rename(
      this.filePath,
      join(this.directory, `permissions.corrupt-${Date.now()}-${randomUUID()}.json`),
    )
  }

  private async writeAtomically(serialized: string): Promise<void> {
    await mkdir(this.directory, { mode: 0o700, recursive: true })
    const temporaryPath = join(this.directory, `.${FILE_NAME}.${process.pid}.${randomUUID()}.tmp`)

    try {
      const file = await open(temporaryPath, 'wx', 0o600)
      try {
        await file.writeFile(`${serialized}\n`, 'utf8')
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporaryPath, this.filePath)
      const directory = await open(this.directory, 'r')
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}

export function createPermissionStore(pathProvider: UserDataPathProvider): PermissionStore {
  if (
    typeof pathProvider !== 'object' ||
    pathProvider === null ||
    typeof pathProvider.getPath !== 'function'
  ) {
    throw new TypeError('权限仓库需要可信的 userData 路径提供者')
  }

  return new JsonPermissionStore(pathProvider.getPath('userData'))
}

import { randomUUID } from 'node:crypto'
import * as filesystem from 'node:fs/promises'
import { join } from 'node:path'

export const KINVO_PROVIDER_FILE = 'foscen.json'
export const KINVO_DIRECTORY_PARTS = [
  'Library',
  'Application Support',
  'Kinvo',
  'providers',
] as const
export const KINVO_MANIFEST = `${JSON.stringify(
  {
    protocol: 'kinvo.actions/0',
    provider: { id: 'foscen', name: 'Foscen', app: 'com.conteman.foscen' },
    actions: [
      {
        id: 'foscen.open',
        title: '以 Foscen 打开',
        description: '打开无凭据的 HTTPS 网页',
        params: [{ name: 'url', label: '网址', type: 'url', required: true }],
        invoke: { type: 'url', template: 'foscen://open?url={{url}}' },
        needsInput: true,
        result: 'none',
      },
      {
        id: 'foscen.scene',
        title: '打开 Foscen 场景',
        description: '按 ID 切换到已保存的场景',
        params: [{ name: 'id', label: '场景 ID', type: 'text', required: true }],
        invoke: { type: 'url', template: 'foscen://scene/{{id}}' },
        needsInput: true,
        result: 'none',
      },
    ],
  },
  null,
  2,
)}\n`

type RegistrationFiles = Pick<typeof filesystem, 'mkdir' | 'lstat' | 'open' | 'rename' | 'unlink'>

export class KinvoRegistration {
  private operations: Promise<void> = Promise.resolve()

  constructor(
    private readonly host: { getPath: (name: 'home') => string },
    private readonly files: RegistrationFiles = filesystem,
  ) {}

  register(): Promise<void> {
    return this.enqueue(async () => {
      const directory = await this.providerDirectory(true)
      const temporary = join(directory, `.foscen-${randomUUID()}.tmp`)
      try {
        const file = await this.files.open(temporary, 'wx', 0o600)
        try {
          await file.writeFile(KINVO_MANIFEST, 'utf8')
          await file.sync()
        } finally {
          await file.close()
        }
        await this.files.rename(temporary, join(directory, KINVO_PROVIDER_FILE))
      } finally {
        await this.files.unlink(temporary).catch(() => undefined)
      }
    })
  }

  unregister(): Promise<void> {
    return this.enqueue(async () => {
      try {
        const directory = await this.providerDirectory(false)
        await this.files.unlink(join(directory, KINVO_PROVIDER_FILE))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
    })
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.operations.then(operation)
    this.operations = result.catch(() => undefined)
    return result
  }

  private async providerDirectory(create: boolean): Promise<string> {
    let directory = this.host.getPath('home')
    for (const part of KINVO_DIRECTORY_PARTS) {
      directory = join(directory, part)
      if (create) {
        await this.files.mkdir(directory, { mode: 0o700 }).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
            throw error
          }
        })
      }
      const metadata = await this.files.lstat(directory)
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new TypeError('Kinvo 清单目录无效')
      }
    }
    return directory
  }
}

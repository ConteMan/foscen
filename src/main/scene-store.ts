import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { TextDecoder } from 'node:util'

import {
  SCENE_LIMITS,
  SCENE_STORE_SCHEMA_VERSION,
  type CreateSceneInput,
  type Scene,
  type SceneStoreData,
  type UpdateSceneInput,
  type WindowBounds,
} from '../shared/scenes.js'

export const SCENE_STORE_FILE_NAME = 'scenes.json'

const MAX_STORE_BYTES = 512 * 1024
const MAX_WINDOW_POSITION = 100_000
const MAX_WINDOW_SIZE = 32_768
const SCENE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })

type JsonRecord = Record<string, unknown>

// 同一主进程内按目标文件串行化；宿主应用仍须持有 Electron 单实例锁。
const OPERATION_QUEUES = new Map<string, Promise<void>>()

export class InvalidSceneDataError extends TypeError {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSceneDataError'
  }
}

function invalid(message: string): never {
  throw new InvalidSceneDataError(message)
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertExactKeys(value: JsonRecord, expectedKeys: readonly string[], label: string): void {
  const actualKeys = Object.keys(value)
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key) => !expectedKeys.includes(key))
  ) {
    invalid(`${label}包含未知或缺失字段`)
  }
}

function normalizeSceneId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > SCENE_LIMITS.maxIdLength ||
    !SCENE_ID_PATTERN.test(value)
  ) {
    invalid('场景 ID 格式无效')
  }

  return value
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)
    return (
      codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    )
  })
}

function normalizeSceneName(value: unknown): string {
  if (typeof value !== 'string') {
    invalid('场景名称必须是字符串')
  }

  const trimmed = value.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > SCENE_LIMITS.maxNameLength ||
    containsControlCharacter(trimmed)
  ) {
    invalid(`场景名称不能为空、包含控制字符或超过 ${SCENE_LIMITS.maxNameLength} 个字符`)
  }

  return trimmed
}

function normalizeHttpsUrl(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > SCENE_LIMITS.maxUrlLength ||
    value !== value.trim() ||
    containsControlCharacter(value)
  ) {
    invalid(`场景地址必须是非空字符串且不能超过 ${SCENE_LIMITS.maxUrlLength} 个字符`)
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    invalid('场景地址格式无效')
  }

  if (
    parsed.href.length > SCENE_LIMITS.maxUrlLength ||
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    !parsed.hostname
  ) {
    invalid('场景地址必须是不含凭据的 HTTPS 地址')
  }

  return parsed.href
}

function normalizeTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !ISO_TIMESTAMP_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    invalid(`${label}必须是规范的 ISO 时间戳`)
  }

  return value
}

function normalizeInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid(`${label}必须是 ${minimum} 到 ${maximum} 之间的整数`)
  }

  return value as number
}

function normalizeWindowBounds(value: unknown): WindowBounds {
  if (!isRecord(value)) {
    invalid('窗口范围必须是对象')
  }

  assertExactKeys(value, ['x', 'y', 'width', 'height'], '窗口范围')
  return {
    x: normalizeInteger(value.x, '窗口 x 坐标', -MAX_WINDOW_POSITION, MAX_WINDOW_POSITION),
    y: normalizeInteger(value.y, '窗口 y 坐标', -MAX_WINDOW_POSITION, MAX_WINDOW_POSITION),
    width: normalizeInteger(value.width, '窗口宽度', 1, MAX_WINDOW_SIZE),
    height: normalizeInteger(value.height, '窗口高度', 1, MAX_WINDOW_SIZE),
  }
}

function normalizeScene(value: unknown): Scene {
  if (!isRecord(value)) {
    invalid('场景必须是对象')
  }

  assertExactKeys(value, ['id', 'name', 'url', 'createdAt', 'updatedAt'], '场景')
  const createdAt = normalizeTimestamp(value.createdAt, '场景创建时间')
  const updatedAt = normalizeTimestamp(value.updatedAt, '场景更新时间')
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    invalid('场景更新时间不能早于创建时间')
  }

  return {
    id: normalizeSceneId(value.id),
    name: normalizeSceneName(value.name),
    url: normalizeHttpsUrl(value.url),
    createdAt,
    updatedAt,
  }
}

function normalizeCreateInput(value: unknown): CreateSceneInput {
  if (!isRecord(value)) {
    invalid('新场景必须是对象')
  }

  assertExactKeys(value, ['name', 'url'], '新场景')
  return {
    name: normalizeSceneName(value.name),
    url: normalizeHttpsUrl(value.url),
  }
}

function normalizeUpdateInput(value: unknown): UpdateSceneInput {
  if (!isRecord(value)) {
    invalid('场景更新必须是对象')
  }

  const keys = Object.keys(value)
  if (keys.length === 0 || keys.some((key) => key !== 'name' && key !== 'url')) {
    invalid('场景更新必须且只能包含名称或地址')
  }

  const normalized: { name?: string; url?: string } = {}
  if (Object.hasOwn(value, 'name')) {
    normalized.name = normalizeSceneName(value.name)
  }
  if (Object.hasOwn(value, 'url')) {
    normalized.url = normalizeHttpsUrl(value.url)
  }
  return normalized
}

function normalizeStoreData(value: unknown): SceneStoreData {
  if (!isRecord(value)) {
    invalid('场景仓库根节点必须是对象')
  }

  assertExactKeys(value, ['schemaVersion', 'scenes', 'currentSceneUrl', 'windowBounds'], '场景仓库')
  if (value.schemaVersion !== SCENE_STORE_SCHEMA_VERSION) {
    invalid(`仅支持场景仓库版本 ${SCENE_STORE_SCHEMA_VERSION}`)
  }
  if (!Array.isArray(value.scenes) || value.scenes.length > SCENE_LIMITS.maxCount) {
    invalid(`场景列表必须是数组且不能超过 ${SCENE_LIMITS.maxCount} 项`)
  }

  const scenes = value.scenes.map(normalizeScene)
  const ids = new Set(scenes.map((scene) => scene.id))
  if (ids.size !== scenes.length) {
    invalid('场景 ID 不能重复')
  }

  return {
    schemaVersion: SCENE_STORE_SCHEMA_VERSION,
    scenes,
    currentSceneUrl:
      value.currentSceneUrl === null ? null : normalizeHttpsUrl(value.currentSceneUrl),
    windowBounds: value.windowBounds === null ? null : normalizeWindowBounds(value.windowBounds),
  }
}

function defaultStoreData(): SceneStoreData {
  return {
    schemaVersion: SCENE_STORE_SCHEMA_VERSION,
    scenes: [],
    currentSceneUrl: null,
    windowBounds: null,
  }
}

function cloneScene(scene: Scene): Scene {
  return { ...scene }
}

function cloneStoreData(data: SceneStoreData): SceneStoreData {
  return {
    schemaVersion: SCENE_STORE_SCHEMA_VERSION,
    scenes: data.scenes.map(cloneScene),
    currentSceneUrl: data.currentSceneUrl,
    windowBounds: data.windowBounds ? { ...data.windowBounds } : null,
  }
}

function isFileSystemError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === code
  )
}

export interface UserDataPathProvider {
  getPath(name: 'userData'): string
}

export interface SceneStore {
  snapshot(): Promise<SceneStoreData>
  reload(): Promise<SceneStoreData>
  list(): Promise<readonly Scene[]>
  get(id: string): Promise<Scene | null>
  save(input: CreateSceneInput): Promise<Scene>
  update(id: string, input: UpdateSceneInput): Promise<Scene | null>
  delete(id: string): Promise<boolean>
  getCurrentSceneUrl(): Promise<string | null>
  setCurrentSceneUrl(url: string | null): Promise<string | null>
  getWindowBounds(): Promise<WindowBounds | null>
  setWindowBounds(bounds: WindowBounds | null): Promise<WindowBounds | null>
}

class JsonSceneStore implements SceneStore {
  private readonly directory: string
  private readonly filePath: string

  constructor(userDataDirectory: string) {
    if (
      typeof userDataDirectory !== 'string' ||
      userDataDirectory.length === 0 ||
      userDataDirectory.includes('\0') ||
      !isAbsolute(userDataDirectory)
    ) {
      throw new TypeError('场景仓库目录必须是可信的绝对路径')
    }

    this.directory = resolve(userDataDirectory)
    this.filePath = join(this.directory, SCENE_STORE_FILE_NAME)
  }

  snapshot(): Promise<SceneStoreData> {
    return this.enqueue(async () => cloneStoreData(await this.loadData()))
  }

  reload(): Promise<SceneStoreData> {
    return this.snapshot()
  }

  list(): Promise<readonly Scene[]> {
    return this.enqueue(async () => (await this.loadData()).scenes.map(cloneScene))
  }

  get(id: string): Promise<Scene | null> {
    return this.enqueue(async () => {
      const normalizedId = normalizeSceneId(id)
      const scene = (await this.loadData()).scenes.find(
        (candidate) => candidate.id === normalizedId,
      )
      return scene ? cloneScene(scene) : null
    })
  }

  save(input: CreateSceneInput): Promise<Scene> {
    return this.enqueue(async () => {
      const normalized = normalizeCreateInput(input)
      const current = await this.loadData()
      if (current.scenes.length >= SCENE_LIMITS.maxCount) {
        invalid(`最多只能保存 ${SCENE_LIMITS.maxCount} 个场景`)
      }

      let id = randomUUID()
      const existingIds = new Set(current.scenes.map((scene) => scene.id))
      while (existingIds.has(id)) {
        id = randomUUID()
      }

      const now = new Date().toISOString()
      const scene: Scene = {
        id,
        name: normalized.name,
        url: normalized.url,
        createdAt: now,
        updatedAt: now,
      }
      await this.commit({ ...current, scenes: [...current.scenes, scene] })
      return cloneScene(scene)
    })
  }

  update(id: string, input: UpdateSceneInput): Promise<Scene | null> {
    return this.enqueue(async () => {
      const normalizedId = normalizeSceneId(id)
      const normalized = normalizeUpdateInput(input)
      const current = await this.loadData()
      const index = current.scenes.findIndex((scene) => scene.id === normalizedId)
      if (index === -1) {
        return null
      }

      const previous = current.scenes[index]
      if (!previous) {
        return null
      }

      const updatedAt = new Date(
        Math.max(Date.now(), Date.parse(previous.createdAt), Date.parse(previous.updatedAt)),
      ).toISOString()
      const updated: Scene = {
        ...previous,
        ...normalized,
        updatedAt,
      }
      const scenes = current.scenes.map((scene, sceneIndex) =>
        sceneIndex === index ? updated : scene,
      )
      await this.commit({ ...current, scenes })
      return cloneScene(updated)
    })
  }

  delete(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      const normalizedId = normalizeSceneId(id)
      const current = await this.loadData()
      const scenes = current.scenes.filter((scene) => scene.id !== normalizedId)
      if (scenes.length === current.scenes.length) {
        return false
      }

      await this.commit({ ...current, scenes })
      return true
    })
  }

  getCurrentSceneUrl(): Promise<string | null> {
    return this.enqueue(async () => (await this.loadData()).currentSceneUrl)
  }

  setCurrentSceneUrl(url: string | null): Promise<string | null> {
    return this.enqueue(async () => {
      const normalized = url === null ? null : normalizeHttpsUrl(url)
      const current = await this.loadData()
      await this.commit({ ...current, currentSceneUrl: normalized })
      return normalized
    })
  }

  getWindowBounds(): Promise<WindowBounds | null> {
    return this.enqueue(async () => {
      const bounds = (await this.loadData()).windowBounds
      return bounds ? { ...bounds } : null
    })
  }

  setWindowBounds(bounds: WindowBounds | null): Promise<WindowBounds | null> {
    return this.enqueue(async () => {
      const normalized = bounds === null ? null : normalizeWindowBounds(bounds)
      const current = await this.loadData()
      await this.commit({ ...current, windowBounds: normalized })
      return normalized ? { ...normalized } : null
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = OPERATION_QUEUES.get(this.filePath) ?? Promise.resolve()
    const result = previous.then(operation)
    const completion = result.then(
      () => undefined,
      () => undefined,
    )
    OPERATION_QUEUES.set(this.filePath, completion)
    void completion.then(() => {
      if (OPERATION_QUEUES.get(this.filePath) === completion) {
        OPERATION_QUEUES.delete(this.filePath)
      }
    })
    return result
  }

  private async loadData(): Promise<SceneStoreData> {
    try {
      const serialized = await this.readStoredBytes()

      let decoded: string
      try {
        decoded = UTF8_DECODER.decode(serialized)
      } catch {
        invalid('场景仓库文件不是有效的 UTF-8')
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(decoded)
      } catch {
        invalid('场景仓库文件不是有效的 JSON')
      }

      return normalizeStoreData(parsed)
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) {
        return defaultStoreData()
      } else if (error instanceof InvalidSceneDataError) {
        return this.quarantineAndReset()
      } else {
        throw error
      }
    }
  }

  private async quarantineAndReset(): Promise<SceneStoreData> {
    const quarantineName = `scenes.corrupt-${Date.now()}-${randomUUID()}.json`
    const quarantinePath = join(this.directory, quarantineName)

    try {
      await rename(this.filePath, quarantinePath)
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw error
      }
    }

    const defaults = defaultStoreData()
    await this.writeAtomically(defaults)
    return defaults
  }

  private async readStoredBytes(): Promise<Buffer> {
    const storedFile = await open(this.filePath, 'r')
    try {
      const buffer = Buffer.allocUnsafe(MAX_STORE_BYTES + 1)
      let length = 0

      while (length < buffer.byteLength) {
        const { bytesRead } = await storedFile.read(
          buffer,
          length,
          buffer.byteLength - length,
          null,
        )
        if (bytesRead === 0) {
          break
        }
        length += bytesRead
      }

      if (length > MAX_STORE_BYTES) {
        invalid(`场景仓库文件不能超过 ${MAX_STORE_BYTES} 字节`)
      }
      return buffer.subarray(0, length)
    } finally {
      await storedFile.close()
    }
  }

  private async commit(data: SceneStoreData): Promise<void> {
    const normalized = normalizeStoreData(data)
    await this.writeAtomically(normalized)
  }

  private async writeAtomically(data: SceneStoreData): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })

    const temporaryPath = join(
      this.directory,
      `.${SCENE_STORE_FILE_NAME}.${process.pid}.${randomUUID()}.tmp`,
    )
    const serialized = `${JSON.stringify(data, null, 2)}\n`

    try {
      const temporaryFile = await open(temporaryPath, 'wx', 0o600)
      try {
        await temporaryFile.writeFile(serialized, 'utf8')
        await temporaryFile.sync()
      } finally {
        await temporaryFile.close()
      }

      await rename(temporaryPath, this.filePath)
    } catch (error) {
      try {
        await unlink(temporaryPath)
      } catch (cleanupError) {
        if (!isFileSystemError(cleanupError, 'ENOENT')) {
          // 保留原始写入错误；孤立临时文件不会被读取，也不影响仓库完整性。
        }
      }
      throw error
    }
  }
}

/**
 * 从主进程的固定 `userData` 位置创建仓库。调用方不能传入文件或目录路径，
 * 实际文件名同样固定；测试可传入只实现 `getPath('userData')` 的替身。
 */
export function createSceneStore(pathProvider: UserDataPathProvider): SceneStore {
  if (
    typeof pathProvider !== 'object' ||
    pathProvider === null ||
    typeof pathProvider.getPath !== 'function'
  ) {
    throw new TypeError('场景仓库需要可信的 userData 路径提供者')
  }

  return new JsonSceneStore(pathProvider.getPath('userData'))
}

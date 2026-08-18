export const SCENE_STORE_SCHEMA_VERSION = 1 as const

export const SCENE_LIMITS = {
  maxCount: 100,
  maxIdLength: 64,
  maxNameLength: 120,
  maxUrlLength: 2048,
} as const

export interface Scene {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateSceneInput {
  readonly name: string
  readonly url: string
}

export interface UpdateSceneInput {
  readonly name?: string
  readonly url?: string
}

export interface WindowBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface SceneStoreData {
  readonly schemaVersion: typeof SCENE_STORE_SCHEMA_VERSION
  readonly scenes: readonly Scene[]
  readonly currentSceneUrl: string | null
  readonly windowBounds: WindowBounds | null
}

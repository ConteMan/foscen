import { resolve } from 'node:path'

import type { NavigateResult } from '../shared/ipc.js'
import { normalizeSceneUrl } from './url-policy.js'

export const MAX_EXTERNAL_URL_LENGTH = 8192
export const MAX_PENDING_EXTERNAL_URLS = 32

export type ExternalCommand =
  | { readonly action: 'open'; readonly url: string; readonly ignored: readonly string[] }
  | { readonly action: 'scene'; readonly id: string }
  | { readonly action: 'macro'; readonly id: string }

export type ExternalUrlResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason: 'invalid' | 'missing-scene' | 'not-implemented' | 'failed'
    }

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/
function containsControlCharacters(value: string, rejectSpace = false): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= (rejectSpace ? 32 : 31) || (code >= 127 && code <= 159)
  })
}

export function parseExternalUrl(candidate: unknown): ExternalCommand {
  if (
    typeof candidate !== 'string' ||
    candidate.length === 0 ||
    candidate.length > MAX_EXTERNAL_URL_LENGTH ||
    containsControlCharacters(candidate, true) ||
    candidate.includes('#') ||
    /%(?![\da-f]{2})/i.test(candidate)
  ) {
    throw new TypeError('外部 URL 无效')
  }

  const route = /^foscen:\/\/(open|scene|macro)(.*)$/.exec(candidate)
  if (!route) {
    throw new TypeError('外部 URL 动作无效')
  }
  const action = route[1]
  const suffix = route[2] ?? ''
  if (action === 'scene' || action === 'macro') {
    const id = suffix.slice(1)
    if (!suffix.startsWith('/') || !ID_PATTERN.test(id)) {
      throw new TypeError('外部 URL ID 无效')
    }
    return { action, id }
  }

  if (
    !suffix.startsWith('?') ||
    suffix.includes('+') ||
    suffix
      .slice(1)
      .split('&')
      .some((entry) => !entry.includes('='))
  ) {
    throw new TypeError('外部 URL 参数无效')
  }
  decodeURIComponent(suffix)
  const params = new URL(candidate).searchParams
  const seen = new Set<string>()
  for (const [name, value] of params) {
    if (
      !['url', 'form', 'rule'].includes(name) ||
      seen.has(name) ||
      containsControlCharacters(value)
    ) {
      throw new TypeError('外部 URL 参数无效')
    }
    seen.add(name)
  }
  const url = params.get('url')
  if (!url || url.length > 2048 || url !== url.trim() || !/^https:\/\//i.test(url)) {
    throw new TypeError('外部 URL 必须为 HTTPS')
  }
  const normalized = normalizeSceneUrl(url)
  if (normalized.length > 2048) {
    throw new TypeError('外部 URL 地址过长')
  }
  return {
    action: 'open',
    url: normalized,
    ignored: ['form', 'rule'].filter((name) => seen.has(name)),
  }
}

interface ExternalUrlDependencies {
  readonly getScene: (id: string) => Promise<{ readonly url: string } | null>
  readonly navigate: (url: string) => Promise<NavigateResult>
  readonly log: (message: string) => void
}

export async function dispatchExternalCommand(
  command: ExternalCommand,
  dependencies: ExternalUrlDependencies,
): Promise<ExternalUrlResult> {
  if (command.action === 'macro') {
    dependencies.log('外部 URL：宏未实现')
    return { ok: false, reason: 'not-implemented' }
  }
  try {
    let url: string
    if (command.action === 'scene') {
      const scene = await dependencies.getScene(command.id)
      if (!scene) {
        dependencies.log('外部 URL：场景不存在')
        return { ok: false, reason: 'missing-scene' }
      }
      url = normalizeSceneUrl(scene.url)
      if (url.length > 2048) {
        throw new TypeError('场景地址过长')
      }
    } else {
      url = command.url
      for (const name of command.ignored) {
        dependencies.log(`外部 URL：忽略保留参数 ${name}`)
      }
    }
    const result = await dependencies.navigate(url)
    if (!result.ok) {
      dependencies.log('外部 URL：页面加载失败')
      return { ok: false, reason: 'failed' }
    }
    return { ok: true }
  } catch {
    dependencies.log('外部 URL：动作执行失败')
    return { ok: false, reason: 'failed' }
  }
}

export async function dispatchExternalUrl(
  candidate: unknown,
  dependencies: ExternalUrlDependencies,
): Promise<ExternalUrlResult> {
  let command: ExternalCommand
  try {
    command = parseExternalUrl(candidate)
  } catch {
    dependencies.log('外部 URL：拒绝无效请求')
    return { ok: false, reason: 'invalid' }
  }
  return dispatchExternalCommand(command, dependencies)
}

export class ExternalUrlQueue {
  private readonly pending: ExternalCommand[] = []
  private ready = false
  private draining: Promise<void> | undefined

  constructor(private readonly dependencies: ExternalUrlDependencies) {}

  get busy(): boolean {
    return this.pending.length > 0 || this.draining !== undefined
  }

  receive(candidate: unknown): Promise<void> {
    try {
      const command = parseExternalUrl(candidate)
      if (this.pending.length >= MAX_PENDING_EXTERNAL_URLS) {
        this.dependencies.log('外部 URL：待处理队列已满')
      } else {
        this.pending.push(command)
      }
    } catch {
      this.dependencies.log('外部 URL：拒绝无效请求')
    }
    return this.drain()
  }

  secondInstance(argv: readonly string[], focus: () => void): Promise<void> {
    const urls = argv.filter((argument) => /^foscen:/i.test(argument))
    if (urls.length === 0) {
      focus()
      return Promise.resolve()
    }
    return Promise.all(urls.map((url) => this.receive(url))).then(() => undefined)
  }

  start(): Promise<void> {
    this.ready = true
    return this.drain()
  }

  private drain(): Promise<void> {
    if (!this.ready || this.pending.length === 0) {
      return this.draining ?? Promise.resolve()
    }
    if (!this.draining) {
      this.draining = Promise.resolve()
        .then(async () => {
          let command: ExternalCommand | undefined
          while ((command = this.pending.shift())) {
            await dispatchExternalCommand(command, this.dependencies)
          }
        })
        .finally(() => {
          this.draining = undefined
          return this.drain()
        })
    }
    return this.draining
  }
}

interface ProtocolClient {
  setAsDefaultProtocolClient: (scheme: string, path?: string, args?: string[]) => boolean
}

export function registerFoscenProtocol(
  client: ProtocolClient,
  host: {
    readonly defaultApp?: boolean
    readonly execPath: string
    readonly argv: readonly string[]
  },
): boolean {
  if (host.defaultApp) {
    const entry = host.argv[1]
    return (
      Boolean(entry) &&
      client.setAsDefaultProtocolClient('foscen', host.execPath, [resolve(entry ?? '')])
    )
  }
  return client.setAsDefaultProtocolClient('foscen')
}

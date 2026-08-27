import type { ChromeState } from '../shared/ui-state.js'

export type NormalizeFailure = 'empty' | 'https' | 'invalid' | 'query'

export type NormalizeResult = { ok: true; href: string } | { ok: false; reason: NormalizeFailure }

export type OmnibarSuggestion =
  | { kind: 'go'; title: string; subtitle: string; href: string }
  | { kind: 'current'; title: string; subtitle: string }
  | { kind: 'scene'; title: string; subtitle: string; id: string }

const PROTOCOL_PREFIX = /^[a-z][a-z\d+.-]*:/i

function hasExplicitProtocol(value: string): boolean {
  return PROTOCOL_PREFIX.test(value)
}

function isNavigableHostname(hostname: string): boolean {
  return hostname.includes('.')
}

export function tryNormalize(raw: string): NormalizeResult {
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > 2048) {
    return { ok: false, reason: 'empty' }
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, reason: 'query' }
  }

  const explicitProtocol = hasExplicitProtocol(trimmed)
  const withProtocol = explicitProtocol ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    return { ok: false, reason: explicitProtocol ? 'invalid' : 'query' }
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
    return { ok: false, reason: 'https' }
  }
  if (!explicitProtocol && !isNavigableHostname(parsed.hostname)) {
    return { ok: false, reason: 'query' }
  }
  return { ok: true, href: parsed.href }
}

export function isIdleQuery(query: string, currentUrl: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) {
    return true
  }
  const parsed = tryNormalize(trimmed)
  return parsed.ok && parsed.href === currentUrl
}

export function buildOmnibarSuggestions(
  query: string,
  state: Pick<ChromeState, 'currentUrl' | 'scenes'>,
  limit: number,
): OmnibarSuggestion[] {
  const parsed = tryNormalize(query)
  if (parsed.ok === false && parsed.reason === 'https' && query.trim()) {
    return []
  }
  const rows: OmnibarSuggestion[] = []
  const idle = isIdleQuery(query, state.currentUrl)
  if (!idle && parsed.ok && parsed.href !== state.currentUrl) {
    rows.push({ kind: 'go', title: '前往', subtitle: parsed.href, href: parsed.href })
  }
  if (idle || state.currentUrl.toLowerCase().includes(query.trim().toLowerCase())) {
    rows.push({ kind: 'current', title: '当前场景', subtitle: state.currentUrl || '' })
  }
  const needle = query.trim().toLowerCase()
  const scenes = [...state.scenes].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )
  for (const scene of scenes) {
    if (scene.url === state.currentUrl) {
      continue
    }
    if (idle || `${scene.name} ${scene.url}`.toLowerCase().includes(needle)) {
      rows.push({ kind: 'scene', title: scene.name, subtitle: scene.url, id: scene.id })
    }
    if (rows.length >= limit) {
      break
    }
  }
  return rows.slice(0, limit)
}

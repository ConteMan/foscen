import {
  PERSISTENT_PERMISSION_STATE_VERSION,
  isPermissionDecision,
  isPermissionLifetime,
  isSupportedPermission,
  type PermissionRecord,
  type PersistentPermissionRecord,
  type PersistentPermissionState,
  type SupportedPermission,
} from '../shared/permissions.js'

const HTTPS_PROTOCOL = 'https:'
const MAX_ORIGIN_LENGTH = 2048

export interface PermissionQuery {
  readonly origin?: string
  readonly permission?: SupportedPermission
}

export class InvalidPermissionOriginError extends Error {
  constructor(message = '权限来源必须是有效的 HTTPS 地址') {
    super(message)
    this.name = 'InvalidPermissionOriginError'
  }
}

export class InvalidPermissionDecisionError extends Error {
  constructor(message = '权限决定无效') {
    super(message)
    this.name = 'InvalidPermissionDecisionError'
  }
}

export class InvalidPersistentPermissionStateError extends Error {
  constructor(message = '持久权限数据无效') {
    super(message)
    this.name = 'InvalidPersistentPermissionStateError'
  }
}

export function normalizeHttpsOrigin(candidate: unknown): string {
  if (typeof candidate !== 'string') {
    throw new InvalidPermissionOriginError('权限来源必须是字符串')
  }

  const trimmed = candidate.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_ORIGIN_LENGTH) {
    throw new InvalidPermissionOriginError('权限来源不能为空且不能超过 2048 个字符')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new InvalidPermissionOriginError()
  }

  if (
    parsed.protocol !== HTTPS_PROTOCOL ||
    parsed.username ||
    parsed.password ||
    !parsed.hostname ||
    parsed.origin === 'null'
  ) {
    throw new InvalidPermissionOriginError()
  }

  return parsed.origin
}

export function parsePersistentPermissions(serialized: unknown): PersistentPermissionState {
  if (typeof serialized !== 'string') {
    throw new InvalidPersistentPermissionStateError('持久权限数据必须是 JSON 字符串')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(serialized) as unknown
  } catch {
    throw new InvalidPersistentPermissionStateError('持久权限数据不是有效 JSON')
  }

  if (
    !isObject(parsed) ||
    !hasExactKeys(parsed, ['version', 'decisions']) ||
    parsed.version !== PERSISTENT_PERMISSION_STATE_VERSION ||
    !Array.isArray(parsed.decisions)
  ) {
    throw new InvalidPersistentPermissionStateError()
  }

  const decisions: PersistentPermissionRecord[] = []
  const seenKeys = new Set<string>()

  for (const candidate of parsed.decisions) {
    if (
      !isObject(candidate) ||
      !hasExactKeys(candidate, ['origin', 'permission', 'decision', 'lifetime']) ||
      !isSupportedPermission(candidate.permission) ||
      !isPermissionDecision(candidate.decision) ||
      candidate.lifetime !== 'persistent'
    ) {
      throw new InvalidPersistentPermissionStateError()
    }

    let origin: string
    try {
      origin = normalizeHttpsOrigin(candidate.origin)
    } catch {
      throw new InvalidPersistentPermissionStateError()
    }

    const key = permissionKey(candidate.permission, origin)
    if (seenKeys.has(key)) {
      throw new InvalidPersistentPermissionStateError('持久权限数据包含重复决定')
    }
    seenKeys.add(key)

    decisions.push({
      origin,
      permission: candidate.permission,
      decision: candidate.decision,
      lifetime: 'persistent',
    })
  }

  return {
    version: PERSISTENT_PERMISSION_STATE_VERSION,
    decisions: sortDecisions(decisions),
  }
}

export class PermissionPolicy {
  private readonly decisions = new Map<string, PermissionRecord>()

  constructor(initialDecisions: readonly PermissionRecord[] = []) {
    for (const decision of initialDecisions) {
      this.setDecision(decision)
    }
  }

  static fromPersistentJson(serialized: unknown): PermissionPolicy {
    try {
      return new PermissionPolicy(parsePersistentPermissions(serialized).decisions)
    } catch {
      return new PermissionPolicy()
    }
  }

  setDecision(candidate: unknown): PermissionRecord {
    if (
      !isObject(candidate) ||
      !isSupportedPermission(candidate.permission) ||
      !isPermissionDecision(candidate.decision) ||
      !isPermissionLifetime(candidate.lifetime)
    ) {
      throw new InvalidPermissionDecisionError()
    }

    let origin: string
    try {
      origin = normalizeHttpsOrigin(candidate.origin)
    } catch (error) {
      throw new InvalidPermissionDecisionError(
        error instanceof Error ? error.message : '权限来源无效',
      )
    }

    const record: PermissionRecord = {
      origin,
      permission: candidate.permission,
      decision: candidate.decision,
      lifetime: candidate.lifetime,
    }

    this.decisions.set(permissionKey(record.permission, record.origin), record)
    return cloneDecision(record)
  }

  getDecision(permission: unknown, origin: unknown): PermissionRecord | undefined {
    const key = safePermissionKey(permission, origin)
    if (!key) {
      return undefined
    }

    const decision = this.decisions.get(key)
    return decision ? cloneDecision(decision) : undefined
  }

  consumeDecision(permission: unknown, origin: unknown): PermissionRecord | undefined {
    const key = safePermissionKey(permission, origin)
    if (!key) {
      return undefined
    }

    const decision = this.decisions.get(key)
    if (!decision) {
      return undefined
    }

    if (decision.lifetime === 'once') {
      this.decisions.delete(key)
    }

    return cloneDecision(decision)
  }

  isAllowed(permission: unknown, origin: unknown): boolean {
    return this.consumeDecision(permission, origin)?.decision === 'allow'
  }

  queryDecisions(query: PermissionQuery = {}): PermissionRecord[] {
    const normalizedQuery = normalizeQuery(query, true)
    if (!normalizedQuery) {
      return []
    }

    return sortDecisions(
      [...this.decisions.values()]
        .filter(
          (decision) =>
            (!normalizedQuery.origin || decision.origin === normalizedQuery.origin) &&
            (!normalizedQuery.permission || decision.permission === normalizedQuery.permission),
        )
        .map(cloneDecision),
    )
  }

  revokeDecisions(query: PermissionQuery): number {
    const normalizedQuery = normalizeQuery(query, false)
    if (!normalizedQuery) {
      return 0
    }

    let revoked = 0
    for (const [key, decision] of this.decisions) {
      if (
        (!normalizedQuery.origin || decision.origin === normalizedQuery.origin) &&
        (!normalizedQuery.permission || decision.permission === normalizedQuery.permission)
      ) {
        this.decisions.delete(key)
        revoked += 1
      }
    }

    return revoked
  }

  clear(): void {
    this.decisions.clear()
  }

  toPersistentJson(): string {
    const decisions = this.queryDecisions()
      .filter(
        (decision): decision is PersistentPermissionRecord => decision.lifetime === 'persistent',
      )
      .map(cloneDecision)

    const state: PersistentPermissionState = {
      version: PERSISTENT_PERMISSION_STATE_VERSION,
      decisions,
    }

    return JSON.stringify(state)
  }
}

function normalizeQuery(
  candidate: unknown,
  allowEmpty: boolean,
): { origin?: string; permission?: SupportedPermission } | undefined {
  if (!isObject(candidate) || !hasOnlyKeys(candidate, ['origin', 'permission'])) {
    return undefined
  }

  const hasOrigin = Object.hasOwn(candidate, 'origin')
  const hasPermission = Object.hasOwn(candidate, 'permission')
  if (!allowEmpty && !hasOrigin && !hasPermission) {
    return undefined
  }

  const normalized: { origin?: string; permission?: SupportedPermission } = {}

  if (hasOrigin) {
    try {
      normalized.origin = normalizeHttpsOrigin(candidate.origin)
    } catch {
      return undefined
    }
  }

  if (hasPermission) {
    if (!isSupportedPermission(candidate.permission)) {
      return undefined
    }
    normalized.permission = candidate.permission
  }

  return normalized
}

function safePermissionKey(permission: unknown, origin: unknown): string | undefined {
  if (!isSupportedPermission(permission)) {
    return undefined
  }

  try {
    return permissionKey(permission, normalizeHttpsOrigin(origin))
  } catch {
    return undefined
  }
}

function permissionKey(permission: SupportedPermission, origin: string): string {
  return `${permission}\u0000${origin}`
}

function cloneDecision<T extends PermissionRecord>(decision: T): T {
  return { ...decision }
}

function sortDecisions<T extends PermissionRecord>(decisions: T[]): T[] {
  return decisions.sort(
    (left, right) =>
      left.origin.localeCompare(right.origin) || left.permission.localeCompare(right.permission),
  )
}

function isObject(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
}

function hasExactKeys(candidate: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(candidate)
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(candidate, key))
}

function hasOnlyKeys(candidate: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(candidate).every((key) => allowed.includes(key))
}

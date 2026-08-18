export const SUPPORTED_PERMISSIONS = [
  'camera',
  'microphone',
  'geolocation',
  'notifications',
  'clipboard-sanitized-write',
] as const

export type SupportedPermission = (typeof SUPPORTED_PERMISSIONS)[number]

export const PERMISSION_DECISIONS = ['allow', 'deny'] as const

export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number]

export const PERMISSION_LIFETIMES = ['once', 'session', 'persistent'] as const

export type PermissionLifetime = (typeof PERMISSION_LIFETIMES)[number]

export interface PermissionRecord {
  readonly origin: string
  readonly permission: SupportedPermission
  readonly decision: PermissionDecision
  readonly lifetime: PermissionLifetime
}

export interface PersistentPermissionRecord extends PermissionRecord {
  readonly lifetime: 'persistent'
}

export const PERSISTENT_PERMISSION_STATE_VERSION = 1 as const

export interface PersistentPermissionState {
  readonly version: typeof PERSISTENT_PERMISSION_STATE_VERSION
  readonly decisions: readonly PersistentPermissionRecord[]
}

const supportedPermissionSet = new Set<string>(SUPPORTED_PERMISSIONS)
const permissionDecisionSet = new Set<string>(PERMISSION_DECISIONS)
const permissionLifetimeSet = new Set<string>(PERMISSION_LIFETIMES)

export function isSupportedPermission(candidate: unknown): candidate is SupportedPermission {
  return typeof candidate === 'string' && supportedPermissionSet.has(candidate)
}

export function isPermissionDecision(candidate: unknown): candidate is PermissionDecision {
  return typeof candidate === 'string' && permissionDecisionSet.has(candidate)
}

export function isPermissionLifetime(candidate: unknown): candidate is PermissionLifetime {
  return typeof candidate === 'string' && permissionLifetimeSet.has(candidate)
}

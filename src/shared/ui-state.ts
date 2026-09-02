import type { DownloadSnapshot } from './downloads.js'
import type { PermissionRecord, SupportedPermission } from './permissions.js'
import type { Scene } from './scenes.js'
import type { UpdateSnapshot } from './updates.js'

export const FOCUS_MODES = [
  'navigate',
  'command',
  'scenes',
  'permissions',
  'downloads',
  'update',
] as const

export type FocusMode = (typeof FOCUS_MODES)[number]

export const CONTROL_PRESENTATIONS = ['omnibar', 'surface', 'toast'] as const
export type ControlPresentation = (typeof CONTROL_PRESENTATIONS)[number]
export const MAX_VISIBLE_ROWS = 6
export const MAX_VISIBLE_ROWS_COMPACT = 4

export function presentationForFocusMode(mode: FocusMode): ControlPresentation {
  return mode === 'navigate' || mode === 'command' ? 'omnibar' : 'surface'
}

export interface PermissionPrompt {
  readonly id: string
  readonly origin: string
  readonly permissions: readonly SupportedPermission[]
  readonly requestedAt: string
}

export interface ChromeState {
  readonly currentUrl: string
  readonly canGoBack: boolean
  readonly canGoForward: boolean
  readonly scenes: readonly Scene[]
  readonly downloads: readonly DownloadSnapshot[]
  readonly permissionRecords: readonly PermissionRecord[]
  readonly permissionPrompt: PermissionPrompt | null
  readonly update: UpdateSnapshot
  readonly focusMode: FocusMode
  /** 每次从隐藏打开控制面时递增，renderer 用来区分「重新打开」和打开后的增量快照。 */
  readonly openGeneration: number
}

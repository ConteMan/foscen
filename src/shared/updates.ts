export type UpdateStatus =
  'unsupported' | 'idle' | 'checking' | 'available' | 'downloaded' | 'up-to-date' | 'error'

export interface UpdateSnapshot {
  readonly status: UpdateStatus
  readonly currentVersion: string
  readonly availableVersion?: string
  readonly message?: string
}

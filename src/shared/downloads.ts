export type DownloadStatus =
  | 'awaiting-approval'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'interrupted'
  | 'rejected'

export interface DownloadSnapshot {
  id: string
  filename: string
  sourceOrigin: string
  receivedBytes: number
  totalBytes: number
  status: DownloadStatus
  startedAt: string
  completedAt?: string
  error?: string
}

import { randomUUID } from 'node:crypto'

import type {
  BluetoothDevice,
  Event,
  FilesystemPermissionRequest,
  MediaAccessPermissionRequest,
  OpenExternalPermissionRequest,
  PermissionCheckHandlerHandlerDetails,
  PermissionRequest,
  SelectHidDeviceDetails,
  SelectUsbDeviceDetails,
  SerialPort,
  Session,
  WebContents,
} from 'electron'

import {
  isPermissionDecision,
  isPermissionLifetime,
  type PermissionRecord,
  type SupportedPermission,
} from '../shared/permissions.js'
import { normalizeHttpsOrigin, PermissionPolicy } from './permission-policy.js'
import type { PermissionStore } from './permission-store.js'

const REQUEST_TIMEOUT_MS = 30_000
const MAX_PENDING_REQUESTS = 32

export interface PermissionPrompt {
  readonly id: string
  readonly origin: string
  readonly permissions: readonly SupportedPermission[]
  readonly requestedAt: string
}

export type PermissionActionResult = { ok: true } | { ok: false; error: string }

interface PendingPermissionRequest {
  readonly prompt: PermissionPrompt
  readonly callback: (allowed: boolean) => void
  timeout: NodeJS.Timeout | undefined
  readonly expiresAt: number
  responding: boolean
  cancelled: boolean
  settled: boolean
}

export interface PermissionControllerOptions {
  readonly session: Session
  readonly sceneContents: WebContents
  readonly policy: PermissionPolicy
  readonly store: PermissionStore
  readonly onChanged: (
    records: readonly PermissionRecord[],
    prompt: PermissionPrompt | undefined,
    requestAttention: boolean,
  ) => void
}

export class PermissionController {
  private readonly queue: PendingPermissionRequest[] = []
  private activeRequest: PendingPermissionRequest | undefined
  private policyMutationInFlight = false

  constructor(private readonly options: PermissionControllerOptions) {
    this.installHandlers()
  }

  records(): PermissionRecord[] {
    return this.options.policy.queryDecisions()
  }

  prompt(): PermissionPrompt | undefined {
    return this.activeRequest ? { ...this.activeRequest.prompt } : undefined
  }

  async respond(
    id: unknown,
    decision: unknown,
    lifetime: unknown,
  ): Promise<PermissionActionResult> {
    const active = this.activeRequest
    if (
      !active ||
      active.responding ||
      typeof id !== 'string' ||
      id !== active.prompt.id ||
      !isPermissionDecision(decision) ||
      !isPermissionLifetime(lifetime)
    ) {
      return { ok: false, error: '权限回应无效或已过期' }
    }

    try {
      if (normalizeHttpsOrigin(this.options.sceneContents.getURL()) !== active.prompt.origin) {
        this.finishActive(false)
        return { ok: false, error: '网页来源已经改变，本次权限请求已拒绝' }
      }
    } catch {
      this.finishActive(false)
      return { ok: false, error: '网页来源已经改变，本次权限请求已拒绝' }
    }

    active.responding = true
    this.policyMutationInFlight = true
    this.clearTimeout(active)

    const candidatePolicy = new PermissionPolicy(this.options.policy.queryDecisions())
    for (const permission of active.prompt.permissions) {
      candidatePolicy.setDecision({
        origin: active.prompt.origin,
        permission,
        decision,
        lifetime,
      })
    }

    let candidatePersisted = false
    try {
      if (lifetime === 'persistent') {
        await this.options.store.save(candidatePolicy)
        candidatePersisted = true
      }

      if (
        active.cancelled ||
        this.activeRequest !== active ||
        this.currentSceneOrigin() !== active.prompt.origin
      ) {
        if (candidatePersisted) {
          await this.options.store.save(this.options.policy)
        }
        if (this.activeRequest === active) {
          this.finishActive(false)
        }
        return { ok: false, error: '网页来源已经改变，本次权限请求已拒绝' }
      }

      for (const permission of active.prompt.permissions) {
        this.options.policy.setDecision({
          origin: active.prompt.origin,
          permission,
          decision,
          lifetime,
        })
      }

      if (lifetime === 'once') {
        for (const permission of active.prompt.permissions) {
          this.options.policy.consumeDecision(permission, active.prompt.origin)
        }
      }

      this.finishActive(decision === 'allow')
      return { ok: true }
    } catch {
      if (candidatePersisted) {
        await this.options.store.save(this.options.policy).catch(() => undefined)
      }
      if (this.activeRequest === active) {
        this.finishActive(false)
      }
      return { ok: false, error: '权限决定未能安全保存，已拒绝本次请求' }
    } finally {
      active.responding = false
      this.policyMutationInFlight = false
    }
  }

  cancelPendingRequests(): void {
    if (this.activeRequest) {
      this.activeRequest.cancelled = true
      this.settle(this.activeRequest, false)
      this.activeRequest = undefined
    }
    for (const pending of this.queue.splice(0)) {
      this.settle(pending, false)
    }
    this.notify(false)
  }

  async revoke(origin: unknown, permission: unknown): Promise<PermissionActionResult> {
    if (this.policyMutationInFlight) {
      return { ok: false, error: '另一个权限操作正在进行，请稍后重试' }
    }
    if (typeof origin !== 'string' || typeof permission !== 'string') {
      return { ok: false, error: '权限撤销参数无效' }
    }

    this.policyMutationInFlight = true
    try {
      const revoked = this.options.policy.revokeDecisions({
        origin,
        permission: permission as SupportedPermission,
      })
      if (revoked === 0) {
        return { ok: false, error: '没有找到可撤销的权限决定' }
      }

      try {
        await this.options.store.save(this.options.policy)
      } catch {
        return { ok: false, error: '权限已从当前会话撤销，但持久文件更新失败' }
      } finally {
        this.notify(false)
      }

      return { ok: true }
    } finally {
      this.policyMutationInFlight = false
    }
  }

  dispose(): void {
    this.cancelPendingRequests()

    const { session, sceneContents } = this.options
    session.setPermissionCheckHandler(() => false)
    session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    session.setDevicePermissionHandler(() => false)
    session.setDisplayMediaRequestHandler((_request, callback) => callback({}), {
      useSystemPicker: false,
    })
    session.off('select-hid-device', this.denyHidDevice)
    session.off('select-serial-port', this.denySerialPort)
    session.off('select-usb-device', this.denyUsbDevice)
    sceneContents.off('select-bluetooth-device', this.denyBluetoothDevice)
    sceneContents.off('render-process-gone', this.cancelForRendererGone)
  }

  private installHandlers(): void {
    const { session, sceneContents } = this.options

    session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) =>
      this.checkPermission(webContents, permission, requestingOrigin, details),
    )
    session.setPermissionRequestHandler((webContents, permission, callback, details) => {
      this.requestPermission(webContents, permission, callback, details)
    })
    session.setDevicePermissionHandler(() => false)
    session.setDisplayMediaRequestHandler((_request, callback) => callback({}), {
      useSystemPicker: false,
    })
    session.on('select-hid-device', this.denyHidDevice)
    session.on('select-serial-port', this.denySerialPort)
    session.on('select-usb-device', this.denyUsbDevice)
    sceneContents.on('select-bluetooth-device', this.denyBluetoothDevice)
    sceneContents.on('render-process-gone', this.cancelForRendererGone)
  }

  private checkPermission(
    webContents: WebContents | null,
    permission: string,
    requestingOrigin: string,
    details: PermissionCheckHandlerHandlerDetails,
  ): boolean {
    const sceneOrigin = this.currentSceneOrigin()
    if (
      (webContents !== this.options.sceneContents &&
        !(permission === 'notifications' && webContents === null)) ||
      !details.isMainFrame ||
      !sceneOrigin ||
      !this.originsMatch(requestingOrigin, details.requestingUrl, details.securityOrigin)
    ) {
      return false
    }

    const supported = mapCheckedPermission(permission, details)
    if (supported.length === 0) {
      return false
    }

    let consumedOnce = false
    const allowed = supported.every((candidate) => {
      const record = this.options.policy.consumeDecision(candidate, sceneOrigin)
      consumedOnce ||= record?.lifetime === 'once'
      return record?.decision === 'allow'
    })
    if (consumedOnce) {
      queueMicrotask(() => this.notify(false))
    }
    return allowed
  }

  private requestPermission(
    webContents: WebContents,
    permission: string,
    callback: (allowed: boolean) => void,
    details:
      | PermissionRequest
      | FilesystemPermissionRequest
      | MediaAccessPermissionRequest
      | OpenExternalPermissionRequest,
  ): void {
    const sceneOrigin = this.currentSceneOrigin()
    const origin = permissionRequestOrigin(permission, details) ?? sceneOrigin
    const supported = mapRequestedPermission(permission, details)

    if (
      webContents !== this.options.sceneContents ||
      !details.isMainFrame ||
      supported.length === 0 ||
      !origin ||
      !sceneOrigin ||
      !this.originsMatch(origin, details.requestingUrl, mediaSecurityOrigin(details))
    ) {
      callback(false)
      return
    }

    if (this.queue.length + (this.activeRequest ? 1 : 0) >= MAX_PENDING_REQUESTS) {
      callback(false)
      return
    }

    const missing: SupportedPermission[] = []
    let consumedOnce = false
    for (const candidate of supported) {
      const record = this.options.policy.consumeDecision(candidate, origin)
      consumedOnce ||= record?.lifetime === 'once'
      if (!record) {
        missing.push(candidate)
      } else if (record.decision === 'deny') {
        callback(false)
        if (consumedOnce) {
          this.notify(false)
        }
        return
      }
    }

    if (missing.length === 0) {
      callback(true)
      if (consumedOnce) {
        this.notify(false)
      }
      return
    }

    const pending: PendingPermissionRequest = {
      prompt: {
        id: randomUUID(),
        origin: sceneOrigin,
        permissions: missing,
        requestedAt: new Date().toISOString(),
      },
      callback,
      timeout: undefined,
      expiresAt: Date.now() + REQUEST_TIMEOUT_MS,
      responding: false,
      cancelled: false,
      settled: false,
    }
    this.queue.push(pending)
    this.activateNext()
  }

  private originsMatch(...candidates: Array<string | undefined>): boolean {
    const sceneOrigin = this.currentSceneOrigin()
    if (!sceneOrigin) {
      return false
    }

    const provided = candidates.filter((candidate): candidate is string => Boolean(candidate))
    if (provided.length === 0) {
      return false
    }

    try {
      return provided.every((candidate) => normalizeHttpsOrigin(candidate) === sceneOrigin)
    } catch {
      return false
    }
  }

  private currentSceneOrigin(): string | undefined {
    try {
      return normalizeHttpsOrigin(this.options.sceneContents.getURL())
    } catch {
      return undefined
    }
  }

  private activateNext(): void {
    if (this.activeRequest) {
      return
    }

    const next = this.queue.shift()
    if (!next) {
      this.notify(false)
      return
    }

    this.activeRequest = next
    const remainingMs = next.expiresAt - Date.now()
    if (remainingMs <= 0) {
      this.settle(next, false)
      this.activeRequest = undefined
      this.activateNext()
      return
    }
    next.timeout = setTimeout(() => {
      if (this.activeRequest === next) {
        this.finishActive(false)
      }
    }, remainingMs)
    next.timeout.unref()
    this.notify(true)
  }

  private finishActive(allowed: boolean): void {
    const active = this.activeRequest
    if (!active) {
      return
    }

    this.activeRequest = undefined
    this.settle(active, allowed)
    this.notify(false)
    this.activateNext()
  }

  private settle(pending: PendingPermissionRequest, allowed: boolean): void {
    if (pending.settled) {
      return
    }
    pending.settled = true
    this.clearTimeout(pending)
    pending.callback(allowed)
  }

  private clearTimeout(pending: PendingPermissionRequest): void {
    if (pending.timeout) {
      clearTimeout(pending.timeout)
      pending.timeout = undefined
    }
  }

  private notify(requestAttention: boolean): void {
    this.options.onChanged(this.records(), this.prompt(), requestAttention)
  }

  private readonly denyHidDevice = (
    event: Event,
    _details: SelectHidDeviceDetails,
    callback: (deviceId?: string | null) => void,
  ): void => {
    event.preventDefault()
    callback()
  }

  private readonly denySerialPort = (
    event: Event,
    _ports: SerialPort[],
    _contents: WebContents,
    callback: (portId: string) => void,
  ): void => {
    event.preventDefault()
    callback('')
  }

  private readonly denyUsbDevice = (
    event: Event,
    _details: SelectUsbDeviceDetails,
    callback: (deviceId?: string) => void,
  ): void => {
    event.preventDefault()
    callback()
  }

  private readonly denyBluetoothDevice = (
    event: Event,
    _devices: BluetoothDevice[],
    callback: (deviceId: string) => void,
  ): void => {
    event.preventDefault()
    callback('')
  }

  private readonly cancelForRendererGone = (): void => {
    this.cancelPendingRequests()
  }
}

function mapCheckedPermission(
  permission: string,
  details: PermissionCheckHandlerHandlerDetails,
): SupportedPermission[] {
  if (permission === 'media') {
    return details.mediaType === 'video'
      ? ['camera']
      : details.mediaType === 'audio'
        ? ['microphone']
        : []
  }
  return mapSimplePermission(permission)
}

function mapRequestedPermission(
  permission: string,
  details:
    | PermissionRequest
    | FilesystemPermissionRequest
    | MediaAccessPermissionRequest
    | OpenExternalPermissionRequest,
): SupportedPermission[] {
  if (permission === 'media') {
    if (!('mediaTypes' in details) || !Array.isArray(details.mediaTypes)) {
      return []
    }
    const supported = new Set<SupportedPermission>()
    for (const mediaType of details.mediaTypes) {
      if (mediaType === 'video') {
        supported.add('camera')
      } else if (mediaType === 'audio') {
        supported.add('microphone')
      }
    }
    return [...supported]
  }
  return mapSimplePermission(permission)
}

function mapSimplePermission(permission: string): SupportedPermission[] {
  switch (permission) {
    case 'geolocation':
    case 'notifications':
    case 'clipboard-sanitized-write':
      return [permission]
    default:
      return []
  }
}

function permissionRequestOrigin(
  permission: string,
  details:
    | PermissionRequest
    | FilesystemPermissionRequest
    | MediaAccessPermissionRequest
    | OpenExternalPermissionRequest,
): string | undefined {
  return permission === 'media' ? mediaSecurityOrigin(details) : details.requestingUrl
}

function mediaSecurityOrigin(
  details:
    | PermissionRequest
    | FilesystemPermissionRequest
    | MediaAccessPermissionRequest
    | OpenExternalPermissionRequest,
): string | undefined {
  return 'securityOrigin' in details && typeof details.securityOrigin === 'string'
    ? details.securityOrigin
    : undefined
}

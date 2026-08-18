const HTTPS_PROTOCOL = 'https:'

export class InvalidSceneUrlError extends Error {
  constructor(message = '仅支持 HTTPS 网页地址') {
    super(message)
    this.name = 'InvalidSceneUrlError'
  }
}

export function normalizeSceneUrl(candidate: unknown): string {
  if (typeof candidate !== 'string') {
    throw new InvalidSceneUrlError('地址必须是字符串')
  }

  const trimmed = candidate.trim()
  if (trimmed.length === 0 || trimmed.length > 2048) {
    throw new InvalidSceneUrlError('地址不能为空且不能超过 2048 个字符')
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    throw new InvalidSceneUrlError('地址格式无效')
  }

  if (
    parsed.protocol !== HTTPS_PROTOCOL ||
    parsed.username ||
    parsed.password ||
    !parsed.hostname
  ) {
    throw new InvalidSceneUrlError()
  }

  return parsed.href
}

export function isAllowedSceneNavigation(target: string, landingPageUrl: string): boolean {
  if (target === landingPageUrl) {
    return true
  }

  try {
    return isSafeParsedSceneUrl(new URL(target))
  } catch {
    return false
  }
}

export function displayableSceneUrl(target: string): string {
  try {
    const parsed = new URL(target)
    return isSafeParsedSceneUrl(parsed) ? parsed.href : ''
  } catch {
    return ''
  }
}

function isSafeParsedSceneUrl(parsed: URL): boolean {
  return (
    parsed.protocol === HTTPS_PROTOCOL &&
    !parsed.username &&
    !parsed.password &&
    Boolean(parsed.hostname) &&
    parsed.origin !== 'null' &&
    parsed.href.length <= 2048
  )
}

import { existsSync } from 'node:fs'
import { link, mkdir, open, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

const MAX_FILENAME_LENGTH = 160
const INVALID_FILENAME_CHARACTERS = /[/\\:*?"<>|]/g
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

function trimFilename(value: string): string {
  const withoutControls = [...value]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0
      return code < 32 || code === 127 ? '-' : character
    })
    .join('')

  return withoutControls
    .replace(INVALID_FILENAME_CHARACTERS, '-')
    .replace(/[. ]+$/g, '')
    .trim()
}

export function sanitizeFilename(candidate: unknown, fallback = 'download'): string {
  const safeFallback = trimFilename(basename(fallback)) || 'download'
  if (typeof candidate !== 'string') {
    return safeFallback
  }

  const normalizedCandidate = trimFilename(basename(candidate.normalize('NFKC')))
  let normalized = normalizedCandidate.replace(/^-+$/g, '')
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    WINDOWS_RESERVED_NAMES.test(normalized)
  ) {
    normalized = safeFallback
  }

  if (normalized.length <= MAX_FILENAME_LENGTH) {
    return normalized
  }

  const extension = extname(normalized).slice(0, 20)
  const stemLimit = Math.max(1, MAX_FILENAME_LENGTH - extension.length)
  return `${normalized.slice(0, stemLimit)}${extension}`
}

export function chooseAvailablePath(
  directory: string,
  suggestedFilename: string,
  reservedPaths: ReadonlySet<string> = new Set(),
): string {
  const filename = sanitizeFilename(suggestedFilename)
  const extension = extname(filename)
  const stem = basename(filename, extension)

  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const candidateName = suffix === 0 ? filename : `${stem}-${suffix}${extension}`
    const candidatePath = join(directory, candidateName)
    if (!reservedPaths.has(candidatePath) && !existsSync(candidatePath)) {
      return candidatePath
    }
  }

  throw new Error('无法分配唯一文件名')
}

export async function writeUniqueFile(
  directory: string,
  suggestedFilename: string,
  data: Uint8Array,
): Promise<string> {
  await mkdir(directory, { mode: 0o700, recursive: true })

  const reserved = new Set<string>()
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const candidate = chooseAvailablePath(directory, suggestedFilename, reserved)
    reserved.add(candidate)

    try {
      await writeFile(candidate, data, { flag: 'wx', mode: 0o600 })
      return candidate
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    }
  }

  throw new Error('无法写入唯一文件')
}

export async function publishStagedFile(
  stagedPath: string,
  directory: string,
  suggestedFilename: string,
): Promise<string> {
  await mkdir(directory, { mode: 0o700, recursive: true })

  const stagedFile = await open(stagedPath, 'r+')
  try {
    await stagedFile.chmod(0o600)
    await stagedFile.sync()
  } finally {
    await stagedFile.close()
  }

  const filename = sanitizeFilename(suggestedFilename)
  const extension = extname(filename)
  const stem = basename(filename, extension)

  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const candidateName = suffix === 0 ? filename : `${stem}-${suffix}${extension}`
    const candidatePath = join(directory, candidateName)

    try {
      await link(stagedPath, candidatePath)
      await unlink(stagedPath).catch(() => undefined)
      return candidatePath
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    }
  }

  throw new Error('无法安全发布下载文件')
}

export function httpsOrigin(candidate: string): string | undefined {
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.hostname
      ? parsed.origin
      : undefined
  } catch {
    return undefined
  }
}

export function isSafeHttpsUrl(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 8192) {
    return false
  }

  try {
    const parsed = new URL(candidate)
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      Boolean(parsed.hostname) &&
      parsed.origin !== 'null'
    )
  } catch {
    return false
  }
}

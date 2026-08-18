import { join } from 'node:path'

import type { WebContentsView } from 'electron'

import { sanitizeFilename, writeUniqueFile } from './safe-files.js'

const MAX_CAPTURE_PIXELS = 50_000_000
const MAX_CAPTURE_BYTES = 64 * 1024 * 1024

function timestampForFilename(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

export class ScreenshotService {
  private lastCapturePath: string | undefined
  private captureInFlight: Promise<string> | undefined

  constructor(
    private readonly sceneView: Pick<WebContentsView, 'getBounds' | 'webContents'>,
    private readonly picturesDirectory: string,
  ) {}

  async capture(): Promise<string> {
    if (this.captureInFlight) {
      throw new Error('截图正在进行，请稍候')
    }
    const operation = this.captureOnce()
    this.captureInFlight = operation
    try {
      return await operation
    } finally {
      this.captureInFlight = undefined
    }
  }

  lastPath(): string | undefined {
    return this.lastCapturePath
  }

  private async captureOnce(): Promise<string> {
    const currentUrl = this.sceneView.webContents.getURL()
    let label = 'scene'
    try {
      const parsed = new URL(currentUrl)
      if (parsed.protocol === 'https:') {
        label = parsed.hostname
      }
    } catch {
      // 内置落地页使用默认名称。
    }

    const bounds = this.sceneView.getBounds()
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      bounds.width * bounds.height > MAX_CAPTURE_PIXELS
    ) {
      throw new Error('当前场景尺寸超过截图安全限制')
    }

    const image = await this.sceneView.webContents.capturePage({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
    })
    if (image.isEmpty()) {
      throw new Error('当前场景没有可截图内容')
    }

    const { width, height } = image.getSize()
    if (width <= 0 || height <= 0 || width * height > MAX_CAPTURE_PIXELS) {
      throw new Error('当前场景尺寸超过截图安全限制')
    }

    const png = image.toPNG()
    if (png.byteLength > MAX_CAPTURE_BYTES) {
      throw new Error('截图文件超过 64 MiB 安全限制')
    }

    const filename = sanitizeFilename(
      `${label}_${timestampForFilename(new Date())}.png`,
      'foscen-scene.png',
    )
    const capturePath = await writeUniqueFile(join(this.picturesDirectory, 'Foscen'), filename, png)
    this.lastCapturePath = capturePath
    return capturePath
  }
}

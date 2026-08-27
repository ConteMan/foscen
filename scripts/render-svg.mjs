#!/usr/bin/env node
// 用随包 Electron 把 SVG 光栅化为带透明通道的 PNG。
//
// 为什么不用 qlmanage：`qlmanage -t` 会给 SVG 铺一层不透明白底，
// 生成的 .icns 在 Dock 里是「白方块上贴个图标」。本机没有 rsvg-convert
// 之类的光栅器，Electron 是唯一已随包、能保留 alpha 的渲染器。
//
// 用法：electron scripts/render-svg.mjs <input.svg> <size> <output.png>

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { BrowserWindow, app } from 'electron'

const [inputPath, sizeArg, outputPath] = process.argv.slice(2)

if (!inputPath || !sizeArg || !outputPath) {
  process.stderr.write('用法: electron scripts/render-svg.mjs <input.svg> <size> <output.png>\n')
  process.exit(1)
}

const size = Number.parseInt(sizeArg, 10)

if (!Number.isInteger(size) || size < 1 || size > 4096) {
  process.stderr.write(`ERROR: 尺寸必须是 1..4096 的整数，收到 ${sizeArg}\n`)
  process.exit(1)
}

const svg = readFileSync(resolve(inputPath), 'utf8')
const page = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden}
  svg{display:block;width:${size}px;height:${size}px}
</style>${svg}`

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  })

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
    // 等一帧，避免捕获到尚未绘制的空白。
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 120))

    const captured = await window.webContents.capturePage()
    // Retina 屏上 capturePage 按设备像素返回（1024 请求会拿到 2048），
    // 统一缩回请求尺寸；高分捕获再降采样反而边缘更干净。
    const image =
      captured.getSize().width === size
        ? captured
        : captured.resize({ width: size, height: size, quality: 'best' })
    const png = image.toPNG()

    if (png.length === 0) {
      throw new Error('capturePage 返回空图像')
    }

    writeFileSync(resolve(outputPath), png)
    process.stdout.write(`${outputPath} ${size}x${size}\n`)
  } catch (error) {
    process.stderr.write(`ERROR: 渲染失败 ${inputPath} — ${String(error)}\n`)
    process.exitCode = 1
  } finally {
    window.destroy()
    app.quit()
  }
})

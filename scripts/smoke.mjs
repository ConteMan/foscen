import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const marker = 'FOSCEN_SMOKE_READY'
const timeoutMs = 20_000

// smoke 使用独立的 --user-data-dir，避免与本机已在运行的 Foscen 实例共用
// userData 目录而触发 Electron 单实例锁。命中锁时第二个实例会以 code=0、
// 无任何输出直接退出，看起来像 smoke 本身挂了，实则与代码无关。
const smokeUserDataDir = await mkdtemp(join(tmpdir(), 'foscen-smoke-'))

const child = spawn('electron', ['.', `--user-data-dir=${smokeUserDataDir}`], {
  env: {
    ...process.env,
    FOSCEN_SMOKE_TEST: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''

child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  stdout += chunk
})
child.stderr.on('data', (chunk) => {
  stderr += chunk
})

const timeout = setTimeout(() => {
  child.kill('SIGTERM')
}, timeoutMs)

async function cleanupUserDataDir() {
  await rm(smokeUserDataDir, { recursive: true, force: true }).catch(() => {})
}

child.on('error', async (error) => {
  clearTimeout(timeout)
  await cleanupUserDataDir()
  console.error(`Electron smoke could not start: ${error.message}`)
  process.exitCode = 1
})

child.on('close', async (code, signal) => {
  clearTimeout(timeout)
  await cleanupUserDataDir()

  if (code === 0 && stdout.includes(marker)) {
    console.log('Electron smoke OK')
    return
  }

  if (code === 0 && signal === null && !stdout && !stderr) {
    // Electron 单实例锁的典型特征：退出码 0、无信号、无任何输出。理论上
    // 独立 --user-data-dir 已规避了与其他 Foscen 实例共用锁文件的情况，
    // 但仍保留这个诊断分支，避免将来出现同类问题时又退化成「no output」。
    console.error(
      '检测到 Electron 以 code=0 且无输出直接退出，疑似命中了单实例锁（例如本机已有 Foscen 实例占用了相同的 --user-data-dir）。请确认没有其他 Foscen/Electron 实例正在使用该临时目录后重试。',
    )
    process.exitCode = 1
    return
  }

  const diagnostic = stderr.trim() || stdout.trim() || 'no output'
  console.error(
    `Electron smoke failed (code=${String(code)}, signal=${String(signal)}): ${diagnostic}`,
  )
  process.exitCode = 1
})

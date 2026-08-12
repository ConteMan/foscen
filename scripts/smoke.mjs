import { spawn } from 'node:child_process'

const marker = 'FOSCEN_SMOKE_READY'
const timeoutMs = 20_000

const child = spawn('electron', ['.'], {
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

child.on('error', (error) => {
  clearTimeout(timeout)
  console.error(`Electron smoke could not start: ${error.message}`)
  process.exitCode = 1
})

child.on('close', (code, signal) => {
  clearTimeout(timeout)

  if (code === 0 && stdout.includes(marker)) {
    console.log('Electron smoke OK')
    return
  }

  const diagnostic = stderr.trim() || stdout.trim() || 'no output'
  console.error(
    `Electron smoke failed (code=${String(code)}, signal=${String(signal)}): ${diagnostic}`,
  )
  process.exitCode = 1
})

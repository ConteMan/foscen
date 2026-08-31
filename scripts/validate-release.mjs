#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
const quiet = process.argv.includes('--quiet')
const failures = []
const stableSemverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function requireEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) failures.push(`缺少环境变量 ${name}`)
  return value
}

if (process.env.FOSCEN_RELEASE !== '1') {
  failures.push('发布必须显式设置 FOSCEN_RELEASE=1')
}
if (process.platform !== 'darwin') {
  failures.push('签名、公证和 macOS 发布必须在 macOS 上执行')
}

const identity = requireEnvironment('APPLE_SIGN_IDENTITY')
const apiKeyPath = requireEnvironment('APPLE_API_KEY')
const apiKeyId = requireEnvironment('APPLE_API_KEY_ID')
const apiIssuer = requireEnvironment('APPLE_API_ISSUER')

// FOSCEN_RELEASE_TAG 由 workflow_dispatch 手动重跑传入，优先于 GITHUB_REF_NAME：
// 手动触发时 GITHUB_REF_NAME/GITHUB_REF_TYPE 反映的是运行工作流的分支，而非目标发布 tag
const manualReleaseTag = process.env.FOSCEN_RELEASE_TAG?.trim()
const releaseTag = manualReleaseTag || process.env.GITHUB_REF_NAME?.trim()
const expectedTag = `v${packageJson.version}`
if (releaseTag !== expectedTag) {
  failures.push(`发布 tag 必须等于 ${expectedTag}，当前为 ${releaseTag || '空'}`)
}
if (!manualReleaseTag && process.env.GITHUB_REF_TYPE && process.env.GITHUB_REF_TYPE !== 'tag') {
  failures.push('GitHub 发布只能从 tag ref 执行')
}
try {
  const gitTag = execFileSync('git', ['tag', '--points-at', 'HEAD', '--list', expectedTag], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  if (gitTag !== expectedTag) {
    failures.push(`当前 Git 提交 tag 必须等于 ${expectedTag}，实际为 ${gitTag}`)
  }
} catch {
  failures.push(`当前 Git 提交没有精确 tag ${expectedTag}`)
}
if (!stableSemverPattern.test(packageJson.version)) {
  failures.push(`本发布通道只接受稳定 SemVer x.y.z：${packageJson.version}`)
}
if (!changelog.includes(`## [${packageJson.version}]`)) {
  failures.push(`CHANGELOG.md 缺少 ${packageJson.version} 版本标题`)
}
try {
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  if (status) {
    failures.push('发布工作区必须干净')
  }
} catch {
  failures.push('无法验证发布工作区状态')
}
try {
  execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main'], {
    cwd: root,
    stdio: 'ignore',
  })
} catch {
  failures.push('发布 tag 提交必须已经合入 origin/main')
}
if (identity && !identity.startsWith('Developer ID Application:')) {
  failures.push('APPLE_SIGN_IDENTITY 必须是 Developer ID Application 证书名称')
}
if (apiKeyId && !/^[A-Z0-9]{10,}$/.test(apiKeyId)) {
  failures.push('APPLE_API_KEY_ID 格式无效')
}
if (
  apiIssuer &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiIssuer)
) {
  failures.push('APPLE_API_ISSUER 必须是 UUID')
}

if (apiKeyPath) {
  try {
    const absoluteApiKeyPath = resolve(apiKeyPath)
    const keyStat = statSync(absoluteApiKeyPath)
    const keyText = readFileSync(absoluteApiKeyPath, 'utf8')
    if (!keyStat.isFile()) failures.push('APPLE_API_KEY 必须指向普通文件')
    if ((keyStat.mode & 0o077) !== 0) failures.push('APPLE_API_KEY 文件权限必须为 0600')
    if (!keyText.includes('-----BEGIN PRIVATE KEY-----')) {
      failures.push('APPLE_API_KEY 文件不是有效的 P8 私钥')
    }
  } catch {
    failures.push('APPLE_API_KEY 指向的文件不可读')
  }
}

if (identity && process.platform === 'darwin') {
  try {
    const args = ['find-identity', '-v', '-p', 'codesigning']
    if (process.env.FOSCEN_KEYCHAIN?.trim()) args.push(process.env.FOSCEN_KEYCHAIN.trim())
    const identities = execFileSync('security', args, { encoding: 'utf8' })
    if (!identities.includes(identity)) failures.push('指定的 Developer ID 证书不在目标 keychain')
  } catch {
    failures.push('无法读取目标 keychain 中的签名身份')
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[release] ${failure}`)
  process.exit(1)
}

if (!quiet) console.log(`[release] ${expectedTag} 的发布环境校验通过`)

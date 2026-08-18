#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const require = createRequire(import.meta.url)
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const config = require(join(root, 'forge.config.cjs'))
const asarTools = require('@electron/asar')
const failures = []
const stableSemverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function isIgnoredByPackager(relativePath) {
  return config.__shouldIgnoreBundlePath?.(relativePath) !== false
}

function filesBelow(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

function plistValue(plistPath, key) {
  try {
    return execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plistPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return undefined
  }
}

function codeSignDetails(file) {
  const result = spawnSync('codesign', ['-d', '--entitlements', ':-', '--verbose=4', file], {
    encoding: 'utf8',
  })
  return result.status === 0 ? `${result.stdout}${result.stderr}` : ''
}

for (const dependency of [
  '@electron-forge/cli',
  '@electron-forge/maker-dmg',
  '@electron-forge/maker-zip',
  '@electron-forge/publisher-github',
]) {
  assert(
    packageJson.devDependencies?.[dependency] === '7.11.2',
    `${dependency} 必须精确锁定 7.11.2`,
  )
}
assert(packageJson.productName === 'Foscen', 'productName 必须是 Foscen')
assert(stableSemverPattern.test(packageJson.version), 'version 必须是稳定 SemVer x.y.z')
assert(
  config.packagerConfig?.appBundleId === 'com.conteman.foscen',
  'bundle id 必须是 com.conteman.foscen',
)
assert(config.packagerConfig?.asar === true, '打包必须启用 asar')
assert(
  config.packagerConfig?.icon?.endsWith('assets/brand/foscen.icns'),
  'Packager 必须使用品牌 icns',
)
for (const path of ['/dist/main/index.js', '/LICENSE', '/package.json']) {
  assert(!isIgnoredByPackager(path), `Packager 不得忽略运行必需文件：${path}`)
}
for (const path of [
  '/.env',
  '/.git-credentials',
  '/.netrc',
  '/.npmrc',
  '/credentials.json',
  '/credentials/AuthKey_TEST.p8',
  '/credentials/developer-id.cer',
  '/credentials/developer-id.p12',
  '/credentials/signing.keychain-db',
  '/credentials/profile.provisionprofile',
]) {
  assert(isIgnoredByPackager(path), `Packager 必须忽略敏感文件：${path}`)
}
const signingContracts = [
  ['Foscen.app', 'entitlements.plist'],
  ['Foscen.app/Contents/Frameworks/Foscen Helper.app', 'entitlements.helper.plist'],
  ['Foscen.app/Contents/Frameworks/Foscen Helper (Renderer).app', 'entitlements.helper.plist'],
  ['Foscen.app/Contents/Frameworks/Foscen Helper (GPU).app', 'entitlements.helper.plist'],
  ['Foscen.app/Contents/Frameworks/Foscen Helper (Plugin).app', 'entitlements.plugin.plist'],
  ['Foscen.app/Contents/Frameworks/Electron Framework.framework', 'entitlements.helper.plist'],
]
for (const [relativeFile, entitlementsFile] of signingContracts) {
  const file = join(root, 'out', 'Foscen-darwin-universal', relativeFile)
  const signingOptions = config.__signOptionsForFile?.(file)
  assert(
    signingOptions?.entitlements === join(root, 'build', entitlementsFile),
    `签名文件 entitlement 分类错误：${file}`,
  )
  assert(signingOptions?.hardenedRuntime === true, `签名文件必须启用 Hardened Runtime：${file}`)
}
if (process.env.FOSCEN_RELEASE === '1') {
  assert(config.packagerConfig?.osxSign !== undefined, '正式发布必须启用 Developer ID 签名')
  assert(config.packagerConfig?.osxNotarize !== undefined, '正式发布必须启用 Apple 公证')
} else {
  assert(config.packagerConfig?.osxSign === undefined, '本地默认配置不应要求签名证书')
  assert(config.packagerConfig?.osxNotarize === undefined, '本地默认配置不应触发公证')
}
assert(
  config.makers?.some((maker) => maker.name === '@electron-forge/maker-dmg'),
  '必须配置 DMG maker',
)
assert(
  config.makers?.some((maker) => maker.name === '@electron-forge/maker-zip'),
  '必须配置 ZIP maker',
)
const publisher = config.publishers?.find(
  (item) => item.name === '@electron-forge/publisher-github',
)
assert(publisher?.config?.draft === true, '上传期间 GitHub Release 必须保持 draft')
assert(publisher?.config?.prerelease === false, 'GitHub Release 不得为 prerelease')
assert(publisher?.config?.force === true, 'draft Release 重试必须替换旧资产')
assert(publisher?.config?.repository?.owner === 'ConteMan', 'GitHub owner 必须是 ConteMan')
assert(publisher?.config?.repository?.name === 'foscen', 'GitHub repository 必须是 foscen')

for (const requiredFile of [
  'assets/brand/foscen.icns',
  'build/entitlements.plist',
  'build/entitlements.helper.plist',
  'build/entitlements.plugin.plist',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
]) {
  assert(existsSync(join(root, requiredFile)), `缺少 ${requiredFile}`)
}
if (existsSync(join(root, 'assets/brand/foscen.icns'))) {
  assert(statSync(join(root, 'assets/brand/foscen.icns')).size > 10_000, '应用图标文件异常')
}
for (const entitlementFile of [
  'build/entitlements.plist',
  'build/entitlements.helper.plist',
  'build/entitlements.plugin.plist',
]) {
  try {
    execFileSync('plutil', ['-lint', join(root, entitlementFile)], { stdio: 'pipe' })
  } catch {
    failures.push(`${entitlementFile} 不是有效 plist`)
  }
}
const workspaceYaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
assert(workspaceYaml.includes('nodeLinker: hoisted'), 'Electron Forge 要求 pnpm 使用 hoisted 布局')
assert(
  workspaceYaml.includes("'@electron/node-gyp': 10.2.0-electron.2"),
  '缺少 Electron node-gyp registry override',
)
const lockfile = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')
assert(lockfile.includes("'@electron-forge/cli':"), '锁文件缺少 Forge CLI importer')
assert(lockfile.includes('@electron/node-gyp@10.2.0-electron.2'), '锁文件缺少 registry node-gyp')
assert(!lockfile.includes('github.com/electron/node-gyp.git'), '锁文件不得包含 node-gyp Git 依赖')

if (process.argv.includes('--artifacts')) {
  const outFiles = filesBelow(join(root, 'out'))
  const appPath = join(root, 'out', 'Foscen-darwin-universal', 'Foscen.app')
  const infoPlist = join(appPath, 'Contents', 'Info.plist')
  const executable = join(appPath, 'Contents', 'MacOS', 'Foscen')
  const asar = join(appPath, 'Contents', 'Resources', 'app.asar')
  const dmgs = outFiles.filter((file) => extname(file) === '.dmg')
  const zips = outFiles.filter((file) => extname(file) === '.zip')

  assert(existsSync(appPath), '缺少 universal Foscen.app')
  assert(existsSync(infoPlist), '缺少应用 Info.plist')
  assert(existsSync(executable), '缺少应用主可执行文件')
  assert(existsSync(asar), '缺少 app.asar')
  assert(dmgs.length === 1, `应生成 1 个 DMG，实际 ${dmgs.length}`)
  assert(zips.length === 1, `应生成 1 个 ZIP，实际 ${zips.length}`)
  if (existsSync(asar)) {
    for (const entry of asarTools.listPackage(asar)) {
      const normalized = entry.split('\\').join('/')
      assert(!isIgnoredByPackager(normalized), `app.asar 包含白名单外文件：${normalized}`)
    }
  }
  for (const artifact of dmgs) {
    const name = basename(artifact)
    assert(
      name === `Foscen-${packageJson.version}-universal.dmg`,
      `DMG 名称不符合发布合同：${name}`,
    )
    assert(statSync(artifact).size > 1_000_000, `制品异常过小：${name}`)
  }
  for (const artifact of zips) {
    const name = basename(artifact)
    assert(
      name === `Foscen-darwin-universal-${packageJson.version}.zip`,
      `ZIP 名称不符合更新服务合同：${name}`,
    )
    assert(
      /.*-(?:mac|darwin|osx).*-universal.*\.zip$/i.test(name),
      `ZIP 无法被 update.electronjs.org 识别：${name}`,
    )
    assert(statSync(artifact).size > 1_000_000, `制品异常过小：${name}`)
  }

  if (existsSync(infoPlist)) {
    assert(
      plistValue(infoPlist, 'CFBundleIdentifier') === 'com.conteman.foscen',
      'Info.plist bundle id 错误',
    )
    assert(
      plistValue(infoPlist, 'CFBundleShortVersionString') === packageJson.version,
      'Info.plist 版本错误',
    )
    for (const key of [
      'NSCameraUsageDescription',
      'NSDownloadsFolderUsageDescription',
      'NSLocationUsageDescription',
      'NSMicrophoneUsageDescription',
      'NSPicturesFolderUsageDescription',
    ]) {
      assert((plistValue(infoPlist, key)?.length ?? 0) > 20, `Info.plist 缺少 ${key}`)
    }
  }
  if (existsSync(executable)) {
    const architectures = execFileSync('lipo', ['-archs', executable], {
      encoding: 'utf8',
    })
    assert(
      architectures.includes('arm64') && architectures.includes('x86_64'),
      '主程序不是 arm64+x86_64 universal',
    )

    try {
      const output = execFileSync(executable, [], {
        encoding: 'utf8',
        env: { ...process.env, FOSCEN_SMOKE_TEST: '1' },
        timeout: 20_000,
      })
      assert(output.includes('FOSCEN_SMOKE_READY'), '打包应用未完成可信 UI 启动握手')
    } catch {
      failures.push('打包应用启动 smoke 失败')
    }
  }

  if (process.env.FOSCEN_RELEASE === '1' && existsSync(appPath)) {
    for (const [command, args, message] of [
      [
        'codesign',
        ['--verify', '--deep', '--strict', '--verbose=2', appPath],
        'Developer ID 签名验证失败',
      ],
      ['spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath], 'Gatekeeper 验证失败'],
      ['xcrun', ['stapler', 'validate', appPath], '公证票据验证失败'],
    ]) {
      try {
        execFileSync(command, args, { stdio: 'pipe' })
      } catch {
        failures.push(message)
      }
    }

    const entitlementContracts = [
      [
        appPath,
        ['com.apple.security.cs.allow-jit', 'com.apple.security.device.camera'],
        [
          'com.apple.security.cs.allow-unsigned-executable-memory',
          'com.apple.security.cs.disable-library-validation',
        ],
      ],
      [
        join(appPath, 'Contents', 'Frameworks', 'Foscen Helper.app'),
        ['com.apple.security.cs.allow-jit'],
        ['com.apple.security.device.camera', 'com.apple.security.personal-information.location'],
      ],
      [
        join(appPath, 'Contents', 'Frameworks', 'Foscen Helper (Renderer).app'),
        ['com.apple.security.cs.allow-jit'],
        ['com.apple.security.device.camera', 'com.apple.security.personal-information.location'],
      ],
      [
        join(appPath, 'Contents', 'Frameworks', 'Foscen Helper (GPU).app'),
        ['com.apple.security.cs.allow-jit'],
        ['com.apple.security.device.camera', 'com.apple.security.personal-information.location'],
      ],
      [
        join(appPath, 'Contents', 'Frameworks', 'Foscen Helper (Plugin).app'),
        [
          'com.apple.security.cs.allow-unsigned-executable-memory',
          'com.apple.security.cs.disable-library-validation',
        ],
        ['com.apple.security.device.camera', 'com.apple.security.personal-information.location'],
      ],
    ]
    for (const [file, requiredKeys, forbiddenKeys] of entitlementContracts) {
      const details = codeSignDetails(file)
      assert(details.includes('runtime'), `签名文件未启用 Hardened Runtime：${file}`)
      for (const key of requiredKeys) {
        assert(details.includes(key), `签名文件缺少 entitlement ${key}：${file}`)
      }
      for (const key of forbiddenKeys) {
        assert(!details.includes(key), `签名文件包含越界 entitlement ${key}：${file}`)
      }
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[package] ${failure}`)
  process.exit(1)
}

console.log(
  process.argv.includes('--artifacts')
    ? '[package] universal 应用、DMG、ZIP 验证通过'
    : '[package] Forge 配置验证通过',
)

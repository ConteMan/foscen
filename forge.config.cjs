/* eslint-disable @typescript-eslint/no-require-imports */
/* global __dirname, module, process, require */

const { execFileSync } = require('node:child_process')
const path = require('node:path')

const root = __dirname
const releaseMode = process.env.FOSCEN_RELEASE === '1'
const entitlementsPath = path.join(root, 'build', 'entitlements.plist')
const helperEntitlementsPath = path.join(root, 'build', 'entitlements.helper.plist')
const pluginEntitlementsPath = path.join(root, 'build', 'entitlements.plugin.plist')
const rootPath = root.split(path.sep).join('/')

function signOptionsForFile(filePath) {
  let entitlements = entitlementsPath
  if (filePath.includes('(Plugin).app')) {
    entitlements = pluginEntitlementsPath
  } else if (filePath.includes(`${path.sep}Contents${path.sep}Frameworks${path.sep}`)) {
    entitlements = helperEntitlementsPath
  }
  return {
    entitlements,
    hardenedRuntime: true,
  }
}

if (releaseMode) {
  execFileSync(process.execPath, [path.join(root, 'scripts/validate-release.mjs'), '--quiet'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  })
}

function bundleRelativePath(filePath) {
  const normalized = filePath.split(path.sep).join('/')
  const relative = normalized.startsWith(rootPath) ? normalized.slice(rootPath.length) : normalized
  return relative.startsWith('/') ? relative : `/${relative}`
}

function isSensitiveBundlePath(relativePath) {
  const filename = relativePath.split('/').at(-1)?.toLowerCase() ?? ''
  return (
    /^\.env(?:\..*)?$/.test(filename) ||
    [
      '.authinfo',
      '.authinfo.gpg',
      '.git-credentials',
      '.netrc',
      '.npmrc',
      'credentials.json',
    ].includes(filename) ||
    /\.(?:cer|key|keychain|keychain-db|mobileprovision|p12|p8|pem|provisionprofile)$/.test(filename)
  )
}

function shouldIgnoreBundlePath(filePath) {
  const relativePath = bundleRelativePath(filePath)
  if (isSensitiveBundlePath(relativePath)) {
    return true
  }
  if (relativePath === '/' || relativePath === '/package.json' || relativePath === '/LICENSE') {
    return false
  }
  if (relativePath === '/node_modules/.bin' || relativePath.startsWith('/node_modules/.bin/')) {
    return true
  }
  return !(
    relativePath === '/dist' ||
    relativePath.startsWith('/dist/') ||
    relativePath === '/node_modules' ||
    relativePath.startsWith('/node_modules/')
  )
}

const osxSign = releaseMode
  ? {
      identity: process.env.APPLE_SIGN_IDENTITY,
      keychain: process.env.FOSCEN_KEYCHAIN,
      optionsForFile: signOptionsForFile,
    }
  : undefined

module.exports = {
  packagerConfig: {
    appBundleId: 'com.conteman.foscen',
    appCategoryType: 'public.app-category.productivity',
    appCopyright: 'Copyright © 2026 ConteMan',
    asar: true,
    executableName: 'Foscen',
    extendInfo: {
      CFBundleDisplayName: 'Foscen',
      NSCameraUsageDescription:
        'Foscen uses the camera only when you approve access for the current web scene.',
      NSDownloadsFolderUsageDescription:
        'Foscen saves downloads that you explicitly approve to your Downloads folder.',
      NSLocationUsageDescription:
        'Foscen shares location only when you approve access for the current web scene.',
      NSMicrophoneUsageDescription:
        'Foscen uses the microphone only when you approve access for the current web scene.',
      NSPicturesFolderUsageDescription:
        'Foscen saves screenshots that you explicitly capture to your Pictures folder.',
    },
    icon: path.join(root, 'assets/brand/foscen.icns'),
    ignore: shouldIgnoreBundlePath,
    osxSign,
    osxNotarize: releaseMode
      ? {
          appleApiKey: process.env.APPLE_API_KEY,
          appleApiKeyId: process.env.APPLE_API_KEY_ID,
          appleApiIssuer: process.env.APPLE_API_ISSUER,
        }
      : undefined,
    overwrite: true,
  },
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: path.join(root, 'assets/brand/foscen.icns'),
        overwrite: true,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'ConteMan', name: 'foscen' },
        draft: true,
        prerelease: false,
        force: true,
        generateReleaseNotes: true,
        tagPrefix: 'v',
      },
    },
  ],
}

Object.defineProperty(module.exports, '__signOptionsForFile', {
  value: signOptionsForFile,
  enumerable: false,
})

Object.defineProperty(module.exports, '__shouldIgnoreBundlePath', {
  value: shouldIgnoreBundlePath,
  enumerable: false,
})

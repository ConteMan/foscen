import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  chooseAvailablePath,
  httpsOrigin,
  isSafeHttpsUrl,
  publishStagedFile,
  sanitizeFilename,
  writeUniqueFile,
} from '../src/main/safe-files.js'

test('清理路径字符、控制字符与保留名', () => {
  assert.equal(sanitizeFilename('../../secret?.txt'), 'secret-.txt')
  assert.equal(sanitizeFilename('CON'), 'download')
  assert.equal(sanitizeFilename('\u0000'), 'download')
  assert.equal(sanitizeFilename(undefined, 'fallback.png'), 'fallback.png')
})

test('保留扩展名并限制文件名长度', () => {
  const filename = sanitizeFilename(`${'a'.repeat(300)}.png`)
  assert.ok(filename.length <= 160)
  assert.ok(filename.endsWith('.png'))
})

test('选择不覆盖磁盘文件和运行时保留路径的名称', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'foscen-path-'))
  try {
    await writeFile(join(directory, 'report.pdf'), 'existing')
    const reserved = new Set([join(directory, 'report-1.pdf')])
    assert.equal(
      chooseAvailablePath(directory, 'report.pdf', reserved),
      join(directory, 'report-2.pdf'),
    )
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('以排他写入生成唯一文件', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'foscen-write-'))
  try {
    await writeFile(join(directory, 'capture.png'), 'existing')
    const output = await writeUniqueFile(directory, 'capture.png', Buffer.from('new'))
    assert.equal(output, join(directory, 'capture-1.png'))
    assert.equal(await readFile(output, 'utf8'), 'new')
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('暂存文件以硬链接排他发布且不覆盖既有下载', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'foscen-publish-'))
  try {
    const staging = join(directory, '.staging.part')
    await writeFile(staging, 'new')
    await writeFile(join(directory, 'report.pdf'), 'existing')

    const output = await publishStagedFile(staging, directory, 'report.pdf')
    assert.equal(output, join(directory, 'report-1.pdf'))
    assert.equal(await readFile(output, 'utf8'), 'new')
    await assert.rejects(access(staging))
    assert.equal(await readFile(join(directory, 'report.pdf'), 'utf8'), 'existing')
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('只解析 HTTPS 来源', () => {
  assert.equal(httpsOrigin('https://example.com/path'), 'https://example.com')
  assert.equal(httpsOrigin('https://user:secret@example.com'), undefined)
  assert.equal(httpsOrigin('http://example.com'), undefined)
  assert.equal(httpsOrigin('not a url'), undefined)

  assert.equal(isSafeHttpsUrl('https://example.com/download?token=private'), true)
  assert.equal(isSafeHttpsUrl('https://user:secret@example.com/download'), false)
  assert.equal(isSafeHttpsUrl('file:///tmp/private'), false)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  findBinary,
  getReleaseAssetFor,
  getRustTargetFor,
  getToolCacheArchFor,
  normalizeVersion,
  stageBinary
} from '../src/shared'

test('normalizeVersion adds a v prefix once', () => {
  assert.equal(normalizeVersion('0.2.30'), 'v0.2.30')
  assert.equal(normalizeVersion('v0.2.30'), 'v0.2.30')
})

test('getRustTargetFor maps supported runners to prek release targets', () => {
  assert.equal(getRustTargetFor('linux', 'x64'), 'x86_64-unknown-linux-gnu')
  assert.equal(getRustTargetFor('linux', 'arm64'), 'aarch64-unknown-linux-gnu')
  assert.equal(getRustTargetFor('darwin', 'x64'), 'x86_64-apple-darwin')
  assert.equal(getRustTargetFor('darwin', 'arm64'), 'aarch64-apple-darwin')
  assert.equal(getRustTargetFor('win32', 'x64'), 'x86_64-pc-windows-msvc')
})

test('getRustTargetFor rejects unsupported platform and arch combinations', () => {
  assert.throws(() => getRustTargetFor('freebsd', 'x64'))
  assert.throws(() => getRustTargetFor('darwin', 'ia32'))
})

test('getReleaseAssetFor builds the expected archive and binary names', () => {
  assert.deepEqual(getReleaseAssetFor('linux', 'x64'), {
    archiveName: 'prek-x86_64-unknown-linux-gnu.tar.gz',
    archiveType: 'tar.gz',
    binaryName: 'prek'
  })
  assert.deepEqual(getReleaseAssetFor('win32', 'x64'), {
    archiveName: 'prek-x86_64-pc-windows-msvc.zip',
    archiveType: 'zip',
    binaryName: 'prek.exe'
  })
})

test('getToolCacheArchFor maps Node architectures to tool-cache values', () => {
  assert.equal(getToolCacheArchFor('x64'), 'x64')
  assert.equal(getToolCacheArchFor('arm64'), 'arm64')
  assert.equal(getToolCacheArchFor('ia32'), 'x86')
  assert.equal(getToolCacheArchFor('arm'), 'arm')
  assert.equal(getToolCacheArchFor('s390x'), 's390x')
})

test('findBinary finds nested binaries inside extracted archives', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-find-binary-'))
  const nestedDir = path.join(rootDir, 'release', 'bin')
  await fs.mkdir(nestedDir, {recursive: true})
  const expected = path.join(nestedDir, 'prek')
  await fs.writeFile(expected, 'binary')

  const resolved = await findBinary(rootDir, 'prek')
  assert.equal(resolved, expected)
})

test('stageBinary copies the binary into a standalone directory', async () => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-stage-source-'))
  const sourceBinary = path.join(sourceDir, process.platform === 'win32' ? 'prek.exe' : 'prek')
  await fs.writeFile(sourceBinary, 'binary')

  const stagedDir = await stageBinary(sourceBinary, path.basename(sourceBinary))
  const stagedBinary = path.join(stagedDir, path.basename(sourceBinary))
  assert.equal(await fs.readFile(stagedBinary, 'utf8'), 'binary')
})

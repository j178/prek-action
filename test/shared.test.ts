import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import {getInputs} from '../src/inputs'
import {
  getBinaryPath,
  getReleaseAssetFor,
  getRustTargetFor,
  getToolCacheArchFor,
  hashFile,
  validateDownloadedChecksum
} from '../src/install'
import {normalizeVersion, resolveVersionFromManifest} from '../src/manifest'

test('resolveVersionFromManifest resolves exact versions and latest from the bundled manifest', () => {
  assert.equal(resolveVersionFromManifest('latest'), 'v0.3.5')
  assert.equal(resolveVersionFromManifest('0.3.5'), 'v0.3.5')
})

test('getInputs enables verbose logs by default and allows opting out', () => {
  const originalEnv = {...process.env}
  try {
    process.env['INPUT_INSTALL-ONLY'] = 'false'
    delete process.env['INPUT_SHOW-VERBOSE-LOGS']
    assert.equal(getInputs().showVerboseLogs, true)

    process.env['INPUT_SHOW-VERBOSE-LOGS'] = 'false'
    assert.equal(getInputs().showVerboseLogs, false)
  } finally {
    process.env = originalEnv
  }
})

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

test('getBinaryPath resolves the nested tar.gz archive layout', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-binary-path-'))
  const nestedDir = path.join(rootDir, 'prek-x86_64-unknown-linux-gnu')
  await fs.mkdir(nestedDir, {recursive: true})
  const expected = path.join(nestedDir, 'prek')
  await fs.writeFile(expected, 'binary')

  const resolved = await getBinaryPath(rootDir, {
    archiveName: 'prek-x86_64-unknown-linux-gnu.tar.gz',
    archiveType: 'tar.gz',
    binaryName: 'prek'
  })
  assert.equal(resolved, expected)
})

test('getBinaryPath resolves the zip archive layout directly', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-binary-path-'))
  const expected = path.join(rootDir, 'prek.exe')
  await fs.writeFile(expected, 'binary')

  const resolved = await getBinaryPath(rootDir, {
    archiveName: 'prek-x86_64-pc-windows-msvc.zip',
    archiveType: 'zip',
    binaryName: 'prek.exe'
  })
  assert.equal(resolved, expected)
})

test('validateDownloadedChecksum reports missing checksums without hashing', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-checksum-'))
  const archivePath = path.join(rootDir, 'prek.tar.gz')
  await fs.writeFile(archivePath, 'binary')

  const result = await validateDownloadedChecksum(archivePath, {
    contentType: 'application/x-gtar',
    downloadUrl: 'https://example.invalid/prek.tar.gz',
    name: 'prek.tar.gz',
    sha256: null,
    size: 6
  })

  assert.equal(result, 'missing')
})

test('validateDownloadedChecksum throws on checksum mismatch', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-checksum-'))
  const archivePath = path.join(rootDir, 'prek.tar.gz')
  await fs.writeFile(archivePath, 'binary')

  await assert.rejects(
    validateDownloadedChecksum(archivePath, {
      contentType: 'application/x-gtar',
      downloadUrl: 'https://example.invalid/prek.tar.gz',
      name: 'prek.tar.gz',
      sha256: 'deadbeef',
      size: 6
    }),
    /Checksum mismatch/
  )
})

test('hashFile returns the sha256 digest for a file', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-hash-'))
  const archivePath = path.join(rootDir, 'prek.tar.gz')
  await fs.writeFile(archivePath, 'binary')

  assert.equal(
    await hashFile(archivePath),
    '9a3a45d01531a20e89ac6ae10b0b0beb0492acd7216a368aa062d1a5fecaf9cd'
  )
})

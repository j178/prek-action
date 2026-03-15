import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import {getInputs} from '../src/inputs'
import {getBinaryPath, getReleaseAssetFor, getRustTargetFor, getToolCacheArchFor} from '../src/install'
import {normalizeVersion, resolveVersionFromManifest} from '../src/manifest'

const manifest = {
  generatedAt: '2026-03-15T00:00:00.000Z',
  releases: [
    {
      assets: [],
      draft: false,
      prerelease: false,
      publishedAt: '2026-03-15T00:00:00.000Z',
      tag: 'v0.3.5',
      version: '0.3.5'
    },
    {
      assets: [],
      draft: false,
      prerelease: false,
      publishedAt: '2026-03-01T00:00:00.000Z',
      tag: 'v0.3.4',
      version: '0.3.4'
    },
    {
      assets: [],
      draft: false,
      prerelease: false,
      publishedAt: '2026-02-01T00:00:00.000Z',
      tag: 'v0.2.9',
      version: '0.2.9'
    },
    {
      assets: [],
      draft: false,
      prerelease: true,
      publishedAt: '2026-03-16T00:00:00.000Z',
      tag: 'v0.4.0-rc.1',
      version: '0.4.0-rc.1'
    }
  ],
  source: 'https://api.github.com/repos/j178/prek/releases'
}

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

test('resolveVersionFromManifest resolves latest, exact versions, and ranges', () => {
  assert.equal(resolveVersionFromManifest('latest', manifest), 'v0.3.5')
  assert.equal(resolveVersionFromManifest('0.3.4', manifest), 'v0.3.4')
  assert.equal(resolveVersionFromManifest('0.3.x', manifest), 'v0.3.5')
  assert.equal(resolveVersionFromManifest('<=0.3.4', manifest), 'v0.3.4')
})

test('resolveVersionFromManifest ignores prereleases for range and latest resolution', () => {
  assert.equal(resolveVersionFromManifest('>=0.3.0', manifest), 'v0.3.5')
  assert.equal(resolveVersionFromManifest('latest', manifest), 'v0.3.5')
})

test('resolveVersionFromManifest rejects invalid and unsatisfied ranges', () => {
  assert.throws(() => resolveVersionFromManifest('not-a-version', manifest))
  assert.throws(() => resolveVersionFromManifest('<0.2.0', manifest))
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

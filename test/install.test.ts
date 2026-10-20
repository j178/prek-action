import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getBinaryPath,
  getReleaseAssetFor,
  getRustTargetFor,
  getToolCacheArchFor,
  verifyDownloadChecksum,
} from '../src/install'
import { toVersion } from '../src/manifest'

const testVersion = toVersion('1.2.3')

describe('install helpers', () => {
  it('getRustTargetFor maps supported runners to prek release targets', () => {
    expect(getRustTargetFor('linux', 'x64', 'gnu')).toBe('x86_64-unknown-linux-gnu')
    expect(getRustTargetFor('linux', 'arm64', 'gnu')).toBe('aarch64-unknown-linux-gnu')
    expect(getRustTargetFor('linux', 'x64', 'musl')).toBe('x86_64-unknown-linux-musl')
    expect(getRustTargetFor('linux', 'arm64', 'musl')).toBe('aarch64-unknown-linux-musl')
    expect(getRustTargetFor('linux', 'ia32', 'musl')).toBe('i686-unknown-linux-musl')
    expect(getRustTargetFor('linux', 'arm', 'musl')).toBe('armv7-unknown-linux-musleabihf')
    expect(getRustTargetFor('darwin', 'x64', 'gnu')).toBe('x86_64-apple-darwin')
    expect(getRustTargetFor('darwin', 'arm64', 'gnu')).toBe('aarch64-apple-darwin')
    expect(getRustTargetFor('win32', 'x64', 'gnu')).toBe('x86_64-pc-windows-msvc')
  })

  it('getRustTargetFor rejects unsupported platform and arch combinations', () => {
    expect(() => getRustTargetFor('freebsd', 'x64', 'gnu')).toThrow()
    expect(() => getRustTargetFor('darwin', 'ia32', 'gnu')).toThrow()
    expect(() => getRustTargetFor('linux', 's390x', 'musl')).toThrow()
  })

  it('getReleaseAssetFor builds the expected archive and binary names', () => {
    expect(getReleaseAssetFor('linux', 'x64', 'gnu')).toEqual({
      archiveName: 'prek-x86_64-unknown-linux-gnu.tar.gz',
      archiveType: 'tar.gz',
      binaryName: 'prek',
    })
    expect(getReleaseAssetFor('linux', 'x64', 'musl')).toEqual({
      archiveName: 'prek-x86_64-unknown-linux-musl.tar.gz',
      archiveType: 'tar.gz',
      binaryName: 'prek',
    })
    expect(getReleaseAssetFor('win32', 'x64', 'gnu')).toEqual({
      archiveName: 'prek-x86_64-pc-windows-msvc.zip',
      archiveType: 'zip',
      binaryName: 'prek.exe',
    })
  })

  it('getToolCacheArchFor preserves GNU cache keys and separates musl cache keys', () => {
    expect(getToolCacheArchFor('x64', 'gnu')).toBe('x64')
    expect(getToolCacheArchFor('x64', 'musl')).toBe('x64-musl')
    expect(getToolCacheArchFor('arm64', 'gnu')).toBe('arm64')
    expect(getToolCacheArchFor('arm64', 'musl')).toBe('arm64-musl')
    expect(getToolCacheArchFor('ia32', 'gnu')).toBe('x86')
    expect(getToolCacheArchFor('ia32', 'musl')).toBe('x86-musl')
    expect(getToolCacheArchFor('arm', 'gnu')).toBe('arm')
    expect(getToolCacheArchFor('arm', 'musl')).toBe('arm-musl')
    expect(getToolCacheArchFor('s390x', 'gnu')).toBe('s390x')
  })
})

describe('archive handling', () => {
  it('getBinaryPath resolves the nested tar.gz archive layout', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-binary-path-'))
    const nestedDir = path.join(rootDir, 'prek-x86_64-unknown-linux-gnu')
    await fs.mkdir(nestedDir, { recursive: true })
    const expected = path.join(nestedDir, 'prek')
    await fs.writeFile(expected, 'binary')

    const resolved = await getBinaryPath(rootDir, {
      archiveName: 'prek-x86_64-unknown-linux-gnu.tar.gz',
      archiveType: 'tar.gz',
      binaryName: 'prek',
    })
    expect(resolved).toBe(expected)
  })

  it('getBinaryPath resolves the zip archive layout directly', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-binary-path-'))
    const expected = path.join(rootDir, 'prek.exe')
    await fs.writeFile(expected, 'binary')

    const resolved = await getBinaryPath(rootDir, {
      archiveName: 'prek-x86_64-pc-windows-msvc.zip',
      archiveType: 'zip',
      binaryName: 'prek.exe',
    })
    expect(resolved).toBe(expected)
  })
})

const checksumAsset = {
  downloadUrl: 'https://example.invalid/prek.tar.gz',
  name: 'prek.tar.gz',
}
const archiveDigest = '9a3a45d01531a20e89ac6ae10b0b0beb0492acd7216a368aa062d1a5fecaf9cd'
const checksumKey = '1.2.3:prek.tar.gz'

describe('checksum helpers', () => {
  let rootDir: string
  let archivePath: string

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-checksum-'))
    archivePath = path.join(rootDir, 'prek.tar.gz')
    await fs.writeFile(archivePath, 'binary')
  })

  afterEach(async () => {
    await fs.rm(rootDir, { force: true, recursive: true })
  })

  it('uses the bundled checksum when no input is provided', async () => {
    const checksums = new Map([[checksumKey, archiveDigest]])
    await expect(
      verifyDownloadChecksum(archivePath, checksumAsset, testVersion, undefined, checksums),
    ).resolves.toBeUndefined()
  })

  it('lets the input override the bundled checksum', async () => {
    const checksums = new Map([[checksumKey, '0'.repeat(64)]])
    await expect(
      verifyDownloadChecksum(archivePath, checksumAsset, testVersion, archiveDigest, checksums),
    ).resolves.toBeUndefined()
  })

  it('skips verification when no checksum is available', async () => {
    await expect(
      verifyDownloadChecksum(archivePath, checksumAsset, testVersion, undefined, new Map()),
    ).resolves.toBeUndefined()
  })

  it.each([
    { bundled: archiveDigest, explicit: '0'.repeat(64), name: 'explicit' },
    { bundled: '0'.repeat(64), explicit: undefined, name: 'bundled' },
  ])('rejects a mismatched $name checksum', async ({ explicit, bundled }) => {
    const checksums = new Map([[checksumKey, bundled]])
    await expect(
      verifyDownloadChecksum(archivePath, checksumAsset, testVersion, explicit, checksums),
    ).rejects.toThrow(/Checksum mismatch/)
  })
})

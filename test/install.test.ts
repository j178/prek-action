import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getBinaryPath,
  getReleaseAssetFor,
  getRustTargetFor,
  getToolCacheArchFor,
  hashFile,
  validateDownloadedChecksum,
} from '../src/install'
import { toVersion } from '../src/manifest'

const testVersion = toVersion('1.2.3')

describe('install helpers', () => {
  it('getRustTargetFor maps supported runners to prek release targets', () => {
    expect(getRustTargetFor('linux', 'x64')).toBe('x86_64-unknown-linux-gnu')
    expect(getRustTargetFor('linux', 'arm64')).toBe('aarch64-unknown-linux-gnu')
    expect(getRustTargetFor('darwin', 'x64')).toBe('x86_64-apple-darwin')
    expect(getRustTargetFor('darwin', 'arm64')).toBe('aarch64-apple-darwin')
    expect(getRustTargetFor('win32', 'x64')).toBe('x86_64-pc-windows-msvc')
  })

  it('getRustTargetFor rejects unsupported platform and arch combinations', () => {
    expect(() => getRustTargetFor('freebsd', 'x64')).toThrow()
    expect(() => getRustTargetFor('darwin', 'ia32')).toThrow()
  })

  it('getReleaseAssetFor builds the expected archive and binary names', () => {
    expect(getReleaseAssetFor('linux', 'x64')).toEqual({
      archiveName: 'prek-x86_64-unknown-linux-gnu.tar.gz',
      archiveType: 'tar.gz',
      binaryName: 'prek',
    })
    expect(getReleaseAssetFor('win32', 'x64')).toEqual({
      archiveName: 'prek-x86_64-pc-windows-msvc.zip',
      archiveType: 'zip',
      binaryName: 'prek.exe',
    })
  })

  it('getToolCacheArchFor maps Node architectures to tool-cache values', () => {
    expect(getToolCacheArchFor('x64')).toBe('x64')
    expect(getToolCacheArchFor('arm64')).toBe('arm64')
    expect(getToolCacheArchFor('ia32')).toBe('x86')
    expect(getToolCacheArchFor('arm')).toBe('arm')
    expect(getToolCacheArchFor('s390x')).toBe('s390x')
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

describe('checksum helpers', () => {
  it('validateDownloadedChecksum accepts a digest found in the known checksum set', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-checksum-'))
    const archivePath = path.join(rootDir, 'prek.tar.gz')
    await fs.writeFile(archivePath, 'binary')

    await expect(
      validateDownloadedChecksum(
        archivePath,
        {
          downloadUrl: 'https://example.invalid/prek.tar.gz',
          name: 'prek.tar.gz',
        },
        testVersion,
        new Map([
          ['1.2.3:prek.tar.gz', '9a3a45d01531a20e89ac6ae10b0b0beb0492acd7216a368aa062d1a5fecaf9cd'],
        ]),
      ),
    ).resolves.toBe('matched')
  })

  it('validateDownloadedChecksum reports missing when no checksum is known for the asset', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-checksum-'))
    const archivePath = path.join(rootDir, 'prek.tar.gz')
    await fs.writeFile(archivePath, 'binary')

    await expect(
      validateDownloadedChecksum(
        archivePath,
        {
          downloadUrl: 'https://example.invalid/prek.tar.gz',
          name: 'prek.tar.gz',
        },
        testVersion,
        new Map(),
      ),
    ).resolves.toBe('missing')
  })

  it('validateDownloadedChecksum throws on checksum mismatch', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-checksum-'))
    const archivePath = path.join(rootDir, 'prek.tar.gz')
    await fs.writeFile(archivePath, 'binary')

    await expect(
      validateDownloadedChecksum(
        archivePath,
        {
          downloadUrl: 'https://example.invalid/prek.tar.gz',
          name: 'prek.tar.gz',
        },
        testVersion,
        new Map([['1.2.3:prek.tar.gz', 'deadbeef']]),
      ),
    ).rejects.toThrow(/Checksum mismatch/)
  })

  it('hashFile returns the sha256 digest for a file', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-hash-'))
    const archivePath = path.join(rootDir, 'prek.tar.gz')
    await fs.writeFile(archivePath, 'binary')

    await expect(hashFile(archivePath)).resolves.toBe(
      '9a3a45d01531a20e89ac6ae10b0b0beb0492acd7216a368aa062d1a5fecaf9cd',
    )
  })
})

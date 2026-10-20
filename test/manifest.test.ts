import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Version, VersionManifest } from '../src/types'

const mockContext = vi.hoisted(() => ({
  knownChecksums: new Map<string, string>(),
  manifest: [] as VersionManifest,
}))

const toolkitMocks = vi.hoisted(() => ({
  downloadTool: vi.fn<() => Promise<string>>(),
  info: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: async () => JSON.stringify(mockContext.manifest),
}))

vi.mock('@actions/core', () => ({
  info: toolkitMocks.info,
  warning: toolkitMocks.warning,
}))

vi.mock('@actions/tool-cache', () => ({
  downloadTool: toolkitMocks.downloadTool,
}))

vi.mock('../src/known-checksums', () => ({
  knownChecksumsByAsset: mockContext.knownChecksums,
}))

const stableManifest: VersionManifest = [
  {
    assets: [],
    prerelease: false,
    publishedAt: '2026-03-01T00:00:00Z',
    version: '0.3.5' as Version,
  },
  {
    assets: [],
    prerelease: false,
    publishedAt: '2026-02-28T00:00:00Z',
    version: '0.3.4' as Version,
  },
  {
    assets: [],
    prerelease: false,
    publishedAt: '2026-02-01T00:00:00Z',
    version: '0.2.30' as Version,
  },
]

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mockContext.knownChecksums.clear()
  mockContext.manifest = stableManifest
  toolkitMocks.downloadTool.mockResolvedValue('/tmp/prek-version-manifest.json')
})

describe('resolveVersion', () => {
  it.each([
    { input: ' v0.2.30 ', version: '0.2.30' },
    { input: '0.2.100', version: '0.2.100' },
  ])('resolves exact version $input without downloading a manifest', async ({ input, version }) => {
    const { resolveVersion } = await import('../src/manifest')

    await expect(resolveVersion(input)).resolves.toBe(version)
    expect(toolkitMocks.downloadTool).not.toHaveBeenCalled()
  })

  it('selects the highest stable bundled version without downloading a manifest', async () => {
    mockContext.knownChecksums.set('1.9.0:prek-aarch64-apple-darwin.tar.gz', 'checksum')
    mockContext.knownChecksums.set('1.10.0:prek-x86_64-unknown-linux-gnu.tar.gz', 'checksum')
    mockContext.knownChecksums.set('1.11.0-rc.1:prek-x86_64-unknown-linux-gnu.tar.gz', 'checksum')
    mockContext.knownChecksums.set('1.8.0:prek-x86_64-pc-windows-msvc.zip', 'checksum')
    toolkitMocks.downloadTool.mockRejectedValue(new Error('manifest unavailable'))
    const { resolveVersion } = await import('../src/manifest')

    await expect(resolveVersion(' latest-known ')).resolves.toBe('1.10.0')
    expect(toolkitMocks.downloadTool).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'empty', versions: [] },
    { name: 'prerelease-only', versions: ['1.11.0-rc.1'] },
  ])('rejects latest-known for $name checksum tables', async ({ versions }) => {
    for (const version of versions) {
      mockContext.knownChecksums.set(`${version}:prek-x86_64-unknown-linux-gnu.tar.gz`, 'checksum')
    }
    const { resolveVersion } = await import('../src/manifest')

    await expect(resolveVersion('latest-known')).rejects.toThrow('bundled checksums')
    expect(toolkitMocks.downloadTool).not.toHaveBeenCalled()
  })

  it.each([
    { input: ' latest ', version: '0.3.5' },
    { input: '', version: '0.3.5' },
    { input: '0.2.x', version: '0.2.30' },
    { input: '<=0.3.4', version: '0.3.4' },
    { input: '>=0.3.0 <0.3.5', version: '0.3.4' },
    { input: '0.3.x', version: '0.3.5' },
  ])('resolves $input from stable releases in the remote manifest', async ({ input, version }) => {
    mockContext.manifest = [
      {
        assets: [],
        prerelease: true,
        publishedAt: '2026-03-02T00:00:00Z',
        version: '0.3.6-beta.1' as Version,
      },
      ...stableManifest,
    ]
    const { resolveVersion } = await import('../src/manifest')

    await expect(resolveVersion(input)).resolves.toBe(version)
  })

  it('rejects invalid input before downloading a manifest', async () => {
    toolkitMocks.downloadTool.mockRejectedValue(new Error('manifest unavailable'))
    const { resolveVersion } = await import('../src/manifest')

    await expect(resolveVersion('hello world')).rejects.toThrow('Invalid prek-version input')
    expect(toolkitMocks.downloadTool).not.toHaveBeenCalled()
  })

  it('rejects an unsatisfied version range', async () => {
    const { resolveVersion } = await import('../src/manifest')

    await expect(resolveVersion('<0.0.1')).rejects.toThrow(
      'No prek release satisfies version range',
    )
  })

  it('rejects latest when the manifest contains no stable release', async () => {
    mockContext.manifest = []
    const { resolveVersion } = await import('../src/manifest')

    await expect(resolveVersion('latest')).rejects.toThrow(
      'The prek version manifest does not contain a stable release',
    )
  })
})

describe('manifest helpers', () => {
  it('getManifestAssetForVersion returns undefined for missing manifest versions', async () => {
    const { getManifestAssetForVersion, toVersion } = await import('../src/manifest')
    const version = toVersion('0.2.100')

    expect(
      getManifestAssetForVersion(version, 'prek-x86_64-unknown-linux-gnu.tar.gz', []),
    ).toBeUndefined()
  })

  it('getManifestAssetForVersion returns the manifest entry without checksum data', async () => {
    const { getManifestAssetForVersion, toVersion } = await import('../src/manifest')
    const version = toVersion('0.2.100')
    const manifest: VersionManifest = [
      {
        assets: [
          {
            downloadUrl: 'https://example.invalid/prek.tar.gz',
            name: 'prek-x86_64-unknown-linux-gnu.tar.gz',
          },
        ],
        prerelease: false,
        publishedAt: '2026-03-01T00:00:00Z',
        version,
      },
    ]

    expect(
      getManifestAssetForVersion(version, 'prek-x86_64-unknown-linux-gnu.tar.gz', manifest),
    ).toEqual({
      downloadUrl: 'https://example.invalid/prek.tar.gz',
      name: 'prek-x86_64-unknown-linux-gnu.tar.gz',
    })
  })

  it('shares the downloaded manifest between version resolution and asset lookup', async () => {
    const asset = {
      downloadUrl: 'https://example.invalid/prek.tar.gz',
      name: 'prek-x86_64-unknown-linux-gnu.tar.gz',
    }
    mockContext.manifest = [{ ...stableManifest[0], assets: [asset] }]
    const { getAssetForVersion, resolveVersion } = await import('../src/manifest')

    const version = await resolveVersion('latest')

    await expect(getAssetForVersion(version, asset.name)).resolves.toEqual(asset)
    expect(toolkitMocks.downloadTool).toHaveBeenCalledTimes(1)
  })

  it('getAssetForVersion falls back to the release URL pattern when manifest download fails', async () => {
    toolkitMocks.downloadTool.mockRejectedValue(new Error('manifest unavailable'))
    const { getAssetForVersion, toVersion } = await import('../src/manifest')

    await expect(
      getAssetForVersion(toVersion('0.2.100'), 'prek-x86_64-unknown-linux-gnu.tar.gz'),
    ).resolves.toEqual({
      downloadUrl:
        'https://github.com/j178/prek/releases/download/v0.2.100/prek-x86_64-unknown-linux-gnu.tar.gz',
      name: 'prek-x86_64-unknown-linux-gnu.tar.gz',
    })
  })

  it('normalizeVersion adds a v prefix once', async () => {
    const { normalizeVersion } = await import('../src/manifest')
    expect(normalizeVersion('0.2.30')).toBe('v0.2.30')
    expect(normalizeVersion('v0.2.30')).toBe('v0.2.30')
  })

  it('toVersion removes the v prefix', async () => {
    const { toVersion } = await import('../src/manifest')
    expect(toVersion('v0.2.30')).toBe('0.2.30')
    expect(toVersion('0.2.30')).toBe('0.2.30')
  })
})

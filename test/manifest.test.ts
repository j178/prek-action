import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Version, VersionManifest } from '../src/types'

const mockContext = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
}))

const toolkitMocks = vi.hoisted(() => ({
  downloadTool: vi.fn<() => Promise<string>>(),
  getBooleanInput: vi.fn((name: string) => (mockContext.inputs[name] ?? '') === 'true'),
  getInput: vi.fn((name: string) => mockContext.inputs[name] ?? ''),
  info: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@actions/core', () => ({
  getBooleanInput: toolkitMocks.getBooleanInput,
  getInput: toolkitMocks.getInput,
  info: toolkitMocks.info,
  warning: toolkitMocks.warning,
}))

vi.mock('@actions/tool-cache', () => ({
  downloadTool: toolkitMocks.downloadTool,
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

async function importManifestModule() {
  vi.resetModules()
  return import('../src/manifest')
}

async function importInputsModule() {
  vi.resetModules()
  return import('../src/inputs')
}

describe('manifest helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockContext.inputs = {}
  })

  it('resolveVersion accepts an exact version with a leading v', async () => {
    const { resolveVersion } = await importManifestModule()
    await expect(resolveVersion('v0.2.30', '')).resolves.toBe('0.2.30')
  })

  it('resolveVersion returns exact versions even when they are missing from the manifest', async () => {
    const { resolveVersion } = await importManifestModule()
    await expect(resolveVersion('0.2.100', '')).resolves.toBe('0.2.100')
  })

  it('resolveVersionFromManifest rejects exact versions that are missing from the manifest', async () => {
    const { resolveVersionFromManifest, toVersion } = await importManifestModule()
    const manifest: VersionManifest = [
      {
        assets: [],
        prerelease: false,
        publishedAt: '2026-02-28T00:00:00Z',
        version: toVersion('0.3.5'),
      },
    ]

    expect(() => resolveVersionFromManifest('0.2.100', manifest)).toThrow(
      /No prek release satisfies version range/,
    )
  })

  it('getManifestAssetForVersion returns undefined for missing manifest versions', async () => {
    const { getManifestAssetForVersion, toVersion } = await importManifestModule()
    const version = toVersion('0.2.100')

    expect(
      getManifestAssetForVersion(version, 'prek-x86_64-unknown-linux-gnu.tar.gz', []),
    ).toBeUndefined()
  })

  it('getManifestAssetForVersion returns the manifest entry without checksum data', async () => {
    const { getManifestAssetForVersion, toVersion } = await importManifestModule()
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

  it('getAssetForVersion falls back to the release URL pattern when manifest download fails', async () => {
    toolkitMocks.downloadTool.mockRejectedValue(new Error('manifest unavailable'))
    const { getAssetForVersion, toVersion } = await importManifestModule()

    await expect(
      getAssetForVersion(toVersion('0.2.100'), 'prek-x86_64-unknown-linux-gnu.tar.gz'),
    ).resolves.toEqual({
      downloadUrl:
        'https://github.com/j178/prek/releases/download/v0.2.100/prek-x86_64-unknown-linux-gnu.tar.gz',
      name: 'prek-x86_64-unknown-linux-gnu.tar.gz',
    })
  })

  it('resolveVersionFromManifest resolves semver ranges from the manifest', async () => {
    const { resolveVersionFromManifest } = await importManifestModule()
    expect(resolveVersionFromManifest('0.2.x', stableManifest)).toBe('0.2.30')
  })

  it('resolveVersionFromManifest resolves upper-bounded ranges from the manifest', async () => {
    const { resolveVersionFromManifest } = await importManifestModule()
    expect(resolveVersionFromManifest('<=0.3.4', stableManifest)).toBe('0.3.4')
  })

  it('resolveVersionFromManifest resolves bounded ranges from the manifest', async () => {
    const { resolveVersionFromManifest, toVersion } = await importManifestModule()
    const manifest: VersionManifest = [
      {
        assets: [],
        prerelease: false,
        publishedAt: '2026-02-28T00:00:00Z',
        version: toVersion('0.3.5'),
      },
      {
        assets: [],
        prerelease: false,
        publishedAt: '2026-02-27T00:00:00Z',
        version: toVersion('0.3.4'),
      },
    ]

    expect(resolveVersionFromManifest('>=0.3.0 <0.3.5', manifest)).toBe('0.3.4')
  })

  it('resolveVersionFromManifest ignores prereleases even when they appear first', async () => {
    const { resolveVersionFromManifest, toVersion } = await importManifestModule()
    const manifest: VersionManifest = [
      {
        assets: [],
        prerelease: true,
        publishedAt: '2026-03-01T00:00:00Z',
        version: toVersion('0.3.6-beta.1'),
      },
      {
        assets: [],
        prerelease: false,
        publishedAt: '2026-02-28T00:00:00Z',
        version: toVersion('0.3.5'),
      },
      {
        assets: [],
        prerelease: false,
        publishedAt: '2026-02-27T00:00:00Z',
        version: toVersion('0.3.4'),
      },
    ]

    expect(resolveVersionFromManifest('latest', manifest)).toBe('0.3.5')
    expect(resolveVersionFromManifest('0.3.x', manifest)).toBe('0.3.5')
  })

  it('resolveVersionFromManifest rejects invalid and unsatisfied ranges', async () => {
    const { resolveVersionFromManifest } = await importManifestModule()
    expect(() => resolveVersionFromManifest('hello world', stableManifest)).toThrow()
    expect(() => resolveVersionFromManifest('<0.0.1', stableManifest)).toThrow()
  })

  it('normalizeVersion adds a v prefix once', async () => {
    const { normalizeVersion } = await importManifestModule()
    expect(normalizeVersion('0.2.30')).toBe('v0.2.30')
    expect(normalizeVersion('v0.2.30')).toBe('v0.2.30')
  })

  it('toVersion removes the v prefix', async () => {
    const { toVersion } = await importManifestModule()
    expect(toVersion('v0.2.30')).toBe('0.2.30')
    expect(toVersion('0.2.30')).toBe('0.2.30')
  })
})

describe('getInputs', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockContext.inputs = {}
  })

  it('enables verbose logs by default and allows opting out', async () => {
    mockContext.inputs['install-only'] = 'false'

    let { getInputs } = await importInputsModule()
    expect(getInputs().showVerboseLogs).toBe(true)

    mockContext.inputs['show-verbose-logs'] = 'false'
    ;({ getInputs } = await importInputsModule())
    expect(getInputs().showVerboseLogs).toBe(false)
  })
})

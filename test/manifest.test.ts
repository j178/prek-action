import { afterEach, beforeEach, expect, jest, test } from '@jest/globals'
import type { Version } from '../src/types'
import type { VersionManifest } from '../src/types'

let mockInputs: Record<string, string> = {}

const mockGetBooleanInput = jest.fn((name: string) => (mockInputs[name] ?? '') === 'true')
const mockGetInput = jest.fn((name: string) => mockInputs[name] ?? '')
const mockInfo = jest.fn()
const mockWarning = jest.fn()
const mockDownloadTool = jest.fn<() => Promise<string>>()

jest.unstable_mockModule('@actions/core', () => ({
  getBooleanInput: mockGetBooleanInput,
  getInput: mockGetInput,
  info: mockInfo,
  warning: mockWarning,
}))

jest.unstable_mockModule('@actions/tool-cache', () => ({
  downloadTool: mockDownloadTool,
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
  jest.resetModules()
  return import('../src/manifest')
}

async function importInputsModule() {
  jest.resetModules()
  return import('../src/inputs')
}

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  mockInputs = {}
})

afterEach(() => {
  jest.clearAllMocks()
})

test('resolveVersion accepts an exact version with a leading v', async () => {
  const { resolveVersion } = await importManifestModule()
  await expect(resolveVersion('v0.2.30', '')).resolves.toBe('0.2.30')
})

test('resolveVersion returns exact versions even when they are missing from the manifest', async () => {
  const { resolveVersion } = await importManifestModule()
  await expect(resolveVersion('0.2.100', '')).resolves.toBe('0.2.100')
})

test('resolveVersionFromManifest rejects exact versions that are missing from the manifest', async () => {
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

test('getManifestAssetForVersion returns undefined for missing manifest versions', async () => {
  const { getManifestAssetForVersion, toVersion } = await importManifestModule()
  const version = toVersion('0.2.100')
  const manifest: VersionManifest = []

  expect(
    getManifestAssetForVersion(version, 'prek-x86_64-unknown-linux-gnu.tar.gz', manifest),
  ).toBeUndefined()
})

test('getManifestAssetForVersion returns the manifest entry without checksum data', async () => {
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

test('getAssetForVersion falls back to the release URL pattern when manifest download fails', async () => {
  mockDownloadTool.mockRejectedValue(new Error('manifest unavailable'))
  const { getAssetForVersion, toVersion } = await importManifestModule()

  await expect(
    getAssetForVersion(toVersion('0.2.100'), 'prek-x86_64-unknown-linux-gnu.tar.gz'),
  ).resolves.toEqual({
    downloadUrl:
      'https://github.com/j178/prek/releases/download/v0.2.100/prek-x86_64-unknown-linux-gnu.tar.gz',
    name: 'prek-x86_64-unknown-linux-gnu.tar.gz',
  })
})

test('resolveVersionFromManifest resolves semver ranges from the manifest', async () => {
  const { resolveVersionFromManifest } = await importManifestModule()
  expect(resolveVersionFromManifest('0.2.x', stableManifest)).toBe('0.2.30')
})

test('resolveVersionFromManifest resolves upper-bounded ranges from the manifest', async () => {
  const { resolveVersionFromManifest } = await importManifestModule()
  expect(resolveVersionFromManifest('<=0.3.4', stableManifest)).toBe('0.3.4')
})

test('resolveVersionFromManifest resolves bounded ranges from the manifest', async () => {
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

test('resolveVersionFromManifest ignores prereleases even when they appear first', async () => {
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

test('resolveVersionFromManifest rejects invalid and unsatisfied ranges', async () => {
  const { resolveVersionFromManifest } = await importManifestModule()
  expect(() => resolveVersionFromManifest('hello world', stableManifest)).toThrow()
  expect(() => resolveVersionFromManifest('<0.0.1', stableManifest)).toThrow()
})

test('getInputs enables verbose logs by default and allows opting out', async () => {
  const originalEnv = { ...process.env }
  try {
    mockInputs['install-only'] = 'false'
    delete mockInputs['show-verbose-logs']

    let { getInputs } = await importInputsModule()
    expect(getInputs().showVerboseLogs).toBe(true)

    mockInputs['show-verbose-logs'] = 'false'
    ;({ getInputs } = await importInputsModule())
    expect(getInputs().showVerboseLogs).toBe(false)
  } finally {
    process.env = originalEnv
  }
})

test('normalizeVersion adds a v prefix once', async () => {
  const { normalizeVersion } = await importManifestModule()
  expect(normalizeVersion('0.2.30')).toBe('v0.2.30')
  expect(normalizeVersion('v0.2.30')).toBe('v0.2.30')
})

test('toVersion removes the v prefix', async () => {
  const { toVersion } = await importManifestModule()
  expect(toVersion('v0.2.30')).toBe('0.2.30')
  expect(toVersion('0.2.30')).toBe('0.2.30')
})

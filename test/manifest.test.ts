import assert from 'node:assert/strict'
import test from 'node:test'
import * as tc from '@actions/tool-cache'
import { getInputs } from '../src/inputs'
import {
  getAssetForVersion,
  getManifestAssetForVersion,
  normalizeVersion,
  resolveVersion,
  resolveVersionFromManifest,
  toVersion,
} from '../src/manifest'
import type { VersionManifest } from '../src/types'

const stableManifest: VersionManifest = [
  {
    assets: [],
    prerelease: false,
    publishedAt: '2026-03-01T00:00:00Z',
    version: toVersion('0.3.5'),
  },
  {
    assets: [],
    prerelease: false,
    publishedAt: '2026-02-28T00:00:00Z',
    version: toVersion('0.3.4'),
  },
  {
    assets: [],
    prerelease: false,
    publishedAt: '2026-02-01T00:00:00Z',
    version: toVersion('0.2.30'),
  },
]

test('resolveVersion accepts an exact version with a leading v', async () => {
  assert.equal(await resolveVersion('v0.2.30', ''), '0.2.30')
})

test('resolveVersion returns exact versions even when they are missing from the manifest', async () => {
  assert.equal(await resolveVersion('0.2.100', ''), '0.2.100')
})

test('resolveVersionFromManifest rejects exact versions that are missing from the manifest', () => {
  const manifest: VersionManifest = [
    {
      assets: [],
      prerelease: false,
      publishedAt: '2026-02-28T00:00:00Z',
      version: toVersion('0.3.5'),
    },
  ]

  assert.throws(
    () => resolveVersionFromManifest('0.2.100', manifest),
    /No prek release satisfies version range/,
  )
})

test('getManifestAssetForVersion returns undefined for missing manifest versions', () => {
  const version = toVersion('0.2.100')
  const manifest: VersionManifest = []

  assert.equal(
    getManifestAssetForVersion(version, 'prek-x86_64-unknown-linux-gnu.tar.gz', manifest),
    undefined,
  )
})

test('getManifestAssetForVersion returns the manifest entry without checksum data', () => {
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

  assert.deepEqual(
    getManifestAssetForVersion(version, 'prek-x86_64-unknown-linux-gnu.tar.gz', manifest),
    {
      downloadUrl: 'https://example.invalid/prek.tar.gz',
      name: 'prek-x86_64-unknown-linux-gnu.tar.gz',
    },
  )
})

test('getAssetForVersion falls back to the release URL pattern when manifest download fails', async () => {
  const toolCache = tc as { downloadTool: typeof tc.downloadTool }
  const originalDownloadTool = toolCache.downloadTool
  toolCache.downloadTool = async () => {
    throw new Error('manifest unavailable')
  }

  try {
    assert.deepEqual(
      await getAssetForVersion(toVersion('0.2.100'), 'prek-x86_64-unknown-linux-gnu.tar.gz'),
      {
        downloadUrl:
          'https://github.com/j178/prek/releases/download/v0.2.100/prek-x86_64-unknown-linux-gnu.tar.gz',
        name: 'prek-x86_64-unknown-linux-gnu.tar.gz',
      },
    )
  } finally {
    toolCache.downloadTool = originalDownloadTool
  }
})

test('resolveVersionFromManifest resolves semver ranges from the manifest', () => {
  assert.equal(resolveVersionFromManifest('0.2.x', stableManifest), '0.2.30')
})

test('resolveVersionFromManifest resolves upper-bounded ranges from the manifest', () => {
  assert.equal(resolveVersionFromManifest('<=0.3.4', stableManifest), '0.3.4')
})

test('resolveVersionFromManifest resolves bounded ranges from the manifest', () => {
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

  assert.equal(resolveVersionFromManifest('>=0.3.0 <0.3.5', manifest), '0.3.4')
})

test('resolveVersionFromManifest ignores prereleases even when they appear first', () => {
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

  assert.equal(resolveVersionFromManifest('latest', manifest), '0.3.5')
  assert.equal(resolveVersionFromManifest('0.3.x', manifest), '0.3.5')
})

test('resolveVersionFromManifest rejects invalid and unsatisfied ranges', () => {
  assert.throws(() => resolveVersionFromManifest('hello world', stableManifest))
  assert.throws(() => resolveVersionFromManifest('<0.0.1', stableManifest))
})

test('getInputs enables verbose logs by default and allows opting out', () => {
  const originalEnv = { ...process.env }
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

test('toVersion removes the v prefix', () => {
  assert.equal(toVersion('v0.2.30'), '0.2.30')
  assert.equal(toVersion('0.2.30'), '0.2.30')
})

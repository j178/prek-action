import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { it } from 'vitest'

import { resolveVersion, resolveVersionFromManifest, toVersion } from '../src/manifest'
import type { VersionManifest } from '../src/types'

function createManifest(versions: string[]): VersionManifest {
  return versions.map((version, index) => ({
    assets: [],
    prerelease: false,
    publishedAt: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    version: toVersion(version),
  }))
}

it('resolveVersionFromManifest picks the highest satisfying stable release regardless of manifest order', () => {
  const manifest = createManifest(['0.3.0', '0.3.5', '0.3.4'])
  assert.equal(resolveVersionFromManifest('>=0.3.0', manifest), '0.3.5')
})

it('resolveVersionFromManifest honors exact exclusion clauses', () => {
  const manifest = createManifest(['0.3.5', '0.3.4'])
  assert.equal(resolveVersionFromManifest('>=0.3.0 !=0.3.5', manifest), '0.3.4')
})

it('resolveVersionFromManifest handles expanded compatible-release ranges', () => {
  const manifest = createManifest(['0.3.5', '0.9.0', '1.0.0'])
  assert.equal(resolveVersionFromManifest('>=0.3.0 <1.0.0', manifest), '0.9.0')
})

it('resolveVersionFromManifest honors wildcard minor-series exclusions', () => {
  const manifest = createManifest(['0.4.0', '0.3.5', '0.3.1', '0.3.0'])
  assert.equal(resolveVersionFromManifest('>=0.3.0 !=0.3.*', manifest), '0.4.0')
})

it('resolveVersionFromManifest honors wildcard patch exclusions', () => {
  const manifest = createManifest(['0.3.5', '0.3.1', '0.3.0'])
  assert.equal(resolveVersionFromManifest('>=0.3.0 !=0.3.1.*', manifest), '0.3.5')
})

it('resolveVersionFromManifest suggests updating the action when an exact version is newer than the bundled manifest', () => {
  const manifest = createManifest(['0.3.5'])
  assert.throws(
    () => resolveVersionFromManifest('0.4.0', manifest),
    /update prek-action|version manifest may be stale/i,
  )
})

it('resolveVersion auto-detects from .tool-versions when input is latest', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(path.join(dir, '.tool-versions'), 'prek 0.3.5\n')
  const result = await resolveVersion({
    prekVersion: 'latest',
    workingDirectory: dir,
  })
  assert.equal(result, '0.3.5')
})

it('resolveVersion uses version-file when provided', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(
    path.join(dir, 'uv.lock'),
    'version = 1\n\n[[package]]\nname = "prek"\nversion = "0.3.4"\n',
  )
  const result = await resolveVersion({
    prekVersion: 'latest',
    versionFile: path.join(dir, 'uv.lock'),
    workingDirectory: dir,
  })
  assert.equal(result, '0.3.4')
})

it('resolveVersion resolves requirements compatible releases against the highest matching manifest version', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  const manifest = createManifest(['0.3.5', '0.9.0', '1.0.0'])
  await fs.writeFile(path.join(dir, 'requirements.txt'), 'prek~=0.3\n')
  const result = await resolveVersion(
    {
      prekVersion: 'latest',
      versionFile: path.join(dir, 'requirements.txt'),
      workingDirectory: dir,
    },
    manifest,
  )
  assert.equal(result, '0.9.0')
})

it('resolveVersion resolves pyproject compatible releases against the highest matching manifest version', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  const manifest = createManifest(['0.3.5', '0.9.0', '1.0.0'])
  await fs.writeFile(path.join(dir, 'pyproject.toml'), `[dependency-groups]\ndev = ["prek~=0.3"]\n`)
  const result = await resolveVersion(
    {
      prekVersion: 'latest',
      versionFile: path.join(dir, 'pyproject.toml'),
      workingDirectory: dir,
    },
    manifest,
  )
  assert.equal(result, '0.9.0')
})

it('resolveVersion honors exclusions from version-file constraints', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(path.join(dir, 'requirements.txt'), 'prek>=0.3.0,!=0.3.5\n')
  const result = await resolveVersion(
    {
      prekVersion: 'latest',
      versionFile: path.join(dir, 'requirements.txt'),
      workingDirectory: dir,
    },
    createManifest(['0.3.5', '0.3.4']),
  )
  assert.equal(result, '0.3.4')
})

it('resolveVersion handles pip-compile style hashed requirements files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(
    path.join(dir, 'requirements.txt'),
    ['prek==0.3.0 \\', '  --hash=sha256:abc123 \\', '  --hash=sha256:def456', ''].join('\n'),
  )
  const result = await resolveVersion({
    prekVersion: 'latest',
    versionFile: path.join(dir, 'requirements.txt'),
    workingDirectory: dir,
  })
  assert.equal(result, '0.3.0')
})

it('resolveVersion handles requirements files with inline comments', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(path.join(dir, 'requirements.txt'), 'prek==0.3.0 # pinned by team\n')
  const result = await resolveVersion({
    prekVersion: 'latest',
    versionFile: path.join(dir, 'requirements.txt'),
    workingDirectory: dir,
  })
  assert.equal(result, '0.3.0')
})

it('resolveVersion ignores config files when explicit version provided', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(path.join(dir, '.tool-versions'), 'prek 0.3.1\n')
  const result = await resolveVersion({
    prekVersion: '0.3.5',
    workingDirectory: dir,
  })
  assert.equal(result, '0.3.5')
})

it('resolveVersion throws when both prek-version and version-file provided', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(
    path.join(dir, 'uv.lock'),
    'version = 1\n\n[[package]]\nname = "prek"\nversion = "0.3.1"\n',
  )
  await assert.rejects(
    () =>
      resolveVersion({
        prekVersion: '0.3.5',
        versionFile: path.join(dir, 'uv.lock'),
        workingDirectory: dir,
      }),
    /Cannot specify both prek-version and version-file/,
  )
})

it('resolveVersion version-file overrides auto-detect', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(path.join(dir, '.tool-versions'), 'prek 0.3.1\n')
  await fs.writeFile(
    path.join(dir, 'uv.lock'),
    'version = 1\n\n[[package]]\nname = "prek"\nversion = "0.3.4"\n',
  )
  const result = await resolveVersion({
    prekVersion: 'latest',
    versionFile: path.join(dir, 'uv.lock'),
    workingDirectory: dir,
  })
  assert.equal(result, '0.3.4')
})

it('resolveVersion surfaces malformed explicit version files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(path.join(dir, 'package.json'), '{ bad json')
  await assert.rejects(
    () =>
      resolveVersion({
        prekVersion: 'latest',
        versionFile: path.join(dir, 'package.json'),
        workingDirectory: dir,
      }),
    /Failed to parse package\.json/,
  )
})

it('resolveVersion resolves version-file relative to working-directory', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(
    path.join(dir, 'uv.lock'),
    'version = 1\n\n[[package]]\nname = "prek"\nversion = "0.3.4"\n',
  )
  const result = await resolveVersion({
    prekVersion: 'latest',
    versionFile: 'uv.lock',
    workingDirectory: dir,
  })
  assert.equal(result, '0.3.4')
})

it('resolveVersion checks the GITHUB_WORKSPACE root when working-directory is relative', async () => {
  const originalWorkspace = process.env.GITHUB_WORKSPACE
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-workspace-'))
  const workingDirectory = path.join('packages', 'app')
  const packageDir = path.join(workspace, workingDirectory)

  await fs.mkdir(packageDir, { recursive: true })
  await fs.writeFile(path.join(workspace, '.tool-versions'), 'prek 0.3.1\n')

  process.env.GITHUB_WORKSPACE = workspace
  try {
    const result = await resolveVersion({
      prekVersion: 'latest',
      workingDirectory,
    })
    assert.equal(result, '0.3.1')
  } finally {
    if (originalWorkspace === undefined) {
      delete process.env.GITHUB_WORKSPACE
    } else {
      process.env.GITHUB_WORKSPACE = originalWorkspace
    }
  }
})

it('resolveVersion surfaces ambiguous pyproject dependency constraints', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(
    path.join(dir, 'pyproject.toml'),
    `[dependency-groups]\ndev = ["prek==0.3.0"]\nlint = ["prek==0.4.0"]\n`,
  )
  await assert.rejects(
    () =>
      resolveVersion({
        prekVersion: 'latest',
        versionFile: path.join(dir, 'pyproject.toml'),
        workingDirectory: dir,
      }),
    /\[tool\.prek\]\.version/,
  )
})

it('resolveVersion ignores minimum_prek_version files and falls back to latest', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  await fs.writeFile(path.join(dir, '.pre-commit-config.yaml'), "minimum_prek_version: '0.3.0'\n")
  await fs.writeFile(path.join(dir, 'prek.toml'), 'minimum_prek_version = "0.3.0"\n')
  const result = await resolveVersion(
    {
      prekVersion: 'latest',
      workingDirectory: dir,
    },
    createManifest(['0.3.5']),
  )
  assert.equal(result, '0.3.5')
})

it('resolveVersion falls through to manifest latest when no config files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-resolve-'))
  const result = await resolveVersion(
    {
      prekVersion: 'latest',
      workingDirectory: dir,
    },
    createManifest(['0.3.5']),
  )
  assert.equal(result, '0.3.5')
})

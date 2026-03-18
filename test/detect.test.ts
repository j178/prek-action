import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { it } from 'vitest'

import { detectVersion } from '../src/version/auto'
import { findVersionInPackageJson } from '../src/version/sources/package-json'
import { findVersionInRequirements, pep440ToSemver } from '../src/version/sources/requirements'
import {
  findVersionInMiseToml,
  findVersionInPyprojectToml,
  findVersionInUvLock,
} from '../src/version/sources/toml'
import { findVersionInToolVersions } from '../src/version/sources/tool-versions'
import { resolveVersionFile } from '../src/version/version-file'

it('findVersionInToolVersions returns version from prek line', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  await fs.writeFile(path.join(dir, '.tool-versions'), 'node 22.0.0\nprek 0.3.1\npython 3.12.0\n')
  assert.equal(await findVersionInToolVersions(path.join(dir, '.tool-versions')), '0.3.1')
})

it('findVersionInToolVersions returns null when prek not listed', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  await fs.writeFile(path.join(dir, '.tool-versions'), 'node 22.0.0\n')
  assert.equal(await findVersionInToolVersions(path.join(dir, '.tool-versions')), null)
})

it('findVersionInToolVersions ignores comments and blank lines', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  await fs.writeFile(path.join(dir, '.tool-versions'), '# tools\n\nprek 0.3.5\n')
  assert.equal(await findVersionInToolVersions(path.join(dir, '.tool-versions')), '0.3.5')
})

it('findVersionInToolVersions strips v prefix', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  await fs.writeFile(path.join(dir, '.tool-versions'), 'prek v0.3.1\n')
  assert.equal(await findVersionInToolVersions(path.join(dir, '.tool-versions')), '0.3.1')
})

it('findVersionInToolVersions ignores a UTF-8 BOM', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  await fs.writeFile(path.join(dir, '.tool-versions'), '\uFEFFprek 0.3.1\n')
  assert.equal(await findVersionInToolVersions(path.join(dir, '.tool-versions')), '0.3.1')
})

it('findVersionInToolVersions returns null for missing file', async () => {
  assert.equal(await findVersionInToolVersions('/nonexistent/.tool-versions'), null)
})

it('findVersionInMiseToml returns version from [tools].prek string', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'mise.toml')
  await fs.writeFile(fp, '[tools]\nprek = "0.3.1"\n')
  assert.equal(await findVersionInMiseToml(fp), '0.3.1')
})

it('findVersionInMiseToml returns version from [tools.prek] object', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'mise.toml')
  await fs.writeFile(fp, '[tools.prek]\nversion = "0.3.2"\n')
  assert.equal(await findVersionInMiseToml(fp), '0.3.2')
})

it('findVersionInMiseToml returns null when prek not in [tools]', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'mise.toml')
  await fs.writeFile(fp, '[tools]\nnode = "22"\n')
  assert.equal(await findVersionInMiseToml(fp), null)
})

it('findVersionInMiseToml strips v prefix', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'mise.toml')
  await fs.writeFile(fp, '[tools]\nprek = "v0.3.1"\n')
  assert.equal(await findVersionInMiseToml(fp), '0.3.1')
})

it('findVersionInMiseToml returns null for missing file', async () => {
  assert.equal(await findVersionInMiseToml('/nonexistent/mise.toml'), null)
})

it('findVersionInUvLock returns version from [[package]] entry', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'uv.lock')
  await fs.writeFile(
    fp,
    `version = 1
requires-python = ">=3.11"

[[package]]
name = "pytest"
version = "7.4.0"

[[package]]
name = "prek"
version = "0.3.3"
source = { registry = "https://pypi.org/simple" }
`,
  )
  assert.equal(await findVersionInUvLock(fp), '0.3.3')
})

it('findVersionInUvLock returns null when prek not in packages', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'uv.lock')
  await fs.writeFile(fp, `version = 1\n\n[[package]]\nname = "pytest"\nversion = "7.4.0"\n`)
  assert.equal(await findVersionInUvLock(fp), null)
})

it('findVersionInUvLock is case-insensitive on package name', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'uv.lock')
  await fs.writeFile(fp, `version = 1\n\n[[package]]\nname = "Prek"\nversion = "0.3.4"\n`)
  assert.equal(await findVersionInUvLock(fp), '0.3.4')
})

it('findVersionInUvLock returns null for missing file', async () => {
  assert.equal(await findVersionInUvLock('/nonexistent/uv.lock'), null)
})

it('findVersionInPyprojectToml reads [tool.prek].version', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(fp, '[tool.prek]\nversion = "0.3.1"\n')
  assert.equal(await findVersionInPyprojectToml(fp), '0.3.1')
})

it('findVersionInPyprojectToml reads [dependency-groups]', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(fp, `[dependency-groups]\ndev = ["prek>=0.3.0", "pytest>=7.0.0"]\n`)
  assert.equal(await findVersionInPyprojectToml(fp), '>=0.3.0')
})

it('findVersionInPyprojectToml reads [project.optional-dependencies]', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(
    fp,
    `[project]\nname = "myproject"\n\n[project.optional-dependencies]\ndev = ["prek==0.3.2"]\n`,
  )
  assert.equal(await findVersionInPyprojectToml(fp), '0.3.2')
})

it('findVersionInPyprojectToml prefers [tool.prek].version over deps', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(
    fp,
    `[tool.prek]\nversion = "0.3.5"\n\n[dependency-groups]\ndev = ["prek>=0.3.0"]\n`,
  )
  assert.equal(await findVersionInPyprojectToml(fp), '0.3.5')
})

it('findVersionInPyprojectToml handles prek[extras]', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(fp, `[dependency-groups]\ndev = ["prek[toml]>=0.3.0"]\n`)
  assert.equal(await findVersionInPyprojectToml(fp), '>=0.3.0')
})

it('findVersionInPyprojectToml expands compatible release clauses in deps', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(fp, `[dependency-groups]\ndev = ["prek~=0.3"]\n`)
  assert.equal(await findVersionInPyprojectToml(fp), '>=0.3.0 <1.0.0')
})

it('findVersionInPyprojectToml accepts repeated identical constraints across groups', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(
    fp,
    [
      '[dependency-groups]',
      'dev = ["prek>=0.3.0,<1.0.0"]',
      '',
      '[project]',
      'name = "myproject"',
      '',
      '[project.optional-dependencies]',
      'lint = ["prek~=0.3"]',
      '',
    ].join('\n'),
  )
  assert.equal(await findVersionInPyprojectToml(fp), '>=0.3.0 <1.0.0')
})

it('findVersionInPyprojectToml rejects ambiguous constraints across groups', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(fp, `[dependency-groups]\ndev = ["prek==0.3.0"]\nlint = ["prek==0.4.0"]\n`)
  await assert.rejects(
    () => findVersionInPyprojectToml(fp),
    /Ambiguous prek version in pyproject\.toml/,
  )
})

it('findVersionInPyprojectToml returns null when no prek found', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(fp, '[project]\nname = "myproject"\n')
  assert.equal(await findVersionInPyprojectToml(fp), null)
})

it('findVersionInPyprojectToml returns null for missing file', async () => {
  assert.equal(await findVersionInPyprojectToml('/nonexistent/pyproject.toml'), null)
})

it('findVersionInRequirements finds prek==X.Y.Z', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'requirements.txt')
  await fs.writeFile(fp, 'pytest>=7.0.0\nprek==0.3.0\nblack>=23.0.0\n')
  assert.equal(await findVersionInRequirements(fp), '0.3.0')
})

it('findVersionInRequirements finds prek>=X.Y.Z', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'requirements.txt')
  await fs.writeFile(fp, 'prek>=0.3.0\n')
  assert.equal(await findVersionInRequirements(fp), '>=0.3.0')
})

it('findVersionInRequirements ignores comments and blank lines', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'requirements.txt')
  await fs.writeFile(fp, '# deps\n\nprek==0.3.0\n')
  assert.equal(await findVersionInRequirements(fp), '0.3.0')
})

it('findVersionInRequirements strips inline comments', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'requirements.txt')
  await fs.writeFile(fp, 'prek==0.3.0 # pinned by team\n')
  assert.equal(await findVersionInRequirements(fp), '0.3.0')
})

it('findVersionInRequirements returns null when prek not listed', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'requirements.txt')
  await fs.writeFile(fp, 'pytest>=7.0.0\n')
  assert.equal(await findVersionInRequirements(fp), null)
})

it('findVersionInRequirements returns null for missing file', async () => {
  assert.equal(await findVersionInRequirements('/nonexistent/requirements.txt'), null)
})

it('findVersionInRequirements ignores PEP 508 environment markers', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'requirements.txt')
  await fs.writeFile(fp, 'prek>=0.3.0; python_version >= "3.8"\n')
  assert.equal(await findVersionInRequirements(fp), '>=0.3.0')
})

it('findVersionInRequirements strips inline comments after environment markers', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'requirements.txt')
  await fs.writeFile(fp, 'prek>=0.3.0 ; python_version >= "3.8" # note\n')
  assert.equal(await findVersionInRequirements(fp), '>=0.3.0')
})

it('findVersionInRequirements handles pip-compile style hash continuations', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'requirements.txt')
  await fs.writeFile(
    fp,
    [
      'prek==0.3.0 \\',
      '    --hash=sha256:abc123 \\',
      '    --hash=sha256:def456',
      'pytest>=7.0.0',
      '',
    ].join('\n'),
  )
  assert.equal(await findVersionInRequirements(fp), '0.3.0')
})

it('findVersionInRequirements expands compatible release clauses', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'requirements.txt')
  await fs.writeFile(fp, 'prek~=0.3\n')
  assert.equal(await findVersionInRequirements(fp), '>=0.3.0 <1.0.0')
})

it('pep440ToSemver strips == prefix', () => {
  assert.equal(pep440ToSemver('==0.3.0'), '0.3.0')
})

it('pep440ToSemver expands ~=X.Y to an explicit semver range', () => {
  assert.equal(pep440ToSemver('~=0.3'), '>=0.3.0 <1.0.0')
})

it('pep440ToSemver expands ~=X.Y.Z to an explicit semver range', () => {
  assert.equal(pep440ToSemver('~=0.3.0'), '>=0.3.0 <0.4.0')
})

it('pep440ToSemver passes through >= unchanged', () => {
  assert.equal(pep440ToSemver('>=0.3.0'), '>=0.3.0')
})

it('pep440ToSemver converts compound specifiers (comma to space)', () => {
  assert.equal(pep440ToSemver('>=0.3.0,<0.4.0'), '>=0.3.0 <0.4.0')
})

it('pep440ToSemver preserves exclusion-only specifiers', () => {
  assert.equal(pep440ToSemver('!=0.3.0'), '!=0.3.0')
})

it('pep440ToSemver preserves != parts from compound specifiers', () => {
  assert.equal(pep440ToSemver('>=0.3.0,!=0.3.1'), '>=0.3.0 !=0.3.1')
})

it('pep440ToSemver preserves wildcard exclusion clauses', () => {
  assert.equal(pep440ToSemver('!=0.3.*'), '!=0.3.*')
  assert.equal(pep440ToSemver('!=0.3.1.*'), '!=0.3.1.*')
})

it('pep440ToSemver preserves exclusions alongside expanded compatible releases', () => {
  assert.equal(pep440ToSemver('~=0.3,!=0.3.5'), '>=0.3.0 <1.0.0 !=0.3.5')
})

it('pep440ToSemver rejects unsupported single-segment compatible releases', () => {
  assert.throws(() => pep440ToSemver('~=1'), /Unsupported PEP 440 compatible release specifier/)
})

it('findVersionInPackageJson reads @j178/prek from devDependencies', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'package.json')
  await fs.writeFile(fp, JSON.stringify({ devDependencies: { '@j178/prek': '^0.3.0' } }))
  assert.equal(await findVersionInPackageJson(fp), '^0.3.0')
})

it('findVersionInPackageJson reads @j178/prek from dependencies', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'package.json')
  await fs.writeFile(fp, JSON.stringify({ dependencies: { '@j178/prek': '0.3.1' } }))
  assert.equal(await findVersionInPackageJson(fp), '0.3.1')
})

it('findVersionInPackageJson ignores a UTF-8 BOM', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'package.json')
  await fs.writeFile(fp, '\uFEFF{"devDependencies":{"@j178/prek":"^0.3.0"}}')
  assert.equal(await findVersionInPackageJson(fp), '^0.3.0')
})

it('findVersionInPackageJson prefers devDependencies', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'package.json')
  await fs.writeFile(
    fp,
    JSON.stringify({
      dependencies: { '@j178/prek': '0.2.0' },
      devDependencies: { '@j178/prek': '0.3.0' },
    }),
  )
  assert.equal(await findVersionInPackageJson(fp), '0.3.0')
})

it('findVersionInPackageJson returns null when prek not in deps', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'package.json')
  await fs.writeFile(fp, JSON.stringify({ devDependencies: { eslint: '^8.0.0' } }))
  assert.equal(await findVersionInPackageJson(fp), null)
})

it('findVersionInPackageJson returns null for non-string version values', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'package.json')
  await fs.writeFile(fp, JSON.stringify({ devDependencies: { '@j178/prek': true } }))
  assert.equal(await findVersionInPackageJson(fp), null)
})

it('findVersionInPackageJson returns null for missing file', async () => {
  assert.equal(await findVersionInPackageJson('/nonexistent/package.json'), null)
})

it('resolveVersionFile dispatches to .tool-versions parser', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, '.tool-versions')
  await fs.writeFile(fp, 'prek 0.3.1\n')
  assert.deepEqual(await resolveVersionFile(fp), {
    source: fp,
    version: '0.3.1',
  })
})

it('resolveVersionFile dispatches to mise.toml parser', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'mise.toml')
  await fs.writeFile(fp, '[tools]\nprek = "0.3.2"\n')
  assert.deepEqual(await resolveVersionFile(fp), {
    source: fp,
    version: '0.3.2',
  })
})

it('resolveVersionFile dispatches to uv.lock parser', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'uv.lock')
  await fs.writeFile(fp, 'version = 1\n\n[[package]]\nname = "prek"\nversion = "0.3.3"\n')
  assert.deepEqual(await resolveVersionFile(fp), {
    source: fp,
    version: '0.3.3',
  })
})

it('resolveVersionFile dispatches to pyproject.toml parser', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(fp, '[tool.prek]\nversion = "0.3.4"\n')
  assert.deepEqual(await resolveVersionFile(fp), {
    source: fp,
    version: '0.3.4',
  })
})

it('resolveVersionFile dispatches to requirements.txt parser', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'requirements.txt')
  await fs.writeFile(fp, 'prek==0.3.0\n')
  assert.deepEqual(await resolveVersionFile(fp), {
    source: fp,
    version: '0.3.0',
  })
})

it('resolveVersionFile dispatches to requirements-dev.txt parser', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'requirements-dev.txt')
  await fs.writeFile(fp, 'prek==0.2.5\n')
  assert.deepEqual(await resolveVersionFile(fp), {
    source: fp,
    version: '0.2.5',
  })
})

it('resolveVersionFile dispatches to package.json parser', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'package.json')
  await fs.writeFile(fp, JSON.stringify({ devDependencies: { '@j178/prek': '0.3.5' } }))
  assert.deepEqual(await resolveVersionFile(fp), {
    source: fp,
    version: '0.3.5',
  })
})

it('resolveVersionFile throws when file exists but has no prek version', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(fp, '[project]\nname = "myproject"\n')
  await assert.rejects(() => resolveVersionFile(fp), /No prek version found/)
})

it('resolveVersionFile throws when file does not exist', async () => {
  await assert.rejects(() => resolveVersionFile('/nonexistent/uv.lock'), /does not exist/)
})

it('resolveVersionFile throws for unsupported file type', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'random.cfg')
  await fs.writeFile(fp, 'something\n')
  await assert.rejects(() => resolveVersionFile(fp), /Unsupported version-file/)
})

it('resolveVersionFile surfaces malformed package.json syntax', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'package.json')
  await fs.writeFile(fp, '{ bad json')
  await assert.rejects(() => resolveVersionFile(fp), /Failed to parse package\.json/)
})

it('resolveVersionFile surfaces malformed uv.lock syntax', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'uv.lock')
  await fs.writeFile(fp, '[[package]\nname = "prek"')
  await assert.rejects(() => resolveVersionFile(fp), /Failed to parse uv\.lock/)
})

it('resolveVersionFile surfaces malformed pyproject.toml syntax', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'pyproject.toml')
  await fs.writeFile(fp, "[tool.prek\nversion = '0.3.0'\n")
  await assert.rejects(() => resolveVersionFile(fp), /Failed to parse pyproject\.toml/)
})

it('resolveVersionFile surfaces malformed mise.toml syntax', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const fp = path.join(dir, 'mise.toml')
  await fs.writeFile(fp, "[tools\nprek = '0.3.0'\n")
  await assert.rejects(() => resolveVersionFile(fp), /Failed to parse mise\.toml/)
})

it('detectVersion finds version from .tool-versions', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  await fs.writeFile(path.join(dir, '.tool-versions'), 'prek 0.3.2\n')
  const result = await detectVersion(dir)
  assert.deepEqual(result, { source: '.tool-versions', version: '0.3.2' })
})

it('detectVersion returns null when no .tool-versions exists', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  assert.equal(await detectVersion(dir), null)
})

it('detectVersion ignores minimum_prek_version files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  await fs.writeFile(path.join(dir, '.pre-commit-config.yaml'), "minimum_prek_version: '0.3.0'\n")
  assert.equal(await detectVersion(dir), null)
})

it('detectVersion ignores prek.toml for action-level version resolution', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  await fs.writeFile(path.join(dir, 'prek.toml'), 'minimum_prek_version = "0.3.0"\n')
  assert.equal(await detectVersion(dir), null)
})

it('detectVersion checks repo root when working directory has no .tool-versions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const subdir = path.join(root, 'packages', 'app')
  await fs.mkdir(subdir, { recursive: true })
  await fs.writeFile(path.join(root, '.tool-versions'), 'prek 0.3.1\n')
  const result = await detectVersion(subdir, root)
  assert.deepEqual(result, { source: '.tool-versions', version: '0.3.1' })
})

it('detectVersion prefers working directory .tool-versions over repo root', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-detect-'))
  const subdir = path.join(root, 'packages', 'app')
  await fs.mkdir(subdir, { recursive: true })
  await fs.writeFile(path.join(root, '.tool-versions'), 'prek 0.3.0\n')
  await fs.writeFile(path.join(subdir, '.tool-versions'), 'prek 0.3.5\n')
  const result = await detectVersion(subdir, root)
  assert.deepEqual(result, { source: '.tool-versions', version: '0.3.5' })
})

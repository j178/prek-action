import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { knownChecksumsByAsset } from '../src/known-checksums'

vi.mock('@actions/core', async importOriginal => ({
  ...(await importOriginal<typeof core>()),
  addPath: vi.fn(),
  debug: vi.fn(),
  endGroup: vi.fn(),
  info: vi.fn(),
  setOutput: vi.fn(),
  startGroup: vi.fn(),
}))
vi.mock('@actions/tool-cache', () => ({
  cacheFile: vi.fn(),
  downloadTool: vi.fn(),
  extractTar: vi.fn(),
  extractZip: vi.fn(),
  find: vi.fn(),
}))
vi.mock('../src/known-checksums', () => ({ knownChecksumsByAsset: new Map<string, string>() }))

const archiveDigest = '9a3a45d01531a20e89ac6ae10b0b0beb0492acd7216a368aa062d1a5fecaf9cd'
const wrongDigest = '0'.repeat(64)
let rootDir: string
let toolPath: string
let checksumKey: string

describe('checksum input', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.resetAllMocks()
    knownChecksumsByAsset.clear()
    vi.stubEnv('INPUT_CHECKSUM', '')
    vi.stubEnv('INPUT_PREK-VERSION', '1.2.3')
    vi.stubEnv('INPUT_INSTALL-ONLY', 'true')
    vi.stubEnv('INPUT_CACHE', 'false')
    vi.stubEnv('INPUT_SHOW-VERBOSE-LOGS', 'false')

    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-checksum-input-'))
    toolPath = path.join(rootDir, 'tool-cache')
    const archivePath = path.join(rootDir, 'archive')
    const manifestPath = path.join(rootDir, 'version-manifest.json')
    const extractedPath = path.join(rootDir, 'extracted')
    const { detectLinuxLibc, getReleaseAssetFor } = await import('../src/install')
    const asset = getReleaseAssetFor(process.platform, process.arch, detectLinuxLibc())
    checksumKey = `1.2.3:${asset.archiveName}`
    const binaryDir =
      asset.archiveType === 'zip' ? extractedPath : path.join(extractedPath, 'target')
    await fs.mkdir(binaryDir, { recursive: true })
    await fs.writeFile(path.join(binaryDir, asset.binaryName), 'executable')
    await fs.writeFile(archivePath, 'binary')
    await fs.writeFile(manifestPath, '[]')

    vi.mocked(tc.find).mockReturnValue('')
    vi.mocked(tc.downloadTool).mockImplementation(async url =>
      url.endsWith('version-manifest.json') ? manifestPath : archivePath,
    )
    vi.mocked(tc.extractTar).mockResolvedValue(extractedPath)
    vi.mocked(tc.extractZip).mockResolvedValue(extractedPath)
    vi.mocked(tc.cacheFile).mockResolvedValue(toolPath)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await fs.rm(rootDir, { force: true, recursive: true })
  })

  it.each([
    wrongDigest,
    undefined,
  ])('installs with a matching input when the bundled checksum is %s', async knownDigest => {
    if (knownDigest) knownChecksumsByAsset.set(checksumKey, knownDigest)
    vi.stubEnv('INPUT_CHECKSUM', archiveDigest)
    const { run } = await import('../src/main')

    await run()

    expect(core.addPath).toHaveBeenCalledWith(toolPath)
  })

  it.each([
    { cachedTool: '', checksum: wrongDigest, knownDigest: archiveDigest },
    { cachedTool: '/cached/prek', checksum: wrongDigest, knownDigest: archiveDigest },
    { cachedTool: '', checksum: wrongDigest, knownDigest: undefined },
    { cachedTool: '', checksum: '', knownDigest: wrongDigest },
  ])('rejects a mismatch before installation (input: $checksum, cache: $cachedTool, bundled: $knownDigest)', async ({
    cachedTool,
    checksum,
    knownDigest,
  }) => {
    if (knownDigest) knownChecksumsByAsset.set(checksumKey, knownDigest)
    vi.stubEnv('INPUT_CHECKSUM', checksum)
    vi.mocked(tc.find).mockReturnValue(cachedTool)
    const { run } = await import('../src/main')

    await expect(run()).rejects.toThrow(`expected ${wrongDigest}, received ${archiveDigest}`)

    expect(tc.extractTar).not.toHaveBeenCalled()
    expect(tc.extractZip).not.toHaveBeenCalled()
    expect(tc.cacheFile).not.toHaveBeenCalled()
    expect(core.addPath).not.toHaveBeenCalled()
  })
})

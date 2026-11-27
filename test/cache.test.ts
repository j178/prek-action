import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as glob from '@actions/glob'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CACHE_KEY_STATE, CACHE_MATCHED_KEY_STATE, CACHE_PATHS_STATE } from '../src/types'

const mockContext = vi.hoisted(() => ({
  cacheDir: '',
  state: {} as Record<string, string>,
  telemetry: {
    infos: [] as string[],
    savedStateEntries: [] as Array<[string, string]>,
    warnings: [] as string[],
  },
}))

const toolkitMocks = vi.hoisted(() => ({
  exec: vi.fn<
    (
      commandLine: string,
      args?: string[],
      options?: { listeners?: { stdout?: (data: Buffer) => void } },
    ) => Promise<number>
  >(),
  restoreCache: vi.fn<typeof import('@actions/cache').restoreCache>(),
  saveCache: vi.fn<(paths: string[], primaryKey: string) => Promise<number>>(),
}))

vi.mock('@actions/cache', () => ({
  restoreCache: toolkitMocks.restoreCache,
  saveCache: toolkitMocks.saveCache,
}))

vi.mock('@actions/core', () => ({
  endGroup: vi.fn(),
  getState: vi.fn((name: string) => mockContext.state[name] ?? ''),
  info: vi.fn((message: string) => {
    mockContext.telemetry.infos.push(message)
  }),
  saveState: vi.fn((name: string, value: string) => {
    mockContext.state[name] = value
    mockContext.telemetry.savedStateEntries.push([name, value])
  }),
  startGroup: vi.fn(),
  warning: vi.fn((message: string) => {
    mockContext.telemetry.warnings.push(message)
  }),
}))

vi.mock('@actions/exec', () => ({
  exec: toolkitMocks.exec,
}))

const { restorePrekCache, savePrekCache } = await import('../src/cache')

async function createWorkingDirectory(): Promise<string> {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-cache-test-'))
  await fs.writeFile(path.join(workingDirectory, 'prek.toml'), 'version = 1\n')
  return workingDirectory
}

function resetMockContext(): void {
  mockContext.cacheDir = path.join(os.homedir(), '.cache', 'prek')
  mockContext.state = {}
  mockContext.telemetry.infos = []
  mockContext.telemetry.savedStateEntries = []
  mockContext.telemetry.warnings = []
}

describe('restorePrekCache', () => {
  afterEach(() => vi.unstubAllEnvs())

  beforeEach(() => {
    resetMockContext()
    vi.clearAllMocks()

    toolkitMocks.restoreCache.mockResolvedValue(undefined)
    toolkitMocks.saveCache.mockResolvedValue(123)
    toolkitMocks.exec.mockImplementation(async (_commandLine, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from(`${mockContext.cacheDir}\n`))
      return 0
    })
  })

  it('saves the matched key when restoreCache hits the primary key', async () => {
    const workingDirectory = await createWorkingDirectory()
    toolkitMocks.restoreCache.mockImplementation(async (_paths, primaryKey) => primaryKey)

    await restorePrekCache(workingDirectory)

    const [paths, primaryKey] = toolkitMocks.restoreCache.mock.calls[0]
    expect(primaryKey).toBe(mockContext.state[CACHE_KEY_STATE])
    expect(mockContext.state[CACHE_MATCHED_KEY_STATE]).toBe(mockContext.state[CACHE_KEY_STATE])
    expect(JSON.parse(mockContext.state[CACHE_PATHS_STATE])).toEqual(paths)
    expect(mockContext.telemetry.savedStateEntries.map(([name]) => name)).toEqual([
      CACHE_KEY_STATE,
      CACHE_PATHS_STATE,
      CACHE_MATCHED_KEY_STATE,
    ])
    expect(mockContext.telemetry.infos).toEqual([
      `Using prek cache dir ${mockContext.cacheDir}`,
      `Restored prek cache with key ${mockContext.state[CACHE_KEY_STATE]}`,
    ])
    expect(mockContext.telemetry.warnings).toEqual([])
  })

  it('prefers the same config across image builds before falling back to another config', async () => {
    const workingDirectory = await createWorkingDirectory()
    const config = path.join(workingDirectory, 'prek.toml')
    vi.stubEnv('ImageOS', 'ubuntu24')
    vi.stubEnv('ImageVersion', '20261122.1')
    vi.stubEnv('pythonLocation', '/opt/python')

    const olderConfig = await restorePrekCache(workingDirectory)
    await fs.appendFile(config, '# new revision\n')
    const previousBuild = await restorePrekCache(workingDirectory)
    vi.stubEnv('ImageVersion', '20261129.1')
    const current = await restorePrekCache(workingDirectory)
    const [sameConfig, anyConfig] = toolkitMocks.restoreCache.mock.lastCall?.[2] ?? []
    expect(previousBuild.primaryKey).not.toBe(olderConfig.primaryKey)
    expect(current.primaryKey).not.toBe(previousBuild.primaryKey)
    expect(previousBuild.primaryKey.startsWith(sameConfig)).toBe(true)
    expect(olderConfig.primaryKey.startsWith(sameConfig)).toBe(false)
    expect(olderConfig.primaryKey.startsWith(anyConfig)).toBe(true)

    for (const [name, value] of [
      ['ImageOS', 'ubuntu26'],
      ['pythonLocation', '/opt/another-python'],
    ]) {
      const original = process.env[name]
      vi.stubEnv(name, value)
      const other = await restorePrekCache(workingDirectory)
      expect(other.primaryKey).not.toBe(current.primaryKey)
      const otherKeys = toolkitMocks.restoreCache.mock.lastCall?.[2] ?? []
      expect(otherKeys.some(prefix => current.primaryKey.startsWith(prefix))).toBe(false)
      vi.stubEnv(name, original)
    }

    vi.stubEnv('ImageVersion', undefined)
    await restorePrekCache(workingDirectory)
    expect(toolkitMocks.restoreCache.mock.lastCall?.[2] ?? []).toEqual([])
  })

  it('logs a cache miss without saving a matched key', async () => {
    const workingDirectory = await createWorkingDirectory()

    await restorePrekCache(workingDirectory)

    expect(mockContext.state[CACHE_MATCHED_KEY_STATE]).toBeUndefined()
    expect(mockContext.telemetry.infos).toEqual([
      `Using prek cache dir ${mockContext.cacheDir}`,
      `No cache found for key ${mockContext.state[CACHE_KEY_STATE]}`,
    ])
    expect(mockContext.telemetry.warnings).toEqual([])
  })

  it('archives hook environments and tool caches while excluding workspace discovery', async () => {
    const workingDirectory = await createWorkingDirectory()
    const cacheDir = path.join(workingDirectory, 'prek home')
    mockContext.cacheDir = cacheDir
    const files = ['hooks/env/tool', 'cache/deno/module', 'cache/prek/workspace/project']
    for (const file of files) {
      const target = path.join(cacheDir, file)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, '')
    }

    await restorePrekCache(workingDirectory)
    const paths = JSON.parse(mockContext.state[CACHE_PATHS_STATE]) as string[]
    const matcher = await glob.create(paths.join('\n'), { implicitDescendants: false })
    const roots = await matcher.glob()
    // The cache toolkit passes matched directories to tar, which includes their descendants.
    const archived = files.filter(file => {
      const target = path.join(cacheDir, file)
      return roots.some(root => target === root || target.startsWith(root + path.sep))
    })
    expect(archived).toEqual(['hooks/env/tool', 'cache/deno/module'])
  })
})

describe('savePrekCache', () => {
  beforeEach(() => {
    resetMockContext()
    vi.clearAllMocks()

    toolkitMocks.restoreCache.mockResolvedValue(undefined)
    toolkitMocks.saveCache.mockResolvedValue(123)
    toolkitMocks.exec.mockImplementation(async (_commandLine, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from(`${mockContext.cacheDir}\n`))
      return 0
    })
  })

  it('skips when no cache state was recorded', async () => {
    await savePrekCache()

    expect(toolkitMocks.saveCache).not.toHaveBeenCalled()
    expect(mockContext.telemetry.infos).toEqual([
      'No cache state found, skipping cache save (cache disabled or restore step did not run)',
    ])
    expect(mockContext.telemetry.warnings).toEqual([])
  })

  it('skips saving on an exact cache hit', async () => {
    const primaryKey = 'prek-v1|Linux|X64|/opt/python|hash'
    mockContext.state = {
      [CACHE_KEY_STATE]: primaryKey,
      [CACHE_MATCHED_KEY_STATE]: primaryKey,
      [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache']),
    }

    await savePrekCache()

    expect(toolkitMocks.saveCache).not.toHaveBeenCalled()
    expect(mockContext.telemetry.infos).toEqual([
      `Cache hit occurred on the primary key ${primaryKey}, not saving cache.`,
    ])
    expect(mockContext.telemetry.warnings).toEqual([])
  })

  it('treats a -1 cache id as a handled non-success path', async () => {
    mockContext.state = {
      [CACHE_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|hash',
      [CACHE_MATCHED_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|older-hash',
      [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache']),
    }
    toolkitMocks.saveCache.mockResolvedValue(-1)

    await savePrekCache()

    expect(toolkitMocks.saveCache).toHaveBeenCalledTimes(1)
    expect(toolkitMocks.saveCache.mock.calls[0]?.[1]).toBe(mockContext.state[CACHE_KEY_STATE])
    expect(mockContext.telemetry.infos).toEqual([])
    expect(mockContext.telemetry.warnings).toEqual([])
  })

  it('logs success when saveCache returns a cache id', async () => {
    mockContext.state = {
      [CACHE_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|hash',
      [CACHE_MATCHED_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|older-hash',
      [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache']),
    }

    await savePrekCache()

    expect(mockContext.telemetry.infos).toEqual([
      `Saved prek cache with key ${mockContext.state[CACHE_KEY_STATE]}`,
    ])
    expect(mockContext.telemetry.warnings).toEqual([])
  })

  it('warns when saveCache throws', async () => {
    mockContext.state = {
      [CACHE_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|hash',
      [CACHE_MATCHED_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|older-hash',
      [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache']),
    }
    toolkitMocks.saveCache.mockRejectedValue(new Error('boom'))

    await savePrekCache()

    expect(mockContext.telemetry.infos).toEqual([])
    expect(mockContext.telemetry.warnings).toEqual(['Failed to save cache: boom'])
  })
})

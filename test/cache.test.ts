import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals'
import { CACHE_KEY_STATE, CACHE_MATCHED_KEY_STATE, CACHE_PATHS_STATE } from '../src/types'

let mockState: Record<string, string> = {}
let mockInfos: string[] = []
let mockWarnings: string[] = []
let mockSavedStateEntries: Array<[string, string]> = []
let mockCacheDir = path.join(os.homedir(), '.cache', 'prek')
let mockGlobFiles: string[] = []

const mockRestoreCache = jest.fn<(paths: string[], primaryKey: string) => Promise<string | undefined>>()
const mockSaveCache = jest.fn<(paths: string[], primaryKey: string) => Promise<number>>()
const mockExec = jest.fn<
  (
    commandLine: string,
    args?: string[],
    options?: { listeners?: { stdout?: (data: Buffer) => void } },
  ) => Promise<number>
>()

jest.unstable_mockModule('@actions/cache', () => ({
  restoreCache: mockRestoreCache,
  saveCache: mockSaveCache,
}))

jest.unstable_mockModule('@actions/core', () => ({
  endGroup: jest.fn(),
  getState: jest.fn((name: string) => mockState[name] ?? ''),
  info: jest.fn((message: string) => {
    mockInfos.push(message)
  }),
  saveState: jest.fn((name: string, value: string) => {
    mockState[name] = value
    mockSavedStateEntries.push([name, value])
  }),
  startGroup: jest.fn(),
  warning: jest.fn((message: string) => {
    mockWarnings.push(message)
  }),
}))

jest.unstable_mockModule('@actions/exec', () => ({
  exec: mockExec,
}))

jest.unstable_mockModule('@actions/glob', () => ({
  create: jest.fn(async () => ({
    glob: async () => mockGlobFiles,
  })),
}))

const { restorePrekCache, savePrekCache } = await import('../src/cache')

async function createWorkingDirectory(): Promise<string> {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-cache-test-'))
  await fs.writeFile(path.join(workingDirectory, 'prek.toml'), 'version = 1\n')
  return workingDirectory
}

beforeEach(() => {
  mockState = {}
  mockInfos = []
  mockWarnings = []
  mockSavedStateEntries = []
  mockCacheDir = path.join(os.homedir(), '.cache', 'prek')
  mockGlobFiles = []

  mockRestoreCache.mockReset()
  mockRestoreCache.mockResolvedValue(undefined)

  mockSaveCache.mockReset()
  mockSaveCache.mockResolvedValue(123)

  mockExec.mockReset()
  mockExec.mockImplementation(async (_commandLine, _args, options) => {
    options?.listeners?.stdout?.(Buffer.from(`${mockCacheDir}\n`))
    return 0
  })
})

afterEach(() => {
  jest.clearAllMocks()
})

test('restorePrekCache saves the matched key when restoreCache hits the primary key', async () => {
  const originalEnv = { ...process.env }
  const workingDirectory = await createWorkingDirectory()
  mockGlobFiles = [path.join(workingDirectory, 'prek.toml')]

  process.env.RUNNER_OS = 'Linux'
  process.env.RUNNER_ARCH = 'X64'
  process.env.pythonLocation = '/opt/python'

  let restoreCall: { paths: string[]; primaryKey: string } | undefined
  mockRestoreCache.mockImplementation(async (paths: string[], primaryKey: string) => {
    restoreCall = { paths, primaryKey }
    return primaryKey
  })

  try {
    await restorePrekCache(workingDirectory)
  } finally {
    process.env = originalEnv
  }

  expect(restoreCall?.paths).toEqual([mockCacheDir])
  expect(restoreCall?.primaryKey).toBe(mockState[CACHE_KEY_STATE])
  expect(mockState[CACHE_MATCHED_KEY_STATE]).toBe(mockState[CACHE_KEY_STATE])
  expect(mockState[CACHE_PATHS_STATE]).toBe(JSON.stringify([mockCacheDir]))
  expect(mockSavedStateEntries.map(([name]) => name)).toEqual([
    CACHE_KEY_STATE,
    CACHE_PATHS_STATE,
    CACHE_MATCHED_KEY_STATE,
  ])
  expect(mockInfos).toEqual([
    `Using prek cache dir ${mockCacheDir}`,
    `Restored prek cache with key ${mockState[CACHE_KEY_STATE]}`,
  ])
  expect(mockWarnings).toEqual([])
})

test('restorePrekCache logs a cache miss without saving a matched key', async () => {
  const workingDirectory = await createWorkingDirectory()
  mockGlobFiles = [path.join(workingDirectory, 'prek.toml')]

  await restorePrekCache(workingDirectory)

  expect(mockState[CACHE_MATCHED_KEY_STATE]).toBeUndefined()
  expect(mockInfos).toEqual([
    `Using prek cache dir ${mockCacheDir}`,
    `No cache found for key ${mockState[CACHE_KEY_STATE]}`,
  ])
  expect(mockWarnings).toEqual([])
})

test('savePrekCache skips when no cache state was recorded', async () => {
  await savePrekCache()

  expect(mockSaveCache).not.toHaveBeenCalled()
  expect(mockInfos).toEqual(['No cache state found, skipping cache save'])
  expect(mockWarnings).toEqual([])
})

test('savePrekCache skips saving on an exact cache hit', async () => {
  const primaryKey = 'prek-v1|Linux|X64|/opt/python|hash'
  mockState = {
    [CACHE_KEY_STATE]: primaryKey,
    [CACHE_MATCHED_KEY_STATE]: primaryKey,
    [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache']),
  }

  await savePrekCache()

  expect(mockSaveCache).not.toHaveBeenCalled()
  expect(mockInfos).toEqual([`Cache hit occurred on the primary key ${primaryKey}, not saving cache.`])
  expect(mockWarnings).toEqual([])
})

test('savePrekCache treats a -1 cache id as a handled non-success path', async () => {
  mockState = {
    [CACHE_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|hash',
    [CACHE_MATCHED_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|older-hash',
    [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache']),
  }
  mockSaveCache.mockResolvedValue(-1)

  await savePrekCache()

  expect(mockSaveCache).toHaveBeenCalledTimes(1)
  expect(mockSaveCache.mock.calls[0]?.[1]).toBe(mockState[CACHE_KEY_STATE])
  expect(mockInfos).toEqual([])
  expect(mockWarnings).toEqual([])
})

test('savePrekCache logs success when saveCache returns a cache id', async () => {
  mockState = {
    [CACHE_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|hash',
    [CACHE_MATCHED_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|older-hash',
    [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache']),
  }

  await savePrekCache()

  expect(mockInfos).toEqual([`Saved prek cache with key ${mockState[CACHE_KEY_STATE]}`])
  expect(mockWarnings).toEqual([])
})

test('savePrekCache warns when saveCache throws', async () => {
  mockState = {
    [CACHE_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|hash',
    [CACHE_MATCHED_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|older-hash',
    [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache']),
  }
  mockSaveCache.mockRejectedValue(new Error('boom'))

  await savePrekCache()

  expect(mockInfos).toEqual([])
  expect(mockWarnings).toEqual(['Failed to save cache: boom'])
})

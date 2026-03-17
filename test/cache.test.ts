import test, {mock} from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import * as cache from '@actions/cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

import {restorePrekCache, savePrekCache} from '../src/cache'
import {CACHE_KEY_STATE, CACHE_MATCHED_KEY_STATE, CACHE_PATHS_STATE} from '../src/types'

type CoreMockState = {
  infos: string[]
  savedStateEntries: Array<[string, string]>
  warnings: string[]
}

function setupCoreMocks(state: Record<string, string>): CoreMockState {
  const infos: string[] = []
  const warnings: string[] = []
  const savedStateEntries: Array<[string, string]> = []

  mock.method(core, 'endGroup', () => {})
  mock.method(core, 'getState', (name: string) => state[name] ?? '')
  mock.method(core, 'info', (message: string) => {
    infos.push(message)
  })
  mock.method(core, 'saveState', (name: string, value: string) => {
    state[name] = value
    savedStateEntries.push([name, value])
  })
  mock.method(core, 'startGroup', () => {})
  mock.method(core, 'warning', (message: string) => {
    warnings.push(message)
  })

  return {infos, savedStateEntries, warnings}
}

async function createWorkingDirectory(): Promise<string> {
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'prek-action-cache-test-'))
  await fs.writeFile(path.join(workingDirectory, 'prek.toml'), 'version = 1\n')
  return workingDirectory
}

test('restorePrekCache saves the matched key when restoreCache hits the primary key', async () => {
  mock.restoreAll()
  const originalEnv = {...process.env}
  const state: Record<string, string> = {}
  const {infos, savedStateEntries, warnings} = setupCoreMocks(state)
  const workingDirectory = await createWorkingDirectory()

  process.env['RUNNER_OS'] = 'Linux'
  process.env['RUNNER_ARCH'] = 'X64'
  process.env['pythonLocation'] = '/opt/python'

  const expectedCacheDir = path.join(os.homedir(), '.cache', 'prek')
  mock.method(
    exec,
    'exec',
    async (
      _commandLine: string,
      _args?: string[],
      options?: {listeners?: {stdout?: (data: Buffer) => void}}
    ) => {
      options?.listeners?.stdout?.(Buffer.from(`${expectedCacheDir}\n`))
      return 0
    }
  )

  let restoreCall: {paths: string[]; primaryKey: string} | undefined
  mock.method(cache, 'restoreCache', async (paths: string[], primaryKey: string) => {
    restoreCall = {paths, primaryKey}
    return primaryKey
  })

  try {
    await restorePrekCache(workingDirectory)
  } finally {
    process.env = originalEnv
    mock.restoreAll()
  }

  assert.deepEqual(restoreCall?.paths, [path.join(os.homedir(), '.cache', 'prek')])
  assert.equal(restoreCall?.primaryKey, state[CACHE_KEY_STATE])
  assert.equal(state[CACHE_MATCHED_KEY_STATE], state[CACHE_KEY_STATE])
  assert.equal(state[CACHE_PATHS_STATE], JSON.stringify([path.join(os.homedir(), '.cache', 'prek')]))
  assert.deepEqual(
    savedStateEntries.map(([name]) => name),
    [CACHE_KEY_STATE, CACHE_PATHS_STATE, CACHE_MATCHED_KEY_STATE]
  )
  assert.deepEqual(infos, [
    `Using prek cache dir ${expectedCacheDir}`,
    `Restored prek cache with key ${state[CACHE_KEY_STATE]}`
  ])
  assert.deepEqual(warnings, [])
})

test('restorePrekCache logs a cache miss without saving a matched key', async () => {
  mock.restoreAll()
  const state: Record<string, string> = {}
  const {infos, warnings} = setupCoreMocks(state)
  const workingDirectory = await createWorkingDirectory()

  const expectedCacheDir = path.join(os.homedir(), '.cache', 'prek')
  mock.method(
    exec,
    'exec',
    async (
      _commandLine: string,
      _args?: string[],
      options?: {listeners?: {stdout?: (data: Buffer) => void}}
    ) => {
      options?.listeners?.stdout?.(Buffer.from(`${expectedCacheDir}\n`))
      return 0
    }
  )
  mock.method(cache, 'restoreCache', async () => undefined)

  try {
    await restorePrekCache(workingDirectory)
  } finally {
    mock.restoreAll()
  }

  assert.equal(state[CACHE_MATCHED_KEY_STATE], undefined)
  assert.deepEqual(infos, [
    `Using prek cache dir ${expectedCacheDir}`,
    `No cache found for key ${state[CACHE_KEY_STATE]}`
  ])
  assert.deepEqual(warnings, [])
})

test('savePrekCache skips when no cache state was recorded', async () => {
  mock.restoreAll()
  const {infos, warnings} = setupCoreMocks({})
  const saveCacheMock = mock.method(cache, 'saveCache', async () => 123)

  try {
    await savePrekCache()
  } finally {
    mock.restoreAll()
  }

  assert.equal(saveCacheMock.mock.callCount(), 0)
  assert.deepEqual(infos, ['No cache state found, skipping cache save'])
  assert.deepEqual(warnings, [])
})

test('savePrekCache skips saving on an exact cache hit', async () => {
  mock.restoreAll()
  const primaryKey = 'prek-v1|Linux|X64|/opt/python|hash'
  const state = {
    [CACHE_KEY_STATE]: primaryKey,
    [CACHE_MATCHED_KEY_STATE]: primaryKey,
    [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache'])
  }
  const {infos, warnings} = setupCoreMocks(state)
  const saveCacheMock = mock.method(cache, 'saveCache', async () => 123)

  try {
    await savePrekCache()
  } finally {
    mock.restoreAll()
  }

  assert.equal(saveCacheMock.mock.callCount(), 0)
  assert.deepEqual(infos, [`Cache hit occurred on the primary key ${primaryKey}, not saving cache.`])
  assert.deepEqual(warnings, [])
})

test('savePrekCache treats a -1 cache id as a handled non-success path', async () => {
  mock.restoreAll()
  const state = {
    [CACHE_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|hash',
    [CACHE_MATCHED_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|older-hash',
    [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache'])
  }
  const {infos, warnings} = setupCoreMocks(state)
  const saveCacheMock = mock.method(cache, 'saveCache', async () => -1)

  try {
    await savePrekCache()
  } finally {
    mock.restoreAll()
  }

  assert.equal(saveCacheMock.mock.callCount(), 1)
  assert.equal(saveCacheMock.mock.calls[0]?.arguments[1], state[CACHE_KEY_STATE])
  assert.deepEqual(infos, [])
  assert.deepEqual(warnings, [])
})

test('savePrekCache logs success when saveCache returns a cache id', async () => {
  mock.restoreAll()
  const state = {
    [CACHE_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|hash',
    [CACHE_MATCHED_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|older-hash',
    [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache'])
  }
  const {infos, warnings} = setupCoreMocks(state)
  mock.method(cache, 'saveCache', async () => 123)

  try {
    await savePrekCache()
  } finally {
    mock.restoreAll()
  }

  assert.deepEqual(infos, [`Saved prek cache with key ${state[CACHE_KEY_STATE]}`])
  assert.deepEqual(warnings, [])
})

test('savePrekCache warns when saveCache throws', async () => {
  mock.restoreAll()
  const state = {
    [CACHE_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|hash',
    [CACHE_MATCHED_KEY_STATE]: 'prek-v1|Linux|X64|/opt/python|older-hash',
    [CACHE_PATHS_STATE]: JSON.stringify(['/tmp/prek-cache'])
  }
  const {infos, warnings} = setupCoreMocks(state)
  mock.method(cache, 'saveCache', async () => {
    throw new Error('boom')
  })

  try {
    await savePrekCache()
  } finally {
    mock.restoreAll()
  }

  assert.deepEqual(infos, [])
  assert.deepEqual(warnings, ['Failed to save cache: boom'])
})

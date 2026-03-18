import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockContext = vi.hoisted(() => ({
  failures: [] as string[],
  inputs: {
    extraArgs: '--all-files',
    installOnly: false,
    prekVersion: 'latest',
    showVerboseLogs: false,
    workingDirectory: '/tmp/repo',
  },
  outputs: [] as Array<[string, string]>,
  restoreResult: {
    matchedKey: 'prek-v1|0.3.6|Linux|X64|/opt/python|hash',
    primaryKey: 'prek-v1|0.3.6|Linux|X64|/opt/python|hash',
  } as { matchedKey?: string; primaryKey: string },
}))

const coreMocks = vi.hoisted(() => ({
  endGroup: vi.fn(),
  info: vi.fn(),
  setFailed: vi.fn((message: string) => {
    mockContext.failures.push(message)
  }),
  setOutput: vi.fn((name: string, value: string) => {
    mockContext.outputs.push([name, value])
  }),
  startGroup: vi.fn(),
}))

const dependencyMocks = vi.hoisted(() => ({
  getInputs: vi.fn(() => mockContext.inputs),
  installPrek: vi.fn(async () => '/tmp/prek'),
  normalizeVersion: vi.fn((version: string) => `v${version.replace(/^v/, '')}`),
  pruneCache: vi.fn(async () => {}),
  resolveVersion: vi.fn(async () => '0.3.6'),
  restorePrekCache: vi.fn(async () => mockContext.restoreResult),
  runPrek: vi.fn(async () => 0),
  showVerboseLogs: vi.fn(async () => {}),
}))

vi.mock('@actions/core', () => coreMocks)
vi.mock('../src/cache', () => ({
  restorePrekCache: dependencyMocks.restorePrekCache,
}))
vi.mock('../src/inputs', () => ({
  getInputs: dependencyMocks.getInputs,
}))
vi.mock('../src/install', () => ({
  installPrek: dependencyMocks.installPrek,
}))
vi.mock('../src/manifest', () => ({
  normalizeVersion: dependencyMocks.normalizeVersion,
  resolveVersion: dependencyMocks.resolveVersion,
}))
vi.mock('../src/prek', () => ({
  pruneCache: dependencyMocks.pruneCache,
  runPrek: dependencyMocks.runPrek,
  showVerboseLogs: dependencyMocks.showVerboseLogs,
}))

async function importMainModule() {
  vi.resetModules()
  return import('../src/main')
}

function resetMockContext(): void {
  mockContext.failures = []
  mockContext.inputs = {
    extraArgs: '--all-files',
    installOnly: false,
    prekVersion: 'latest',
    showVerboseLogs: false,
    workingDirectory: '/tmp/repo',
  }
  mockContext.outputs = []
  mockContext.restoreResult = {
    matchedKey: 'prek-v1|0.3.6|Linux|X64|/opt/python|hash',
    primaryKey: 'prek-v1|0.3.6|Linux|X64|/opt/python|hash',
  }
}

describe('run', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetMockContext()
  })

  it('sets cache-hit when the restored cache key matches the primary key', async () => {
    const { run } = await importMainModule()

    await run()

    expect(mockContext.outputs).toEqual([
      ['prek-version', 'v0.3.6'],
      ['cache-hit', 'true'],
    ])
    expect(mockContext.failures).toEqual([])
  })

  it('reports a cache miss via cache-hit=false and skips prek execution for install-only', async () => {
    mockContext.inputs.installOnly = true
    mockContext.restoreResult = {
      matchedKey: undefined,
      primaryKey: 'prek-v1|0.3.6|Linux|X64|/opt/python|hash',
    }

    const { run } = await importMainModule()

    await run()

    expect(dependencyMocks.runPrek).not.toHaveBeenCalled()
    expect(mockContext.outputs).toEqual([
      ['prek-version', 'v0.3.6'],
      ['cache-hit', 'false'],
    ])
  })
})

import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals'

let mockInfos: string[] = []
let mockCacheDir = '/tmp/prek-cache'

const mockExec =
  jest.fn<
    (
      commandLine: string,
      args?: string[],
      options?: { listeners?: { stdout?: (data: Buffer) => void } },
    ) => Promise<number>
  >()

jest.unstable_mockModule('@actions/core', () => ({
  info: jest.fn((message: string) => {
    mockInfos.push(message)
  }),
}))

jest.unstable_mockModule('@actions/exec', () => ({
  exec: mockExec,
}))

const { getPrekCacheDir } = await import('../src/prek')

beforeEach(() => {
  mockInfos = []
  mockCacheDir = '/tmp/prek-cache'
  mockExec.mockReset()
  mockExec.mockImplementation(async (_commandLine, _args, options) => {
    options?.listeners?.stdout?.(Buffer.from(`${mockCacheDir}\n`))
    return 0
  })
})

afterEach(() => {
  jest.clearAllMocks()
})

test('getPrekCacheDir prefers the CLI-reported path', async () => {
  await expect(getPrekCacheDir()).resolves.toBe('/tmp/prek-cache')
  expect(mockInfos).toEqual(['Using prek cache dir /tmp/prek-cache'])
})

test('getPrekCacheDir falls back to PREK_HOME when the CLI probe fails', async () => {
  const originalEnv = { ...process.env }
  const prekHome = path.join(os.tmpdir(), 'prek-action-prek-home')
  process.env.PREK_HOME = prekHome
  mockExec.mockResolvedValue(2)

  try {
    await expect(getPrekCacheDir()).resolves.toBe(prekHome)
  } finally {
    process.env = originalEnv
  }

  expect(mockInfos).toEqual([`Falling back to default prek cache dir ${prekHome}`])
})

test('getPrekCacheDir falls back to XDG_CACHE_HOME/prek when CLI probe fails and PREK_HOME is unset', async () => {
  const originalEnv = { ...process.env }

  delete process.env.PREK_HOME
  if (process.platform === 'win32') {
    process.env.LOCALAPPDATA = path.join(os.tmpdir(), 'prek-action-localappdata')
    delete process.env.XDG_CACHE_HOME
  } else {
    process.env.XDG_CACHE_HOME = path.join(os.tmpdir(), 'prek-action-xdg-cache')
  }

  const expected =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || '', 'prek')
      : path.join(process.env.XDG_CACHE_HOME || '', 'prek')

  mockExec.mockResolvedValue(2)

  try {
    await expect(getPrekCacheDir()).resolves.toBe(expected)
  } finally {
    process.env = originalEnv
  }

  expect(mockInfos).toEqual([`Falling back to default prek cache dir ${expected}`])
})

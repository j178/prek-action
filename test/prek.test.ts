import * as os from 'node:os'
import * as path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockContext = vi.hoisted(() => ({
  cacheDir: '/tmp/prek-cache',
  infos: [] as string[],
}))

const toolkitMocks = vi.hoisted(() => ({
  exec: vi.fn<
    (
      commandLine: string,
      args?: string[],
      options?: { listeners?: { stdout?: (data: Buffer) => void } },
    ) => Promise<number>
  >(),
}))

vi.mock('@actions/core', () => ({
  info: vi.fn((message: string) => {
    mockContext.infos.push(message)
  }),
}))

vi.mock('@actions/exec', () => ({
  exec: toolkitMocks.exec,
}))

const { getPrekCacheDir } = await import('../src/prek')

describe('getPrekCacheDir', () => {
  beforeEach(() => {
    mockContext.cacheDir = '/tmp/prek-cache'
    mockContext.infos = []
    vi.clearAllMocks()

    toolkitMocks.exec.mockImplementation(async (_commandLine, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from(`${mockContext.cacheDir}\n`))
      return 0
    })
  })

  it('prefers the CLI-reported path', async () => {
    await expect(getPrekCacheDir()).resolves.toBe('/tmp/prek-cache')
    expect(mockContext.infos).toEqual(['Using prek cache dir /tmp/prek-cache'])
  })

  it('falls back to PREK_HOME when the CLI probe fails', async () => {
    const originalEnv = { ...process.env }
    const prekHome = path.join(os.tmpdir(), 'prek-action-prek-home')
    process.env.PREK_HOME = prekHome
    toolkitMocks.exec.mockResolvedValue(2)

    try {
      await expect(getPrekCacheDir()).resolves.toBe(prekHome)
    } finally {
      process.env = originalEnv
    }

    expect(mockContext.infos).toEqual([`Falling back to default prek cache dir ${prekHome}`])
  })

  it('falls back to XDG_CACHE_HOME/prek when CLI probe fails and PREK_HOME is unset', async () => {
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

    toolkitMocks.exec.mockResolvedValue(2)

    try {
      await expect(getPrekCacheDir()).resolves.toBe(expected)
    } finally {
      process.env = originalEnv
    }

    expect(mockContext.infos).toEqual([`Falling back to default prek cache dir ${expected}`])
  })
})

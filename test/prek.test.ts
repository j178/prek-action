import test, {mock} from 'node:test'
import assert from 'node:assert/strict'
import * as os from 'node:os'
import * as path from 'node:path'

import * as core from '@actions/core'
import * as exec from '@actions/exec'

import {getPrekCacheDir} from '../src/prek'

test('getPrekCacheDir prefers the CLI-reported path', async () => {
  mock.restoreAll()
  const infos: string[] = []
  const warnings: string[] = []

  mock.method(core, 'info', (message: string) => {
    infos.push(message)
  })
  mock.method(core, 'warning', (message: string) => {
    warnings.push(message)
  })
  mock.method(
    exec,
    'exec',
    async (
      _commandLine: string,
      _args?: string[],
      options?: {listeners?: {stdout?: (data: Buffer) => void}}
    ) => {
      options?.listeners?.stdout?.(Buffer.from('/tmp/prek-cache\n'))
      return 0
    }
  )

  try {
    assert.equal(await getPrekCacheDir(), '/tmp/prek-cache')
  } finally {
    mock.restoreAll()
  }

  assert.deepEqual(infos, ['Using prek cache dir /tmp/prek-cache'])
  assert.deepEqual(warnings, [])
})

test('getPrekCacheDir falls back to PREK_HOME when the CLI probe fails', async () => {
  mock.restoreAll()
  const originalEnv = {...process.env}
  const infos: string[] = []
  const warnings: string[] = []

  const prekHome = path.join(os.tmpdir(), 'prek-action-prek-home')
  process.env['PREK_HOME'] = prekHome

  mock.method(core, 'info', (message: string) => {
    infos.push(message)
  })
  mock.method(core, 'warning', (message: string) => {
    warnings.push(message)
  })
  mock.method(exec, 'exec', async () => 2)

  try {
    assert.equal(await getPrekCacheDir(), prekHome)
  } finally {
    process.env = originalEnv
    mock.restoreAll()
  }

  assert.deepEqual(infos, [`Falling back to default prek cache dir ${prekHome}`])
  assert.deepEqual(warnings, [])
})

test('getPrekCacheDir falls back to XDG_CACHE_HOME/prek when CLI probe fails and PREK_HOME is unset', async () => {
  mock.restoreAll()
  const originalEnv = {...process.env}
  const infos: string[] = []
  const warnings: string[] = []

  delete process.env['PREK_HOME']
  if (process.platform === 'win32') {
    process.env['LOCALAPPDATA'] = path.join(os.tmpdir(), 'prek-action-localappdata')
    delete process.env['XDG_CACHE_HOME']
  } else {
    process.env['XDG_CACHE_HOME'] = path.join(os.tmpdir(), 'prek-action-xdg-cache')
  }

  const expected =
    process.platform === 'win32'
      ? path.join(process.env['LOCALAPPDATA']!, 'prek')
      : path.join(process.env['XDG_CACHE_HOME']!, 'prek')

  mock.method(core, 'info', (message: string) => {
    infos.push(message)
  })
  mock.method(core, 'warning', (message: string) => {
    warnings.push(message)
  })
  mock.method(exec, 'exec', async () => 2)

  try {
    assert.equal(await getPrekCacheDir(), expected)
  } finally {
    process.env = originalEnv
    mock.restoreAll()
  }

  assert.deepEqual(infos, [`Falling back to default prek cache dir ${expected}`])
  assert.deepEqual(warnings, [])
})

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseToolVersion, readToolVersions } from '../src/tool-versions'

describe('parseToolVersion', () => {
  it('returns the first version for a tool and ignores other tools, comments, and fallbacks', () => {
    const content = [
      '# managed by mise',
      'nodejs 24.1.0',
      'prekx 9.9.9',
      '  prek   0.3.6 0.3.5  # pinned',
      'uv 0.9.5',
      'python 3.13.0',
    ].join('\r\n')

    expect(parseToolVersion(content, 'prek')).toBe('0.3.6')
    expect(parseToolVersion(content, 'uv')).toBe('0.9.5')
  })

  it('returns undefined when the tool is missing or has no version', () => {
    expect(parseToolVersion('nodejs 24.1.0\n', 'prek')).toBeUndefined()
    expect(parseToolVersion('prek\n# prek 0.3.6\n', 'prek')).toBeUndefined()
    expect(parseToolVersion('', 'prek')).toBeUndefined()
  })
})

describe('readToolVersions', () => {
  let workspace: string
  let file: string

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'prek-tool-versions-'))
    file = path.join(workspace, '.tool-versions')
  })

  afterEach(() => {
    fs.rmSync(workspace, { force: true, recursive: true })
  })

  it('reads the prek and uv versions', () => {
    fs.writeFileSync(file, 'nodejs 24.1.0\nprek 0.3.6\nuv 0.9.5\n')

    expect(readToolVersions(file)).toEqual({ prek: '0.3.6', uv: '0.9.5' })
  })

  it('returns empty versions when neither tool is declared', () => {
    fs.writeFileSync(file, 'nodejs 24.1.0\n')

    expect(readToolVersions(file)).toEqual({ prek: undefined, uv: undefined })
  })

  it('returns undefined when the file does not exist or is a directory', () => {
    expect(readToolVersions(file)).toBeUndefined()
    expect(readToolVersions(workspace)).toBeUndefined()
  })

  it.each(['system', 'ref:v0.3.6', 'path:/opt/prek'])('rejects unsupported version %s', version => {
    fs.writeFileSync(file, `prek ${version}\n`)

    expect(() => readToolVersions(file)).toThrow(`Unsupported prek version "${version}"`)
  })
})

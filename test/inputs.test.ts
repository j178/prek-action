import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockContext = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  warnings: [] as string[],
}))

const toolkitMocks = vi.hoisted(() => ({
  getBooleanInput: vi.fn((name: string) => (mockContext.inputs[name] ?? '') === 'true'),
  getInput: vi.fn((name: string) => mockContext.inputs[name] ?? ''),
  info: vi.fn(),
  warning: vi.fn((message: string) => {
    mockContext.warnings.push(message)
  }),
}))

vi.mock('@actions/core', () => ({
  getBooleanInput: toolkitMocks.getBooleanInput,
  getInput: toolkitMocks.getInput,
  info: toolkitMocks.info,
  warning: toolkitMocks.warning,
}))

async function importInputsModule() {
  vi.resetModules()
  return import('../src/inputs')
}

describe('getInputs', () => {
  let workspace: string

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'prek-inputs-'))
    mockContext.inputs = {
      cache: 'true',
      'install-only': 'false',
      'prek-version-file': '.tool-versions',
      'show-verbose-logs': 'true',
      'working-directory': workspace,
    }
    mockContext.warnings = []
    vi.stubEnv('PREK_UV_VERSION', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(workspace, { force: true, recursive: true })
  })

  it('defaults prek-version to latest without a .tool-versions file', async () => {
    const { getInputs } = await importInputsModule()

    expect(getInputs()).toMatchObject({ prekVersion: 'latest', uvVersion: undefined })
  })

  it('defaults prek-version to latest when .tool-versions has no prek entry', async () => {
    fs.writeFileSync(path.join(workspace, '.tool-versions'), 'nodejs 24.1.0\n')

    const { getInputs } = await importInputsModule()

    expect(getInputs().prekVersion).toBe('latest')
  })

  it('reads the prek and uv versions from .tool-versions in the working directory', async () => {
    fs.writeFileSync(path.join(workspace, '.tool-versions'), 'prek 0.3.6\nuv v0.9.5\n')

    const { getInputs } = await importInputsModule()

    expect(getInputs()).toMatchObject({ prekVersion: '0.3.6', uvVersion: '0.9.5' })
    expect(toolkitMocks.info).toHaveBeenCalledWith(
      `Using prek version "0.3.6" from ${path.join(workspace, '.tool-versions')}`,
    )
  })

  it('resolves prek-version-file relative to the working directory', async () => {
    fs.mkdirSync(path.join(workspace, 'tools'))
    fs.writeFileSync(path.join(workspace, 'tools', 'versions'), 'prek 0.3.x\n')
    mockContext.inputs['prek-version-file'] = 'tools/versions'

    const { getInputs } = await importInputsModule()

    expect(getInputs()).toMatchObject({ prekVersion: '0.3.x', uvVersion: undefined })
  })

  it('treats an empty prek-version-file as the default', async () => {
    fs.writeFileSync(path.join(workspace, '.tool-versions'), 'prek 0.3.6\n')
    mockContext.inputs['prek-version-file'] = ''

    const { getInputs } = await importInputsModule()

    expect(getInputs().prekVersion).toBe('0.3.6')
  })

  it('fails when a custom prek-version-file does not exist', async () => {
    mockContext.inputs['prek-version-file'] = 'missing/.tool-versions'

    const { getInputs } = await importInputsModule()

    expect(() => getInputs()).toThrow(
      `prek-version-file not found: ${path.join(workspace, 'missing', '.tool-versions')}`,
    )
  })

  it('fails when a custom prek-version-file does not declare prek', async () => {
    fs.writeFileSync(path.join(workspace, 'versions'), 'uv 0.9.5\n')
    mockContext.inputs['prek-version-file'] = 'versions'

    const { getInputs } = await importInputsModule()

    expect(() => getInputs()).toThrow(
      `Could not determine prek version from file: ${path.join(workspace, 'versions')}`,
    )
  })

  it('prefers an explicit prek-version and ignores the version file, including uv', async () => {
    fs.writeFileSync(path.join(workspace, '.tool-versions'), 'prek 0.3.6\nuv 0.9.5\n')
    mockContext.inputs['prek-version'] = '0.2.30'

    const { getInputs } = await importInputsModule()

    expect(getInputs()).toMatchObject({ prekVersion: '0.2.30', uvVersion: undefined })
    expect(mockContext.warnings).toEqual([])
  })

  it('warns when a custom prek-version-file is ignored because prek-version is set', async () => {
    mockContext.inputs['prek-version'] = '0.2.30'
    mockContext.inputs['prek-version-file'] = 'missing/.tool-versions'

    const { getInputs } = await importInputsModule()

    expect(getInputs().prekVersion).toBe('0.2.30')
    expect(mockContext.warnings).toEqual([
      'Ignoring prek-version-file "missing/.tool-versions" because prek-version is set',
    ])
  })

  it('keeps an existing PREK_UV_VERSION over the version file', async () => {
    fs.writeFileSync(path.join(workspace, '.tool-versions'), 'prek 0.3.6\nuv 0.9.5\n')
    vi.stubEnv('PREK_UV_VERSION', '0.8.0')

    const { getInputs } = await importInputsModule()

    expect(getInputs().uvVersion).toBeUndefined()
  })

  it('uses uv-version without a version file', async () => {
    mockContext.inputs['uv-version'] = 'v0.9.5'

    const { getInputs } = await importInputsModule()

    expect(getInputs()).toMatchObject({ prekVersion: 'latest', uvVersion: '0.9.5' })
  })

  it('applies uv-version together with an explicit prek-version', async () => {
    mockContext.inputs['prek-version'] = '0.2.30'
    mockContext.inputs['uv-version'] = '0.9.5'

    const { getInputs } = await importInputsModule()

    expect(getInputs()).toMatchObject({ prekVersion: '0.2.30', uvVersion: '0.9.5' })
  })

  it('prefers uv-version over the version file and an existing PREK_UV_VERSION', async () => {
    fs.writeFileSync(path.join(workspace, '.tool-versions'), 'prek 0.3.6\nuv latest\n')
    vi.stubEnv('PREK_UV_VERSION', '0.8.0')
    mockContext.inputs['uv-version'] = '0.9.5'

    const { getInputs } = await importInputsModule()

    expect(getInputs()).toMatchObject({ prekVersion: '0.3.6', uvVersion: '0.9.5' })
    expect(mockContext.warnings).toEqual([])
  })

  it.each(['latest', '0.9', '>=0.9.0'])('rejects non-exact uv-version %s', async version => {
    mockContext.inputs['uv-version'] = version

    const { getInputs } = await importInputsModule()

    expect(() => getInputs()).toThrow(`Invalid uv-version "${version}"`)
  })

  it.each(['latest', '0.9', '>=0.9.0'])('ignores non-exact uv version %s', async version => {
    fs.writeFileSync(path.join(workspace, '.tool-versions'), `prek 0.3.6\nuv ${version}\n`)

    const { getInputs } = await importInputsModule()

    expect(getInputs()).toMatchObject({ prekVersion: '0.3.6', uvVersion: undefined })
    expect(mockContext.warnings).toHaveLength(1)
    expect(mockContext.warnings[0]).toContain(`Ignoring uv version "${version}"`)
  })

  it('uses the configured extra-args default when no explicit value is provided', async () => {
    mockContext.inputs['extra-args'] = '--all-files'

    const { getInputs } = await importInputsModule()

    expect(getInputs().extraArgs).toBe('--all-files')
  })

  it('does not emit a runtime warning for extra_args (deprecationMessage handles it)', async () => {
    mockContext.inputs.extra_args = '--files foo.py'

    const { getInputs } = await importInputsModule()

    expect(getInputs().extraArgs).toBe('--files foo.py')
    expect(mockContext.warnings).toEqual([])
  })

  it('preserves an explicit empty extra-args value', async () => {
    mockContext.inputs['extra-args'] = ''

    const { getInputs } = await importInputsModule()

    expect(getInputs().extraArgs).toBe('')
  })

  it('prefers extra_args over extra-args when both are set', async () => {
    mockContext.inputs.extra_args = '--legacy'
    mockContext.inputs['extra-args'] = '--modern'

    const { getInputs } = await importInputsModule()

    expect(getInputs().extraArgs).toBe('--legacy')
  })

  it('does not expose the deprecated token value to runtime code', async () => {
    mockContext.inputs.token = 'secret'

    const { getInputs } = await importInputsModule()
    const inputs = getInputs() as Record<string, unknown>

    expect('token' in inputs).toBe(false)
  })

  it('enables cache by default and allows opting out', async () => {
    let { getInputs } = await importInputsModule()
    expect(getInputs().cache).toBe(true)

    mockContext.inputs.cache = 'false'
    ;({ getInputs } = await importInputsModule())
    expect(getInputs().cache).toBe(false)
  })

  it('enables verbose logs by default and allows opting out', async () => {
    let { getInputs } = await importInputsModule()
    expect(getInputs().showVerboseLogs).toBe(true)

    mockContext.inputs['show-verbose-logs'] = 'false'
    ;({ getInputs } = await importInputsModule())
    expect(getInputs().showVerboseLogs).toBe(false)
  })
})

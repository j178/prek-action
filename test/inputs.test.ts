import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockContext = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  warnings: [] as string[],
}))

const toolkitMocks = vi.hoisted(() => ({
  getBooleanInput: vi.fn((name: string) => (mockContext.inputs[name] ?? '') === 'true'),
  getInput: vi.fn((name: string) => mockContext.inputs[name] ?? ''),
  warning: vi.fn((message: string) => {
    mockContext.warnings.push(message)
  }),
}))

vi.mock('@actions/core', () => ({
  getBooleanInput: toolkitMocks.getBooleanInput,
  getInput: toolkitMocks.getInput,
  warning: toolkitMocks.warning,
}))

async function importInputsModule() {
  vi.resetModules()
  return import('../src/inputs')
}

describe('getInputs', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockContext.inputs = { cache: 'true', 'install-only': 'false' }
    mockContext.warnings = []
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

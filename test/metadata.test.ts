import * as fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

async function readActionYaml(): Promise<string> {
  return fs.readFile(new URL('../action.yml', import.meta.url), 'utf8')
}

describe('action metadata', () => {
  it('marks deprecated inputs with deprecationMessage entries', async () => {
    const actionYaml = await readActionYaml()

    expect(actionYaml).toMatch(
      /extra_args:\n(?:.*\n)*?\s+deprecationMessage: The extra_args input has been renamed to extra-args\. Update your workflow\./,
    )
    expect(actionYaml).toMatch(
      /token:\n(?:.*\n)*?\s+deprecationMessage: The token input is unused and will be removed in a future major version\./,
    )
    expect(actionYaml).toMatch(/token:\n(?:.*\n)*?\s+default:\s*(?:''|"")/)
  })

  it('exposes the cache-hit output', async () => {
    const actionYaml = await readActionYaml()

    expect(actionYaml).toMatch(
      /outputs:\n(?:.*\n)*?\s+cache-hit:\n\s+description: Whether the prek environment cache was an exact match/,
    )
  })
})

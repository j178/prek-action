import { readFileOrNull, stripVPrefix } from './shared'

export async function findVersionInToolVersions(filePath: string): Promise<string | null> {
  const content = await readFileOrNull(filePath)
  if (!content) return null

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [tool, version] = trimmed.split(/\s+/)
    if (tool === 'prek' && version) {
      return stripVPrefix(version)
    }
  }

  return null
}

import { PEP508_PREK_RE } from '../constants'
import { translatePep440Specifier } from '../pep440'
import { readFileOrNull } from './shared'

function extractPep508PrekVersion(dep: string): string | null {
  const match = dep.trim().match(PEP508_PREK_RE)
  if (!match) return null
  return pep440ToSemver(match[1].trim())
}

function sanitizeRequirementLine(entry: string): string {
  return entry
    .replace(/\s+--hash=\S+/g, '')
    .replace(/\s+#.*$/, '')
    .trim()
}

function getLogicalRequirementLines(content: string): string[] {
  const logicalLines: string[] = []
  let current = ''

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    current = current ? `${current} ${trimmed}` : trimmed
    if (current.endsWith('\\')) {
      current = current.slice(0, -1).trimEnd()
      continue
    }

    logicalLines.push(sanitizeRequirementLine(current))
    current = ''
  }

  if (current) {
    logicalLines.push(sanitizeRequirementLine(current))
  }

  return logicalLines
}

export function pep440ToSemver(specifier: string): string | null {
  return translatePep440Specifier(specifier)
}

export async function findVersionInRequirements(filePath: string): Promise<string | null> {
  const content = await readFileOrNull(filePath)
  if (!content) return null

  for (const line of getLogicalRequirementLines(content)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('-')) continue
    const version = extractPep508PrekVersion(trimmed)
    if (version) return version
  }

  return null
}

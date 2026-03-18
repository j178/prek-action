import * as path from 'node:path'
import { parse as parseTOML } from 'smol-toml'
import { PEP508_PREK_RE } from '../constants'
import { translatePep440Specifier } from '../pep440'
import { createParseError, readFileOrNull, stripVPrefix } from './shared'

function findPrekInDependencyList(deps: unknown[]): string[] {
  const versions: string[] = []

  for (const dep of deps) {
    if (typeof dep !== 'string') continue

    const match = dep.trim().match(PEP508_PREK_RE)
    if (!match) continue

    const translated = translatePep440Specifier(match[1].trim())
    if (translated) {
      versions.push(translated)
    }
  }

  return versions
}

function getUniqueDependencyVersion(filePath: string, versions: Iterable<string>): string | null {
  const uniqueVersions = [...new Set(versions)]
  if (uniqueVersions.length === 0) return null
  if (uniqueVersions.length === 1) return uniqueVersions[0] ?? null

  throw new Error(
    `Ambiguous prek version in ${path.basename(filePath)}: found multiple distinct constraints (${uniqueVersions.join(', ')}). Set [tool.prek].version to make the version explicit.`,
  )
}

async function parseTomlFile(filePath: string): Promise<Record<string, unknown> | null> {
  const content = await readFileOrNull(filePath)
  if (!content) return null

  try {
    return parseTOML(content) as Record<string, unknown>
  } catch (error) {
    throw createParseError(filePath, 'TOML', error)
  }
}

export async function findVersionInMiseToml(filePath: string): Promise<string | null> {
  const data = await parseTomlFile(filePath)
  if (!data) return null

  const tools = data.tools as Record<string, unknown> | undefined
  if (!tools) return null

  const prek = tools.prek
  if (typeof prek === 'string') return stripVPrefix(prek)
  if (typeof prek === 'object' && prek !== null) {
    const version = (prek as Record<string, unknown>).version
    if (typeof version === 'string') return stripVPrefix(version)
  }

  return null
}

export async function findVersionInUvLock(filePath: string): Promise<string | null> {
  const data = await parseTomlFile(filePath)
  if (!data) return null

  const packages = data.package as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(packages)) return null

  for (const pkg of packages) {
    if (typeof pkg.name === 'string' && pkg.name.toLowerCase() === 'prek') {
      const version = pkg.version
      if (typeof version === 'string') return stripVPrefix(version)
    }
  }

  return null
}

export async function findVersionInPyprojectToml(filePath: string): Promise<string | null> {
  const data = await parseTomlFile(filePath)
  if (!data) return null

  const tool = data.tool as Record<string, unknown> | undefined
  const prekTool = tool?.prek as Record<string, unknown> | undefined
  const explicitVersion = prekTool?.version
  if (typeof explicitVersion === 'string') return stripVPrefix(explicitVersion)

  const dependencyVersions: string[] = []
  const dependencyGroups = data['dependency-groups'] as Record<string, unknown[]> | undefined
  if (dependencyGroups) {
    for (const group of Object.values(dependencyGroups)) {
      if (!Array.isArray(group)) continue
      dependencyVersions.push(...findPrekInDependencyList(group))
    }
  }

  const project = data.project as Record<string, unknown> | undefined
  const optionalDependencies = project?.['optional-dependencies'] as
    | Record<string, unknown[]>
    | undefined
  if (optionalDependencies) {
    for (const group of Object.values(optionalDependencies)) {
      if (!Array.isArray(group)) continue
      dependencyVersions.push(...findPrekInDependencyList(group))
    }
  }

  return getUniqueDependencyVersion(filePath, dependencyVersions)
}

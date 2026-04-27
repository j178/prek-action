import { PREK_PACKAGE_NAME } from '../constants'
import { createParseError, readFileOrNull } from './shared'

export async function findVersionInPackageJson(filePath: string): Promise<string | null> {
  const content = await readFileOrNull(filePath)
  if (!content) return null

  try {
    const data = JSON.parse(content) as Record<string, unknown>
    const devDependencies = data.devDependencies as Record<string, unknown> | undefined
    const devVersion = devDependencies?.[PREK_PACKAGE_NAME]
    if (typeof devVersion === 'string' && devVersion) return devVersion

    const dependencies = data.dependencies as Record<string, unknown> | undefined
    const dependencyVersion = dependencies?.[PREK_PACKAGE_NAME]
    if (typeof dependencyVersion === 'string' && dependencyVersion) {
      return dependencyVersion
    }

    return null
  } catch (error) {
    throw createParseError(filePath, 'JSON', error)
  }
}

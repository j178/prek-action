import * as path from 'node:path'
import { TOOL_VERSIONS_FILENAME } from './constants'
import { findVersionInToolVersions } from './sources/tool-versions'

export type DetectedVersion = {
  version: string
  source: string
}

export async function detectVersion(
  workingDirectory: string,
  repoRoot?: string,
): Promise<DetectedVersion | null> {
  const searchDirectories = [workingDirectory]
  if (repoRoot && path.resolve(repoRoot) !== path.resolve(workingDirectory)) {
    searchDirectories.push(repoRoot)
  }

  for (const directory of searchDirectories) {
    const version = await findVersionInToolVersions(path.join(directory, TOOL_VERSIONS_FILENAME))
    if (version) {
      return { source: TOOL_VERSIONS_FILENAME, version }
    }
  }

  return null
}

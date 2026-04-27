import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { DetectedVersion } from './auto'
import { REQUIREMENTS_FILE_RE, SUPPORTED_VERSION_FILE_NAMES, VERSION_FILE_HINTS } from './constants'
import { findVersionInPackageJson } from './sources/package-json'
import { findVersionInRequirements } from './sources/requirements'
import {
  findVersionInMiseToml,
  findVersionInPyprojectToml,
  findVersionInUvLock,
} from './sources/toml'
import { findVersionInToolVersions } from './sources/tool-versions'

type FileParser = (filePath: string) => Promise<string | null>

const PARSER_MAP: Record<string, FileParser> = {
  '.tool-versions': findVersionInToolVersions,
  'mise.toml': findVersionInMiseToml,
  'package.json': findVersionInPackageJson,
  'pyproject.toml': findVersionInPyprojectToml,
  'uv.lock': findVersionInUvLock,
}

function isRequirementsFile(filename: string): boolean {
  return REQUIREMENTS_FILE_RE.test(filename)
}

function getNoVersionHint(filename: string): string {
  return (
    VERSION_FILE_HINTS[filename] ||
    (isRequirementsFile(filename) ? 'Expected a prek PEP 508 specifier (e.g. prek==0.3.0).' : '')
  )
}

export async function resolveVersionFile(filePath: string): Promise<DetectedVersion> {
  try {
    await fs.access(filePath)
  } catch {
    throw new Error(`version-file "${filePath}" does not exist`)
  }

  const filename = path.basename(filePath)
  let parser = PARSER_MAP[filename]
  if (!parser && isRequirementsFile(filename)) {
    parser = findVersionInRequirements
  }

  if (!parser) {
    throw new Error(
      `Unsupported version-file type: "${filename}". Supported: ${SUPPORTED_VERSION_FILE_NAMES.join(', ')}, requirements*.txt`,
    )
  }

  const version = await parser(filePath)
  if (!version) {
    const hint = getNoVersionHint(filename)
    throw new Error(`No prek version found in "${filePath}". ${hint}`.trimEnd())
  }

  return { source: filePath, version }
}

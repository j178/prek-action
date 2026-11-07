import * as fs from 'node:fs'

export const DEFAULT_VERSION_FILE = '.tool-versions'
const UNSUPPORTED_VERSION_PATTERN = /^(?:system|ref:|path:)/

export type ToolVersions = {
  prek?: string
  uv?: string
}

// Return the first version declared for `tool` in a .tool-versions file (asdf/mise format).
export function parseToolVersion(content: string, tool: string): string | undefined {
  for (const rawLine of content.split(/\r?\n/)) {
    const [name, version] = rawLine.replace(/#.*$/, '').trim().split(/\s+/)
    if (name === tool && version) {
      return version
    }
  }
  return undefined
}

// Read the prek and uv versions from a .tool-versions file, or return undefined if it does not exist.
export function readToolVersions(file: string): ToolVersions | undefined {
  let content: string
  try {
    content = fs.readFileSync(file, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') {
      return undefined
    }
    throw error
  }

  const prek = parseToolVersion(content, 'prek')
  if (prek && UNSUPPORTED_VERSION_PATTERN.test(prek)) {
    throw new Error(
      `Unsupported prek version "${prek}" in ${file}; use a version, semver range, or "latest"`,
    )
  }
  return { prek, uv: parseToolVersion(content, 'uv') }
}

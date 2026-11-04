import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export function stripVPrefix(version: string): string {
  return version.replace(/^v/, '')
}

function stripByteOrderMark(content: string): string {
  return content.replace(/^\uFEFF/, '')
}

export async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return stripByteOrderMark(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return null
    }
    throw error
  }
}

export function createParseError(filePath: string, format: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(`Failed to parse ${path.basename(filePath)} as ${format}: ${message}`)
}

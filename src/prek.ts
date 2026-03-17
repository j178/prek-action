import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { parseArgsStringToArgv } from 'string-argv'

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runPrek(workingDirectory: string, extraArgs: string): Promise<number> {
  const args = [
    'run',
    '--show-diff-on-failure',
    '--color=always',
    ...parseArgsStringToArgv(extraArgs),
  ]
  return exec.exec('prek', args, {
    cwd: workingDirectory,
    ignoreReturnCode: true,
  })
}

export async function showVerboseLogs(): Promise<void> {
  core.startGroup('Prek verbose logs')
  try {
    const cacheDir = await getPrekCacheDir()
    const logPath = path.join(cacheDir, 'prek.log')
    try {
      const log = await fs.readFile(logPath, 'utf8')
      process.stdout.write(log)
      if (!log.endsWith('\n')) {
        process.stdout.write('\n')
      }
    } catch {
      core.info(`No prek log file found at ${logPath}`)
    }
  } finally {
    core.endGroup()
  }
}

export async function pruneCache(): Promise<void> {
  core.startGroup('Pruning prek cache')
  try {
    const code = await exec.exec('prek', ['cache', 'gc', '-v'], {
      ignoreReturnCode: true,
    })
    if (code !== 0) {
      core.info('Failed to prune prek cache')
    }
  } finally {
    core.endGroup()
  }
}

export async function getPrekCacheDir(): Promise<string> {
  let output = ''
  let code: number
  try {
    code = await exec.exec('prek', ['cache', 'dir', '--no-log-file'], {
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString()
        },
      },
      silent: true,
    })
  } catch (error) {
    core.info(`Failed to query prek cache dir: ${formatError(error)}`)
    return getDefaultPrekCacheDir()
  }

  if (code === 0) {
    const trimmed = output.trim()
    if (trimmed) {
      core.info(`Using prek cache dir ${trimmed}`)
      return trimmed
    }
  }

  return getDefaultPrekCacheDir()
}

// Guess the prek cache directory using the same resolution order as the prek
// CLI itself (PREK_HOME, then platform cache dirs via the etcetera crate).
//
// This fallback exists because `prek cache dir` was added in v0.2.2 and
// `--no-log-file` in v0.2.3, so the CLI probe fails on older versions.
// Consider removing this (and dropping <v0.2.2 from the version manifest)
// once those versions are no longer in use.
function getDefaultPrekCacheDir(): string {
  // PREK_HOME is used as-is (no /prek suffix), matching prek's own behavior.
  const prekHome = process.env.PREK_HOME
  if (prekHome) {
    const fallback = prekHome.startsWith('~/')
      ? path.join(os.homedir(), prekHome.slice(2))
      : prekHome
    core.info(`Falling back to default prek cache dir ${fallback}`)
    return fallback
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    const fallback = path.join(localAppData, 'prek')
    core.info(`Falling back to default prek cache dir ${fallback}`)
    return fallback
  }

  const xdgCacheHome = process.env.XDG_CACHE_HOME
  if (xdgCacheHome && path.isAbsolute(xdgCacheHome)) {
    const fallback = path.join(xdgCacheHome, 'prek')
    core.info(`Falling back to default prek cache dir ${fallback}`)
    return fallback
  }

  const fallback = path.join(os.homedir(), '.cache', 'prek')
  core.info(`Falling back to default prek cache dir ${fallback}`)
  return fallback
}

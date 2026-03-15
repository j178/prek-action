import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {parseArgsStringToArgv} from 'string-argv'

import {getCachePaths} from './cache'

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runPrek(workingDirectory: string, extraArgs: string): Promise<number> {
  const args = ['run', '--show-diff-on-failure', '--color=always', ...parseArgsStringToArgv(extraArgs)]
  return exec.exec('prek', args, {
    cwd: workingDirectory,
    ignoreReturnCode: true
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
      ignoreReturnCode: true
    })
    if (code !== 0) {
      core.info('Failed to prune prek cache')
    }
  } finally {
    core.endGroup()
  }
}

async function getPrekCacheDir(): Promise<string> {
  let output = ''
  let code: number
  try {
    code = await exec.exec('prek', ['cache', 'dir', '--no-log-file'], {
      ignoreReturnCode: true,
      silent: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString()
        }
      }
    })
  } catch (error) {
    core.info(`Failed to query prek cache dir: ${formatError(error)}`)
    return getCachePaths()[0]
  }

  if (code === 0) {
    const trimmed = output.trim()
    if (trimmed) {
      return trimmed
    }
  }

  return getCachePaths()[0]
}

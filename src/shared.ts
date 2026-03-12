import * as cache from '@actions/cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as glob from '@actions/glob'
import {HttpClient} from '@actions/http-client'
import * as tc from '@actions/tool-cache'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {parseArgsStringToArgv} from 'string-argv'

export const CACHE_KEY_STATE = 'prek-cache-primary-key'
export const CACHE_PATHS_STATE = 'prek-cache-paths'
const PREK_RELEASES_LATEST_URL = 'https://api.github.com/repos/j178/prek/releases/latest'
const PREK_CACHE_KEY_PREFIX = 'prek-v1'

type Inputs = {
  extraArgs: string
  installOnly: boolean
  prekVersion: string
  workingDirectory: string
  token: string
}

export function getInputs(): Inputs {
  return {
    extraArgs: core.getInput('extra_args') || core.getInput('extra-args') || '--all-files',
    installOnly: core.getBooleanInput('install-only'),
    prekVersion: core.getInput('prek-version') || 'latest',
    workingDirectory: core.getInput('working-directory') || '.',
    token: core.getInput('token')
  }
}

/**
 * Resolves `latest` to the current GitHub release tag and normalizes all versions to `v*`.
 */
export async function resolveVersion(versionInput: string, token: string): Promise<string> {
  if (versionInput !== 'latest') {
    return normalizeVersion(versionInput)
  }

  const client = new HttpClient('prek-action')
  try {
    return normalizeVersion(await fetchLatestVersion(client, token))
  } catch (error) {
    if (!token) {
      throw error
    }
    core.warning(`Authenticated request failed: ${formatError(error)}. Retrying without token.`)
    return normalizeVersion(await fetchLatestVersion(client, ''))
  }
}

async function fetchLatestVersion(client: HttpClient, token: string): Promise<string> {
  const response = await client.getJson<{tag_name: string}>(
    PREK_RELEASES_LATEST_URL,
    buildHeaders(token)
  )
  if (!response.result?.tag_name) {
    throw new Error('GitHub API response did not include tag_name')
  }
  return response.result.tag_name
}

function buildHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

/**
 * Ensures downstream release URLs and outputs always use the tag form expected by GitHub releases.
 */
export function normalizeVersion(version: string): string {
  return `v${version.replace(/^v/, '')}`
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Downloads the platform-specific prek archive, caches the extracted binary in the runner tool-cache,
 * and adds the installed directory to PATH for subsequent steps.
 */
export async function installPrek(version: string): Promise<string> {
  const toolVersion = version.replace(/^v/, '')
  const toolArch = getToolCacheArchFor(process.arch)
  const cachedTool = tc.find('prek', toolVersion, toolArch)

  core.startGroup(`Installing prek ${version}`)
  try {
    if (cachedTool) {
      core.info(`Using cached prek from ${cachedTool}`)
      core.addPath(cachedTool)
      return cachedTool
    }

    const asset = getReleaseAssetFor(process.platform, process.arch)
    const downloadUrl = `https://github.com/j178/prek/releases/download/${version}/${asset.archiveName}`
    const archivePath = await tc.downloadTool(downloadUrl)
    const extractedPath =
      asset.archiveType === 'zip' ? await tc.extractZip(archivePath) : await tc.extractTar(archivePath)
    const binaryPath = await getBinaryPath(extractedPath, asset)
    if (process.platform !== 'win32') {
      await fs.chmod(binaryPath, 0o755)
    }
    const toolPath = await tc.cacheFile(binaryPath, asset.binaryName, 'prek', toolVersion, toolArch)
    core.addPath(toolPath)
    return toolPath
  } finally {
    core.endGroup()
  }
}

export type ReleaseAsset = {
  archiveName: string
  archiveType: 'tar.gz' | 'zip'
  binaryName: string
}

/**
 * Maps a Node.js platform/arch pair to the prek release archive naming scheme.
 */
export function getReleaseAssetFor(platform: NodeJS.Platform, arch: NodeJS.Architecture): ReleaseAsset {
  const binaryName = platform === 'win32' ? 'prek.exe' : 'prek'
  const target = getRustTargetFor(platform, arch)
  const extension = platform === 'win32' ? 'zip' : 'tar.gz'
  return {
    archiveName: `prek-${target}.${extension}`,
    archiveType: extension,
    binaryName
  }
}

/**
 * Maps a Node.js platform/arch pair to the Rust target triples used by prek release assets.
 */
export function getRustTargetFor(platform: NodeJS.Platform, arch: NodeJS.Architecture): string {
  switch (platform) {
    case 'darwin':
      switch (arch) {
        case 'arm64':
          return 'aarch64-apple-darwin'
        case 'x64':
          return 'x86_64-apple-darwin'
        default:
          break
      }
      break
    case 'win32':
      switch (arch) {
        case 'arm64':
          return 'aarch64-pc-windows-msvc'
        case 'ia32':
          return 'i686-pc-windows-msvc'
        case 'x64':
          return 'x86_64-pc-windows-msvc'
        default:
          break
      }
      break
    case 'linux':
      switch (arch) {
        case 'arm':
          return 'armv7-unknown-linux-gnueabihf'
        case 'arm64':
          return 'aarch64-unknown-linux-gnu'
        case 'ia32':
          return 'i686-unknown-linux-gnu'
        case 'riscv64':
          return 'riscv64gc-unknown-linux-gnu'
        case 's390x':
          return 's390x-unknown-linux-gnu'
        case 'x64':
          return 'x86_64-unknown-linux-gnu'
        default:
          break
      }
      break
    default:
      break
  }

  throw new Error(`Unsupported platform/arch combination: ${platform}/${arch}`)
}

/**
 * Normalizes Node.js architecture names to the values used by `@actions/tool-cache`.
 */
export function getToolCacheArchFor(arch: NodeJS.Architecture): string {
  switch (arch) {
    case 'x64':
      return 'x64'
    case 'arm64':
      return 'arm64'
    case 'ia32':
      return 'x86'
    case 'arm':
      return 'arm'
    default:
      return arch
  }
}

/**
 * Resolves the extracted prek executable from the known archive layout.
 */
export async function getBinaryPath(rootDir: string, asset: ReleaseAsset): Promise<string> {
  if (asset.archiveType === 'zip') {
    return path.join(rootDir, asset.binaryName)
  }

  const [entry] = await fs.readdir(rootDir)
  if (!entry) {
    throw new Error(`Extracted archive is empty: ${rootDir}`)
  }

  return path.join(rootDir, entry, asset.binaryName)
}

/**
 * Restores the prek cache and records the key/path state so the post-step can save it again.
 */
export async function restorePrekCache(workingDirectory: string): Promise<void> {
  const paths = getCachePaths()
  const primaryKey = await buildCacheKey(workingDirectory)
  core.saveState(CACHE_KEY_STATE, primaryKey)
  core.saveState(CACHE_PATHS_STATE, JSON.stringify(paths))

  core.startGroup('Restore prek cache')
  try {
    const restoredKey = await cache.restoreCache(paths, primaryKey)
    if (restoredKey) {
      core.info(`Restored prek cache with key ${restoredKey}`)
    } else {
      core.info(`No cache found for key ${primaryKey}`)
    }
  } catch (error) {
    core.warning(`Failed to restore cache: ${formatError(error)}`)
  } finally {
    core.endGroup()
  }
}

/**
 * Saves the prek cache in the post-step using the state captured during restore.
 */
export async function savePrekCache(): Promise<void> {
  const primaryKey = core.getState(CACHE_KEY_STATE)
  const rawPaths = core.getState(CACHE_PATHS_STATE)
  if (!primaryKey || !rawPaths) {
    core.info('No cache state found, skipping cache save')
    return
  }

  const paths = JSON.parse(rawPaths) as string[]
  core.startGroup('Save prek cache')
  try {
    await cache.saveCache(paths, primaryKey)
    core.info(`Saved prek cache with key ${primaryKey}`)
  } catch (error) {
    const message = formatError(error)
    if (message.includes('already exists')) {
      core.info(`Cache with key ${primaryKey} already exists`)
      return
    }
    core.warning(`Failed to save cache: ${message}`)
  } finally {
    core.endGroup()
  }
}

function getCachePaths(): string[] {
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local')
    return [path.join(localAppData, 'prek')]
  }
  return [path.join(os.homedir(), '.cache', 'prek')]
}

async function buildCacheKey(workingDirectory: string): Promise<string> {
  const normalizedWorkingDirectory = path.resolve(workingDirectory)
  const hash = await hashConfigFiles(normalizedWorkingDirectory)
  // Hook environments often embed the interpreter path, so changing the Python installation can make
  // cached hook environments invalid even though this action itself is implemented in TypeScript.
  const pythonLocation = process.env['pythonLocation'] || ''
  const runnerOs = process.env['RUNNER_OS'] || process.platform
  const runnerArch = process.env['RUNNER_ARCH'] || os.arch()
  return `${PREK_CACHE_KEY_PREFIX}|${runnerOs}|${runnerArch}|${pythonLocation}|${hash}`
}

/**
 * Hashes prek/pre-commit configuration files so cache reuse tracks hook definitions and environments.
 */
async function hashConfigFiles(workingDirectory: string): Promise<string> {
  const matcher = await glob.create(getConfigPatterns(workingDirectory).join('\n'))

  const files = await matcher.glob()
  if (files.length === 0) {
    return 'no-config'
  }

  const digest = crypto.createHash('sha256')
  for (const file of files.sort()) {
    digest.update(path.relative(workingDirectory, file))
    digest.update('\0')
    digest.update(await fs.readFile(file))
    digest.update('\0')
  }
  return digest.digest('hex')
}

function getConfigPatterns(workingDirectory: string): string[] {
  return [
    path.join(workingDirectory, '**', 'prek.toml').replaceAll(path.sep, '/'),
    path.join(workingDirectory, '**', '.pre-commit-config.yaml').replaceAll(path.sep, '/'),
    path.join(workingDirectory, '**', '.pre-commit-config.yml').replaceAll(path.sep, '/')
  ]
}

/**
 * Executes `prek run` with the action's fixed base flags plus any user-provided extra arguments.
 */
export async function runPrek(workingDirectory: string, extraArgs: string): Promise<number> {
  const args = ['run', '--show-diff-on-failure', '--color=always', ...parseArgsStringToArgv(extraArgs)]
  return exec.exec('prek', args, {
    cwd: workingDirectory,
    ignoreReturnCode: true
  })
}

/**
 * Prints the verbose prek log if present to aid CI debugging after a run.
 */
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

/**
 * Prunes stale prek cache entries after a successful run.
 */
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

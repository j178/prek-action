import * as path from 'node:path'
import * as core from '@actions/core'
import * as semver from 'semver'
import { knownChecksumsByAsset } from '../known-checksums'
import { getVersionManifest } from '../manifest'
import type { Version, VersionManifest } from '../types'
import { parseConstraint, resolveVersionFromManifest, toVersion } from './constraints'
import { detectVersion } from './tool-versions'
import { resolveVersionFile } from './version-file'

type ResolveOptions = {
  prekVersion: string
  versionFile?: string
  workingDirectory?: string
}

export async function resolveVersion(
  options: ResolveOptions | string,
  manifest?: VersionManifest,
): Promise<Version> {
  const normalizedOptions = typeof options === 'string' ? { prekVersion: options } : options
  const { prekVersion, versionFile, workingDirectory = '.' } = normalizedOptions
  const normalizedInput = prekVersion.trim() || 'latest'

  if (normalizedInput !== 'latest' && versionFile) {
    throw new Error(
      'Cannot specify both `prek-version` and `version-file` inputs. ' +
        'Use one or the other to avoid ambiguity.',
    )
  }

  if (normalizedInput !== 'latest') {
    return resolveVersionInput(normalizedInput, manifest)
  }

  const resolvedWorkingDirectory = resolveWorkingDirectory(workingDirectory)
  if (versionFile) {
    const resolvedPath = path.isAbsolute(versionFile)
      ? versionFile
      : path.resolve(resolvedWorkingDirectory, versionFile)
    const detected = await resolveVersionFile(resolvedPath)
    core.info(`Resolved prek version "${detected.version}" from version-file: ${detected.source}`)
    return resolveVersionInput(detected.version, manifest)
  }

  const repoRoot = resolveRepoRoot()
  const detected = await detectVersion(resolvedWorkingDirectory, repoRoot)
  if (detected) {
    core.info(`Auto-detected prek version "${detected.version}" from ${detected.source}`)
    return resolveVersionInput(detected.version, manifest)
  }

  core.info('No version source found (no version-file or .tool-versions); defaulting to latest')
  return resolveVersionInput('latest', manifest)
}

async function resolveVersionInput(
  versionInput: string,
  manifest?: VersionManifest,
): Promise<Version> {
  const normalizedInput = versionInput.trim() || 'latest'
  core.info(`Resolving prek version from input "${versionInput}"`)

  if (normalizedInput === 'latest-known') {
    const versions = Array.from(knownChecksumsByAsset.keys(), key => key.split(':')[0])
    const [version] = versions
      .filter(version => semver.prerelease(version) === null)
      .sort(semver.rcompare)
    if (!version) {
      throw new Error('No stable prek version is available in the bundled checksums')
    }
    core.info(`Resolved "latest-known" to bundled version ${version}`)
    return toVersion(version)
  }

  const exactVersion = semver.valid(toVersion(normalizedInput))
  if (exactVersion) {
    const version = exactVersion as Version
    core.info(`Resolved exact version "${normalizedInput}" to ${version}`)
    return version
  }

  // Validate before downloading so network failures cannot mask invalid input.
  if (normalizedInput !== 'latest') {
    parseConstraint(normalizedInput)
  }

  return resolveVersionFromManifest(versionInput, manifest ?? (await getVersionManifest()))
}

function resolveRepoRoot(): string | undefined {
  const repoRoot = process.env.GITHUB_WORKSPACE
  return repoRoot ? path.resolve(repoRoot) : undefined
}

function resolveWorkingDirectory(workingDirectory: string): string {
  if (path.isAbsolute(workingDirectory)) {
    return workingDirectory
  }

  const repoRoot = resolveRepoRoot()
  return repoRoot ? path.resolve(repoRoot, workingDirectory) : path.resolve(workingDirectory)
}

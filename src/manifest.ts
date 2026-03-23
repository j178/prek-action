import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as semver from 'semver'
import type { ManifestAsset, NormalizedVersion, Version, VersionManifest } from './types'
import { detectVersion } from './version/auto'
import {
  normalizeVersion,
  resolveVersionFromManifest as resolveVersionFromManifestWithManifest,
} from './version/constraints'
import { resolveVersionFile } from './version/version-file'

const prekReleasesBaseUrl = 'https://github.com/j178/prek/releases/download'
const prekVersionManifestUrl =
  'https://raw.githubusercontent.com/j178/prek-action/main/version-manifest.json'

// Cache the in-flight manifest download so version resolution and asset lookup share one request per process.
let versionManifestPromise: Promise<VersionManifest> | undefined

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
      'Cannot specify both prek-version and version-file inputs. ' +
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
  const exactVersion = semver.valid(toVersion(normalizedInput))
  if (exactVersion) {
    const version = exactVersion as Version
    core.info(`Resolved exact version "${normalizedInput}" to ${version}`)
    return version
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

export { normalizeVersion }

export function toVersion(version: string): Version {
  return version.replace(/^v/, '') as Version
}

// Return the manifest asset metadata for a version, if that version exists in the manifest.
// If the version exists but the expected asset is missing, treat that as a manifest error.
export function getManifestAssetForVersion(
  version: Version,
  archiveName: string,
  manifest: VersionManifest,
): ManifestAsset | undefined {
  core.info(`Looking up asset ${archiveName} for ${version}`)
  const release = manifest.find(candidate => candidate.version === version)
  if (!release) {
    return undefined
  }

  const asset = release.assets.find(candidate => candidate.name === archiveName)
  if (!asset) {
    throw new Error(
      `prek asset ${archiveName} was not found for ${release.version} in the version manifest`,
    )
  }
  return asset
}

// Return the asset to download for a version. Prefer manifest metadata when available;
// if an exact version is newer than the manifest, fall back to the release URL pattern.
export async function getAssetForVersion(
  version: Version,
  archiveName: string,
): Promise<ManifestAsset> {
  let manifest: VersionManifest | undefined
  try {
    manifest = await getVersionManifest()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.warning(
      `Failed to download version manifest: ${message}. Falling back to the release asset URL pattern for ${version}`,
    )
    return buildReleaseAssetUrl(version, archiveName)
  }

  const asset = getManifestAssetForVersion(version, archiveName, manifest)
  if (asset) {
    return asset
  }

  core.info(
    `Version ${version} is not in the version manifest; falling back to the release asset URL pattern`,
  )
  return buildReleaseAssetUrl(version, archiveName)
}

export function resolveVersionFromManifest(
  versionInput: string,
  manifest: VersionManifest,
): Version {
  return resolveVersionFromManifestWithManifest(versionInput, manifest)
}

async function downloadVersionManifest(): Promise<VersionManifest> {
  core.info(`Downloading version manifest from ${prekVersionManifestUrl}`)
  const downloadedPath = await tc.downloadTool(prekVersionManifestUrl)
  const rawManifest = await fs.readFile(downloadedPath, 'utf8')
  return JSON.parse(rawManifest) as VersionManifest
}

async function getVersionManifest(): Promise<VersionManifest> {
  versionManifestPromise ??= downloadVersionManifest()

  try {
    return await versionManifestPromise
  } catch (error) {
    versionManifestPromise = undefined
    throw error
  }
}

function buildReleaseAssetUrl(version: Version, archiveName: string): ManifestAsset {
  return {
    downloadUrl: `${prekReleasesBaseUrl}/${normalizeVersion(version)}/${archiveName}`,
    name: archiveName,
  }
}

export type { NormalizedVersion }

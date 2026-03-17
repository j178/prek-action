import * as fs from 'node:fs/promises'
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as semver from 'semver'
import type { ManifestAsset, NormalizedVersion, Version, VersionManifest } from './types'

const prekReleasesBaseUrl = 'https://github.com/j178/prek/releases/download'
const prekVersionManifestUrl =
  'https://raw.githubusercontent.com/j178/prek-action/main/version-manifest.json'
// Cache the in-flight manifest download so version resolution and asset lookup share one request per process.
let versionManifestPromise: Promise<VersionManifest> | undefined

// Resolve user input to a bare version. Exact versions pass through directly; ranges and `latest`
// are resolved from the downloaded version manifest.
export async function resolveVersion(versionInput: string, _token: string): Promise<Version> {
  const normalizedInput = versionInput.trim() || 'latest'
  const exactVersion = semver.valid(toVersion(normalizedInput))
  if (exactVersion) {
    const version = exactVersion as Version
    core.info(`Resolved exact version "${normalizedInput}" to ${version}`)
    return version
  }

  return resolveVersionFromManifest(versionInput, await getVersionManifest())
}

// Internal code uses bare semver strings; GitHub-facing tags still need a leading v.
export function normalizeVersion(version: string | Version | NormalizedVersion): NormalizedVersion {
  return `v${version.replace(/^v/, '')}` as NormalizedVersion
}

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

// Resolve `latest` and semver ranges from the downloaded manifest only.
export function resolveVersionFromManifest(
  versionInput: string,
  manifest: VersionManifest,
): Version {
  const normalizedInput = versionInput.trim() || 'latest'
  core.info(`Resolving prek version from input "${versionInput}"`)

  if (normalizedInput === 'latest') {
    const latestRelease = manifest.find(release => !release.prerelease)
    if (!latestRelease) {
      throw new Error('The prek version manifest does not contain a stable release')
    }
    core.info(`Resolved "${normalizedInput}" to latest stable release ${latestRelease.version}`)
    return latestRelease.version
  }

  const range = semver.validRange(normalizedInput)
  if (!range) {
    throw new Error(`Invalid prek-version input: ${versionInput}`)
  }

  const rangeRelease = manifest.find(
    candidate => !candidate.prerelease && semver.satisfies(candidate.version, range),
  )
  if (!rangeRelease) {
    throw new Error(`No prek release satisfies version range: ${versionInput}`)
  }

  core.info(`Resolved version range "${normalizedInput}" to ${rangeRelease.version}`)
  return rangeRelease.version
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

import * as core from '@actions/core'
import * as semver from 'semver'
import versionManifest from './version-manifest.json'
import type {ManifestAsset, NormalizedVersion, Version, VersionManifest} from './types'

const prekVersionManifest = versionManifest as VersionManifest
const prekReleasesBaseUrl = 'https://github.com/j178/prek/releases/download'

// Resolve user input to a bare version. Exact versions pass through directly; ranges and `latest`
// are resolved from the bundled manifest.
export async function resolveVersion(versionInput: string, _token: string): Promise<Version> {
  const normalizedInput = versionInput.trim() || 'latest'
  const exactVersion = semver.valid(toVersion(normalizedInput))
  if (exactVersion) {
    const version = exactVersion as Version
    core.info(`Resolved exact version "${normalizedInput}" to ${version}`)
    return version
  }

  return resolveVersionFromManifest(versionInput)
}

// Internal code uses bare semver strings; GitHub-facing tags still need a leading v.
export function normalizeVersion(version: string | Version | NormalizedVersion): NormalizedVersion {
  return `v${version.replace(/^v/, '')}` as NormalizedVersion
}

export function toVersion(version: string): Version {
  return version.replace(/^v/, '') as Version
}

// Return the bundled asset metadata for a version, if that version exists in the manifest.
// If the version exists but the expected asset is missing, treat that as a manifest error.
export function getManifestAssetForVersion(version: Version, archiveName: string): ManifestAsset | undefined {
  core.info(`Looking up asset ${archiveName} for ${version}`)
  const release = prekVersionManifest.find(candidate => candidate.version === version)
  if (!release) {
    return undefined
  }

  const asset = release.assets.find(candidate => candidate.name === archiveName)
  if (!asset) {
    throw new Error(`prek asset ${archiveName} was not found for ${release.version} in the bundled version manifest`)
  }
  return asset
}

// Return the asset to download for a version. Prefer bundled metadata so we can verify checksums;
// if an exact version is newer than the bundled manifest, fall back to the release URL pattern.
export function getAssetForVersion(version: Version, archiveName: string): ManifestAsset {
  const asset = getManifestAssetForVersion(version, archiveName)
  if (asset) {
    return asset
  }

  core.info(`Version ${version} is not in the bundled manifest; falling back to the release asset URL pattern`)
  return {
    downloadUrl: `${prekReleasesBaseUrl}/${normalizeVersion(version)}/${archiveName}`,
    name: archiveName,
    sha256: null,
    size: 0
  }
}

// Resolve `latest` and semver ranges from the bundled manifest only.
export function resolveVersionFromManifest(
  versionInput: string,
  manifest: VersionManifest = prekVersionManifest
): Version {
  const normalizedInput = versionInput.trim() || 'latest'
  core.info(`Resolving prek version from input "${versionInput}"`)

  if (normalizedInput === 'latest') {
    const latestRelease = manifest.find(release => !release.prerelease)
    if (!latestRelease) {
      throw new Error('The bundled prek version manifest does not contain a stable release')
    }
    core.info(`Resolved "${normalizedInput}" to latest stable release ${latestRelease.version}`)
    return latestRelease.version
  }

  const range = semver.validRange(normalizedInput)
  if (!range) {
    throw new Error(`Invalid prek-version input: ${versionInput}`)
  }

  const rangeRelease = manifest.find(
    candidate => !candidate.prerelease && semver.satisfies(candidate.version, range)
  )
  if (!rangeRelease) {
    throw new Error(`No prek release satisfies version range: ${versionInput}`)
  }

  core.info(`Resolved version range "${normalizedInput}" to ${rangeRelease.version}`)
  return rangeRelease.version
}

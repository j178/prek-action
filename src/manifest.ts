import * as core from '@actions/core'
import * as semver from 'semver'
import versionManifest from './version-manifest.json'
import type {ManifestAsset, NormalizedVersion, Version, VersionManifest} from './types'

const prekVersionManifest = versionManifest as VersionManifest

// Resolve the user input to the bare prek version used internally by install and cache code.
export async function resolveVersion(versionInput: string, _token: string): Promise<Version> {
  return resolveVersionFromManifest(versionInput)
}

// Internal code uses bare semver strings; GitHub-facing tags still need a leading v.
export function normalizeVersion(version: string | Version | NormalizedVersion): NormalizedVersion {
  return `v${version.replace(/^v/, '')}` as NormalizedVersion
}

export function toVersion(version: string): Version {
  return version.replace(/^v/, '') as Version
}

// Look up the release asset recorded for a resolved prek version and target archive name.
export function getManifestAssetForVersion(version: Version, archiveName: string): ManifestAsset {
  core.info(`Looking up asset ${archiveName} for ${version}`)
  const release = prekVersionManifest.find(candidate => candidate.version === version)
  if (!release) {
    throw new Error(`prek version ${version} was not found in the bundled version manifest`)
  }

  const asset = release.assets.find(candidate => candidate.name === archiveName)
  if (!asset) {
    throw new Error(`prek asset ${archiveName} was not found for ${release.version} in the bundled version manifest`)
  }
  return asset
}

// Resolve exact versions, semver ranges, and `latest` against the bundled manifest.
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

  const exactVersion = semver.valid(normalizedInput)
  if (exactVersion) {
    const version = exactVersion as Version
    const exactRelease = manifest.find(candidate => candidate.version === version)
    if (!exactRelease) {
      throw new Error(`prek version ${version} was not found in the bundled version manifest`)
    }
    core.info(`Resolved exact version "${normalizedInput}" to ${exactRelease.version}`)
    return exactRelease.version
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

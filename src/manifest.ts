import * as semver from 'semver'

import versionManifest from './version-manifest.json'
import type {ManifestAsset, ManifestRelease, VersionManifest} from './types'

const prekVersionManifest = versionManifest as VersionManifest

export async function resolveVersion(versionInput: string, _token: string): Promise<string> {
  return resolveVersionFromManifest(versionInput)
}

export function resolveVersionFromManifest(
  versionInput: string,
  manifest: VersionManifest = prekVersionManifest
): string {
  const normalizedInput = versionInput.trim() || 'latest'
  if (normalizedInput === 'latest') {
    return getLatestManifestRelease(manifest).tag
  }

  const exactVersion = semver.valid(normalizedInput)
  if (exactVersion) {
    return getManifestReleaseByVersion(exactVersion, manifest).tag
  }

  const range = semver.validRange(normalizedInput)
  if (!range) {
    throw new Error(`Invalid prek-version input: ${versionInput}`)
  }

  const release = manifest.releases.find(
    candidate => !candidate.draft && !candidate.prerelease && semver.satisfies(candidate.version, range)
  )
  if (!release) {
    throw new Error(`No prek release satisfies version range: ${versionInput}`)
  }
  return release.tag
}

export function normalizeVersion(version: string): string {
  return `v${version.replace(/^v/, '')}`
}

export function getManifestAssetForVersion(
  version: string,
  archiveName: string,
  manifest: VersionManifest = prekVersionManifest
): ManifestAsset {
  const release = getManifestReleaseByTag(version, manifest)
  const asset = release.assets.find(candidate => candidate.name === archiveName)
  if (!asset) {
    throw new Error(`prek asset ${archiveName} was not found for ${release.tag} in the bundled version manifest`)
  }
  return asset
}

function getLatestManifestRelease(manifest: VersionManifest): ManifestRelease {
  const latestRelease = manifest.releases.find(release => !release.draft && !release.prerelease)
  if (!latestRelease) {
    throw new Error('The bundled prek version manifest does not contain a stable release')
  }
  return latestRelease
}

function getManifestReleaseByTag(version: string, manifest: VersionManifest): ManifestRelease {
  const tag = normalizeVersion(version)
  const release = manifest.releases.find(candidate => candidate.tag === tag)
  if (!release) {
    throw new Error(`prek version ${tag} was not found in the bundled version manifest`)
  }
  return release
}

function getManifestReleaseByVersion(version: string, manifest: VersionManifest): ManifestRelease {
  const release = manifest.releases.find(candidate => candidate.version === version)
  if (!release) {
    throw new Error(`prek version ${normalizeVersion(version)} was not found in the bundled version manifest`)
  }
  return release
}

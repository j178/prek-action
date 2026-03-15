import * as semver from 'semver'
import versionManifest from './version-manifest.json'
import type {ManifestAsset, ManifestRelease, VersionManifest} from './types'

const prekVersionManifest = versionManifest as VersionManifest

export async function resolveVersion(versionInput: string, _token: string): Promise<string> {
  return resolveVersionFromManifest(versionInput)
}

export function normalizeVersion(version: string): string {
  return `v${version.replace(/^v/, '')}`
}

export function getManifestAssetForVersion(version: string, archiveName: string): ManifestAsset {
  const release = getManifestReleaseByTag(version)
  if (!release) {
    throw new Error(`prek version ${normalizeVersion(version)} was not found in the bundled version manifest`)
  }

  const asset = release.assets.find(candidate => candidate.name === archiveName)
  if (!asset) {
    throw new Error(`prek asset ${archiveName} was not found for ${release.tag} in the bundled version manifest`)
  }
  return asset
}

export function resolveVersionFromManifest(versionInput: string): string {
  const normalizedInput = versionInput.trim() || 'latest'
  if (normalizedInput === 'latest') {
    return getLatestManifestRelease().tag
  }

  const exactVersion = semver.valid(normalizedInput)
  if (exactVersion) {
    const exactRelease = getManifestReleaseByVersion(exactVersion)
    if (!exactRelease) {
      throw new Error(`prek version ${normalizeVersion(exactVersion)} was not found in the bundled version manifest`)
    }
    return exactRelease.tag
  }

  const range = semver.validRange(normalizedInput)
  if (!range) {
    throw new Error(`Invalid prek-version input: ${versionInput}`)
  }

  const rangeRelease = prekVersionManifest.releases.find(
    candidate => !candidate.draft && !candidate.prerelease && semver.satisfies(candidate.version, range)
  )
  if (!rangeRelease) {
    throw new Error(`No prek release satisfies version range: ${versionInput}`)
  }

  return rangeRelease.tag
}

function getLatestManifestRelease(): ManifestRelease {
  const latestRelease = prekVersionManifest.releases.find(release => !release.draft && !release.prerelease)
  if (!latestRelease) {
    throw new Error('The bundled prek version manifest does not contain a stable release')
  }
  return latestRelease
}

function getManifestReleaseByTag(version: string): ManifestRelease | undefined {
  const tag = normalizeVersion(version)
  return prekVersionManifest.releases.find(candidate => candidate.tag === tag)
}

function getManifestReleaseByVersion(version: string): ManifestRelease | undefined {
  return prekVersionManifest.releases.find(candidate => candidate.version === version)
}

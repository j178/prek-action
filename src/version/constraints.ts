import * as core from '@actions/core'
import * as semver from 'semver'
import type { ManifestRelease, Version, VersionManifest } from '../types'

type ParsedConstraint = {
  exactExclusions: string[]
  prefixExclusions: number[][]
  rangeInput: string
}

function getStaleManifestHint(): string {
  return (
    ' The version manifest may be stale. ' +
    'Try updating prek-action or pinning an older prek version.'
  )
}

function createMissingVersionError(version: string): Error {
  return new Error(
    `prek version ${normalizeVersion(version)} was not found in the version manifest.${getStaleManifestHint()}`,
  )
}

function createUnsatisfiedRangeError(versionInput: string): Error {
  return new Error(
    `No prek release satisfies version range: ${versionInput}.${getStaleManifestHint()}`,
  )
}

export function normalizeVersion(version: string): `v${string}` {
  return `v${version.replace(/^v/, '')}`
}

function getStableReleases(manifest: VersionManifest): ManifestRelease[] {
  return manifest
    .filter(release => !release.prerelease)
    .sort((left, right) => semver.rcompare(left.version, right.version))
}

function parsePrefixExclusion(versionInput: string): number[] | null {
  const match = versionInput.match(/^(\d+)\.(\d+)(?:\.(\d+))?\.\*$/)
  if (!match) return null
  return match
    .slice(1)
    .filter((segment): segment is string => typeof segment === 'string')
    .map(segment => Number(segment))
}

function matchesExcludedPrefix(version: string, prefix: number[]): boolean {
  const parsed = semver.parse(version)
  if (!parsed) return false

  const releaseSegments = [parsed.major, parsed.minor, parsed.patch]
  return prefix.every((segment, index) => releaseSegments[index] === segment)
}

function parseConstraint(versionInput: string): ParsedConstraint {
  const exactExclusions: string[] = []
  const prefixExclusions: number[][] = []
  const rangeTokens: string[] = []

  // Python-origin parsers can pass through PEP 440 exclusions like `!=0.3.*`
  // that semver does not understand, so strip them before validating the range.
  for (const token of versionInput.split(/\s+/).filter(Boolean)) {
    if (!token.startsWith('!=')) {
      rangeTokens.push(token)
      continue
    }

    const rawExclusion = token.slice(2)
    const excludedVersion = semver.valid(rawExclusion)
    if (excludedVersion) {
      exactExclusions.push(excludedVersion)
      continue
    }

    const prefixExclusion = parsePrefixExclusion(rawExclusion)
    if (!prefixExclusion) {
      throw new Error(
        `Invalid prek-version exclusion: "${token}". Expected an exact version like "!=0.3.5" or a release prefix like "!=0.3.*".`,
      )
    }
    prefixExclusions.push(prefixExclusion)
  }

  return {
    exactExclusions,
    prefixExclusions,
    rangeInput: rangeTokens.join(' ') || '*',
  }
}

export function resolveVersionFromManifest(
  versionInput: string,
  manifest: VersionManifest,
): Version {
  const normalizedInput = versionInput.trim() || 'latest'
  core.debug(`Resolving prek version from input "${versionInput}"`)

  if (normalizedInput === 'latest') {
    const latestRelease = getStableReleases(manifest)[0]
    if (!latestRelease) {
      throw new Error('The bundled prek version manifest does not contain a stable release')
    }
    core.info(`Resolved "${normalizedInput}" to latest stable release ${latestRelease.version}`)
    return latestRelease.version
  }

  const { exactExclusions, prefixExclusions, rangeInput } = parseConstraint(normalizedInput)
  const exactVersion =
    exactExclusions.length === 0 && prefixExclusions.length === 0 ? semver.valid(rangeInput) : null
  if (exactVersion) {
    const exactRelease = manifest.find(candidate => candidate.version === exactVersion)
    if (!exactRelease) {
      throw createMissingVersionError(exactVersion)
    }
    core.info(`Resolved exact version "${normalizedInput}" to ${exactRelease.version}`)
    return exactRelease.version
  }

  const range = semver.validRange(rangeInput)
  if (!range) {
    throw new Error(
      `Invalid prek-version input: "${versionInput}". Expected a semver version (e.g. 0.3.5), range (e.g. 0.3.x, >=0.3.0), or "latest".`,
    )
  }

  const rangeRelease = getStableReleases(manifest).find(
    candidate =>
      semver.satisfies(candidate.version, range) &&
      !exactExclusions.includes(candidate.version) &&
      !prefixExclusions.some(prefix => matchesExcludedPrefix(candidate.version, prefix)),
  )
  if (!rangeRelease) {
    throw createUnsatisfiedRangeError(versionInput)
  }

  core.info(`Resolved version range "${normalizedInput}" to ${rangeRelease.version}`)
  return rangeRelease.version
}

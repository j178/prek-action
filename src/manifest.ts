import * as core from '@actions/core'
import {HttpClient} from '@actions/http-client'
import versionManifest from './version-manifest.json'
import type {ManifestAsset, ManifestRelease, VersionManifest} from './types'

const prekVersionManifest = versionManifest as VersionManifest

export async function resolveVersion(versionInput: string, token: string): Promise<string> {
  const normalizedInput = versionInput.trim() || 'latest'
  if (normalizedInput === 'latest') {
    return getLatestManifestRelease().tag
  }

  const manifestVersion = getManifestReleaseByTag(normalizedInput)
  if (manifestVersion) {
    return manifestVersion.tag
  }

  return resolveVersionFromGitHub(normalizedInput, token)
}

async function fetchLatestVersion(client: HttpClient, token: string): Promise<string> {
  const response = await client.getJson<{tag_name: string}>(
    'https://api.github.com/repos/j178/prek/releases/latest',
    buildHeaders(token)
  )
  if (!response.result?.tag_name) {
    throw new Error('GitHub API response did not include tag_name')
  }
  return response.result.tag_name
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

  const release = getManifestReleaseByTag(normalizedInput)
  if (!release) {
    throw new Error(`prek version ${normalizeVersion(versionInput)} was not found in the bundled version manifest`)
  }
  return release.tag
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function resolveVersionFromGitHub(versionInput: string, token: string): Promise<string> {
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

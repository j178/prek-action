export const CACHE_KEY_STATE = 'prek-cache-primary-key'
export const CACHE_MATCHED_KEY_STATE = 'prek-cache-matched-key'
export const CACHE_PATHS_STATE = 'prek-cache-paths'
export const PREK_CACHE_KEY_PREFIX = 'prek-v1'

export type Inputs = {
  extraArgs: string
  installOnly: boolean
  prekVersion: string
  showVerboseLogs: boolean
  token: string
  workingDirectory: string
}

export type ReleaseAsset = {
  archiveName: string
  archiveType: 'tar.gz' | 'zip'
  binaryName: string
}

export type ManifestAsset = {
  contentType: string
  downloadUrl: string
  name: string
  sha256: string | null
  size: number
}

export type ManifestRelease = {
  assets: ManifestAsset[]
  draft: boolean
  prerelease: boolean
  publishedAt: string
  tag: string
  version: string
}

export type VersionManifest = {
  releases: ManifestRelease[]
  source: string
}

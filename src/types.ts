export const CACHE_KEY_STATE = 'prek-cache-primary-key'
export const CACHE_MATCHED_KEY_STATE = 'prek-cache-matched-key'
export const CACHE_PATHS_STATE = 'prek-cache-paths'
export const PREK_CACHE_KEY_PREFIX = 'prek-v1'

export type Version = string & { readonly __brand: 'Version' }
export type NormalizedVersion = `v${string}`

export type Inputs = {
  cache: boolean
  extraArgs: string
  installOnly: boolean
  prekVersion: string
  showVerboseLogs: boolean
  versionFile?: string
  workingDirectory: string
}

export type ReleaseAsset = {
  archiveName: string
  archiveType: 'tar.gz' | 'zip'
  binaryName: string
}

export type ManifestAsset = {
  downloadUrl: string
  name: string
}

export type ManifestRelease = {
  assets: ManifestAsset[]
  prerelease: boolean
  publishedAt: string
  version: Version
}

export type VersionManifest = ManifestRelease[]

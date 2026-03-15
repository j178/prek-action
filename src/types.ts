export const CACHE_KEY_STATE = 'prek-cache-primary-key'
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

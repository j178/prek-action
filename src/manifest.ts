import * as core from '@actions/core'
import {HttpClient} from '@actions/http-client'

export async function resolveVersion(versionInput: string, _token: string): Promise<string> {
  if (versionInput !== 'latest') {
    return normalizeVersion(versionInput)
  }

  const client = new HttpClient('prek-action')
  try {
    return normalizeVersion(await fetchLatestVersion(client, _token))
  } catch (error) {
    if (!_token) {
      throw error
    }
    core.warning(`Authenticated request failed: ${formatError(error)}. Retrying without token.`)
    return normalizeVersion(await fetchLatestVersion(client, ''))
  }
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

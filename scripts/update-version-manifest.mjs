import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import semver from 'semver'

const releasesApiUrl = 'https://api.github.com/repos/j178/prek/releases'
const manifestPath = path.resolve('src/version-manifest.json')
const archivePattern = /\.(tar\.gz|zip)$/

async function run() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
  const releases = await fetchAllReleases(token)
  const manifest = {
    releases,
    source: releasesApiUrl
  }

  await mkdir(path.dirname(manifestPath), {recursive: true})
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Wrote ${releases.length} prek releases to ${manifestPath}`)
}

async function fetchAllReleases(token) {
  const releases = []

  for (let page = 1; ; page += 1) {
    const url = `${releasesApiUrl}?per_page=100&page=${page}`
    const response = await fetch(url, {
      headers: buildHeaders(token)
    })
    if (!response.ok) {
      throw new Error(`GitHub API request failed for ${url}: ${response.status} ${response.statusText}`)
    }

    const pageReleases = await response.json()
    if (!Array.isArray(pageReleases) || pageReleases.length === 0) {
      break
    }

    for (const release of pageReleases) {
      const version = semver.valid(release.tag_name)
      if (!version) {
        continue
      }

      releases.push({
        assets: Array.isArray(release.assets)
          ? release.assets
              .filter(asset => archivePattern.test(asset.name))
              .map(asset => ({
              contentType: asset.content_type,
              downloadUrl: asset.browser_download_url,
              name: asset.name,
              sha256: normalizeDigest(asset.digest),
              size: asset.size
              }))
          : [],
        draft: Boolean(release.draft),
        prerelease: Boolean(release.prerelease),
        publishedAt: release.published_at || release.created_at || '',
        tag: release.tag_name,
        version
      })
    }

    if (pageReleases.length < 100) {
      break
    }
  }

  return releases.sort(compareReleasesDesc)
}

function buildHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'prek-action-manifest-updater'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function normalizeDigest(digest) {
  if (typeof digest !== 'string' || digest.length === 0) {
    return null
  }

  if (digest.startsWith('sha256:')) {
    return digest.slice('sha256:'.length)
  }

  return digest
}

function compareReleasesDesc(left, right) {
  return semver.rcompare(left.version, right.version) || right.publishedAt.localeCompare(left.publishedAt)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

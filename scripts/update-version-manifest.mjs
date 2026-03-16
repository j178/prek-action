import {appendFile, mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import semver from 'semver'

const releasesApiUrl = 'https://api.github.com/repos/j178/prek/releases'
const manifestPath = path.resolve('src/version-manifest.json')
const minimumSupportedVersion = '0.0.23'
const installableArchivePattern = /^prek-(.+)\.(tar\.gz|zip)$/
const excludedArchiveNames = new Set(['prek-npm-package.tar.gz'])

async function run() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
  const previousReleases = await readExistingManifest()
  const previousVersions = new Set(previousReleases.map(release => release.version))
  const releases = await fetchAllReleases(token)
  const addedVersions = releases.map(release => release.version).filter(version => !previousVersions.has(version))

  await mkdir(path.dirname(manifestPath), {recursive: true})
  await writeFile(manifestPath, `${JSON.stringify(releases, null, 2)}\n`)
  console.log(`Wrote ${releases.length} prek releases to ${manifestPath}`)
  if (addedVersions.length === 0) {
    console.log('No new prek releases found')
  } else {
    console.log(`New prek releases: ${addedVersions.join(', ')}`)
  }

  await writeOutputs(addedVersions)
}

async function readExistingManifest() {
  return JSON.parse(await readFile(manifestPath, 'utf8'))
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
      if (!version || semver.lt(version, minimumSupportedVersion) || release.draft) {
        continue
      }

      releases.push({
        assets: Array.isArray(release.assets)
          ? release.assets
              .filter(asset => isInstallableArchive(asset.name))
              .map(asset => ({
                downloadUrl: asset.browser_download_url,
                name: asset.name,
                sha256: normalizeDigest(asset.digest),
                size: asset.size
              }))
          : [],
        prerelease: Boolean(release.prerelease),
        publishedAt: release.published_at || release.created_at || '',
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

function isInstallableArchive(name) {
  return installableArchivePattern.test(name) && !excludedArchiveNames.has(name)
}

function compareReleasesDesc(left, right) {
  return semver.rcompare(left.version, right.version) || right.publishedAt.localeCompare(left.publishedAt)
}

async function writeOutputs(addedVersions) {
  const outputPath = process.env.GITHUB_OUTPUT
  if (!outputPath) {
    return
  }

  const prTitle =
    addedVersions.length === 0
      ? 'Update prek version manifest'
      : `Update prek version manifest for ${formatVersionSummary(addedVersions)}`
  const addedVersionsMarkdown =
    addedVersions.length === 0
      ? '- None'
      : addedVersions.map(version => `- prek ${version}`).join('\n')

  await appendFile(
    outputPath,
    [
      `added_versions=${addedVersions.join(',')}`,
      `pr_title=${prTitle}`,
      'added_versions_markdown<<EOF',
      addedVersionsMarkdown,
      'EOF'
    ].join('\n') + '\n'
  )
}

function formatVersionSummary(addedVersions) {
  if (addedVersions.length === 1) {
    return `prek ${addedVersions[0]}`
  }

  return `prek ${addedVersions[0]} and ${addedVersions.length - 1} more`
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

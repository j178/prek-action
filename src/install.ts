import * as crypto from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import { isNonGlibcLinuxSync } from 'detect-libc'
import { knownChecksumsByAsset } from './known-checksums'
import { getAssetForVersion } from './manifest'
import type { ManifestAsset, ReleaseAsset, Version } from './types'

export type LinuxLibc = 'gnu' | 'musl'

// Install a specific bare prek version, preferring the GitHub Actions tool cache when available.
export async function installPrek(version: Version): Promise<string> {
  const linuxLibc = process.platform === 'linux' ? detectLinuxLibc() : 'gnu'
  const toolArch = getToolCacheArchFor(process.arch, linuxLibc)
  const cachedTool = tc.find('prek', version, toolArch)

  core.startGroup(`Installing prek ${version}`)
  try {
    if (cachedTool) {
      core.info(`Using cached prek from ${cachedTool}`)
      core.addPath(cachedTool)
      return cachedTool
    }

    const asset = getReleaseAssetFor(process.platform, process.arch, linuxLibc)
    core.info(
      `Selected release asset ${asset.archiveName} for runner ${process.platform}/${process.arch} (tool-cache arch ${toolArch})`,
    )
    const manifestAsset = await getAssetForVersion(version, asset.archiveName)

    core.info(`Downloading prek from ${manifestAsset.downloadUrl}`)
    const archivePath = await tc.downloadTool(manifestAsset.downloadUrl)
    core.info(`Downloaded archive to ${archivePath}`)

    await verifyDownloadChecksum(archivePath, manifestAsset, version)

    const extractedPath = await extractArchive(archivePath, asset)
    core.info(`Extracted ${asset.archiveType} archive to ${extractedPath}`)

    const binaryPath = await getBinaryPath(extractedPath, asset)
    if (process.platform !== 'win32') {
      await fs.chmod(binaryPath, 0o755)
    }
    const toolPath = await tc.cacheFile(binaryPath, asset.binaryName, 'prek', version, toolArch)
    core.info(`Cached prek binary at ${toolPath}`)

    core.addPath(toolPath)
    return toolPath
  } finally {
    core.endGroup()
  }
}

async function extractArchive(archivePath: string, asset: ReleaseAsset): Promise<string> {
  if (asset.archiveType === 'tar.gz') {
    return tc.extractTar(archivePath)
  }

  if (process.platform === 'win32') {
    return extractWindowsZipArchive(archivePath)
  }

  return tc.extractZip(archivePath)
}

async function extractWindowsZipArchive(archivePath: string): Promise<string> {
  try {
    // bsdtar can extract zip archives much faster than the zip fallback on Windows runners.
    return await tc.extractTar(archivePath, undefined, 'x')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.info(`Extracting zip with tar failed, falling back to zip extraction: ${message}`)
    return tc.extractZip(archivePath)
  }
}

// Translate the current runner platform/arch into the expected release archive and executable names.
export function getReleaseAssetFor(
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
  linuxLibc: LinuxLibc,
): ReleaseAsset {
  const binaryName = platform === 'win32' ? 'prek.exe' : 'prek'
  const target = getRustTargetFor(platform, arch, linuxLibc)
  const extension = platform === 'win32' ? 'zip' : 'tar.gz'
  return {
    archiveName: `prek-${target}.${extension}`,
    archiveType: extension,
    binaryName,
  }
}

export function getRustTargetFor(
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
  linuxLibc: LinuxLibc,
): string {
  switch (platform) {
    case 'darwin':
      switch (arch) {
        case 'arm64':
          return 'aarch64-apple-darwin'
        case 'x64':
          return 'x86_64-apple-darwin'
      }
      break
    case 'win32':
      switch (arch) {
        case 'arm64':
          return 'aarch64-pc-windows-msvc'
        case 'ia32':
          return 'i686-pc-windows-msvc'
        case 'x64':
          return 'x86_64-pc-windows-msvc'
      }
      break
    case 'linux':
      switch (arch) {
        case 'arm':
          return `armv7-unknown-linux-${linuxLibc}eabihf`
        case 'arm64':
          return `aarch64-unknown-linux-${linuxLibc}`
        case 'ia32':
          return `i686-unknown-linux-${linuxLibc}`
        case 'riscv64':
          if (linuxLibc === 'gnu') {
            return 'riscv64gc-unknown-linux-gnu'
          }
          break
        case 's390x':
          if (linuxLibc === 'gnu') {
            return 's390x-unknown-linux-gnu'
          }
          break
        case 'x64':
          return `x86_64-unknown-linux-${linuxLibc}`
      }
      break
  }

  const targetDescription =
    platform === 'linux' ? `${platform}/${arch}/${linuxLibc}` : `${platform}/${arch}`
  throw new Error(`Unsupported platform/arch combination: ${targetDescription}`)
}

export function detectLinuxLibc(): LinuxLibc {
  return isNonGlibcLinuxSync() ? 'musl' : 'gnu'
}

export function getToolCacheArchFor(arch: NodeJS.Architecture, linuxLibc: LinuxLibc): string {
  let toolArch: string
  switch (arch) {
    case 'x64':
      toolArch = 'x64'
      break
    case 'arm64':
      toolArch = 'arm64'
      break
    case 'ia32':
      toolArch = 'x86'
      break
    case 'arm':
      toolArch = 'arm'
      break
    default:
      toolArch = arch
  }

  return linuxLibc === 'musl' ? `${toolArch}-musl` : toolArch
}

export async function getBinaryPath(rootDir: string, asset: ReleaseAsset): Promise<string> {
  if (asset.archiveType === 'zip') {
    const binaryPath = path.join(rootDir, asset.binaryName)
    core.info(`Resolved binary path to ${binaryPath}`)
    return binaryPath
  }

  // Tarball releases unpack into a top-level target directory that contains the binary.
  const [entry] = await fs.readdir(rootDir)
  if (!entry) {
    throw new Error(`Extracted archive is empty: ${rootDir}`)
  }

  const binaryPath = path.join(rootDir, entry, asset.binaryName)
  core.info(`Resolved binary path to ${binaryPath}`)
  return binaryPath
}

async function verifyDownloadChecksum(
  archivePath: string,
  asset: ManifestAsset,
  version: Version,
): Promise<void> {
  const result = await validateDownloadedChecksum(archivePath, asset, version)
  if (result === 'missing') {
    core.debug(
      `Checksum is not known for ${buildChecksumKey(version, asset.name)}; skipping verification for prek ${version}`,
    )
    return
  }

  core.info(`Verified SHA-256 checksum for ${asset.name} from prek ${version}`)
}

export async function validateDownloadedChecksum(
  archivePath: string,
  asset: ManifestAsset,
  version: Version,
  checksumMap: ReadonlyMap<string, string> = knownChecksumsByAsset,
): Promise<'matched' | 'missing'> {
  const expectedDigest = checksumMap.get(buildChecksumKey(version, asset.name))
  if (!expectedDigest) {
    return 'missing'
  }

  const digest = await hashFile(archivePath)
  if (digest !== expectedDigest) {
    throw new Error(
      `Checksum mismatch for ${asset.name}: expected ${expectedDigest}, received ${digest}`,
    )
  }

  return 'matched'
}

function buildChecksumKey(version: Version, assetName: string): string {
  return `${version}:${assetName}`
}

// Stream the archive through SHA-256 hashing to avoid loading the whole file into memory.
export async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256')

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', chunk => {
      hash.update(chunk)
    })
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  return hash.digest('hex')
}

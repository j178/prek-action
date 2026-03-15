import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as crypto from 'node:crypto'
import {createReadStream} from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import {getManifestAssetForVersion} from './manifest'
import type {ManifestAsset, ReleaseAsset} from './types'

export async function installPrek(version: string): Promise<string> {
  const toolVersion = version.replace(/^v/, '')
  const toolArch = getToolCacheArchFor(process.arch)
  const cachedTool = tc.find('prek', toolVersion, toolArch)

  core.startGroup(`Installing prek ${version}`)
  try {
    if (cachedTool) {
      core.info(`Using cached prek from ${cachedTool}`)
      core.addPath(cachedTool)
      return cachedTool
    }

    const asset = getReleaseAssetFor(process.platform, process.arch)
    core.info(
      `Selected release asset ${asset.archiveName} for runner ${process.platform}/${process.arch} (tool-cache arch ${toolArch})`
    )
    const manifestAsset = getManifestAssetForVersion(version, asset.archiveName)
    core.info(`Downloading prek from ${manifestAsset.downloadUrl}`)
    const archivePath = await tc.downloadTool(manifestAsset.downloadUrl)
    core.info(`Downloaded archive to ${archivePath}`)
    await verifyDownloadChecksum(archivePath, manifestAsset, version)
    const extractedPath =
      asset.archiveType === 'zip' ? await tc.extractZip(archivePath) : await tc.extractTar(archivePath)
    core.info(`Extracted ${asset.archiveType} archive to ${extractedPath}`)
    const binaryPath = await getBinaryPath(extractedPath, asset)
    if (process.platform !== 'win32') {
      await fs.chmod(binaryPath, 0o755)
    }
    const toolPath = await tc.cacheFile(binaryPath, asset.binaryName, 'prek', toolVersion, toolArch)
    core.info(`Cached prek binary at ${toolPath}`)
    core.addPath(toolPath)
    return toolPath
  } finally {
    core.endGroup()
  }
}

export function getReleaseAssetFor(platform: NodeJS.Platform, arch: NodeJS.Architecture): ReleaseAsset {
  const binaryName = platform === 'win32' ? 'prek.exe' : 'prek'
  const target = getRustTargetFor(platform, arch)
  const extension = platform === 'win32' ? 'zip' : 'tar.gz'
  return {
    archiveName: `prek-${target}.${extension}`,
    archiveType: extension,
    binaryName
  }
}

export function getRustTargetFor(platform: NodeJS.Platform, arch: NodeJS.Architecture): string {
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
          return 'armv7-unknown-linux-gnueabihf'
        case 'arm64':
          return 'aarch64-unknown-linux-gnu'
        case 'ia32':
          return 'i686-unknown-linux-gnu'
        case 'riscv64':
          return 'riscv64gc-unknown-linux-gnu'
        case 's390x':
          return 's390x-unknown-linux-gnu'
        case 'x64':
          return 'x86_64-unknown-linux-gnu'
      }
      break
  }

  throw new Error(`Unsupported platform/arch combination: ${platform}/${arch}`)
}

export function getToolCacheArchFor(arch: NodeJS.Architecture): string {
  switch (arch) {
    case 'x64':
      return 'x64'
    case 'arm64':
      return 'arm64'
    case 'ia32':
      return 'x86'
    case 'arm':
      return 'arm'
    default:
      return arch
  }
}

export async function getBinaryPath(rootDir: string, asset: ReleaseAsset): Promise<string> {
  if (asset.archiveType === 'zip') {
    const binaryPath = path.join(rootDir, asset.binaryName)
    core.info(`Resolved binary path to ${binaryPath}`)
    return binaryPath
  }

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
  version: string
): Promise<void> {
  const result = await validateDownloadedChecksum(archivePath, asset)
  if (result === 'missing') {
    core.warning(`No SHA-256 checksum recorded for ${asset.name} in the ${version} manifest entry`)
  } else {
    core.info(`Verified SHA-256 checksum for ${asset.name}`)
  }
}

export async function validateDownloadedChecksum(
  archivePath: string,
  asset: ManifestAsset
): Promise<'missing' | 'matched'> {
  if (!asset.sha256) {
    return 'missing'
  }

  const digest = await hashFile(archivePath)
  if (digest !== asset.sha256) {
    throw new Error(`Checksum mismatch for ${asset.name}: expected ${asset.sha256}, received ${digest}`)
  }

  return 'matched'
}

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

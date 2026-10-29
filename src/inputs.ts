import * as path from 'node:path'
import * as core from '@actions/core'
import * as semver from 'semver'
import { DEFAULT_VERSION_FILE, readToolVersions } from './tool-versions'
import type { Inputs } from './types'

// Parse and normalize action inputs, including the legacy `extra_args` alias.
export function getInputs(): Inputs {
  const legacyExtraArgs = core.getInput('extra_args')
  const modernExtraArgs = core.getInput('extra-args')
  const workingDirectory = core.getInput('working-directory') || '.'
  const { prekVersion, uvVersion } = getVersions(workingDirectory, getUvVersionInput())
  return {
    cache: core.getBooleanInput('cache'),
    extraArgs: legacyExtraArgs || modernExtraArgs,
    installOnly: core.getBooleanInput('install-only'),
    prekVersion,
    sha256: core.getInput('sha256'),
    showVerboseLogs: core.getBooleanInput('show-verbose-logs'),
    uvVersion,
    workingDirectory,
  }
}

// Like setup-uv's `python-version`, an explicit `uv-version` overrides both the version file
// and an existing PREK_UV_VERSION, and applies even when `prek-version` is set.
function getUvVersionInput(): string | undefined {
  const version = core.getInput('uv-version')
  if (!version) {
    return undefined
  }
  const exactVersion = semver.valid(version)
  if (!exactVersion) {
    throw new Error(`Invalid uv-version "${version}"; use an exact version such as 0.9.5`)
  }
  return exactVersion
}

// Like setup-uv: an explicit `prek-version` wins; otherwise read `prek-version-file`, which can
// also pin the uv version prek installs. Fall back to `latest`.
function getVersions(
  workingDirectory: string,
  uvVersionInput: string | undefined,
): Pick<Inputs, 'prekVersion' | 'uvVersion'> {
  const explicitVersion = core.getInput('prek-version')
  const versionFileInput = core.getInput('prek-version-file') || DEFAULT_VERSION_FILE
  const isDefaultVersionFile = versionFileInput === DEFAULT_VERSION_FILE

  if (explicitVersion) {
    if (!isDefaultVersionFile) {
      core.warning(`Ignoring prek-version-file "${versionFileInput}" because prek-version is set`)
    }
    return { prekVersion: explicitVersion, uvVersion: uvVersionInput }
  }

  const versionFile = path.resolve(workingDirectory, versionFileInput)
  const versions = readToolVersions(versionFile)
  if (!versions) {
    if (!isDefaultVersionFile) {
      throw new Error(`prek-version-file not found: ${versionFile}`)
    }
    return { prekVersion: 'latest', uvVersion: uvVersionInput }
  }

  let prekVersion = versions.prek
  if (prekVersion) {
    core.info(`Using prek version "${prekVersion}" from ${versionFile}`)
  } else if (isDefaultVersionFile) {
    prekVersion = 'latest'
  } else {
    throw new Error(`Could not determine prek version from file: ${versionFile}`)
  }

  return { prekVersion, uvVersion: uvVersionInput ?? getUvVersion(versions.uv, versionFile) }
}

function getUvVersion(version: string | undefined, versionFile: string): string | undefined {
  if (!version) {
    return undefined
  }
  if (process.env.PREK_UV_VERSION) {
    core.info(
      `PREK_UV_VERSION is already set to "${process.env.PREK_UV_VERSION}"; ignoring uv version from ${versionFile}`,
    )
    return undefined
  }

  const exactVersion = semver.valid(version)
  if (!exactVersion) {
    core.warning(
      `Ignoring uv version "${version}" from ${versionFile}; PREK_UV_VERSION requires an exact version such as 0.9.5`,
    )
    return undefined
  }
  core.info(`Using uv version "${exactVersion}" from ${versionFile}`)
  return exactVersion
}

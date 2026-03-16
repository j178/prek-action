import * as core from '@actions/core'
import {restorePrekCache} from './cache'
import {getInputs} from './inputs'
import {installPrek} from './install'
import {normalizeVersion, resolveVersion} from './manifest'
import {pruneCache, runPrek, showVerboseLogs} from './prek'

async function run(): Promise<void> {
  const inputs = getInputs()

  core.startGroup('Resolving prek version')
  const version = await resolveVersion(inputs.prekVersion, inputs.token)
  core.info(`Using prek ${version}`)
  core.endGroup()
  core.setOutput('prek-version', normalizeVersion(version))

  await installPrek(version)
  await restorePrekCache(inputs.workingDirectory)

  if (inputs.installOnly) {
    core.info('Skipping prek run because install-only=true')
    return
  }

  let exitCode: number | undefined
  try {
    exitCode = await runPrek(inputs.workingDirectory, inputs.extraArgs)
  } finally {
    if (inputs.showVerboseLogs) {
      await showVerboseLogs()
    }
    if (exitCode === 0) {
      await pruneCache()
    }
  }

  if (exitCode !== 0) {
    core.setFailed(`prek exited with code ${exitCode}`)
  }
}

run().catch(error => {
  core.setFailed(error instanceof Error ? error.message : String(error))
})

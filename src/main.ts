import * as core from '@actions/core'
import {
  getInputs,
  installPrek,
  pruneCache,
  resolveVersion,
  restorePrekCache,
  runPrek,
  showVerboseLogs
} from './shared'

async function run(): Promise<void> {
  const inputs = getInputs()

  const version = await resolveVersion(inputs.prekVersion, inputs.token)
  core.setOutput('prek-version', version)

  await installPrek(version)
  await restorePrekCache(inputs.workingDirectory)

  if (inputs.installOnly) {
    return
  }

  let exitCode: number | undefined
  try {
    exitCode = await runPrek(inputs.workingDirectory, inputs.extraArgs)
  } finally {
    await showVerboseLogs()
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

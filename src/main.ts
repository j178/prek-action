import * as core from '@actions/core'
import { restorePrekCache, savePrekCache } from './cache'
import { getInputs } from './inputs'
import { installPrek } from './install'
import { normalizeVersion, resolveVersion } from './manifest'
import { pruneCache, runPrek, showVerboseLogs } from './prek'
import { POST_ACTION_STATE } from './types'

export async function run(): Promise<void> {
  const inputs = getInputs()

  core.startGroup('Resolving prek version')
  const version = await resolveVersion(inputs.prekVersion)
  core.info(`Using prek ${version}`)
  core.endGroup()
  core.setOutput('prek-version', normalizeVersion(version))

  await installPrek(version)

  if (inputs.cache) {
    const { matchedKey, primaryKey } = await restorePrekCache(inputs.workingDirectory)
    core.setOutput('cache-hit', String(matchedKey === primaryKey))
  } else {
    core.info('Caching disabled via cache=false; skipping cache restore')
    core.setOutput('cache-hit', 'false')
  }

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

export async function runPost(): Promise<void> {
  // GitHub always runs the post step; savePrekCache() decides whether the main
  // step initialized any cache state worth persisting.
  await savePrekCache()
}

function isPostAction(): boolean {
  return core.getState(POST_ACTION_STATE) === 'true'
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isMainModule(): boolean {
  return typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module
}

if (isMainModule()) {
  const isPost = isPostAction()
  if (!isPost) {
    core.saveState(POST_ACTION_STATE, 'true')
  }

  const action = isPost ? runPost() : run()
  void action.catch(error => {
    if (isPost) {
      core.warning(formatError(error))
    } else {
      core.setFailed(formatError(error))
    }
  })
}

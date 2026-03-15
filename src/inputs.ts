import * as core from '@actions/core'

import type {Inputs} from './types'

export function getInputs(): Inputs {
  const showVerboseLogsInput = core.getInput('show-verbose-logs')
  return {
    extraArgs: core.getInput('extra_args') || core.getInput('extra-args') || '--all-files',
    installOnly: core.getBooleanInput('install-only'),
    prekVersion: core.getInput('prek-version') || 'latest',
    showVerboseLogs: showVerboseLogsInput === '' ? true : core.getBooleanInput('show-verbose-logs'),
    token: core.getInput('token'),
    workingDirectory: core.getInput('working-directory') || '.'
  }
}

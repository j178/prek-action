import * as core from '@actions/core'
import type { Inputs } from './types'

// Parse and normalize action inputs, including the legacy `extra_args` alias.
export function getInputs(): Inputs {
  const legacyExtraArgs = core.getInput('extra_args')
  const modernExtraArgs = core.getInput('extra-args')
  return {
    cache: core.getBooleanInput('cache'),
    extraArgs: legacyExtraArgs || modernExtraArgs,
    installOnly: core.getBooleanInput('install-only'),
    prekVersion: core.getInput('prek-version') || 'latest',
    showVerboseLogs: core.getBooleanInput('show-verbose-logs'),
    workingDirectory: core.getInput('working-directory') || '.',
  }
}

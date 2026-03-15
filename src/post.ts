import * as core from '@actions/core'
import {savePrekCache} from './cache'

async function run(): Promise<void> {
  await savePrekCache()
}

run().catch(error => {
  core.warning(error instanceof Error ? error.message : String(error))
})

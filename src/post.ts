import * as core from '@actions/core'
import { savePrekCache } from './cache'

async function run(): Promise<void> {
  // GitHub always runs the post step; savePrekCache() decides whether the main
  // step initialized any cache state worth persisting.
  await savePrekCache()
}

run().catch(error => {
  core.warning(error instanceof Error ? error.message : String(error))
})

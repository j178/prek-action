import * as fs from 'node:fs/promises'
import { build } from 'esbuild'

const entries = [
  {
    entry: 'src/main.ts',
    outfile: 'dist/index.cjs',
  },
  {
    entry: 'src/post.ts',
    outfile: 'dist/post/index.cjs',
  },
]

await fs.rm('dist', { force: true, recursive: true })

for (const { entry, outfile } of entries) {
  await build({
    bundle: true,
    entryPoints: [entry],
    format: 'cjs',
    outfile,
    platform: 'node',
    target: 'node24',
  })
}

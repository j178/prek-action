# Contributing

## Setup

1. Install Node.js 24 or newer.
2. Install dependencies:

```bash
npm ci
```

If you are bootstrapping from scratch and no lockfile exists yet, run `npm install` once, then commit the generated `package-lock.json`.

## Build

Compile TypeScript:

```bash
npm run build
```

Bundle the action entrypoints for GitHub Actions:

```bash
npm run bundle
```

That command produces:

- `dist/index.js` for the main action
- `dist/post/index.js` for the post-step cache save

The bundled files must be committed, because GitHub Actions consumers run the checked-in `dist/` output directly.

## Test

Run the unit tests:

```bash
npm test
```

This compiles the test files to `.test-build/` and runs them with Node's built-in test runner.

## Validate

Run the action repo checks locally:

```bash
npm test
npm run bundle
git diff --stat
```

`git diff` should only show the source and generated bundle changes you intend to release.

## Release

1. Make the source changes.
2. Run `npm ci`.
3. Run `npm test`.
4. Run `npm run bundle`.
5. Commit both source files and the generated `dist/` output.
6. Push the commit to `main`.
7. Create and push a version tag, for example:

```bash
git tag -a v1.2.0 -m "v1.2.0"
git push origin v1.2.0
```

8. The `Release` workflow runs on the pushed tag. It re-runs validation, creates the GitHub Release with generated notes, and moves the matching major tag such as `v1` for stable semver tags.

Consumers should normally reference the major tag:

```yaml
- uses: j178/prek-action@v1
```

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
7. Open the `Release` workflow in GitHub Actions and run it manually with the desired version, for example `v1.2.0` or `1.2.0`.
8. The workflow re-runs validation, creates the GitHub Release with generated notes, and creates the corresponding Git tag from the current `main` commit.
9. For stable semver tags, the workflow also moves the matching major tag such as `v1`.

You do not need to create or push the version tag manually; the workflow does that via GitHub when it creates the release.

Consumers should normally reference the major tag:

```yaml
- uses: j178/prek-action@v1
```

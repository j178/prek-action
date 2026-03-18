# Prek Action

Run [prek](https://github.com/j178/prek) in your GitHub Actions workflows.

## Usage

```yaml
name: Prek checks
on: [push, pull_request]

jobs:
  prek:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: j178/prek-action@v2
```

`prek` is always invoked as:

```text
prek run --show-diff-on-failure --color=always <extra-args>
```

## Version Tags

Major and minor tags are moving tags. For example, `v2` and `v2.0` are not fixed releases:

- `v2` always points to the latest `v2.x.y` release
- `v2.0` always points to the latest `v2.0.y` release

For a stable reference, pin to a specific release tag such as `v2.0.0`, or pin to a commit SHA.

## Inputs

| Input | Description | Required | Default |
| --- | --- | --- | --- |
| `extra-args` | Additional arguments appended to `prek run --show-diff-on-failure --color=always` | No | `--all-files` |
| `extra_args` | Deprecated alias for `extra-args` | No | |
| `cache` | Cache the prek environment between workflow runs | No | `true` |
| `install-only` | Install `prek` but skip `prek run` | No | `false` |
| `prek-version` | Version or semver range to install, for example `0.2.30`, `0.3.x`, `<=1.0.0`, or `latest` | No | `latest` |
| `version-file` | Path to a file containing the `prek` version to install. Supports `.tool-versions`, `mise.toml`, `uv.lock`, `pyproject.toml`, `requirements*.txt`, and `package.json` | No | |
| `working-directory` | Directory where `prek run` is executed | No | `.` |
| `show-verbose-logs` | Print the `prek` verbose log after `prek run` completes | No | `true` |
| `token` | Deprecated and unused; retained for backward compatibility | No | `''` |

## Version Resolution

`prek-action` resolves the version to install in this order:

1. `prek-version` when it is set to anything other than `latest`
2. `version-file`
3. Auto-detected `.tool-versions`
4. Latest stable release from the version manifest

Auto-detection checks `working-directory` first, then `GITHUB_WORKSPACE` when it is different.

`version-file` is explicit and fails hard when the file does not exist, is malformed, or does not contain a `prek` version. It cannot be combined with an explicit `prek-version`. Relative `version-file` paths are resolved from `working-directory`.

`minimum_prek_version` in `prek.toml` or pre-commit YAML remains a runtime constraint enforced by `prek` itself. It is not used as an action-level version source.

Supported `version-file` formats:

| File | Extracted value |
| --- | --- |
| `.tool-versions` | `prek <version>` |
| `mise.toml` | `[tools].prek` or `[tools.prek].version` |
| `uv.lock` | `[[package]] name = "prek"` version |
| `pyproject.toml` | `[tool.prek].version`, `[dependency-groups]`, or `[project.optional-dependencies]` |
| `requirements*.txt` | `prek==X.Y.Z` or other supported PEP 508 specifiers |
| `package.json` | `dependencies["@j178/prek"]` or `devDependencies["@j178/prek"]` |

## Outputs

| Output         | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `prek-version` | The resolved `prek` version, normalized to a `v`-prefixed tag |
| `cache-hit` | Whether the restored prek cache exactly matched the computed primary cache key |

## Examples

Install and run against all files:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v2
```

Pass extra arguments:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v2
    with:
      extra-args: "--all-files --directory packages/"
```

Pin a specific `prek` version:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v2
    with:
      prek-version: "0.2.30"
```

Resolve a semver range:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v2
    with:
      prek-version: "0.3.x"
```

Auto-detect from `.tool-versions`:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v2
```

With a repository `.tool-versions` entry such as:

```text
prek 0.3.5
```

Use an explicit `version-file`:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v2
    with:
      version-file: uv.lock
```

Install only:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v2
    with:
      install-only: true
  - run: prek run --show-diff-on-failure --color=always --all-files
```

Disable verbose log output after the run:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v2
    with:
      show-verbose-logs: false
```

## Requirements

The target repository needs a `prek` or pre-commit configuration file:

- `prek.toml`
- `.pre-commit-config.yaml`
- `.pre-commit-config.yml`

## Contributing

For contributor setup, testing, bundling, and release steps, see [CONTRIBUTING.md](CONTRIBUTING.md).

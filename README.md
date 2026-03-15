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
      - uses: j178/prek-action@v1
```

`prek` is always invoked as:

```text
prek run --show-diff-on-failure --color=always <extra-args>
```

## Inputs

| Input | Description | Required | Default |
| --- | --- | --- | --- |
| `extra-args` | Additional arguments appended to `prek run --show-diff-on-failure --color=always` | No | `--all-files` |
| `extra_args` | Deprecated alias for `extra-args` | No | |
| `install-only` | Install `prek` but skip `prek run` | No | `false` |
| `prek-version` | Version to install, for example `0.2.30` or `latest` | No | `latest` |
| `show-verbose-logs` | Print the `prek` verbose log after `prek run` completes | No | `true` |
| `working-directory` | Directory where `prek run` is executed | No | `.` |
| `token` | Unused; retained for backward compatibility | No | `${{ github.token }}` |

## Outputs

| Output | Description |
| --- | --- |
| `prek-version` | The resolved `prek` version, normalized to a `v`-prefixed tag |

## Examples

Install and run against all files:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v1
```

Pass extra arguments:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v1
    with:
      extra-args: '--all-files --directory packages/'
```

Pin a specific `prek` version:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v1
    with:
      prek-version: '0.2.30'
```

Install only:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v1
    with:
      install-only: true
  - run: prek run --show-diff-on-failure --color=always --all-files
```

Disable verbose log output after the run:

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: j178/prek-action@v1
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

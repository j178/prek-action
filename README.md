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
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: j178/prek-action@5337cb91e0fa35a7ff31b9ca345126d8bbbcdf16 # v2.0.6
```

`prek` is always invoked as:

```text
prek run --show-diff-on-failure --color=always <extra-args>
```

## Version Tags

For v2 and earlier releases, major and minor tags such as `v2` and `v2.0` are moving tags. Starting with v3, major and minor tags are no longer published. Always use an exact version such as `j178/prek-action@v3.0.0`; for stronger protection against supply-chain attacks, pin to a full commit SHA.

## Inputs

| Input | Description | Required | Default |
| --- | --- | --- | --- |
| `extra-args` | Additional arguments appended to `prek run --show-diff-on-failure --color=always` | No | `--all-files` |
| `extra_args` | Deprecated alias for `extra-args` | No | |
| `prek-version` | Version or semver range to install, for example `0.2.30`, `0.3.x`, `<=1.0.0`, or `latest` | No | `latest` |
| `checksum` | SHA-256 checksum of the release archive; overrides the bundled checksum | No | |
| `install-only` | Install `prek` but skip `prek run` | No | `false` |
| `working-directory` | Directory where `prek run` is executed | No | `.` |
| `show-verbose-logs` | Print the `prek` verbose log after `prek run` completes | No | `true` |
| `cache` | Cache the prek environment between workflow runs | No | `true` |
| `token` | Deprecated and unused; retained for backward compatibility | No | `''` |

## Outputs

| Output | Description |
| --- | --- |
| `prek-version` | The resolved `prek` version, normalized to a `v`-prefixed tag |
| `cache-hit` | Whether the restored prek cache exactly matched the computed primary cache key |

## Examples

Install and run against all files:

```yaml
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: j178/prek-action@5337cb91e0fa35a7ff31b9ca345126d8bbbcdf16 # v2.0.6
```

Pass extra arguments:

```yaml
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: j178/prek-action@5337cb91e0fa35a7ff31b9ca345126d8bbbcdf16 # v2.0.6
    with:
      extra-args: '--all-files --directory packages/'
```

Pin a specific `prek` version:

```yaml
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: j178/prek-action@5337cb91e0fa35a7ff31b9ca345126d8bbbcdf16 # v2.0.6
    with:
      prek-version: '0.2.30'
```

Verify a release archive by setting `checksum` to its SHA-256 digest from the
[prek releases](https://github.com/j178/prek/releases). Pin `prek-version` and use
the checksum for your runner's platform, architecture, and libc. For example, for
`0.5.6` on x86_64 Linux with GNU libc:

```yaml
with:
  prek-version: '0.5.6'
  checksum: 'b0c1a9fdaf0f379c1c2809481a1e1560a4a233777ecd3c38d3e7459d77a59398'
```

An explicit checksum overrides the bundled value when downloading `prek`. A
mismatch fails the action before extraction. If omitted or empty, the action uses
the bundled checksum when available and otherwise skips verification. If `prek` is
already in the runner's tool cache, it is reused without downloading or checking
the checksum.

Resolve a semver range:

```yaml
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: j178/prek-action@5337cb91e0fa35a7ff31b9ca345126d8bbbcdf16 # v2.0.6
    with:
      prek-version: '0.3.x'
```

Install only:

```yaml
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: j178/prek-action@5337cb91e0fa35a7ff31b9ca345126d8bbbcdf16 # v2.0.6
    with:
      install-only: true
  - run: prek run --show-diff-on-failure --color=always --all-files
```

Disable verbose log output after the run:

```yaml
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: j178/prek-action@5337cb91e0fa35a7ff31b9ca345126d8bbbcdf16 # v2.0.6
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

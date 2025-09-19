# Prek Action

A GitHub Action that runs pre-commit hooks using **prek** in your CI/CD pipeline.

## What is prek?

[**prek**](https://github.com/j178/prek) is a fast pre-commit hook runner that provides an alternative to the standard pre-commit framework. It offers better performance and caching capabilities for running code quality checks.

## Usage

### Basic Usage

```yaml
name: Prek checks
on: [push, pull_request]

jobs:
  prek:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: j178/prek-action@v1
```

### Custom Arguments

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: j178/prek-action@v1
    with:
      extra_args: '--all-files --directory packages/'
```

### Running Specific Hooks

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: j178/prek-action@v1
    with:
      extra_args: '--all-files mypy flake8 ruff'
```

### Specifying Prek Version

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: j178/prek-action@v1
    with:
      prek-version: '0.2.1'
      extra_args: '--all-files'
```

## Inputs

| Input          | Description                                | Required | Default       |
| -------------- | ------------------------------------------ | -------- | ------------- |
| `extra_args`   | Additional arguments to pass to `prek run` | No       | `--all-files` |
| `prek-version` | Version of prek to install (e.g., '0.2.1', 'latest') | No | `latest` |

## Requirements

Your repository must have a `.pre-commit-config.yaml` file configured for use with pre-commit hooks.

## License

This action is licensed under the MIT License. See [LICENSE](LICENSE) for details.

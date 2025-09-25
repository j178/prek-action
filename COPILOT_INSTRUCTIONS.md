# Copilot Instructions for prek-action

## Repository Overview

This repository contains a GitHub Action that runs pre-commit hooks using **prek**, a fast pre-commit hook runner that provides an alternative to the standard pre-commit framework with better performance and caching capabilities.

## Project Structure

- `action.yaml` - Main GitHub Action definition file with inputs, outputs, and steps
- `README.md` - User-facing documentation with usage examples
- `.github/workflows/ci.yaml` - CI pipeline that tests the action across multiple operating systems
- `.pre-commit-config.yaml` - Pre-commit configuration for this repository
- `LICENSE` - MIT license file

## Key Components

### GitHub Action Definition (`action.yaml`)

This is a **composite action** that:
1. Resolves the download URL for the specified prek version
2. Installs prek using platform-specific installers (shell script for Unix, PowerShell for Windows)
3. Sets up caching for prek cache directories
4. Runs prek with the specified arguments (unless `install-only` is true)

### Action Inputs

- `extra-args`: Additional arguments to pass to `prek run` (default: `--all-files`)
- `extra_args`: Deprecated version of `extra-args` (maintained for backward compatibility)
- `install-only`: Only install prek without running it (default: `false`)
- `prek-version`: Version of prek to install (default: `latest`)
- `working-directory`: Directory to run prek in (default: `.`)

### Action Behavior

- Supports all major operating systems (Linux, macOS, Windows)
- Uses different installation methods per platform
- Implements intelligent caching based on OS, architecture, and `.pre-commit-config.yaml` hash
- Only runs prek if `install-only` is false
- Passes through additional arguments to prek

## Development Guidelines

### Making Changes

1. **Action Definition**: Modify `action.yaml` for changes to inputs, steps, or behavior
2. **Documentation**: Update `README.md` to reflect any changes in usage or inputs
3. **Testing**: The CI workflow tests the action across Ubuntu, Windows, and macOS

### Testing

- The repository uses a simple CI workflow that runs the action on multiple OS platforms
- The action is tested by actually executing it (self-testing approach)
- No unit tests are present - testing is done through integration testing

### Pre-commit Hooks

The repository uses its own pre-commit configuration with basic hooks:
- `trailing-whitespace` - Removes trailing whitespace
- `end-of-file-fixer` - Ensures files end with a newline
- `check-yaml` - Validates YAML syntax

### Version Management

- The action supports both `latest` and specific version tags for prek installation
- Version strings are normalized (removes/adds `v` prefix as needed)
- Uses GitHub releases API to fetch the appropriate installer

### Caching Strategy

The action implements caching for prek's cache directories:
- Cache key includes OS, architecture, and hash of `.pre-commit-config.yaml`
- Cached paths: `~/.cache/prek` (Unix) and `~\AppData\Local\prek` (Windows)
- Caching is skipped when `install-only` is true

## Important Notes

- **Backward Compatibility**: The `extra_args` input is deprecated but still supported
- **Platform Support**: Different installation scripts for Unix-like systems vs Windows
- **Error Handling**: The action shows diff on failure and uses colored output
- **Working Directory**: All prek operations respect the `working-directory` input

## Related Projects

- [prek](https://github.com/j178/prek) - The underlying pre-commit hook runner
- [pre-commit](https://pre-commit.com/) - The standard pre-commit framework that prek replaces

## Branding

The action uses:
- Icon: `git-commit`
- Color: `orange`

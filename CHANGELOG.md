# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows semantic versioning.

## [Unreleased]

## [2.0.1] - 2026-06-22

### Added

- Added automated tests for provider resolution and CLI argument parsing using the native Node.js test runner.
- Added `npm test`, `npm run check:syntax`, and `npm run ci` development and validation commands.
- Added a GitHub Actions CI workflow for pushes and pull requests.
- Added an automatic GitHub Release workflow for semantic version tags.
- Added release tag and `package.json` version matching validation.
- Added automatic AppImage, Debian package, and `tar.gz` builds with `SHA256SUMS.txt` checksums.
- Added an About window to the tray with application, runtime component, platform, and provider information.
- Added Z.ai as a supported assistant across runtime configuration, Linux launchers, Flatpak metadata, and documentation.
- Added Gemini as a supported assistant across runtime configuration, Linux launchers, and Flatpak metadata.
- Added a generic AI Desktop Hub launch mode for starts without `--app=<assistant>`.
- Added an initial chooser window labeled `Elegi un Asistente` for first use in generic mode.
- Added persistence for the last assistant selected in generic mode.
- Added assistant switching from the tray menu in generic mode.
- Added assistant-specific Debian desktop entries and Debian install/remove scripts.

### Changed

- Reorganized the source tree to keep main-process, preload, assets, and packaging concerns cleaner and easier to maintain.
- Standardized Linux icon assets under `assets/icons` and clarified the split between packaging icons and runtime assistant icons.
- Kept AI Desktop Hub branding for taskbar, tray, and window identity when the app is launched without an explicit assistant.
- Preserved assistant-specific launch behavior when the app is started with `--app=<assistant>`.
- Improved Gemini navigation handling so Google consent and related internal pages stay inside the embedded app flow.
- Updated packaging metadata, release documentation, and Linux release structure for public distribution.
- Updated release process documentation for tag-triggered releases, artifact installation, and checksum verification.

### Removed

- Removed legacy Linux-unused icon formats from the repository release flow.

### Notes

- Releases are created from semantic version tags such as `v2.0.1`, not from commit messages.
- Pull requests run validation but never publish releases.

## [2.0.0] - 2026-04-11

### Added

- Initial public release baseline for the Linux-first Electron desktop wrapper.
- Support for ChatGPT, Claude, Grok, DeepSeek, and Qwen.
- Linux packaging targets for AppImage, Debian packages, and `tar.gz`.
- Flatpak metadata and launcher files in the repository.

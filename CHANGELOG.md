# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows semantic versioning.

## [Unreleased]

## [2.0.2] - 2026-06-24

### Added

- Added a pure, Electron-independent navigation module (`src/main/navigation.js`) that centralizes URL allowlist and login-domain logic for every provider.
- Added automated tests for navigation, hostname matching, and base-URL comparisons, covering the login flows of all supported providers.
- Added a centralized i18n string module (`src/main/i18n.js`) for main-process user-facing text.
- Added an `npm run lint` and `npm run lint:fix` command backed by ESLint 9, plus `npm run format` backed by Prettier.
- Added a Dependabot configuration to keep Electron, electron-builder, and GitHub Actions patched, with a focus on security labels.
- Added a `provider:state` IPC handler so the renderer can query the active provider and available assistants.
- Added a Content-Security-Policy meta tag to the assistant selector window.
- Added a Node 18/20/22 matrix to the CI workflow.

### Changed

- Enabled the renderer sandbox (`sandbox: true`) across the main, login, Claude auth popup, and assistant selector windows. The preload script is now self-contained with no local `require()` calls, which is required for sandboxing.
- Hardened all renderer windows: `nodeIntegration` disabled, `contextIsolation` and `webSecurity` enabled, and the dead `enableRemoteModule` option removed.
- DevTools are now disabled in production builds unless explicitly requested with `--devtools` or `FORCE_DEVTOOLS=1`, removing them from shipped binaries.
- Removed the redundant clipboard IPC handlers. Clipboard access now happens entirely in the sandboxed preload via `electron.clipboard`, eliminating a duplicated and unnecessary IPC path.
- Replaced the hash-based single-instance lock port with a deterministic per-provider port map to avoid collisions between providers.
- Cached base64 provider icons and tray menu icons to avoid repeated synchronous filesystem reads.
- Extracted the About and assistant selector windows from inline HTML template literals into standalone HTML files (`src/windows/`) rendered through a small template helper with HTML escaping.
- Unified the duplicated main-window toggle logic in the tray into a single `toggleVisibleWindow` helper.
- Unified the Linux release build into a single electron-builder invocation that produces AppImage, `.deb`, and `tar.gz` in one pass.
- Promoted ESLint and Prettier to run as part of `npm run ci`.
- Updated the assistant selector HTML to load through the shared template renderer.

### Security

- Upgraded `electron-builder` to `^26`, resolving five high-severity advisories in transitive dependencies (`app-builder-lib`, `dmg-builder`, `electron-builder-squirrel-windows`) plus the `tmp` path traversal advisory. `npm audit` now reports zero vulnerabilities.
- Reduced the IPC surface exposed to the renderer to only `dialog:show` and `provider:state`.

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

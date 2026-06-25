<p align="center">
  <img src="assets/icons/providers/aidesktophub.png" alt="AI Desktop Hub" width="96" height="96">
</p>

<h1 align="center">AI Desktop Hub</h1>

<p align="center">
  <strong>Version 2.0.2</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-41.1.0-47848F?logo=electron&logoColor=white" alt="Electron 41.1.0">
  <img src="https://img.shields.io/badge/Node.js-20.19+-339933?logo=nodedotjs&logoColor=white" alt="Node.js 20.19+">
  <img src="https://img.shields.io/badge/Linux-AppImage%20%7C%20.deb%20%7C%20tar.gz-FCC624?logo=linux&logoColor=black" alt="Linux AppImage .deb tar.gz">
  <img src="https://img.shields.io/badge/Assistants-7%20providers-7C3AED" alt="7 supported AI assistants">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

<p align="center">
  Linux-first Electron desktop wrapper for popular AI assistants
</p>

<p align="center">
  Standalone launchers · Isolated sessions · Generic AI Desktop Hub mode · AppImage / .deb / tar.gz
</p>

## Overview

AI Desktop Hub turns supported AI web apps into standalone Linux desktop applications with isolated Electron sessions, Linux packaging, and a generic launcher mode for users who want to choose an assistant at runtime.

## Supported Assistants

<table width="100%">
  <tr>
    <td align="center" width="14.28%">
      <img src="assets/icons/providers/chatgpt.png" alt="ChatGPT" width="48" height="48"><br>
      <strong>ChatGPT</strong>
    </td>
    <td align="center" width="14.28%">
      <img src="assets/icons/providers/claude.png" alt="Claude" width="48" height="48"><br>
      <strong>Claude</strong>
    </td>
    <td align="center" width="14.28%">
      <img src="assets/icons/providers/gemini.png" alt="Gemini" width="48" height="48"><br>
      <strong>Gemini</strong>
    </td>
    <td align="center" width="14.28%">
      <img src="assets/icons/providers/grok.png" alt="Grok" width="48" height="48"><br>
      <strong>Grok</strong>
    </td>
    <td align="center" width="14.28%">
      <img src="assets/icons/providers/deepseek.png" alt="DeepSeek" width="48" height="48"><br>
      <strong>DeepSeek</strong>
    </td>
    <td align="center" width="14.28%">
      <img src="assets/icons/providers/qwen.png" alt="Qwen" width="48" height="48"><br>
      <strong>Qwen</strong>
    </td>
    <td align="center" width="14.28%">
      <img src="assets/icons/providers/zai.png" alt="Z.ai" width="48" height="48"><br>
      <strong>Z.ai</strong>
    </td>
  </tr>
</table>

## Highlights

- Standalone Linux desktop wrapper for multiple AI assistants
- Isolated Electron session data per assistant
- Direct launch support through `--app=<assistant>`
- Generic `AIDesktopHub` launcher mode when started without `--app`
- First-run chooser window labeled `Elegi un Asistente`
- Remembers the last assistant used in generic mode
- Assistant switching from the system tray in generic mode
- About window in the system tray with application and runtime component versions
- AI Desktop Hub branding for taskbar, tray, and window icon in generic mode
- Assistant-specific launchers, icons, and runtime identity when launched directly
- Linux packaging for `AppImage`, `.deb`, and `tar.gz`

## Quick Start

Install dependencies:

```bash
git clone https://github.com/jgomezbau/AIDesktopHub.git
cd AIDesktopHub
npm install
```

Start AI Desktop Hub in generic mode:

```bash
npm start
```

Start a specific assistant directly:

```bash
npm run start:chatgpt
npm run start:claude
npm run start:gemini
npm run start:grok
npm run start:deepseek
npm run start:qwen
npm run start:zai
```

You can also launch directly with:

```bash
electron . --app=chatgpt
```

## How It Works

**Generic mode**

Use `npm start` or launch `AIDesktopHub` without `--app`.

- On first launch, or when no valid last assistant is stored, AI Desktop Hub opens a chooser window labeled `Elegi un Asistente`.
- Once an assistant is selected, AI Desktop Hub remembers it and reopens it automatically on future launches without `--app`.
- In this mode, the application identity stays as `AI Desktop Hub`.
- The taskbar icon remains the AI Desktop Hub icon.
- The tray icon remains the AI Desktop Hub icon.
- The active assistant can be changed from the tray menu through `Elegi un Asistente`.

**Direct-launch mode**

Use `--app=<assistant>` or `npm run start:<assistant>`.

- Opens the requested assistant immediately
- Does not show the generic chooser flow
- Does not show the assistant-switching tray submenu
- Uses the selected assistant identity and icon as the runtime branding

## Requirements

- Linux
- Node.js 20.19 or newer
- npm 10 or newer

Runtime and packaging on Debian-based systems may require:

- `libnotify4`
- `libxtst6`
- `libnss3`

## Development

Useful commands:

```bash
npm run dev
npm run debug
npm test
npm run check:syntax
npm run lint
npm run lint:fix
npm run format
npm run ci
```

The test suite uses the native Node.js test runner and covers provider resolution, command-line argument parsing, and the navigation/URL-allowlist logic that drives every provider's login flow. `npm run lint` runs ESLint and `npm run format` formats the codebase with Prettier. `npm run ci` performs syntax checks, lint, tests, and validates an unpacked application build.

DevTools are disabled in production builds by default. To enable them during local development, pass `--devtools` or set `FORCE_DEVTOOLS=1`:

```bash
npm run dev -- --devtools
```

## Build And Packaging

Available build commands:

```bash
npm run build
npm run build:linux
npm run build:dir
npm run build:appimage
npm run build:deb
```

Release artifacts are written to `dist/` and typically include:

- `AI Desktop Hub-<version>-x86_64.AppImage`
- `AI Desktop Hub-<version>-amd64.deb`
- `AI Desktop Hub-<version>-x64.tar.gz`

Packaging notes:

- `electron-builder` is configured for Linux packaging.
- The main packaging icon is [`assets/icons/aidesktophub.png`](assets/icons/aidesktophub.png).
- Runtime and launcher assistant icons live in [`assets/icons/providers`](assets/icons/providers).
- The Debian package installs the main `AIDesktopHub.desktop` entry plus assistant-specific `.desktop` launchers.

## Release Automation

GitHub Actions validates pushes and pull requests with syntax checks, lint, automated tests, and an unpacked build across Node 20 and 22. Pull requests never publish releases.

Releases are triggered only by semantic version tags such as `v2.0.2`. The release workflow verifies that the tag matches the version in `package.json`, builds the AppImage, Debian package, and `tar.gz` in a single pass, generates `SHA256SUMS.txt`, and attaches all four artifacts to the GitHub Release. Commit messages do not trigger releases.

For Debian and Ubuntu, install the `.deb` package. On other Linux distributions, use the AppImage or extract the `tar.gz` archive.

After downloading the release files, verify their integrity from the same directory:

```bash
sha256sum --check SHA256SUMS.txt
```

## Project Structure

```text
.
├── assets/
│   ├── icons/
│   │   ├── aidesktophub.png
│   │   ├── providers/
│   │   └── source/
│   └── linux/
├── .github/
│   ├── workflows/
│   └── dependabot.yml
├── src/
│   ├── main/        # index, apps, ipc, navigation, runtime-flags, templates, i18n
│   ├── preload/     # self-contained sandboxed preload
│   └── windows/     # HTML templates for the About and selector windows
├── test/
├── CHANGELOG.md
├── LICENSE
├── README.md
├── package.json
└── package-lock.json
```

## Icons And Assets

- `assets/icons/aidesktophub.png` is the canonical packaging icon.
- `assets/icons/providers/*.png` are the assistant runtime icons and launcher assets.
- `assets/icons/providers/aidesktophub.png` is the generic runtime icon used by the generic AI Desktop Hub mode.
- Legacy `.ico` assets are not part of the current Linux release pipeline.

## Session Model

Each assistant uses its own Electron partition and user-data directory. This keeps cookies, storage, and login state isolated between ChatGPT, Claude, Gemini, Grok, DeepSeek, Qwen, and Z.ai.

In generic mode, AI Desktop Hub also stores a small separate configuration file for the last assistant used:

- `~/.config/AIDesktopHub/config.json`

That file is only used to remember the last assistant selected in generic mode. It does not replace or mix with the per-assistant session data.

## Troubleshooting

- If `npm start` opens the chooser window, no valid last assistant is stored yet for generic mode.
- If you want to bypass the chooser entirely, start the app with `--app=<assistant>` or use `npm run start:<assistant>`.
- If Gemini shows a Google consent flow, complete it inside the embedded window. AI Desktop Hub keeps the relevant Gemini and Google navigation inside the app flow.
- If `.deb` packaging fails, verify the host has the system tooling required by `electron-builder`.
- If AppImage creation fails on a minimal system, install the usual Linux desktop packaging dependencies first.

## License

This project is released under the [MIT License](LICENSE).

## Disclaimer

AI Desktop Hub is an independent and unofficial desktop wrapper project.

It is not affiliated with, endorsed by, sponsored by, or supported by the companies behind the supported assistants, including:

- OpenAI
- Anthropic
- Google
- xAI
- DeepSeek
- Alibaba
- Zhipu AI

`ChatGPT`, `Claude`, `Gemini`, `Grok`, `DeepSeek`, `Qwen`, `Z.ai`, and any related product names, logos, icons, and trademarks are the property of their respective owners.

This repository is intended to provide a Linux desktop wrapper experience for publicly available web applications. Users are responsible for complying with the terms of service, account requirements, and usage policies of each respective service.

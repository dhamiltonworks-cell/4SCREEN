# FourScreen Release Guide

This document explains how to build, package, and publish **FourScreen** (application name: **4SCREEN**) for public distribution.

## Application metadata

| Field | Value |
|-------|-------|
| Product name | FourScreen |
| Application name | 4SCREEN |
| Version | 1.0.6 |
| Description | View multiple websites, streams, dashboards, and tools simultaneously. |

## Prerequisites

- **Node.js** 20+ recommended
- **npm** 10+
- **macOS** — required to build signed/unsigned `.dmg` installers locally
- **Windows** — required to build `.exe` NSIS installers locally (or use CI)

Install dependencies once:

```bash
npm install
```

## Build commands

### Compile the app (required before packaging)

```bash
npm run build
```

This compiles Electron main/preload TypeScript, bundles the renderer shell, and copies static assets into `dist/`.

### Create production installers

Build for the **current platform**:

```bash
npm run dist
```

Platform-specific:

```bash
npm run dist:mac   # macOS .dmg (x64 + arm64)
npm run dist:win   # Windows .exe installer (x64)
```

### Other useful checks

```bash
npm run typecheck
npm run compile
npm run lint
```

### Run locally (development)

```bash
npm run dev
```

### Run the compiled app without packaging

```bash
npm run build
npm start
```

## Output locations

All installers and packaged apps are written to:

```text
release/
```

Typical artifacts:

| Platform | Example filename |
|----------|------------------|
| macOS (Apple Silicon) | `release/FourScreen-1.0.6-mac-arm64.dmg` |
| macOS (Intel) | `release/FourScreen-1.0.6-mac-x64.dmg` |
| Windows | `release/FourScreen-1.0.6-win-x64.exe` |

During packaging, electron-builder also creates intermediate folders under `release/` (for example `release/mac-arm64/FourScreen.app`).

## Application icons

Placeholder icons live in:

```text
build/icons/
  icon.png    # Master 1024×1024 PNG
  icon.icns   # macOS icon
  README.md   # How to replace icons for production
```

Replace `build/icons/icon.png` with your final artwork before a polished public launch, then regenerate `.icns` (see `build/icons/README.md`).

Windows builds use `icon.png`; electron-builder converts it during packaging. For best Windows results, add a multi-size `build/icons/icon.ico` and set `build.win.icon` in `package.json`.

## macOS notes

- Installers built without an Apple Developer ID are **unsigned**. Users may need to right-click → Open the first time.
- For notarized public distribution, configure code signing and notarization in `package.json` → `build.mac` (not included in this release prep).

## Windows notes

- Building Windows installers on macOS may require additional tooling depending on your environment. The most reliable approach is to run `npm run dist:win` on a Windows machine or in GitHub Actions.
- NSIS installer options (install directory, shortcuts) are configured under `build.nsis` in `package.json`.

## Upload a GitHub release

1. Tag the release:

```bash
git tag v1.0.3
git push origin v1.0.3
```

2. Build installers on each target platform (or CI):

```bash
npm run dist:mac
npm run dist:win
```

3. Create the GitHub release:

```bash
gh release create v1.0.3 \
  release/FourScreen-1.0.3-mac-arm64.dmg \
  release/FourScreen-1.0.3-mac-x64.dmg \
  release/FourScreen-1.0.3-win-x64.exe \
  --title "FourScreen 1.0.3" \
  --notes "Quick Launch tile management: right-click menu (Open, Edit, Delete), hover trash delete with confirmation, edit custom tiles, compact homepage with sports/streaming defaults, one-click loading overlay, and stability fixes."
```

Or use the GitHub website: **Releases → Draft a new release → attach files from `release/`**.

## What gets packaged

electron-builder includes:

- Compiled `dist/` output (main process, preload, renderer shell)
- `package.json` metadata
- Electron runtime

User data (saved panel URLs, history, sessions, homepage tiles) is **not** bundled; it is stored at runtime in the OS app data directory.

## Troubleshooting

| Issue | Suggestion |
|-------|------------|
| `dist` fails on macOS with signing errors | Build unsigned locally; add signing only for store/notarized releases |
| Windows build fails on macOS | Run `npm run dist:win` on Windows or CI |
| App opens blank | Run `npm run build` before `npm run dist` |
| Icon not updating | Replace files in `build/icons/` and rebuild |

## Changelog

### 1.0.6

- **Add Tile modal UI** — Centered overlay with high z-index and dimmed blurred backdrop so the Quick Launch add/edit dialog stays visible above shell content (UI-only; no interaction logic changes)

### 1.0.5

- **Stability rollback** — Restores v1.0.3 interaction behavior by removing post-1.0.3 hover/pointer sync, modal overlay layering, and Clear-panel interaction refresh experiments that caused UI regressions
- Includes all v1.0.3 Quick Launch features: tile management, one-click loading, compact homepage, and collapsible history

### 1.0.4

- **Add/Edit tile modal overlay** — Quick Launch add/edit dialog always appears centered above all panels and webviews with dimmed blurred backdrop (superseded by 1.0.5 rollback)

### 1.0.3

- **Quick Launch tile management** — Right-click any tile for Open, Edit (custom tiles), Delete, and Cancel
- **Hover trash delete** — Small corner trash icon on hover with confirmation before removal
- **Built-in tile removal** — Hides preset tiles per user; stays hidden after restart
- **Custom tile editing** — Change name and URL for user-added tiles; persisted locally
- **Custom tile deletion** — Permanently removes custom tiles from saved storage
- **Compact Quick Launch** — Smaller tiles, collapsible history, priority-ordered defaults for sports/streaming/gaming
- **One-click loading** — Homepage hides instantly with loading indicator when a tile is clicked
- **Homepage scroll fix** — No scrollbar unless tile count exceeds visible area

### 1.0.2

- **Homepage Quick Launch** — Built-in preset tiles on every empty panel for one-click loading
- **Custom homepage icons (+)** — Add unlimited custom tiles with site name and URL; persisted locally across restarts
- **Homepage icon removal** — Right-click any tile (preset or custom) to remove; removals persist
- **Homepage layout polish** — Empty panels prioritize Quick Launch visibility with tighter control chrome and centered grid
- **Audio Lock improvements** — Audio Lock available on all four screens; lock/focus/hover priority preserved; lock follows panel when moved
- **Panel movement controls** — Compact D-pad swaps panel positions without reload; preserves sites, tabs, history, sessions, audio lock, and focus
- **Fullscreen fixes** — Panel HTML video fullscreen contained to panel; native window maximize/fullscreen no longer blocked by page fullscreen events
- **Cursor inactivity fixes** — Cursor auto-hides after 5 seconds of inactivity; resyncs after navigation and movement
- **Control center improvements** — Thinner reveal zone, compact D-pad movement control, denser empty-panel chrome

### 1.0.1

- Native macOS fullscreen support
- Menu bar and Dock hidden during fullscreen
- Green macOS fullscreen button enabled
- Proper fullscreen enter/exit behavior
- Focus Mode, Audio Mode, and panel video fullscreen unchanged

### 1.0.0

- Initial public release of FourScreen

## Version bumps

1. Update `"version"` in `package.json`
2. Run `npm run dist`
3. Tag and publish a new GitHub release with the new installer files

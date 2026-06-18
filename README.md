# FourScreen

FourScreen is an Electron desktop app that runs **four fully independent browser instances** in a single 2×2 window.

Each panel uses its own persistent Electron session (`persist:fourscreen-panel-N`), so cookies, logins, and navigation are isolated per screen.

## Features

- Four real `WebContentsView` browser panels (not iframes)
- 2×2 grid layout with auto-hiding per-panel controls
- Independent sessions and navigation per panel
- Persistent URLs stored in the app user-data directory
- Fullscreen HTML5 video support per panel
- Works with ChatGPT, Facebook, X, Gmail, Reddit, YouTube, TradingView, and any normal website

## Development

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — build and launch Electron
- `npm run build` — compile TypeScript and copy renderer assets
- `npm run typecheck` — TypeScript validation
- `npm run lint` — ESLint

## Architecture

- `electron/main.ts` — main process, panel layout, IPC, persistence
- `electron/preload.ts` — secure bridge for the control shell
- `renderer/` — transparent control overlay UI
- `shared/` — shared types and URL helpers

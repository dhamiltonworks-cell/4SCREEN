# FourScreen (4SCREEN)

FourScreen is the initial MVP for **4SCREEN**: a dark, responsive, four-panel dashboard for loading independent websites or video/video links side by side.

This repository is intentionally separate from any Hermes workspace or bot project.

## Features

- Next.js, React, TypeScript, and Tailwind CSS
- Responsive 2×2 dashboard layout on large screens
- Four independent panels with their own URL state
- URL input with validation and normalization, so `youtube.com` becomes `https://youtube.com`
- YouTube, Vimeo, and Twitch URL transformation to embeddable player URLs when possible
- Load, refresh, focus/expand, open in new window, and clear controls per panel
- iframe-based loading for websites that allow embedding
- User-facing blocked iframe detection when a panel takes too long to load
- localStorage persistence for panel URLs
- Empty panel state: “Paste a website or video link to start.”
- Keyboard shortcuts:
  - `1`, `2`, `3`, `4` focus the matching panel
  - `Esc` exits focus mode

## iframe limitations

FourScreen loads panel content with browser iframes when a website allows it. Some sites intentionally block iframe embedding with security headers such as `X-Frame-Options` or Content Security Policy `frame-ancestors`. When that happens, the browser may show a blank panel, a refusal message, or a console error. This is expected browser security behavior and cannot be bypassed safely from the client app.

If a site blocks embedding, FourScreen shows a panel warning after the iframe appears to stall. Use the panel’s **Open** button to launch the original link in a new browser window or tab.

## Getting started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build and checks

Create a production build:

```bash
npm run build
```

Run TypeScript checks:

```bash
npm run typecheck
```

Run linting:

```bash
npm run lint
```

## Project structure

```text
app/
  globals.css
  layout.tsx
  page.tsx
components/
  FourScreenDashboard.tsx
lib/
  url.ts
README.md
```

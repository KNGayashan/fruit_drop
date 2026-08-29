# AR Fruit Catcher

A single-page browser game. Move an on-screen basket by moving a colored rectangle in front of the webcam (tracked via color detection), catch falling fruit for points, and avoid bombs. Nearly everything about the game — timing, scoring, difficulty, the tracked color, the fruit/bomb/brand roster, and core images — is configurable live from an admin dashboard, no code changes required.

## Features

- Real-time color-object tracking via webcam — no keyboard/mouse controls
- Timed rounds with ramping difficulty (fruit falls faster and bombs appear more often as time runs out)
- Score popups, beep sound effects (synthesized with the Web Audio API — no audio files), and a countdown before each round
- Global leaderboard with per-brand and per-screen-size breakdowns
- Multi-brand support: players pick a brand before playing, each with its own falling items and score icon
- Admin dashboard for editing every setting above, plus brands/items (with image upload) — see [backend/README.md](backend/README.md)

## Running the game

The frontend has no build system or package manager — [index.html](index.html), [styles.css](styles.css), and [script.js](script.js) are plain static files. The backend (below) now serves them itself, same origin as its API, so there's just one thing to run:

```
cd backend
npm install
cp .env.example .env   # then set a real JWT_SECRET (see backend/README.md)
npm start
```

Then visit `http://localhost:3000/` and grant camera permission when prompted (webcam access requires a secure context — `http://localhost` is exempt, but a real deployment needs `https://`).

Or run it containerized — see [HOW_TO_RUN.md](HOW_TO_RUN.md#running-with-docker) for the Docker/`docker-compose` setup (defaults to port 3004, with the SQLite DB and uploaded images persisted via named volumes).

### Backend (config + leaderboard + admin)

The game fetches its entire configuration — not just the leaderboard — from the same Node/Express + SQLite API in [backend/](backend/) that serves it. It must be running for the game to reflect any admin-made changes (it falls back to built-in defaults and an empty leaderboard if the API isn't reachable).

Admin dashboard: `http://localhost:3000/admin/`. On first visit you'll be prompted to create the one admin account — no shared/default credentials. From there:
- **Game Settings** — round duration, scoring/difficulty curve, item speed & spawn timing, basket/canvas size, tracked color + tolerances, tracking sensitivity, audio tones, core UI images, and branding (location name/logo, typed game name, colors).
- **Brands** — add/edit/remove brands, each with its own logo and score icon.
- **Items** — the fruits/bombs that fall during play: image, points (negative = penalty item), spawn weight, and which brand(s) it belongs to.
- **Leaderboard** — scores, stats, screen-size breakdown, per-brand filtering, and a reset button.

## Controls

Hold up the configured color (`#34C4A3`/teal by default) in front of the webcam — the basket follows it. Catch fruit for points; avoid bombs, which cost points. Exact point values, and which items exist, are set per-brand from the admin dashboard.

## Tech stack

- Frontend: vanilla HTML/CSS/JS, no frameworks or build step
- Backend: Node/Express + SQLite (`node:sqlite`, no native compilation needed)
- [MediaPipe camera_utils](https://developers.google.com/mediapipe) (via CDN) for webcam frame capture
- Plain HSV color thresholding (no ML model) for object tracking
- HTML5 Canvas for rendering
- Web Audio API for sound effects

## Development notes

The input method went through a few iterations: it started as MediaPipe hand-landmark tracking, was prototyped with color-blob tracking for a dark green box and then a black square, and now tracks an admin-configurable color via HSV thresholding (see [script.js](script.js)'s `isTargetColor`/`CONFIG.targetColor`, and [CLAUDE.md](CLAUDE.md) for the current architecture breakdown). The tracked color and matching tolerance are tuned from the admin dashboard's Settings tab, not in code.

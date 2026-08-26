# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page browser game: "AR Fruit Catcher". The player moves an on-screen basket by moving a physical colored rectangle in front of the webcam (tracked via plain RGB/HSV color-blob detection), catching falling fruit for points and avoiding bombs. The frontend has no build system or package manager — markup lives in [index.html](index.html), styles in [styles.css](styles.css), and all game logic in [script.js](script.js). A separate Node/Express + SQLite backend in [backend/](backend/) is the source of truth for almost everything about the game (timing, scoring, difficulty, color tracking, the item/brand roster, core UI images) plus the leaderboard, and powers an admin dashboard for editing all of it; see [backend/README.md](backend/README.md).

## Running the game

There is no build/lint/test tooling for the frontend. To run it, serve the directory over HTTP and open it in a browser (opening the file directly via `file://` will likely break webcam access, which requires a secure context):

```
python -m http.server 8000
```

then visit `http://localhost:8000/index.html`. Camera permission must be granted for tracking to work.

The backend (see [backend/README.md](backend/README.md)) must also be running — the game fetches its entire config (not just the leaderboard) from it on load. If the backend is unreachable, the game falls back to built-in defaults in `script.js` (kept identical to the backend's seed data) so it still runs standalone, just without live leaderboard/admin edits.

```
cd backend
npm install
cp .env.example .env   # then set a real JWT_SECRET — server.js throws on startup without one
npm start               # or `npm run dev` for --watch
```

API on `http://localhost:3000`, admin dashboard at `http://localhost:3000/admin/` (first visit prompts you to create the one admin account).

There are no automated tests, linters, or build steps to run.

## Architecture

[index.html](index.html) is a thin shell that links [styles.css](styles.css) and loads [script.js](script.js) (plus the MediaPipe `camera_utils` CDN script, used only for its `Camera` webcam-frame helper) at the bottom of `<body>`. There's no module system — all functions and state in `script.js` are global. `#brandSelect` starts empty in the HTML and is populated entirely by JS once brand data loads.

Key pieces, in the order they appear in [script.js](script.js):

- **Config loading**: `init()` (called once, at the bottom of the file) awaits `loadRemoteConfig()`, which fetches `GET {API_BASE}/api/config` and merges the response into module-level `CONFIG`/`BRANDS`/`ITEMS`, falling back to `DEFAULT_CONFIG`/`DEFAULT_BRANDS`/`DEFAULT_ITEMS` (mirrors the backend's seed data) on fetch failure. Everything else — canvas setup, asset loading, camera/tracking startup, the draw loop — only starts after this resolves, so there's no risk of the game initializing with half-loaded config.
- **Asset loading**: `images` is a plain object populated via `loadImg(name, src)`, which runs each path through `resolveAssetUrl()` — paths starting with `/uploads/` (admin-uploaded images) get prefixed with the backend's origin since they're served cross-origin from the game's own static server; bare relative paths (e.g. `img/apple.png`, the seeded defaults) are left alone since they're same-origin with the game. Draw calls always guard on `img.complete` since loads are async and unawaited.
- **Object tracking pipeline**: a MediaPipe `Camera` instance pushes webcam frames to `trackObject()`, which draws each frame to a small offscreen canvas (`trackCanvas`, sized from `CONFIG.trackingCanvasWidth/Height`) and scans its pixels for a match against `CONFIG.targetColor` (converted to a target hue via `hexToHue()`) within `CONFIG.colorHueToleranceDeg`/`colorSaturationMin`/`colorValueMin` in HSV space (`isTargetColor`). The centroid of matching pixels is lerped into `basket.x`/`basket.y` every frame using `CONFIG.trackingEasing` — this is the only input method (no keyboard/mouse basket control). Tracking is plain HSV thresholding, not an ML model.
- **Game state**: top-level `let` variables (`basket`, `score`, `timeLeft`, `gameActive`, `items`, `floatingTexts`, `selectedBrand`) hold all mutable game state; there's no state container/store.
- **Game loop**: `draw()` is a `requestAnimationFrame` loop that always runs (even before a game starts) to keep the background/basket rendered; it only advances items/collisions/floating text while `gameActive` is true. Collision detection, scoring, and item cleanup all happen inline inside this loop's `items.forEach`. Scoring is `score = Math.max(0, score + item.points)` — `item.points` comes from the admin-configured item (positive or negative), there's no hardcoded +10/-20 anymore.
- **Spawning**: `spawnItem()` self-schedules via `setTimeout` (not `setInterval`) and derives spawn rate/item speed from a `difficulty` value computed from remaining `timeLeft` against `CONFIG.roundDurationSec`. Each spawn: `itemsForBrand(selectedBrand)` builds the roster (items where `item.brand === selectedBrand` OR `item.brand === null`, i.e. "global" items like the shared bomb spawn for every brand), splits it into good (`points >= 0`) / bad (`points < 0`) pools, picks good-vs-bad per `CONFIG.difficultyBadChanceBase/Ramp`, then `pickWeighted()` selects within that pool by each item's `weight`. Stops re-scheduling once `gameActive` is false.
- **Game flow**: `startGame()` runs a `CONFIG.countdownSec`-length countdown (via `setInterval` + beeps) then calls `initGame()`, which resets state, starts the spawn loop, and runs a 1-second timer countdown. When time runs out, it swaps `#overlay`'s innerHTML to a game-over/leaderboard view and re-invokes `startGame` via the "Play Again" button's inline `onclick`.
- **Brand selection**: `renderBrandSelect()` builds `#brandSelect`'s markup from `BRANDS` (fetched config, not hardcoded) and binds click handlers via `dataset.brand` rather than inline `onclick="selectBrand('bb')"` — brand keys are no longer baked into the HTML anywhere.
- **Leaderboard/persistence**: top scores are fetched/submitted via the [backend/](backend/) API (`getScores()` GETs `/api/scores/top?limit={CONFIG.leaderboardSize}`, `submitScore()` POSTs to `/api/scores` with the score plus `selectedBrand`, `window.screen` dimensions, and `navigator.userAgent`) rather than `localStorage`; entering a qualifying score uses a blocking `prompt()` for the player's name. `API_BASE` in script.js points at the backend's origin (`http://localhost:3000` by default). Rendered names are HTML-escaped (`escapeHtml`) since they come from a shared, multi-player data source.
- **Audio**: simple beep feedback (countdown ticks, catch/hit) is synthesized on the fly via the Web Audio API (`playBeep`), with frequencies/durations from `CONFIG.audio` — there are no audio asset files.
- **Canvas coordinate system**: `canvas.width` is set from `CONFIG.canvasWidth` and `canvas.height` from `window.innerHeight` once at load (inside `init()`, after config resolves) and never respond to window resize. `#game-wrapper` is separately fixed via CSS at 512x640px, so the canvas's internal drawing resolution and its displayed CSS box size are set independently and can diverge — game-object coordinates are computed in the JS-resolution space, not the CSS box's.

## Backend / admin-configurable everything

See [backend/README.md](backend/README.md) for the full API and data model. In short: `game_config` (one JSON blob covering timing/scoring/difficulty/tracking/audio/core-asset-paths), `brands`, and `items` (fruits and bombs — a single table; what makes something a "bomb" is just `points < 0`, and `brand = NULL` means the item spawns for every brand) all live in SQLite and are editable from the admin dashboard (`/admin/`, Settings/Brands/Items tabs), with image fields uploaded through the dashboard (`POST /api/admin/uploads`) rather than referencing files on disk. The game frontend has zero knowledge of any of this beyond the one `GET /api/config` fetch at load — adding a new fruit, retuning the tracked color, or standing up a new brand never requires a script.js change.

The SQLite file lives at `backend/data/scores.db` (gitignored); deleting it resets everything — leaderboard, admin account, and config/brands/items — back to the seeded defaults in [backend/db.js](backend/db.js) on next server start. [backend/server.js](backend/server.js) also mounts the root [img/](img/) folder at `/game-assets` (separate from `/uploads`) purely so the admin dashboard, running on a different origin/port, can render thumbnail previews for un-edited default items — the game frontend itself never requests `/game-assets`.

## Assets

Default images live in [img/](img/) and are referenced by relative path both in CSS (`content: url(...)`) and as seed data for `items`/`brands`/`game_config` in [backend/db.js](backend/db.js). Anything uploaded via the admin dashboard instead lives in `backend/uploads/` and is referenced by an absolute `/uploads/...` path. Adding a new fruit/brand/asset no longer means editing code — do it from `/admin/` instead; the `img/` seed data only matters for the backend's first-run defaults.

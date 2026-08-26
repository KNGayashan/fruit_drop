# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page browser game: "AR Fruit Catcher". The player moves an on-screen basket by moving a physical `#34C4A3`-colored rectangle in front of the webcam (tracked via plain RGB color-blob detection), catching falling fruit for points and avoiding bombs. There is no build system, no package manager, and no server-side code — markup lives in [index.html](index.html), styles in [styles.css](styles.css), and all game logic in [script.js](script.js).

## Running the game

There is no build/lint/test tooling in this repo. To run it, serve the directory over HTTP and open it in a browser (opening the file directly via `file://` will likely break webcam access, which requires a secure context):

```
python -m http.server 8000
```

then visit `http://localhost:8000/index.html`. Camera permission must be granted for tracking to work.

There are no automated tests, linters, or build steps to run.

## Architecture

[index.html](index.html) is a thin shell that links [styles.css](styles.css) and loads [script.js](script.js) (plus the MediaPipe `camera_utils` CDN script, used only for its `Camera` webcam-frame helper) at the bottom of `<body>`. There's no module system — all functions and state in `script.js` are global.

Key pieces, in the order they appear in [script.js](script.js):

- **Asset loading**: `images` is a plain object populated via `loadImg(name, src)`; draw calls always guard on `img.complete` since loads are async and unawaited.
- **Object tracking pipeline**: a MediaPipe `Camera` instance pushes webcam frames to `trackObject()`, which draws each frame to a small offscreen canvas (`trackCanvas`, 160x120) and scans its pixels for a match against `TARGET_COLOR` (`#34C4A3`) within `COLOR_DISTANCE` in RGB space (`isTargetColor`). The centroid of matching pixels is smoothly lerped into `basket.x`/`basket.y` every frame — this is the only input method (no keyboard/mouse basket control). Tracking is plain RGB thresholding, not an ML model; `TARGET_COLOR`/`COLOR_DISTANCE` may need retuning for different lighting or a different colored object.
- **Game state**: top-level `let` variables (`basket`, `score`, `timeLeft`, `gameActive`, `items`, `floatingTexts`) hold all mutable game state; there's no state container/store.
- **Game loop**: `draw()` is a `requestAnimationFrame` loop that always runs (even before a game starts) to keep the background/basket rendered; it only advances items/collisions/floating text while `gameActive` is true. Collision detection, scoring, and item cleanup all happen inline inside this loop's `items.forEach`.
- **Spawning**: `spawnItem()` self-schedules via `setTimeout` (not `setInterval`) and derives both spawn rate and item speed from a `difficulty` value computed from remaining `timeLeft`, so difficulty ramps up as the 60-second round progresses. It stops re-scheduling once `gameActive` is false.
- **Game flow**: `startGame()` runs a 3-2-1-GO countdown (via `setInterval` + beeps) then calls `initGame()`, which resets state, starts the spawn loop, and runs a 1-second timer countdown. When time runs out, it swaps `#overlay`'s innerHTML to a game-over/leaderboard view and re-invokes `startGame` via the "Play Again" button's inline `onclick`.
- **Leaderboard/persistence**: top-5 high scores are stored in `localStorage` under the key `arCatcherScores` as a JSON array of `{name, score}`, read/written by `getScores()`/`updateUI()`; entering a qualifying score uses a blocking `prompt()` for the player's name.
- **Audio**: simple beep feedback (countdown ticks, catch/hit) is synthesized on the fly via the Web Audio API (`playBeep`) — there are no audio asset files.
- **Canvas coordinate system**: `canvas.width`/`canvas.height` are set once in JS at load (500 and `window.innerHeight`, respectively) and never respond to window resize. `#game-wrapper` is separately fixed via CSS at 512x640px, so the canvas's internal drawing resolution and its displayed CSS box size are set independently and can diverge (e.g. on a viewport where `window.innerHeight` isn't 640) — game-object coordinates are computed in the JS-resolution space, not the CSS box's.

## Assets

All images live in [img/](img/) and are referenced by relative path both in CSS (`content: url(...)`) and in JS (`loadImg`). Fruit types are enumerated in the `fruitKeys` array (`apple`, `banana`, `strawberry`, `grape`); adding a new fruit means adding both an image file and a `loadImg` call plus a `fruitKeys` entry.

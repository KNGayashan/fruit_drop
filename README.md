# AR Fruit Catcher

A single-page browser game. Move an on-screen basket by moving a `#34C4A3`-colored rectangle in front of the webcam (tracked via color detection), catch falling fruit for points, and avoid bombs.

## Features

- Real-time color-object tracking via webcam — no keyboard/mouse controls
- 60-second timed rounds with ramping difficulty (fruit falls faster and bombs appear more often as time runs out)
- Score popups, beep sound effects (synthesized with the Web Audio API — no audio files), and a 3-2-1-GO countdown
- Local top-5 leaderboard (saved in the browser via `localStorage`)

## Running the game

There's no build system, package manager, or server-side code — [index.html](index.html) links [styles.css](styles.css) and [script.js](script.js) directly. Because webcam access requires a secure context, you can't just open the file directly (`file://`); serve it over HTTP instead:

```
python -m http.server 8000
```

Then visit `http://localhost:8000/index.html` and grant camera permission when prompted.

## Controls

Hold up a `#34C4A3`-colored rectangle in front of the webcam — the basket follows it. Catch fruit (apple, banana, strawberry, grape) for +10 points; avoid bombs, which cost -20 points.

## Tech stack

- Vanilla HTML/CSS/JS, no frameworks or dependencies
- [MediaPipe camera_utils](https://developers.google.com/mediapipe) (via CDN) for webcam frame capture
- Plain RGB color-distance thresholding (no ML model) for object tracking
- HTML5 Canvas for rendering
- Web Audio API for sound effects
- `localStorage` for leaderboard persistence

## Development notes

The input method went through a few iterations: it started as MediaPipe hand-landmark tracking, was prototyped with color-blob tracking for a dark green box and then a black square, and now tracks a specific `#34C4A3`-colored rectangle via RGB color-distance thresholding (see [script.js](script.js)'s `isTargetColor`/`TARGET_COLOR`/`COLOR_DISTANCE`, and [CLAUDE.md](CLAUDE.md) for the current architecture breakdown). The color-distance approach can be repointed at a different color by changing `TARGET_COLOR`, and the matching tolerance tuned via `COLOR_DISTANCE`.

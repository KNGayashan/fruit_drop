# AR Fruit Catcher

A single-page browser game. Move an on-screen basket by moving your hand in front of the webcam (tracked via MediaPipe Hands), catch falling fruit for points, and avoid bombs.

## Features

- Real-time hand tracking via webcam — no keyboard/mouse controls
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

Hold your hand up in front of the webcam — the basket follows your palm position. Catch fruit (apple, banana, strawberry, grape) for +10 points; avoid bombs, which cost -20 points.

## Tech stack

- Vanilla HTML/CSS/JS, no frameworks or dependencies
- [MediaPipe Hands](https://developers.google.com/mediapipe) (via CDN) for hand landmark tracking
- HTML5 Canvas for rendering
- Web Audio API for sound effects
- `localStorage` for leaderboard persistence

## Development notes

During development, a few alternate approaches to the input method were explored on top of the original MediaPipe hand-tracking implementation:

- **Color-blob object tracking**: replacing hand-landmark tracking with plain RGB/HSV pixel thresholding on downscaled webcam frames, to control the basket by moving a colored physical object instead of a hand. This was prototyped for a dark green box and then a black square.
- **Live camera preview**: showing the raw (mirrored) webcam feed in a small window in the top-left corner of the screen, to make it easier to see what the tracker sees while tuning detection thresholds.

These were exploratory changes made and then reverted during development discussions — [script.js](script.js) in this repo uses the original MediaPipe Hands landmark tracking (see [CLAUDE.md](CLAUDE.md) for the current architecture breakdown). The color-blob tracking approach remains a viable path if hand tracking is ever swapped out for a physical prop/marker-based control scheme.

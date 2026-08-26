# How to Run

Two things need to run at the same time: the **backend** (config + leaderboard API + admin dashboard) and the **frontend** (the game itself, served as static files).

## Prerequisites

- Node.js ≥ 22.5 (backend uses the built-in `node:sqlite` module — no native compilation needed)
- Python 3 (just for serving the static frontend over HTTP; any other static file server works too)

## 1. Start the backend

```
cd backend
npm install
cp .env.example .env
```

Open `backend/.env` and set `JWT_SECRET` to a random string:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output as `JWT_SECRET=...` in `.env`. Then:

```
npm start
```

Backend is now running at `http://localhost:3000`.

## 2. Start the frontend

In a **second terminal**, from the project root:

```
python -m http.server 8000
```

Frontend is now running at `http://localhost:8000`.

## 3. Play the game

Visit **http://localhost:8000/index.html**, grant camera access, and play. The game fetches all of its settings (timing, scoring, tracked color, items, brands, images) from the backend on load — if the backend isn't running, it falls back to built-in defaults and the leaderboard stays empty.

## 4. Set up the admin dashboard

Visit **http://localhost:3000/admin/**. On first visit you'll see a "Create Admin Account" screen (no default/shared credentials) — set your own username and password there. From the dashboard you can edit:

- **Game Settings** — round timing, scoring/difficulty, tracking color, audio, core images
- **Brands** — add/edit brands, each with its own logo, score icon, and background image
- **Items** — the fruits/bombs that fall during play
- **Leaderboard** — scores, stats, per-brand/screen-size breakdowns

Changes made here take effect the next time the game page is loaded (or reloaded).

## 5. Background mode (live camera / virtual background)

Under **Game Settings → Basket & canvas → Background mode**, choose how the game canvas's background is drawn:

- **`image`** (default) — the static background image, unchanged from before.
- **`camera`** — the live webcam feed, mirrored, fills the background.
- **`virtual`** — a Zoom-style cutout: the player is segmented out of the camera feed and composited over the configured background image (per-brand if one's selected). Requires a real person in frame and a browser with WebGL support; if the segmentation model fails to load, it silently falls back to `image`.

Save the setting, then reload the game page to see the change.

## Troubleshooting

- **Leaderboard empty / settings not reflecting admin changes** — backend isn't running or `CORS_ORIGIN` in `backend/.env` doesn't match the frontend's actual origin (default assumes `http://localhost:8000`).
- **Webcam doesn't work** — the game must be served over `http://` (or `https://`), not opened directly as a `file://` path; browsers block camera access on `file://`.
- **Port already in use** — change `PORT` in `backend/.env` for the backend, or pass a different port to `python -m http.server <port>` for the frontend (and update `CORS_ORIGIN` / the game's `API_BASE` in `script.js` to match).

See [README.md](README.md) and [backend/README.md](backend/README.md) for more detail.

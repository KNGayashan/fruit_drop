# How to Run

One thing needs to run: the **backend**. It now serves the game frontend
itself (same origin/port), plus the config + leaderboard API and the admin
dashboard.

## Prerequisites

- Node.js ≥ 22.5 (backend uses the built-in `node:sqlite` module — no native compilation needed)
- Docker (optional — only if you want to run it containerized, see below)

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

## 2. Play the game

Visit **http://localhost:3000/** (or whatever `PORT` you set), grant camera
access, and play. The game fetches all of its settings (timing, scoring,
tracked color, items, brands, images) from the backend on load — if it can't
reach the API it falls back to built-in defaults and the leaderboard stays
empty.

## 3. Set up the admin dashboard

Visit **http://localhost:3000/admin/**. On first visit you'll see a "Create
Admin Account" screen (no default/shared credentials) — set your own
username and password there. From the dashboard you can edit:

- **Game Settings** — round timing, scoring/difficulty, tracking color, audio, core images, branding (location name/logo, typed game name, colors)
- **Brands** — add/edit brands, each with its own logo, score icon, and background image
- **Items** — the fruits/bombs that fall during play
- **Leaderboard** — scores, stats, per-brand/screen-size breakdowns, and a "Reset Leaderboard" button

Changes made here take effect the next time the game page is loaded (or reloaded).

## Running with Docker

```
cp backend/.env.example backend/.env   # then set a real JWT_SECRET, as above
docker compose up -d --build
```

This builds an image containing the backend and the frontend files
(`index.html`/`script.js`/`styles.css`/`img/`), and runs it on port `3004`
(see `docker-compose.yml` — change the port mapping and `PORT` env var
together if you need a different port). The SQLite database and
admin-uploaded images persist across restarts/rebuilds via named Docker
volumes (`catch_data`, `catch_uploads`).

Visit `http://localhost:3004/` for the game and `http://localhost:3004/admin/`
for the dashboard.

## Troubleshooting

- **Leaderboard empty / settings not reflecting admin changes** — backend isn't running, or something's calling the API from a different origin than it expects (see `CORS_ORIGIN` in `backend/.env` — only relevant if the frontend is ever served separately from the API again; the default same-origin setup doesn't need it).
- **Webcam doesn't work** — the game must be served over `http://` (localhost is exempt) or `https://` in production; browsers block camera access on plain `http://` for any other host, and on `file://` entirely.
- **Port already in use** — change `PORT` in `backend/.env` (or the port mapping in `docker-compose.yml`).

See [README.md](README.md) and [backend/README.md](backend/README.md) for more detail.

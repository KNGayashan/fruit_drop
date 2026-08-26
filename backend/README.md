# fruit_drop backend

Leaderboard + full game-configuration API for the AR Fruit Catcher game. Node/Express, storage via Node's built-in `node:sqlite` (real SQLite, no native compilation required — needs Node ≥ 22.5).

## Setup

```
npm install
cp .env.example .env
```

Edit `.env`:
- `JWT_SECRET` — set to a long random string (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- `CORS_ORIGIN` — the origin the frontend is served from (default assumes `python -m http.server 8000`).

Then:

```
npm start
```

The API listens on `http://localhost:3000` (`PORT` in `.env`). The admin dashboard is served at `http://localhost:3000/admin/`.

**First run:** visit `/admin/` — since no admin account exists yet, you'll get a "Create Admin Account" screen instead of a login form. Set your own username/password there (min 8 characters); this is a one-time, single-admin setup — the screen won't reappear once an account exists. Password can be changed later from the dashboard's "Change password" button.

## What's configurable from the admin dashboard

The game (`../script.js`) fetches its entire configuration from this backend on load — nothing about round timing, scoring, difficulty, color tracking, or the item/brand roster is hardcoded in the frontend anymore. If the backend is unreachable, the game falls back to built-in defaults (identical to what's seeded here) so it still runs standalone.

- **Game Settings tab** — round duration, countdown, leaderboard size, difficulty ramp, item speed/size/spawn timing, basket size, canvas width, tracked color + HSV tolerances, tracking sensitivity, camera resolution, audio beep frequencies, and the six core UI images (logo, start button, basket, background, time's-up, play-again). An "Advanced: raw JSON" editor at the bottom exposes the complete config object for anything not in the form.
- **Brands tab** — add/edit/deactivate/delete brands; each has a logo (shown on the brand-select screen) and a score icon (shown during gameplay), both uploaded as images.
- **Items tab** — the fruits/bombs that fall during gameplay. Each item has an image, `points` (positive = good catch, negative = penalty — this is what determines "good" vs "bad" for the difficulty curve, not a fixed +10/-20), a spawn `weight`, and a brand assignment (or "Global," meaning it spawns for every brand — this is how the shared bomb works).
- **Leaderboard tab** — the original scores/stats view (unchanged).

## API

Public:
- `GET /api/config` — `{ game, brands, items }`, the full config the game frontend consumes.
- `GET /api/scores/top?limit=5` — top N scores (name, score, brand).
- `POST /api/scores` — submit a score: `{ name, score, brand, screenWidth, screenHeight, userAgent }`. Rate-limited to 20/min per IP.

Admin (require `Authorization: Bearer <token>` from `/api/admin/login`):
- `GET /api/admin/setup-status` — `{ needsSetup }`, true until the one admin account is created.
- `POST /api/admin/setup` — `{ username, password }` → `{ token }`. Only works while `needsSetup` is true.
- `POST /api/admin/login` — `{ username, password }` → `{ token }`. Rate-limited to 10 attempts/15min per IP.
- `POST /api/admin/change-password` — `{ currentPassword, newPassword }`.
- `GET/PUT /api/admin/config` — game config. `PUT` shallow-merges top-level keys and deep-merges the nested `audio`/`assets` objects, so you can send just the fields you're changing.
- `GET/POST /api/admin/brands`, `PUT/DELETE /api/admin/brands/:id` — a brand's `key` is set at creation and immutable (items and historical scores reference it).
- `GET/POST /api/admin/items`, `PUT/DELETE /api/admin/items/:id` — `GET ?brand=<key>` filters to one brand's items, `?brand=` (empty) filters to global-only items.
- `POST /api/admin/uploads` — `multipart/form-data` with an `image` field (PNG/JPEG/WebP/GIF/SVG, max 5MB) → `{ path }`, an `/uploads/...` path to feed into the fields above.
- `GET /api/admin/scores?page=&pageSize=&brand=` — paginated, filterable score list with screen size / device / IP.
- `DELETE /api/admin/scores/:id`
- `GET /api/admin/stats` — totals, top/avg score, per-brand and per-screen-size breakdowns.

## Data

SQLite file at `backend/data/scores.db` (gitignored) holds `scores`, `admins`, `game_config`, `brands`, and `items`. Delete it to reset everything (leaderboard, admin account, and config/brands/items back to seeded defaults).

Uploaded images live in `backend/uploads/` (gitignored) and are served publicly (unauthenticated, since the game itself needs to load them) at `/uploads/<filename>`. `backend/../img/` (the game frontend's own image folder) is also mirrored at `/game-assets/` purely so the admin dashboard can render thumbnail previews for un-edited default items — the game itself never uses `/game-assets`.

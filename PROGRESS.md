# Progress log

Running record of what's been built for the One Galle Face "Catch the Food"
(AR Fruit Catcher) event game and admin backend, for continuity between
sessions. See [CLAUDE.md](CLAUDE.md) for architecture detail and
[HOW_TO_RUN.md](HOW_TO_RUN.md) for setup.

## Done

**Backend** (`backend/`) — Node/Express + SQLite (`node:sqlite`, no native
build step). Game fetches its entire config from it at load; falls back to
built-in defaults if unreachable so it still runs standalone.
- Leaderboard API (scores recorded automatically, no player-facing name
  prompt — every session is timestamped and stored for admin analytics only)
- Admin dashboard at `/admin/`: first-run account setup (no shared
  credentials), 4 tabs (Leaderboard, Game Settings, Brands, Items)
- Full game config editable from the dashboard: timing, scoring/difficulty,
  color tracking, audio, core UI images, via a form + a raw-JSON escape
  hatch for anything not in the form
- Brands: logo, score icon, background image, primary/secondary theme
  colors — all admin-editable with image upload
- Items (fruits/bombs): image, points (sign determines good/bad), spawn
  weight, brand assignment or "Global" (shared across all brands)

**Frontend** (`index.html` / `script.js` / `styles.css`)
- Full-width responsive layout (was a fixed 512x640 box); canvas resolution
  matches actual screen size for crisp rendering at any size
- Brand-adaptive theming: selecting a brand re-themes the frame, HUD, badge,
  and penalty splat to that brand's colors in real time — same code/layout
  reused per sponsor (Bamboo Boy, Broastmasters, Domino's, Taco Bell)
- Reference-video-style UI: green rolling-hill SVG frame, corner
  Points/Timer stat medals (with icons), circular brand badge, splat-style
  penalty popups
- Live player overlay via MediaPipe selfie segmentation (background-removed,
  mirrored) — visible during countdown + gameplay only, not on menus
- Canvas-drawn layered hill/sun backdrop behind the per-brand background
  image, tinted to the current theme
- Combo streak popups ("COMBO xN!") on 3+ consecutive good catches
- Game-feel animations: entrance pop-ins, button press states, HUD pulse on
  score/timer change, basket squash on catch, screen shake on bad catch
- Item/basket sizes scale with actual screen size (0.6x-1.6x), tuned
  against a 500px reference width, so they don't look tiny on large kiosk
  displays or oversized on phones

**Fixed bugs** (all caught by actually driving the app in a browser, not
just reading code):
- `[hidden]` attribute silently overridden by `display: flex` rules (hit
  this twice — admin login dimming, then the game's HUD badge)
- Canvas internal resolution tied to `window.innerHeight` instead of the
  canvas's own CSS box → non-uniform X/Y stretch on any non-640px-tall
  window
- HUD stat cards rendering behind the decorative hill frame on
  narrow/tall aspect ratios (mobile portrait, tall desktop windows)
- Gameplay background stretched to exactly fill the canvas instead of
  "cover"-fit scaling, distorting non-matching aspect ratios

## In progress — One Galle Face event branding

Reference: a pink/magenta landing page with "ONE GALLE FACE" location
branding at top, the existing "HUNGRY GAMES" logo asset below it, then a
large comic-style "CATCH THE FOOD" game name, and a play button.

- [x] Backend: `game_config.branding` section — `locationName`,
      `locationLogoPath` (defaults to the real `img/logo/ogf.png` asset,
      already in the repo), `gameName` (plain text, not an image — typed
      by the admin, rendered with the same comic-book stroke+shadow CSS
      treatment as the existing logo art), `overlayColor`. Migrated onto
      the existing live config row.
- [x] Admin UI: text inputs for location name / game name, color picker
      for the start/end screen background, image upload for the location
      logo — added to the Game Settings tab's Branding group.
- [ ] Frontend: rebuild `showStartScreen()` to show the location badge,
      existing logo image, and the new typed+styled game name, above the
      play button. Apply the pink `overlayColor` (+ patterned background)
      to `#overlay`.
- [ ] Restyle the end/scoring screen so it's cohesive against the new pink
      background (currently shares `#overlay` with the start screen, so
      much of this comes for free once the overlay background changes —
      still need to check contrast/readability of the score card).

## Branch / repo

Working on `Gayan` branch of `https://github.com/KNGayashan/fruit_drop`,
pushed after each verified change. `frontend_designs/` holds mockup
directions explored before implementation (screenshots + source HTML),
kept for reference.

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

## Done — One Galle Face event branding

Reference: a pink/magenta landing page with "ONE GALLE FACE" location
branding at top, the existing "HUNGRY GAMES" logo asset below it, then a
large comic-style "CATCH THE FOOD" game name, and a play button.

- [x] Backend: `game_config.branding` section — `locationName`,
      `locationLogoPath` (defaults to the real `img/logo/ogf.png` asset,
      already in the repo), `gameName` (plain text, not an image — typed
      by the admin, rendered with the same comic-book stroke+shadow CSS
      treatment as the existing logo art), `overlayColor`, `gameNameColor`.
      Migrated onto the existing live config row.
- [x] Admin UI: text inputs for location name / game name, color pickers
      for the game-name outline and start/end screen background, image
      upload for the location logo — in the Game Settings tab's Branding
      group.
- [x] Frontend: `showStartScreen()` renders the location badge (logo pill),
      the "HUNGRY GAMES" logo image, and the typed+styled game name above
      the play button. `applyBranding()` pushes `overlayColor`/
      `gameNameColor` onto CSS custom properties on load. Cropped the
      transparent padding off `img/logo.png` and `img/logo/ogf.png` so
      they render at a legible size instead of mostly empty canvas.
- [x] End/scoring screen redesigned to match: small location badge +
      "TIME'S UP!" + score card + "Play Again", same pink patterned
      `#overlay` background (shared with the start screen). Verified
      layout/contrast with a scripted Playwright pass (start screen,
      brand-select, and a full played-out round) — no clipping or
      overlap at 900x1400.
- [x] Follow-up polish pass, color-matched by sampling the actual reference
      poster PNG (`AI Cover.png`) with PIL: `overlayColor` → `#e44c9b`,
      `gameNameColor` → `#ed1c24`. `DEFAULT_THEME_PRIMARY`/`_SECONDARY`
      (the `#game-frame` hill border/badges shown when no brand is picked)
      changed from green/yellow to red/cream so the frame no longer
      clashes with the pink event branding.
- [x] `#overlay`'s food-doodle pattern switched from a small tiled repeat
      to `background-size: cover; background-repeat: no-repeat` — one
      large scaled instance instead of many tiny repeated icons.
- [x] Typed game name (`branding.gameName`) now renders in the "Luckiest
      Guy" Google Font, one word per line via `renderGameTitle()` in
      `script.js`, with CSS-only staggered poster placement
      (`.title-word:first-child`/`:last-child`/middle selectors — big+left,
      small+centered, big+right) so it works for any admin-typed name, not
      just the literal "Catch the Food" case.
- [ ] Not verified live: the color/border changes above were checked via
      a scripted Playwright pass against the running dev servers, not
      by the client in a real browser session — worth a final look.

## Admin dashboard

- [x] Leaderboard tab: "Reset Leaderboard" button next to the brand
      filter (`backend/public/index.html`/`admin.js`), backed by
      `DELETE /api/admin/scores` (`backend/routes/admin.js`) — clears
      every score, or just the currently-filtered brand's scores if one's
      selected. Confirms before deleting; existing per-row delete is
      unchanged.

## Branch / repo

Working on `Gayan` branch of `https://github.com/KNGayashan/fruit_drop`,
pushed after each verified change. `frontend_designs/` (pre-implementation
mockup explorations) and `backup_original/` (pre-rewrite zips) were removed
once the pink One Galle Face design was implemented and verified — no
longer needed for reference. Stale `index.txt` (an old pre-rewrite copy of
`index.html`) and orphaned `img/trophy.png` (unused since the player-facing
leaderboard was removed) were also cleaned up.

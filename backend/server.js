require("dotenv").config();
require("express-async-errors");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const scoresRouter = require("./routes/scores");
const adminRouter = require("./routes/admin");
const configRouter = require("./routes/config");

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:8000";
const repoRoot = path.join(__dirname, "..");

app.set("trust proxy", 1);
// CSP is left off: the game frontend (served below, same origin as this API)
// loads MediaPipe/Google Fonts from third-party CDNs and uses inline
// onclick="" handlers throughout its generated HTML. It ran with no CSP at
// all before (a separate static file server), so this isn't a new gap —
// just not tightening it while combining origins. Helmet's other headers
// (frame options, no-sniff, HSTS, etc.) still apply.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/scores", scoresRouter);
app.use("/api/admin", adminRouter);
app.use("/api/config", configRouter);
app.use("/admin", express.static(path.join(__dirname, "public")));

// The default (un-edited) items/brands reference the game frontend's own img/
// folder by relative path (e.g. "img/apple.png"). The admin dashboard runs on
// a different origin/port than the game, so it can't resolve those directly —
// mirror that folder here purely so admin thumbnail previews can render them.
app.use("/game-assets", express.static(path.join(repoRoot, "img")));

// The game frontend itself (index.html/script.js/styles.css/img/), served
// from this same app/port so the game can call the API same-origin — no
// CORS_ORIGIN or hardcoded API host needed. Named individually (not a blanket
// static mount on repoRoot) so nothing else in the repo is exposed over HTTP.
app.use("/img", express.static(path.join(repoRoot, "img")));
app.get("/script.js", (req, res) => res.sendFile(path.join(repoRoot, "script.js")));
app.get("/styles.css", (req, res) => res.sendFile(path.join(repoRoot, "styles.css")));
app.get("/", (req, res) => res.sendFile(path.join(repoRoot, "index.html")));

// Uploaded game assets are loaded cross-origin by the game frontend (a different
// port), so they need an explicit opt-out of helmet's same-origin resource policy.
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "uploads"))
);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`fruit_drop backend listening on http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin/`);
});

const express = require("express");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { signToken, requireAuth } = require("../auth");
const { upload } = require("../upload");

const router = express.Router();

const MIN_PASSWORD_LEN = 8;
const MAX_USERNAME_LEN = 40;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." }
});

function adminCount() {
  return db.prepare("SELECT COUNT(*) AS c FROM admins").get().c;
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LEN;
}

// First run only: create the one admin account. Locked once an admin exists.
router.get("/setup-status", (req, res) => {
  res.json({ needsSetup: adminCount() === 0 });
});

router.post("/setup", loginLimiter, async (req, res) => {
  if (adminCount() > 0) {
    return res.status(409).json({ error: "An admin account already exists." });
  }

  const { username, password } = req.body || {};
  const cleanUsername = String(username || "").trim().slice(0, MAX_USERNAME_LEN);

  if (!cleanUsername) return res.status(400).json({ error: "Username is required." });
  if (!validatePassword(password)) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LEN} characters.` });
  }

  const hash = await bcrypt.hash(String(password), 10);
  try {
    db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(cleanUsername, hash);
  } catch {
    return res.status(409).json({ error: "An admin account already exists." });
  }

  res.status(201).json({ token: signToken(cleanUsername) });
});

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(String(username || ""));
  const validPass = admin && (await bcrypt.compare(String(password || ""), admin.password_hash));

  if (!admin || !validPass) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  res.json({ token: signToken(admin.username) });
});

router.use(requireAuth);

router.post("/change-password", async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(req.user.sub);

  if (!admin || !(await bcrypt.compare(String(currentPassword || ""), admin.password_hash))) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }
  if (!validatePassword(newPassword)) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LEN} characters.` });
  }

  const hash = await bcrypt.hash(String(newPassword), 10);
  db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(hash, admin.id);
  res.json({ ok: true });
});

// --- Image uploads ---
router.post("/uploads", (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });
    res.status(201).json({ path: `/uploads/${req.file.filename}` });
  });
});

// --- Game config (single JSON blob: timing, scoring curve, tracking, audio, core assets) ---
function mergeConfig(current, incoming) {
  const merged = { ...current, ...incoming };
  if (incoming.audio) merged.audio = { ...current.audio, ...incoming.audio };
  if (incoming.assets) merged.assets = { ...current.assets, ...incoming.assets };
  return merged;
}

router.get("/config", (req, res) => {
  const row = db.prepare("SELECT data FROM game_config WHERE id = 1").get();
  res.json(JSON.parse(row.data));
});

router.put("/config", (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return res.status(400).json({ error: "Config must be a JSON object." });
  }
  const current = JSON.parse(db.prepare("SELECT data FROM game_config WHERE id = 1").get().data);
  const merged = mergeConfig(current, incoming);
  db.prepare("UPDATE game_config SET data = ?, updated_at = datetime('now') WHERE id = 1").run(JSON.stringify(merged));
  res.json(merged);
});

// --- Brands ---
router.get("/brands", (req, res) => {
  res.json(db.prepare("SELECT * FROM brands ORDER BY sort_order, id").all());
});

router.post("/brands", (req, res) => {
  const { key, name, logoPath, scoreIconPath, backgroundPath, active, sortOrder } = req.body || {};
  const cleanKey = String(key || "").trim().toLowerCase().slice(0, 20);
  const cleanName = String(name || "").trim().slice(0, 60);

  if (!/^[a-z0-9_-]+$/.test(cleanKey)) {
    return res.status(400).json({ error: "Key must be lowercase letters, numbers, - or _ only." });
  }
  if (!cleanName) return res.status(400).json({ error: "Name is required." });

  try {
    const info = db
      .prepare(
        "INSERT INTO brands (key, name, logo_path, score_icon_path, background_path, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        cleanKey,
        cleanName,
        logoPath || null,
        scoreIconPath || null,
        backgroundPath || null,
        active === false ? 0 : 1,
        Number.isInteger(sortOrder) ? sortOrder : 0
      );
    res.status(201).json({ id: info.lastInsertRowid });
  } catch {
    res.status(409).json({ error: "A brand with that key already exists." });
  }
});

router.put("/brands/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM brands WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { name, logoPath, scoreIconPath, backgroundPath, active, sortOrder } = req.body || {};
  const cleanName = name !== undefined ? String(name).trim().slice(0, 60) : existing.name;
  if (!cleanName) return res.status(400).json({ error: "Name is required." });

  db.prepare(
    "UPDATE brands SET name = ?, logo_path = ?, score_icon_path = ?, background_path = ?, active = ?, sort_order = ? WHERE id = ?"
  ).run(
    cleanName,
    logoPath !== undefined ? logoPath : existing.logo_path,
    scoreIconPath !== undefined ? scoreIconPath : existing.score_icon_path,
    backgroundPath !== undefined ? backgroundPath : existing.background_path,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    Number.isInteger(sortOrder) ? sortOrder : existing.sort_order,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete("/brands/:id", (req, res) => {
  const info = db.prepare("DELETE FROM brands WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// --- Items (fruits/bombs; brand = null means shared across every brand) ---
router.get("/items", (req, res) => {
  const { brand } = req.query;
  let rows;
  if (brand === undefined) rows = db.prepare("SELECT * FROM items ORDER BY sort_order, id").all();
  else if (brand === "") rows = db.prepare("SELECT * FROM items WHERE brand IS NULL ORDER BY sort_order, id").all();
  else rows = db.prepare("SELECT * FROM items WHERE brand = ? ORDER BY sort_order, id").all(brand);
  res.json(rows);
});

router.post("/items", (req, res) => {
  const { key, label, imagePath, points, weight, brand, active, sortOrder } = req.body || {};
  const cleanKey = String(key || "").trim().slice(0, 40);
  const cleanLabel = String(label || "").trim().slice(0, 60);

  if (!cleanKey) return res.status(400).json({ error: "Key is required." });
  if (!cleanLabel) return res.status(400).json({ error: "Label is required." });
  if (!imagePath) return res.status(400).json({ error: "Image is required." });

  const cleanPoints = Number.isFinite(Number(points)) ? Math.round(Number(points)) : 10;
  const cleanWeight = Math.max(1, Number.isFinite(Number(weight)) ? Math.round(Number(weight)) : 10);

  try {
    const info = db
      .prepare("INSERT INTO items (key, label, image_path, points, weight, brand, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(cleanKey, cleanLabel, imagePath, cleanPoints, cleanWeight, brand || null, active === false ? 0 : 1, Number.isInteger(sortOrder) ? sortOrder : 0);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch {
    res.status(409).json({ error: "An item with that key already exists." });
  }
});

router.put("/items/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { label, imagePath, points, weight, brand, active, sortOrder } = req.body || {};
  const cleanLabel = label !== undefined ? String(label).trim().slice(0, 60) : existing.label;
  if (!cleanLabel) return res.status(400).json({ error: "Label is required." });

  db.prepare("UPDATE items SET label = ?, image_path = ?, points = ?, weight = ?, brand = ?, active = ?, sort_order = ? WHERE id = ?").run(
    cleanLabel,
    imagePath !== undefined ? imagePath : existing.image_path,
    points !== undefined ? Math.round(Number(points)) : existing.points,
    weight !== undefined ? Math.max(1, Math.round(Number(weight))) : existing.weight,
    brand !== undefined ? (brand || null) : existing.brand,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    Number.isInteger(sortOrder) ? sortOrder : existing.sort_order,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete("/items/:id", (req, res) => {
  const info = db.prepare("DELETE FROM items WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// --- Scores (leaderboard moderation) ---
router.get("/scores", (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 25, 100);
  const offset = (page - 1) * pageSize;
  const brand = req.query.brand || null;

  const where = brand ? "WHERE brand = ?" : "";
  const params = brand ? [brand] : [];

  const rows = db
    .prepare(`SELECT * FROM scores ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  const { count: total } = db
    .prepare(`SELECT COUNT(*) AS count FROM scores ${where}`)
    .get(...params);

  res.json({ rows, total, page, pageSize });
});

router.delete("/scores/:id", (req, res) => {
  const info = db.prepare("DELETE FROM scores WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

router.get("/stats", (req, res) => {
  const totalPlays = db.prepare("SELECT COUNT(*) AS c FROM scores").get().c;
  const topScore = db.prepare("SELECT MAX(score) AS m FROM scores").get().m || 0;
  const avgScore = db.prepare("SELECT AVG(score) AS a FROM scores").get().a || 0;
  const byBrand = db
    .prepare(
      `SELECT COALESCE(brand, 'unknown') AS brand, COUNT(*) AS plays, AVG(score) AS avgScore
       FROM scores GROUP BY brand ORDER BY plays DESC`
    )
    .all()
    .map((r) => ({ ...r, avgScore: Math.round(r.avgScore) }));
  const byScreen = db
    .prepare(
      `SELECT screen_width AS width, screen_height AS height, COUNT(*) AS plays
       FROM scores WHERE screen_width IS NOT NULL AND screen_height IS NOT NULL
       GROUP BY screen_width, screen_height ORDER BY plays DESC LIMIT 10`
    )
    .all();

  res.json({ totalPlays, topScore, avgScore: Math.round(avgScore), byBrand, byScreen });
});

module.exports = router;

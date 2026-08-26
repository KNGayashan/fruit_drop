const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Try again shortly." }
});

const MAX_NAME_LEN = 20;
const MAX_BRAND_LEN = 20;
const MAX_UA_LEN = 255;
const MAX_SCORE = 5000;
const MAX_SCREEN_DIM = 10000;

function cleanDimension(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= MAX_SCREEN_DIM ? n : null;
}

router.get("/top", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50);
  const rows = db
    .prepare("SELECT name, score, brand FROM scores ORDER BY score DESC, created_at ASC LIMIT ?")
    .all(limit);
  res.json(rows);
});

router.post("/", submitLimiter, (req, res) => {
  const { name, score, brand, screenWidth, screenHeight, userAgent } = req.body || {};

  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return res.status(400).json({ error: "Invalid score" });
  }

  const cleanName = String(name || "Player").trim().slice(0, MAX_NAME_LEN) || "Player";
  const cleanBrand = typeof brand === "string" ? brand.slice(0, MAX_BRAND_LEN) : null;
  const cleanUserAgent = typeof userAgent === "string" ? userAgent.slice(0, MAX_UA_LEN) : req.headers["user-agent"]?.slice(0, MAX_UA_LEN) || null;
  const ipAddress = req.ip;

  const info = db
    .prepare(
      `INSERT INTO scores (name, score, brand, screen_width, screen_height, user_agent, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      cleanName,
      Math.round(score),
      cleanBrand,
      cleanDimension(screenWidth),
      cleanDimension(screenHeight),
      cleanUserAgent,
      ipAddress
    );

  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = router;

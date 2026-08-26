const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  const game = JSON.parse(db.prepare("SELECT data FROM game_config WHERE id = 1").get().data);

  const brands = db
    .prepare("SELECT * FROM brands WHERE active = 1 ORDER BY sort_order, id")
    .all()
    .map((b) => ({
      key: b.key,
      name: b.name,
      logoPath: b.logo_path,
      scoreIconPath: b.score_icon_path,
      backgroundPath: b.background_path
    }));

  const items = db
    .prepare("SELECT * FROM items WHERE active = 1 ORDER BY sort_order, id")
    .all()
    .map((i) => ({
      key: i.key,
      label: i.label,
      imagePath: i.image_path,
      points: i.points,
      weight: i.weight,
      brand: i.brand
    }));

  res.json({ game, brands, items, frontendUrl: process.env.CORS_ORIGIN || "http://localhost:8000" });
});

module.exports = router;

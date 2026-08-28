const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "scores.db"));
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    brand TEXT,
    screen_width INTEGER,
    screen_height INTEGER,
    user_agent TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS game_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    logo_path TEXT,
    score_icon_path TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Migrations: earlier versions of this table didn't have these columns.
// CREATE TABLE IF NOT EXISTS won't add columns to an already-existing table.
const brandColumns = db.prepare("PRAGMA table_info(brands)").all().map((c) => c.name);
if (!brandColumns.includes("background_path")) {
  db.exec("ALTER TABLE brands ADD COLUMN background_path TEXT");
}
const addedColorColumns = !brandColumns.includes("primary_color");
if (addedColorColumns) {
  db.exec("ALTER TABLE brands ADD COLUMN primary_color TEXT NOT NULL DEFAULT '#2f9e44'");
}
if (!brandColumns.includes("secondary_color")) {
  db.exec("ALTER TABLE brands ADD COLUMN secondary_color TEXT NOT NULL DEFAULT '#ffd43b'");
}
if (addedColorColumns) {
  // Backfill known default brands with curated colors instead of leaving
  // them all on the generic default the ALTER TABLE just applied — but only
  // brands that still hold that generic value, so any admin customization
  // that could theoretically land between these statements isn't clobbered.
  const curated = {
    bb: ["#e0393e", "#2f9e44"],
    bm: ["#e8720c", "#ffd43b"],
    do: ["#0066a4", "#e31837"],
    tb: ["#702f8f", "#ff5c8d"]
  };
  const updateColor = db.prepare(
    "UPDATE brands SET primary_color = ?, secondary_color = ? WHERE key = ? AND primary_color = '#2f9e44'"
  );
  Object.entries(curated).forEach(([key, [primary, secondary]]) => updateColor.run(primary, secondary, key));
}

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    image_path TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 10,
    weight INTEGER NOT NULL DEFAULT 10,
    brand TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// --- Seed defaults matching the game's original hardcoded values ---
// (only runs once — on an already-seeded DB these inserts are skipped)

const DEFAULT_GAME_CONFIG = {
  roundDurationSec: 60,
  countdownSec: 3,
  leaderboardSize: 5,
  canvasWidth: 500,
  basketWidth: 120,
  basketHeight: 120,
  basketStartX: 190,
  basketStartY: 500,
  difficultyBadChanceBase: 0.3,
  difficultyBadChanceRamp: 0.15,
  itemSpeedMin: 2.5,
  itemSpeedRandomAdd: 2,
  itemSize: 75,
  spawnIntervalMinMs: 600,
  spawnIntervalMaxMs: 1100,
  spawnIntervalDifficultyFactorMs: 500,
  targetColor: "#34C4A3",
  colorHueToleranceDeg: 18,
  colorSaturationMin: 0.25,
  colorValueMin: 0.2,
  trackingEasing: 0.75,
  trackingMinPixelCount: 5,
  trackingCanvasWidth: 160,
  trackingCanvasHeight: 120,
  cameraWidth: 640,
  cameraHeight: 480,
  audio: {
    countdownBeepFreq: 400,
    goBeepFreq: 800,
    catchBeepFreq: 800,
    hitBeepFreq: 200,
    beepShortDurationSec: 0.1,
    beepLongDurationSec: 0.2
  },
  assets: {
    logo: "img/logo.png",
    startButton: "img/btn.png",
    basket: "img/basket.png",
    background: "img/background.png",
    timeUp: "img/time.png",
    playAgain: "img/again.png"
  },
  branding: {
    locationName: "One Galle Face",
    locationLogoPath: "img/logo/ogf.png",
    gameName: "Catch the Food",
    overlayColor: "#f0409c"
  }
};

const existingConfigRow = db.prepare("SELECT data FROM game_config WHERE id = 1").get();
if (!existingConfigRow) {
  db.prepare("INSERT INTO game_config (id, data) VALUES (1, ?)").run(JSON.stringify(DEFAULT_GAME_CONFIG));
} else {
  // Migration: backfill fields added after the config row already existed
  // (e.g. `branding`), without touching anything an admin already changed.
  const existing = JSON.parse(existingConfigRow.data);
  if (!existing.branding) {
    existing.branding = DEFAULT_GAME_CONFIG.branding;
    db.prepare("UPDATE game_config SET data = ? WHERE id = 1").run(JSON.stringify(existing));
  }
}

if (db.prepare("SELECT COUNT(*) AS c FROM brands").get().c === 0) {
  const insertBrand = db.prepare(
    "INSERT INTO brands (key, name, logo_path, score_icon_path, primary_color, secondary_color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const defaultBrands = [
    { key: "bb", name: "Bamboo Boy", primary: "#e0393e", secondary: "#2f9e44" },
    { key: "bm", name: "Broastmasters", primary: "#e8720c", secondary: "#ffd43b" },
    { key: "do", name: "Domino's", primary: "#0066a4", secondary: "#e31837" },
    { key: "tb", name: "Taco Bell", primary: "#702f8f", secondary: "#ff5c8d" }
  ];
  defaultBrands.forEach((b, i) => {
    insertBrand.run(b.key, b.name, `img/logo/${b.key}.png`, `img/${b.key}/score.png`, b.primary, b.secondary, i);
  });
}

if (db.prepare("SELECT COUNT(*) AS c FROM items").get().c === 0) {
  const insertItem = db.prepare(
    "INSERT INTO items (key, label, image_path, points, weight, brand, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const fruits = [
    { key: "apple", label: "Apple", image: "img/apple.png" },
    { key: "banana", label: "Banana", image: "img/banana.png" },
    { key: "strawberry", label: "Strawberry", image: "img/strawberry.png" },
    { key: "grape", label: "Grape", image: "img/grapes.png" }
  ];
  fruits.forEach((f, i) => insertItem.run(f.key, f.label, f.image, 10, 10, null, i));
  insertItem.run("bomb", "Bomb", "img/bomb.png", -20, 10, null, fruits.length);

  const brandItemCounts = { bb: 2, bm: 5, do: 3, tb: 5 };
  Object.entries(brandItemCounts).forEach(([brand, count]) => {
    for (let i = 1; i <= count; i++) {
      insertItem.run(`${brand}_${i}`, `${brand} item ${i}`, `img/${brand}/${i}.png`, 10, 10, brand, i);
    }
  });
}

module.exports = db;

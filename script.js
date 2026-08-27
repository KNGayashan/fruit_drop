const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const videoElement = document.getElementById("input_video");
const overlay = document.getElementById("overlay");
const brandSelect = document.getElementById("brandSelect");
const countdownEl = document.getElementById("countdown");
const scoreEl = document.getElementById("score");
const scoreIconEl = document.getElementById("scoreIcon");
const timerEl = document.getElementById("timer");
const gameBadgeEl = document.getElementById("game-badge");
const badgeLogoEl = document.getElementById("badgeLogo");
const statsHudEl = document.getElementById("statsHud");
const gameWrapper = document.getElementById("game-wrapper");

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- BACKEND ---
const API_BASE = "http://localhost:3000";

function resolveAssetUrl(p) {
  if (!p) return "";
  if (/^https?:\/\//i.test(p) || p.startsWith("/uploads/")) {
    return p.startsWith("/") ? `${API_BASE}${p}` : p;
  }
  return p;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// --- CONFIG (fetched from the backend; falls back to these built-in
// defaults if the backend is unreachable, so the game still runs standalone) ---
const DEFAULT_CONFIG = {
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
  }
};

const DEFAULT_BRANDS = [
  { key: "bb", name: "Bamboo Boy", logoPath: "img/logo/bb.png", scoreIconPath: "img/bb/score.png", primaryColor: "#e0393e", secondaryColor: "#2f9e44" },
  { key: "bm", name: "Broastmasters", logoPath: "img/logo/bm.png", scoreIconPath: "img/bm/score.png", primaryColor: "#e8720c", secondaryColor: "#ffd43b" },
  { key: "do", name: "Domino's", logoPath: "img/logo/do.png", scoreIconPath: "img/do/score.png", primaryColor: "#0066a4", secondaryColor: "#e31837" },
  { key: "tb", name: "Taco Bell", logoPath: "img/logo/tb.png", scoreIconPath: "img/tb/score.png", primaryColor: "#702f8f", secondaryColor: "#ff5c8d" }
];

const DEFAULT_ITEMS = [
  { key: "apple", label: "Apple", imagePath: "img/apple.png", points: 10, weight: 10, brand: null },
  { key: "banana", label: "Banana", imagePath: "img/banana.png", points: 10, weight: 10, brand: null },
  { key: "strawberry", label: "Strawberry", imagePath: "img/strawberry.png", points: 10, weight: 10, brand: null },
  { key: "grape", label: "Grape", imagePath: "img/grapes.png", points: 10, weight: 10, brand: null },
  { key: "bomb", label: "Bomb", imagePath: "img/bomb.png", points: -20, weight: 10, brand: null },
  ...["bb", "bm", "do", "tb"].flatMap((brand) => {
    const count = { bb: 2, bm: 5, do: 3, tb: 5 }[brand];
    return Array.from({ length: count }, (_, i) => ({
      key: `${brand}_${i + 1}`,
      label: `${brand} item ${i + 1}`,
      imagePath: `img/${brand}/${i + 1}.png`,
      points: 10,
      weight: 10,
      brand
    }));
  })
];

let CONFIG = DEFAULT_CONFIG;
let BRANDS = DEFAULT_BRANDS;
let ITEMS = DEFAULT_ITEMS;
let TARGET_HUE = 166;

async function loadRemoteConfig() {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    if (data.game) {
      CONFIG = {
        ...DEFAULT_CONFIG,
        ...data.game,
        audio: { ...DEFAULT_CONFIG.audio, ...(data.game.audio || {}) },
        assets: { ...DEFAULT_CONFIG.assets, ...(data.game.assets || {}) }
      };
    }
    if (Array.isArray(data.brands) && data.brands.length) BRANDS = data.brands;
    if (Array.isArray(data.items) && data.items.length) ITEMS = data.items;
  } catch (err) {
    console.error("Config fetch failed, using built-in defaults:", err);
  }
}

function hexToHue(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 166;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return h;
}

// --- ASSETS ---
const images = {};
const loadImg = (name, src) => {
  images[name] = new Image();
  images[name].src = resolveAssetUrl(src);
};

function loadAssets() {
  loadImg("basket", CONFIG.assets.basket);
  loadImg("virtualBg", CONFIG.assets.background);
  ITEMS.forEach((it) => loadImg(it.key, it.imagePath));
  BRANDS.forEach((b) => {
    if (b.backgroundPath) loadImg(`brand_bg_${b.key}`, b.backgroundPath);
  });
}

// Per-brand background if one's set, else the global default.
function currentBackgroundImage() {
  const brandBg = selectedBrand && images[`brand_bg_${selectedBrand}`];
  return brandBg && brandBg.complete ? brandBg : images.virtualBg;
}

let basket = { x: 190, y: 500, width: 120, height: 120 };
let basketSquash = 0; // 0..1, decays each frame — brief squash/stretch feedback on catch
let comboStreak = 0; // consecutive good catches; resets on a bad catch
let score = 0,
  timeLeft = 60,
  gameActive = false,
  countdownActive = false;
let items = [],
  floatingTexts = [];
let selectedBrand = null;

// --- BRAND THEMING (frame/badge/HUD color, driven by the selected brand) ---
const DEFAULT_THEME_PRIMARY = "#2f9e44";
const DEFAULT_THEME_SECONDARY = "#ffd43b";
let currentThemeColor = DEFAULT_THEME_PRIMARY;
let currentThemeSecondary = DEFAULT_THEME_SECONDARY;

function applyBrandTheme(primary, secondary) {
  document.documentElement.style.setProperty("--brand-primary", primary);
  document.documentElement.style.setProperty("--brand-secondary", secondary);
  currentThemeColor = primary;
  currentThemeSecondary = secondary;
}

function resetTheme() {
  applyBrandTheme(DEFAULT_THEME_PRIMARY, DEFAULT_THEME_SECONDARY);
}

function itemsForBrand(brand) {
  return ITEMS.filter((it) => it.brand === brand || it.brand === null);
}

function pickWeighted(pool) {
  const total = pool.reduce((sum, it) => sum + it.weight, 0);
  let r = Math.random() * total;
  for (const it of pool) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return pool[pool.length - 1];
}

// --- COLOR-BLOB TRACKING (config-defined color via HSV) ---
let trackCanvas, trackCtx;

function isTargetColor(r, g, b) {
  const rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm), min = Math.min(rNorm, gNorm, bNorm);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rNorm) h = ((gNorm - bNorm) / d) % 6;
    else if (max === gNorm) h = (bNorm - rNorm) / d + 2;
    else h = (rNorm - gNorm) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;

  const tol = CONFIG.colorHueToleranceDeg;
  const hueMatch = Math.abs(h - TARGET_HUE) <= tol || Math.abs(h - TARGET_HUE) >= 360 - tol;
  const satMatch = s >= CONFIG.colorSaturationMin;
  const valMatch = v >= CONFIG.colorValueMin;

  return hueMatch && satMatch && valMatch;
}

function trackObject() {
  const w = CONFIG.trackingCanvasWidth, h = CONFIG.trackingCanvasHeight;
  trackCtx.drawImage(videoElement, 0, 0, w, h);
  const { data } = trackCtx.getImageData(0, 0, w, h);

  let sumX = 0, sumY = 0, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isTargetColor(data[i], data[i + 1], data[i + 2])) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  if (count > CONFIG.trackingMinPixelCount) {
    const cx = sumX / count / w;
    const cy = sumY / count / h;
    const easing = CONFIG.trackingEasing;
    basket.x += ((1 - cx) * canvas.width - basket.width / 2 - basket.x) * easing;
    basket.y += (cy * canvas.height - basket.height / 2 - basket.y) * easing;
  }
}

// --- LIVE PLAYER OVERLAY (background-removed via MediaPipe selfie segmentation) ---
const personCanvas = document.createElement("canvas");
const personCtx = personCanvas.getContext("2d");
let personReady = false;
let selfieSegmentation = null;

function onSegmentationResults(results) {
  personCanvas.width = results.image.width;
  personCanvas.height = results.image.height;
  personCtx.clearRect(0, 0, personCanvas.width, personCanvas.height);
  personCtx.drawImage(results.segmentationMask, 0, 0, personCanvas.width, personCanvas.height);
  personCtx.globalCompositeOperation = "source-in";
  personCtx.drawImage(results.image, 0, 0, personCanvas.width, personCanvas.height);
  personCtx.globalCompositeOperation = "source-over";
  personReady = true;
}

// Best-effort: if the segmentation model fails to load (offline CDN, older
// browser, etc.) the game still works fine, it just won't show the player.
function setupSegmentation() {
  try {
    selfieSegmentation = new SelfieSegmentation({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
    });
    selfieSegmentation.setOptions({ modelSelection: 1 });
    selfieSegmentation.onResults(onSegmentationResults);
  } catch (err) {
    console.error("Selfie segmentation unavailable, player won't be shown:", err);
    selfieSegmentation = null;
  }
}

// Draws the cut-out player, mirrored (so it behaves like a mirror, matching
// the tracking's own left/right flip) and "cover"-fit to the canvas.
function drawPersonLayer() {
  if (!personReady || personCanvas.width === 0) return;

  const scale = Math.max(canvas.width / personCanvas.width, canvas.height / personCanvas.height);
  const drawW = personCanvas.width * scale;
  const drawH = personCanvas.height * scale;
  const dx = (canvas.width - drawW) / 2;
  const dy = (canvas.height - drawH) / 2;

  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(personCanvas, dx, dy, drawW, drawH);
  ctx.restore();
}

// --- HELPERS ---
// Every play session is recorded server-side for admin analytics, but there's
// no player-facing leaderboard — no name prompt, no "did you qualify" check.
// The play timestamp is used as the record's name instead of asking the player.
async function submitScore(points) {
  try {
    const playedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    await fetch(`${API_BASE}/api/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: playedAt,
        score: points,
        brand: selectedBrand,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        userAgent: navigator.userAgent
      })
    });
  } catch (err) {
    console.error("Score submit failed:", err);
  }
}

// Restarts a CSS animation on repeated triggers (e.g. every catch), since just
// re-adding a class that's already present doesn't replay its animation.
function replayAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

function playBeep(f, d) {
  if (audioCtx.state === "suspended") audioCtx.resume();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.setValueAtTime(f, audioCtx.currentTime);
  o.connect(g);
  g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0.1, audioCtx.currentTime);
  o.start();
  o.stop(audioCtx.currentTime + d);
}

function spawnFloatingText(x, y, text, color, splat) {
  floatingTexts.push({ x, y, text, color, splat: !!splat, life: 1.0 });
}

const COMBO_THRESHOLD = 3;

function spawnComboPopup(x, y, streak) {
  floatingTexts.push({ x, y, text: `COMBO x${streak}!`, color: "#ffffff", combo: true, life: 1.0 });
}

// Jagged "impact" burst behind penalty text, matching the reference product's
// splat-style hit feedback instead of plain floating text.
function drawSplat(x, y, life) {
  const spikes = 10;
  const outerR = 32;
  const innerR = 15;
  ctx.save();
  ctx.globalAlpha = life;
  ctx.translate(x, y - 8);
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / spikes) * i;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = currentThemeColor;
  ctx.fill();
  ctx.restore();
}

// --- DYNAMIC DIFFICULTY SPAWNING ---
function spawnItem() {
  if (!gameActive) return;

  const difficulty = (CONFIG.roundDurationSec - timeLeft) / CONFIG.roundDurationSec;
  const roster = itemsForBrand(selectedBrand);
  const goodPool = roster.filter((it) => it.points >= 0);
  const badPool = roster.filter((it) => it.points < 0);
  const wantsBad = Math.random() < CONFIG.difficultyBadChanceBase + difficulty * CONFIG.difficultyBadChanceRamp;
  const pool = wantsBad && badPool.length ? badPool : goodPool;

  if (pool.length) {
    const chosen = pickWeighted(pool);
    items.push({
      x: Math.random() * (canvas.width - CONFIG.itemSize),
      y: -CONFIG.itemSize,
      itemKey: chosen.key,
      points: chosen.points,
      speed: (CONFIG.itemSpeedMin + Math.random() * CONFIG.itemSpeedRandomAdd) * (1 + difficulty),
      size: CONFIG.itemSize
    });
  }

  const nextSpawn = Math.max(
    CONFIG.spawnIntervalMinMs,
    CONFIG.spawnIntervalMaxMs - difficulty * CONFIG.spawnIntervalDifficultyFactorMs
  );
  setTimeout(spawnItem, nextSpawn);
}

function showStartScreen() {
  gameBadgeEl.hidden = true;
  statsHudEl.hidden = true;
  countdownActive = false;
  resetTheme();
  overlay.innerHTML = `
        <img src="${resolveAssetUrl(CONFIG.assets.logo)}" alt="AR Fruit Catcher Logo" style="width:300px; margin-bottom:25px;">
        <img src="${resolveAssetUrl(CONFIG.assets.startButton)}" alt="Start Mission" style="cursor:pointer; width:250px;" onclick="showBrandSelect()">
    `;
  overlay.style.display = "flex";
}

function renderBrandSelect() {
  brandSelect.innerHTML = `
    <h2>Select Your Brand</h2>
    <div class="section-sub">Each brand brings its own challenge</div>
    <div class="brand-grid">
      ${BRANDS.map(
        (b, i) =>
          `<img src="${resolveAssetUrl(b.logoPath)}" alt="${escapeHtml(b.name)}" class="brand-logo" data-brand="${escapeHtml(b.key)}" style="animation-delay:${0.24 + i * 0.08}s">`
      ).join("")}
    </div>
  `;
  brandSelect.querySelectorAll(".brand-logo").forEach((el) => {
    el.addEventListener("click", () => selectBrand(el.dataset.brand));
  });
}

function showBrandSelect() {
  overlay.style.display = "none";
  brandSelect.style.display = "flex";
}

function selectBrand(brand) {
  selectedBrand = brand;
  const b = BRANDS.find((x) => x.key === brand);
  if (b && b.scoreIconPath) scoreIconEl.style.content = `url("${resolveAssetUrl(b.scoreIconPath)}")`;
  if (b && b.logoPath) {
    badgeLogoEl.src = resolveAssetUrl(b.logoPath);
    gameBadgeEl.hidden = false;
  }
  statsHudEl.hidden = false;
  applyBrandTheme(b?.primaryColor || DEFAULT_THEME_PRIMARY, b?.secondaryColor || DEFAULT_THEME_SECONDARY);
  brandSelect.style.display = "none";
  startGame();
}

function startGame() {
  overlay.style.display = "none";
  countdownActive = true;
  let count = CONFIG.countdownSec;
  countdownEl.style.display = "block";
  countdownEl.innerText = count;
  replayAnimation(countdownEl, "punch");
  playBeep(CONFIG.audio.countdownBeepFreq, CONFIG.audio.beepShortDurationSec);
  const ci = setInterval(() => {
    count--;
    if (count > 0) {
      countdownEl.innerText = count;
      replayAnimation(countdownEl, "punch");
      playBeep(CONFIG.audio.countdownBeepFreq, CONFIG.audio.beepShortDurationSec);
    } else if (count === 0) {
      countdownEl.innerText = "GO!";
      replayAnimation(countdownEl, "punch");
      playBeep(CONFIG.audio.goBeepFreq, CONFIG.audio.beepLongDurationSec);
    } else {
      clearInterval(ci);
      countdownEl.style.display = "none";
      initGame();
    }
  }, 1000);
}

function initGame() {
  score = 0;
  timeLeft = CONFIG.roundDurationSec;
  items = [];
  floatingTexts = [];
  comboStreak = 0;
  countdownActive = false;
  gameActive = true;
  scoreEl.innerText = score;
  timerEl.innerText = timeLeft;
  spawnItem();

  const ti = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      timerEl.innerText = timeLeft;
      if (timeLeft <= 10) replayAnimation(timerEl.closest(".stat-medal"), "pulse");
    } else {
      gameActive = false;
      clearInterval(ti);

      overlay.innerHTML = `
            <img src="${resolveAssetUrl(CONFIG.assets.timeUp)}" alt="Time's Up" class="logo">
            <div class="total-score">
              <label>Total Score</label>
              <span>${score}</span>
            </div>
            <img src="${resolveAssetUrl(CONFIG.assets.playAgain)}" alt="Play Again" class="start-btn" onclick="showStartScreen()">
        `;
      overlay.style.display = "flex";

      submitScore(score);
    }
  }, 1000);
}

// Draws img centered inside the box (x, y, boxSize, boxSize) at its real aspect
// ratio ("contain" fit) instead of stretching it to fill a forced square —
// several source images (esp. brand items) aren't square.
function drawContained(img, x, y, boxSize) {
  const aspect = img.naturalWidth / img.naturalHeight;
  const drawW = aspect >= 1 ? boxSize : boxSize * aspect;
  const drawH = aspect >= 1 ? boxSize / aspect : boxSize;
  ctx.drawImage(img, x + (boxSize - drawW) / 2, y + (boxSize - drawH) / 2, drawW, drawH);
}

// Draws img scaled to fully cover the (x, y, w, h) box at its real aspect
// ratio, cropping any overflow ("cover" fit, like CSS background-size:cover)
// instead of stretching it to fill the box and distorting it.
function drawCover(img, x, y, w, h) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

// Soft sun glow + three layered rolling-hill silhouettes (back/mid/front,
// increasing opacity toward the front) for depth, tinted to the current
// brand theme. Sits behind the per-brand background image/pattern.
function drawHillLayer(heightFrac, color, alpha) {
  const h = canvas.height * heightFrac;
  const baseY = canvas.height - h * 0.5;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  ctx.lineTo(0, baseY);
  const segments = 3;
  const segW = canvas.width / segments;
  for (let i = 0; i < segments; i++) {
    const cpX = segW * i + segW / 2;
    const cpY = baseY - h * (i % 2 === 0 ? 0.5 : 0.15);
    const endX = segW * (i + 1);
    ctx.quadraticCurveTo(cpX, cpY, endX, baseY);
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSkyBackdrop() {
  const sunX = canvas.width * 0.85;
  const sunY = canvas.height * 0.05;
  const sunR = canvas.width * 0.5;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  sunGrad.addColorStop(0, "rgba(255, 249, 219, 0.55)");
  sunGrad.addColorStop(1, "rgba(255, 249, 219, 0)");
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawHillLayer(0.4, currentThemeSecondary, 0.3);
  drawHillLayer(0.28, currentThemeSecondary, 0.45);
  drawHillLayer(0.16, currentThemeColor, 0.6);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawSkyBackdrop();

  const bgImg = currentBackgroundImage();
  if (bgImg && bgImg.complete) {
    ctx.globalAlpha = 0.5;
    drawCover(bgImg, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
  }

  // Visible through the countdown too, so the player can see themselves and
  // get in position before "GO!" — but not on the start/brand-select/end screens.
  if (gameActive || countdownActive) drawPersonLayer();

  if (gameActive) {
    if (images.basket && images.basket.complete) {
      const squashY = 1 - basketSquash * 0.22;
      const squashW = basket.width * (1 + basketSquash * 0.12);
      const squashH = basket.height * squashY;
      ctx.drawImage(
        images.basket,
        basket.x - (squashW - basket.width) / 2,
        basket.y + (basket.height - squashH),
        squashW,
        squashH
      );
      basketSquash = Math.max(0, basketSquash - 0.08);
    }

    items.forEach((item, i) => {
      item.y += item.speed;
      const img = images[item.itemKey];
      if (img && img.complete) drawContained(img, item.x, item.y, item.size);

      if (
        item.y + item.size > basket.y + 20 &&
        item.y < basket.y + basket.height &&
        item.x + item.size > basket.x &&
        item.x < basket.x + basket.width
      ) {
        score = Math.max(0, score + item.points);
        const sign = item.points >= 0 ? "+" : "";
        spawnFloatingText(item.x, item.y, `${sign}${item.points}`, item.points >= 0 ? "#f1c40f" : "#ffffff", item.points < 0);
        playBeep(
          item.points >= 0 ? CONFIG.audio.catchBeepFreq : CONFIG.audio.hitBeepFreq,
          item.points >= 0 ? CONFIG.audio.beepShortDurationSec : CONFIG.audio.beepLongDurationSec
        );
        scoreEl.innerText = score;
        replayAnimation(scoreEl.closest(".stat-medal"), "pulse");
        basketSquash = 1;

        if (item.points >= 0) {
          comboStreak++;
          if (comboStreak >= COMBO_THRESHOLD) spawnComboPopup(item.x + item.size / 2, item.y - 30, comboStreak);
        } else {
          comboStreak = 0;
        }
        if (item.points < 0) replayAnimation(gameWrapper, "shake-screen");
        items.splice(i, 1);
      }

      if (item.y > canvas.height) items.splice(i, 1);
    });

    floatingTexts.forEach((ft, i) => {
      if (ft.splat) drawSplat(ft.x, ft.y, ft.life);
      ctx.globalAlpha = ft.life;

      if (ft.combo) {
        ctx.textAlign = "center";
        ctx.font = "bold 30px Arial";
        ctx.lineWidth = 5;
        ctx.strokeStyle = currentThemeColor;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.textAlign = "left";
      } else if (ft.splat) {
        ctx.fillStyle = ft.color;
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";
        ctx.fillText(ft.text, ft.x, ft.y - 4);
        ctx.textAlign = "left";
      } else {
        ctx.fillStyle = ft.color;
        ctx.font = "bold 24px Arial";
        ctx.fillText(ft.text, ft.x, ft.y);
      }

      ft.y -= ft.combo ? 1.0 : 1.5;
      ft.life -= ft.combo ? 0.012 : 0.02;

      if (ft.life <= 0) floatingTexts.splice(i, 1);
    });

    ctx.globalAlpha = 1.0;
  }

  requestAnimationFrame(draw);
}

async function init() {
  await loadRemoteConfig();
  TARGET_HUE = hexToHue(CONFIG.targetColor);

  // The game now fills the viewport (#game-wrapper is 100vw x 100vh), so the
  // canvas's internal drawing resolution is set to match its actual on-screen
  // CSS pixel size directly — this keeps rendering crisp at any window size
  // and keeps X/Y scale factors equal (a fixed buffer size stretched into a
  // differently-shaped box would squash everything drawn on it, same failure
  // mode as the old window.innerHeight bug this replaced).
  const canvasRect = canvas.getBoundingClientRect();
  canvas.width = canvasRect.width > 0 ? Math.round(canvasRect.width) : CONFIG.canvasWidth;
  canvas.height = canvasRect.height > 0 ? Math.round(canvasRect.height) : window.innerHeight;
  basket = { x: CONFIG.basketStartX, y: CONFIG.basketStartY, width: CONFIG.basketWidth, height: CONFIG.basketHeight };

  trackCanvas = document.createElement("canvas");
  trackCanvas.width = CONFIG.trackingCanvasWidth;
  trackCanvas.height = CONFIG.trackingCanvasHeight;
  trackCtx = trackCanvas.getContext("2d", { willReadFrequently: true });

  loadAssets();
  renderBrandSelect();
  showStartScreen();
  setupSegmentation();

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      trackObject();
      if (selfieSegmentation) await selfieSegmentation.send({ image: videoElement });
    },
    width: CONFIG.cameraWidth,
    height: CONFIG.cameraHeight
  });
  camera.start();

  draw();
}

init();

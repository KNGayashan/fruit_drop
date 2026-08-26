const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const videoElement = document.getElementById("input_video");
const overlay = document.getElementById("overlay");
const brandSelect = document.getElementById("brandSelect");
const countdownEl = document.getElementById("countdown");
const scoreEl = document.getElementById("score");
const scoreIconEl = document.getElementById("scoreIcon");
const timerEl = document.getElementById("timer");

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
  backgroundMode: "image",
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
  { key: "bb", name: "Bamboo Boy", logoPath: "img/logo/bb.png", scoreIconPath: "img/bb/score.png" },
  { key: "bm", name: "Broastmasters", logoPath: "img/logo/bm.png", scoreIconPath: "img/bm/score.png" },
  { key: "do", name: "Domino's", logoPath: "img/logo/do.png", scoreIconPath: "img/do/score.png" },
  { key: "tb", name: "Taco Bell", logoPath: "img/logo/tb.png", scoreIconPath: "img/tb/score.png" }
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
let score = 0,
  timeLeft = 60,
  gameActive = false;
let items = [],
  floatingTexts = [];
let selectedBrand = null;

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

// --- VIRTUAL BACKGROUND (MediaPipe Selfie Segmentation, opt-in via CONFIG.backgroundMode) ---
let segCanvas, segCtx;
let selfieSegmentation = null;
let segmentationReady = false;

function onSegmentationResults(results) {
  segCtx.save();
  segCtx.clearRect(0, 0, segCanvas.width, segCanvas.height);
  segCtx.drawImage(results.segmentationMask, 0, 0, segCanvas.width, segCanvas.height);
  segCtx.globalCompositeOperation = "source-in";
  segCtx.drawImage(results.image, 0, 0, segCanvas.width, segCanvas.height);
  segCtx.globalCompositeOperation = "destination-over";
  const bg = currentBackgroundImage();
  if (bg && bg.complete) segCtx.drawImage(bg, 0, 0, segCanvas.width, segCanvas.height);
  segCtx.restore();
  segmentationReady = true;
}

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
    basket.x += ((1 - cx) * CONFIG.canvasWidth - basket.width / 2 - basket.x) * easing;
    basket.y += (cy * canvas.height - basket.height / 2 - basket.y) * easing;
  }
}

// --- HELPERS ---
async function getScores() {
  try {
    const res = await fetch(`${API_BASE}/api/scores/top?limit=${CONFIG.leaderboardSize}`);
    if (!res.ok) throw new Error("bad response");
    return await res.json();
  } catch (err) {
    console.error("Leaderboard fetch failed:", err);
    return [];
  }
}

async function submitScore(name, points) {
  try {
    await fetch(`${API_BASE}/api/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
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

async function updateUI() {
  const leaderboardList = document.getElementById("leaderboard-list");
  if (!leaderboardList) return;
  const scores = await getScores();
  leaderboardList.innerHTML =
    scores
      .map(
        (s) =>
          `<div class="score-row"><span>${escapeHtml(s.name)}</span><span>${s.score}</span></div>`
      )
      .join("") || "No missions completed";
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

function spawnFloatingText(x, y, text, color) {
  floatingTexts.push({ x, y, text, color, life: 1.0 });
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
  overlay.innerHTML = `
        <img src="${resolveAssetUrl(CONFIG.assets.logo)}" alt="AR Fruit Catcher Logo" style="width:300px; margin-bottom:25px;">
        <img src="${resolveAssetUrl(CONFIG.assets.startButton)}" alt="Start Mission" style="cursor:pointer; width:250px;" onclick="showBrandSelect()">
    `;
  overlay.style.display = "flex";
}

function renderBrandSelect() {
  brandSelect.innerHTML = `
    <h2>Select Your Brand</h2>
    <div class="brand-grid">
      ${BRANDS.map(
        (b) =>
          `<img src="${resolveAssetUrl(b.logoPath)}" alt="${escapeHtml(b.name)}" class="brand-logo" data-brand="${escapeHtml(b.key)}">`
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
  brandSelect.style.display = "none";
  startGame();
}

function startGame() {
  overlay.style.display = "none";
  let count = CONFIG.countdownSec;
  countdownEl.style.display = "block";
  countdownEl.innerText = count;
  playBeep(CONFIG.audio.countdownBeepFreq, CONFIG.audio.beepShortDurationSec);
  const ci = setInterval(() => {
    count--;
    if (count > 0) {
      countdownEl.innerText = count;
      playBeep(CONFIG.audio.countdownBeepFreq, CONFIG.audio.beepShortDurationSec);
    } else if (count === 0) {
      countdownEl.innerText = "GO!";
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
  gameActive = true;
  scoreEl.innerText = score;
  timerEl.innerText = timeLeft;
  spawnItem();

  const ti = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      timerEl.innerText = timeLeft;
    } else {
      gameActive = false;
      clearInterval(ti);

      overlay.innerHTML = `
            <img src="${resolveAssetUrl(CONFIG.assets.timeUp)}" alt="Time's Up" class="logo">
            <div class="leaderboard">
              <h3><img class="icon-trophy" /> TOP ${CONFIG.leaderboardSize} RECORDS</h3>
              <div id="leaderboard-list"></div>
            </div>
            <img src="${resolveAssetUrl(CONFIG.assets.playAgain)}" alt="Play Again" class="start-btn" onclick="showStartScreen()">
        `;
      overlay.style.display = "flex";

      (async () => {
        const scores = await getScores();
        if (scores.length < CONFIG.leaderboardSize || score > scores[scores.length - 1].score) {
          setTimeout(async () => {
            const name = prompt("TOP SCORE! Name:") || "Player";
            await submitScore(name, score);
            updateUI();
          }, 500);
        } else {
          updateUI();
        }
      })();
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

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (CONFIG.backgroundMode === "camera") {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else if (CONFIG.backgroundMode === "virtual" && segmentationReady) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(segCanvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    const bgImg = currentBackgroundImage();
    if (bgImg && bgImg.complete) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
    }
  }

  if (gameActive) {
    if (images.basket && images.basket.complete)
      ctx.drawImage(images.basket, basket.x, basket.y, basket.width, basket.height);

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
        spawnFloatingText(item.x, item.y, `${sign}${item.points}`, item.points >= 0 ? "#f1c40f" : "#ff4757");
        playBeep(
          item.points >= 0 ? CONFIG.audio.catchBeepFreq : CONFIG.audio.hitBeepFreq,
          item.points >= 0 ? CONFIG.audio.beepShortDurationSec : CONFIG.audio.beepLongDurationSec
        );
        scoreEl.innerText = score;
        items.splice(i, 1);
      }

      if (item.y > canvas.height) items.splice(i, 1);
    });

    floatingTexts.forEach((ft, i) => {
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = ft.life;
      ctx.font = "bold 24px Arial";
      ctx.fillText(ft.text, ft.x, ft.y);

      ft.y -= 1.5;
      ft.life -= 0.02;

      if (ft.life <= 0) floatingTexts.splice(i, 1);
    });

    ctx.globalAlpha = 1.0;
  }

  requestAnimationFrame(draw);
}

async function init() {
  await loadRemoteConfig();
  TARGET_HUE = hexToHue(CONFIG.targetColor);

  // The canvas's on-screen CSS box size (#game-wrapper is fixed at 512x640) is
  // independent of its internal drawing resolution set here. Using window.innerHeight
  // for canvas.height made the two mismatch on any window that isn't exactly 640px
  // tall (i.e. almost always), so the browser stretched X and Y by different
  // factors when scaling the canvas bitmap into its CSS box — visibly squashing
  // everything drawn on it (basket, items, background). Deriving canvas.height
  // from the canvas's actual CSS aspect ratio keeps both scale factors equal.
  canvas.width = CONFIG.canvasWidth;
  const canvasRect = canvas.getBoundingClientRect();
  canvas.height = canvasRect.width > 0
    ? Math.round(CONFIG.canvasWidth * (canvasRect.height / canvasRect.width))
    : window.innerHeight;
  basket = { x: CONFIG.basketStartX, y: CONFIG.basketStartY, width: CONFIG.basketWidth, height: CONFIG.basketHeight };

  trackCanvas = document.createElement("canvas");
  trackCanvas.width = CONFIG.trackingCanvasWidth;
  trackCanvas.height = CONFIG.trackingCanvasHeight;
  trackCtx = trackCanvas.getContext("2d", { willReadFrequently: true });

  segCanvas = document.createElement("canvas");
  segCanvas.width = CONFIG.cameraWidth;
  segCanvas.height = CONFIG.cameraHeight;
  segCtx = segCanvas.getContext("2d");

  if (CONFIG.backgroundMode === "virtual") {
    if (typeof SelfieSegmentation !== "undefined") {
      selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      });
      selfieSegmentation.setOptions({ modelSelection: 1, selfieMode: false });
      selfieSegmentation.onResults(onSegmentationResults);
    } else {
      console.error("SelfieSegmentation failed to load; falling back to the static background.");
    }
  }

  loadAssets();
  renderBrandSelect();
  showStartScreen();

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      trackObject();
      if (selfieSegmentation) {
        try {
          await selfieSegmentation.send({ image: videoElement });
        } catch (err) {
          console.error("Segmentation frame failed:", err);
        }
      }
    },
    width: CONFIG.cameraWidth,
    height: CONFIG.cameraHeight
  });
  camera.start();

  draw();
}

init();

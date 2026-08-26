const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const videoElement = document.getElementById("input_video");
const overlay = document.getElementById("overlay");
const brandSelect = document.getElementById("brandSelect");
const countdownEl = document.getElementById("countdown");
const scoreEl = document.getElementById("score");
const scoreIconEl = document.getElementById("scoreIcon");
const timerEl = document.getElementById("timer");

canvas.width = 500;
canvas.height = window.innerHeight;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- ASSETS ---
const images = {};
const loadImg = (name, src) => {
  images[name] = new Image();
  images[name].src = src;
};
loadImg("basket", "img/basket.png");
loadImg("apple", "img/apple.png");
loadImg("banana", "img/banana.png");
loadImg("strawberry", "img/strawberry.png");
loadImg("grape", "img/grapes.png");
loadImg("bomb", "img/bomb.png");
loadImg("virtualBg", "img/background.png");

const fruitKeys = ["apple", "banana", "strawberry", "grape"];
const brandItemCounts = { bb: 2, bm: 5, do: 3, tb: 5 };
let basket = { x: 190, y: 500, width: 120, height: 120 };
let score = 0,
  timeLeft = 60,
  gameActive = false;
let items = [],
  floatingTexts = [];
let selectedBrand = null;
let currentItemKeys = fruitKeys;

function loadBrandAssets(brand) {
  const count = brandItemCounts[brand];
  currentItemKeys = [];
  for (let i = 1; i <= count; i++) {
    const key = `${brand}_${i}`;
    loadImg(key, `img/${brand}/${i}.png`);
    currentItemKeys.push(key);
  }
  scoreIconEl.style.content = `url("img/${brand}/score.png")`;
}

// --- AI MODELS ---
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.5
});
hands.onResults((res) => {
  if (res.multiHandLandmarks?.length > 0) {
    const p = res.multiHandLandmarks[0][9];
    basket.x += ((1 - p.x) * 500 - basket.width / 2 - basket.x) * 0.4;
    basket.y += (p.y * canvas.height - basket.height / 2 - basket.y) * 0.4;
  }
});

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({ image: videoElement });
  },
  width: 640,
  height: 480
});
camera.start();

// --- HELPERS ---
function getScores() {
  return JSON.parse(localStorage.getItem("arCatcherScores")) || [];
}

function updateUI() {
  const leaderboardList = document.getElementById("leaderboard-list");
  if (!leaderboardList) return;
  leaderboardList.innerHTML =
    getScores()
      .map(
        (s) =>
          `<div class="score-row"><span>${s.name}</span><span>${s.score}</span></div>`
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

  const difficulty = (60 - timeLeft) / 60;
  const isGood = Math.random() > 0.3 + difficulty * 0.15;

  items.push({
    x: Math.random() * (canvas.width - 60),
    y: -60,
    imgKey: isGood
      ? currentItemKeys[Math.floor(Math.random() * currentItemKeys.length)]
      : "bomb",
    isGood,
    speed: (2.5 + Math.random() * 2) * (1 + difficulty),
    size: 75
  });

  const nextSpawn = Math.max(600, 1100 - difficulty * 500);
  setTimeout(spawnItem, nextSpawn);
}

function showStartScreen() {
  overlay.innerHTML = `
        <img src="img/logo.png" alt="AR Fruit Catcher Logo" style="width:300px; margin-bottom:25px;">
        <img src="img/btn.png" alt="Start Mission" style="cursor:pointer; width:250px;" onclick="showBrandSelect()">
    `;
  overlay.style.display = "flex";
}

function showBrandSelect() {
  overlay.style.display = "none";
  brandSelect.style.display = "flex";
}

function selectBrand(brand) {
  selectedBrand = brand;
  loadBrandAssets(brand);
  brandSelect.style.display = "none";
  startGame();
}

function startGame() {
  overlay.style.display = "none";
  let count = 3;
  countdownEl.style.display = "block";
  countdownEl.innerText = count;
  playBeep(400, 0.1);
  const ci = setInterval(() => {
    count--;
    if (count > 0) {
      countdownEl.innerText = count;
      playBeep(400, 0.1);
    } else if (count === 0) {
      countdownEl.innerText = "GO!";
      playBeep(800, 0.2);
    } else {
      clearInterval(ci);
      countdownEl.style.display = "none";
      initGame();
    }
  }, 1000);
}

function initGame() {
  score = 0;
  timeLeft = 60;
  items = [];
  floatingTexts = [];
  gameActive = true;
  scoreEl.innerText = score;
  spawnItem();

  const ti = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      timerEl.innerText = timeLeft;
    } else {
      gameActive = false;
      clearInterval(ti);

      // Show overlay with leaderboard
      overlay.innerHTML = `
            <img src="img/time.png" alt="AR Fruit Catcher Logo" class="logo">
            <div class="leaderboard">
              <h3><img class="icon-trophy" /> TOP 5 RECORDS</h3>
              <div id="leaderboard-list"></div>
            </div>
            <img src="img/again.png" alt="Play Again" class="start-btn" onclick="showStartScreen()">
        `;
      overlay.style.display = "flex";

      const scores = getScores();
      if (scores.length < 5 || score > scores[scores.length - 1].score) {
        setTimeout(() => {
          const name = prompt("TOP 5 SCORE! Name:") || "Player";
          scores.push({ name, score });
          scores.sort((a, b) => b.score - a.score);
          localStorage.setItem(
            "arCatcherScores",
            JSON.stringify(scores.slice(0, 5))
          );
          updateUI();
        }, 500);
      }
      updateUI();
    }
  }, 1000);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (images.virtualBg.complete) {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(images.virtualBg, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
  }

  if (gameActive) {
    if (images.basket.complete)
      ctx.drawImage(
        images.basket,
        basket.x,
        basket.y,
        basket.width,
        basket.height
      );

    items.forEach((item, i) => {
      item.y += item.speed;
      const img = images[item.imgKey];
      if (img && img.complete)
        ctx.drawImage(img, item.x, item.y, item.size, item.size);

      if (
        item.y + item.size > basket.y + 20 &&
        item.y < basket.y + basket.height &&
        item.x + item.size > basket.x &&
        item.x < basket.x + basket.width
      ) {
        if (item.isGood) {
          score += 10;
          spawnFloatingText(item.x, item.y, "+10", "#f1c40f");
          playBeep(800, 0.1);
        } else {
          score = Math.max(0, score - 20);
          spawnFloatingText(item.x, item.y, "-20", "#ff4757");
          playBeep(200, 0.2);
        }
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
draw();

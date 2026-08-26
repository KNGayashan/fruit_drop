const API_BASE = window.location.origin;
const PAGE_SIZE = 25;

let token = sessionStorage.getItem("adminToken");
let page = 1;

const setupView = document.getElementById("setup-view");
const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");

const setupForm = document.getElementById("setup-form");
const setupError = document.getElementById("setup-error");

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

const changePasswordBtn = document.getElementById("change-password-btn");
const changePasswordForm = document.getElementById("change-password-form");
const cancelChangePassword = document.getElementById("cancel-change-password");
const changePasswordError = document.getElementById("change-password-error");
const changePasswordSuccess = document.getElementById("change-password-success");

const statsEl = document.getElementById("stats");
const screenBreakdownEl = document.getElementById("screen-breakdown");
const tableBody = document.querySelector("#scores-table tbody");
const brandFilter = document.getElementById("brand-filter");
const pageLabel = document.getElementById("page-label");

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function deviceLabel(userAgent) {
  if (!userAgent) return "-";
  return /Mobi|Android|iPhone|iPad/i.test(userAgent) ? "Mobile" : "Desktop";
}

// Default (un-edited) image paths are relative to the game frontend's own
// server; /uploads paths are same-origin with this admin dashboard.
function resolveUrl(p) {
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith("/uploads/")) return p;
  if (p.startsWith("img/")) return `/game-assets/${p.slice(4)}`;
  return p;
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
  target[last] = value;
}

// --- Form helpers: loading state + visible, self-clearing errors ---
function setBusy(form, busy, busyLabel) {
  const btn = form.querySelector("button[type=submit]");
  const label = btn.querySelector(".btn-label");
  if (busy) {
    btn.dataset.originalLabel = label.textContent;
    label.textContent = busyLabel;
    btn.disabled = true;
  } else {
    label.textContent = btn.dataset.originalLabel || label.textContent;
    btn.disabled = false;
  }
}

function showError(el, message) {
  el.textContent = message;
  el.classList.remove("shake");
  // Force reflow so the animation restarts on repeated errors.
  void el.offsetWidth;
  el.classList.add("shake");
}

function clearError(el) {
  el.textContent = "";
  el.classList.remove("shake");
}

// --- View switching ---
function showSetup() {
  setupView.hidden = false;
  loginView.hidden = true;
  dashboardView.hidden = true;
}

function showLogin(message) {
  token = null;
  sessionStorage.removeItem("adminToken");
  setupView.hidden = true;
  loginView.hidden = false;
  dashboardView.hidden = true;
  if (message) showError(loginError, message);
}

function showDashboard() {
  setupView.hidden = true;
  loginView.hidden = true;
  dashboardView.hidden = false;
  loadBrandsForSelects().then(loadScores);
  loadStats();
  setViewGameLink();
}

async function setViewGameLink() {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    const { frontendUrl } = await res.json();
    if (frontendUrl) {
      document.getElementById("view-game-link").href = `${frontendUrl.replace(/\/$/, "")}/index.html`;
    }
  } catch {
    // Leave the fallback href in index.html as-is.
  }
}

async function init() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/setup-status`);
    const { needsSetup } = await res.json();
    if (needsSetup) {
      showSetup();
      return;
    }
  } catch {
    // If the status check fails, fall through to the normal login screen.
  }
  if (token) showDashboard();
  else showLogin();
}

// --- Setup ---
setupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(setupError);

  const username = document.getElementById("setup-username").value;
  const password = document.getElementById("setup-password").value;
  const confirm = document.getElementById("setup-password-confirm").value;

  if (password !== confirm) {
    showError(setupError, "Passwords do not match.");
    return;
  }

  setBusy(setupForm, true, "Creating…");
  try {
    const res = await fetch(`${API_BASE}/api/admin/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showError(setupError, data.error || "Could not create account.");
      return;
    }
    token = data.token;
    sessionStorage.setItem("adminToken", token);
    showDashboard();
  } catch {
    showError(setupError, "Setup failed. Is the backend running?");
  } finally {
    setBusy(setupForm, false);
  }
});

// --- Login ---
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(loginError);

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  setBusy(loginForm, true, "Logging in…");
  try {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showError(loginError, data.error || "Invalid credentials");
      document.getElementById("password").value = "";
      document.getElementById("password").focus();
      return;
    }
    token = data.token;
    sessionStorage.setItem("adminToken", token);
    showDashboard();
  } catch {
    showError(loginError, "Login failed. Is the backend running?");
  } finally {
    setBusy(loginForm, false);
  }
});

document.getElementById("logout-btn").addEventListener("click", () => showLogin());

// --- Change password ---
changePasswordBtn.addEventListener("click", () => {
  changePasswordForm.hidden = !changePasswordForm.hidden;
  clearError(changePasswordError);
  changePasswordSuccess.textContent = "";
});
cancelChangePassword.addEventListener("click", () => {
  changePasswordForm.hidden = true;
  changePasswordForm.reset();
});

changePasswordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(changePasswordError);
  changePasswordSuccess.textContent = "";

  const currentPassword = document.getElementById("current-password").value;
  const newPassword = document.getElementById("new-password").value;

  setBusy(changePasswordForm, true, "Updating…");
  try {
    const res = await authedFetch("/api/admin/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      showError(changePasswordError, data.error || "Could not update password.");
      return;
    }
    changePasswordSuccess.textContent = "Password updated.";
    changePasswordForm.reset();
  } catch {
    showError(changePasswordError, "Request failed.");
  } finally {
    setBusy(changePasswordForm, false);
  }
});

// --- Authenticated requests ---
async function authedFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  });
  if (res.status === 401) {
    showLogin("Session expired, please log in again.");
    throw new Error("Unauthorized");
  }
  return res;
}

async function loadStats() {
  const res = await authedFetch("/api/admin/stats");
  const data = await res.json();

  statsEl.innerHTML = `
    <div class="stat-card"><strong>${data.totalPlays}</strong><span>Total Plays</span></div>
    <div class="stat-card"><strong>${data.topScore}</strong><span>Top Score</span></div>
    <div class="stat-card"><strong>${data.avgScore}</strong><span>Avg Score</span></div>
    ${data.byBrand
      .map(
        (b) =>
          `<div class="stat-card"><strong>${b.plays}</strong><span>${escapeHtml(b.brand)} plays (avg ${b.avgScore})</span></div>`
      )
      .join("")}
  `;

  screenBreakdownEl.innerHTML = data.byScreen.length
    ? `<h3>Top Screen Sizes</h3><div class="stat-row">${data.byScreen
        .map(
          (s) =>
            `<div class="stat-card small"><strong>${s.width}×${s.height}</strong><span>${s.plays} plays</span></div>`
        )
        .join("")}</div>`
    : "";
}

async function loadScores() {
  const brand = brandFilter.value;
  const params = new URLSearchParams({ page, pageSize: PAGE_SIZE });
  if (brand) params.set("brand", brand);

  const res = await authedFetch(`/api/admin/scores?${params}`);
  const data = await res.json();

  tableBody.innerHTML =
    data.rows
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.score}</td>
        <td>${escapeHtml(r.brand || "-")}</td>
        <td>${r.screen_width && r.screen_height ? `${r.screen_width}×${r.screen_height}` : "-"}</td>
        <td>${deviceLabel(r.user_agent)}</td>
        <td>${escapeHtml(r.ip_address || "-")}</td>
        <td>${escapeHtml(r.created_at)}</td>
        <td><button data-id="${r.id}" class="delete-btn secondary">Delete</button></td>
      </tr>`
      )
      .join("") || `<tr><td colspan="8">No scores yet</td></tr>`;

  const totalPages = Math.max(Math.ceil(data.total / PAGE_SIZE), 1);
  pageLabel.textContent = `Page ${page} of ${totalPages}`;

  tableBody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this score?")) return;
      await authedFetch(`/api/admin/scores/${btn.dataset.id}`, { method: "DELETE" });
      loadScores();
      loadStats();
    });
  });
}

document.getElementById("prev-page").addEventListener("click", () => {
  if (page > 1) {
    page--;
    loadScores();
  }
});
document.getElementById("next-page").addEventListener("click", () => {
  page++;
  loadScores();
});
brandFilter.addEventListener("change", () => {
  page = 1;
  loadScores();
});

// --- Tabs ---
let cachedBrands = [];

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = true));
    document.getElementById(`tab-${btn.dataset.tab}`).hidden = false;

    if (btn.dataset.tab === "settings") loadSettings();
    if (btn.dataset.tab === "brands") loadBrands();
    if (btn.dataset.tab === "items") loadBrandsForSelects().then(loadItems);
  });
});

async function loadBrandsForSelects() {
  const res = await authedFetch("/api/admin/brands");
  cachedBrands = await res.json();

  brandFilter.innerHTML =
    `<option value="">All</option>` +
    cachedBrands.map((b) => `<option value="${escapeHtml(b.key)}">${escapeHtml(b.name)}</option>`).join("");

  const itemBrandSelect = document.getElementById("item-brand");
  itemBrandSelect.innerHTML =
    `<option value="">Global (all brands)</option>` +
    cachedBrands.map((b) => `<option value="${escapeHtml(b.key)}">${escapeHtml(b.name)}</option>`).join("");

  const itemBrandFilter = document.getElementById("item-brand-filter");
  itemBrandFilter.innerHTML =
    `<option value="">All items</option><option value="__global__">Global (shared across brands)</option>` +
    cachedBrands.map((b) => `<option value="${escapeHtml(b.key)}">${escapeHtml(b.name)}</option>`).join("");
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await authedFetch("/api/admin/uploads", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.path;
}

// --- Game settings ---
const SETTINGS_FIELDS = [
  { group: "Round & Scoring", key: "roundDurationSec", label: "Round duration (sec)" },
  { group: "Round & Scoring", key: "countdownSec", label: "Countdown (sec)" },
  { group: "Round & Scoring", key: "leaderboardSize", label: "Leaderboard size" },
  { group: "Difficulty", key: "difficultyBadChanceBase", label: "Base bad-item chance (0-1)", step: "0.01" },
  { group: "Difficulty", key: "difficultyBadChanceRamp", label: "Bad-item chance ramp (0-1)", step: "0.01" },
  { group: "Item movement", key: "itemSpeedMin", label: "Item min speed", step: "0.1" },
  { group: "Item movement", key: "itemSpeedRandomAdd", label: "Item speed random range", step: "0.1" },
  { group: "Item movement", key: "itemSize", label: "Item size (px)" },
  { group: "Item movement", key: "spawnIntervalMinMs", label: "Min spawn interval (ms)" },
  { group: "Item movement", key: "spawnIntervalMaxMs", label: "Max spawn interval (ms)" },
  { group: "Item movement", key: "spawnIntervalDifficultyFactorMs", label: "Spawn interval difficulty factor (ms)" },
  { group: "Basket & canvas", key: "canvasWidth", label: "Canvas width (px)" },
  { group: "Basket & canvas", key: "basketWidth", label: "Basket width (px)" },
  { group: "Basket & canvas", key: "basketHeight", label: "Basket height (px)" },
  { group: "Basket & canvas", key: "basketStartX", label: "Basket start X" },
  { group: "Basket & canvas", key: "basketStartY", label: "Basket start Y" },
  { group: "Color tracking", key: "targetColor", label: "Tracked color", type: "color" },
  { group: "Color tracking", key: "colorHueToleranceDeg", label: "Hue tolerance (deg)" },
  { group: "Color tracking", key: "colorSaturationMin", label: "Min saturation (0-1)", step: "0.01" },
  { group: "Color tracking", key: "colorValueMin", label: "Min brightness (0-1)", step: "0.01" },
  { group: "Color tracking", key: "trackingEasing", label: "Tracking easing (0-1)", step: "0.01" },
  { group: "Color tracking", key: "trackingMinPixelCount", label: "Min matching pixels" },
  { group: "Color tracking", key: "trackingCanvasWidth", label: "Tracking canvas width" },
  { group: "Color tracking", key: "trackingCanvasHeight", label: "Tracking canvas height" },
  { group: "Color tracking", key: "cameraWidth", label: "Camera capture width" },
  { group: "Color tracking", key: "cameraHeight", label: "Camera capture height" },
  { group: "Audio", key: "audio.countdownBeepFreq", label: "Countdown beep freq (Hz)" },
  { group: "Audio", key: "audio.goBeepFreq", label: "GO beep freq (Hz)" },
  { group: "Audio", key: "audio.catchBeepFreq", label: "Catch beep freq (Hz)" },
  { group: "Audio", key: "audio.hitBeepFreq", label: "Hit beep freq (Hz)" },
  { group: "Audio", key: "audio.beepShortDurationSec", label: "Short beep duration (sec)", step: "0.01" },
  { group: "Audio", key: "audio.beepLongDurationSec", label: "Long beep duration (sec)", step: "0.01" }
];

const ASSET_FIELDS = [
  { key: "assets.logo", label: "Start screen logo" },
  { key: "assets.startButton", label: "Start button" },
  { key: "assets.basket", label: "Basket" },
  { key: "assets.background", label: "Background" },
  { key: "assets.timeUp", label: "Time's up image" },
  { key: "assets.playAgain", label: "Play again button" }
];

const settingsForm = document.getElementById("settings-form");
const settingsFieldsEl = document.getElementById("settings-fields");
const assetFieldsEl = document.getElementById("asset-fields");
const settingsError = document.getElementById("settings-error");
const settingsSuccess = document.getElementById("settings-success");
const rawJsonEl = document.getElementById("settings-raw-json");
const rawJsonError = document.getElementById("settings-raw-error");

let currentConfig = null;

function renderSettings(config) {
  currentConfig = config;

  const groups = [...new Set(SETTINGS_FIELDS.map((f) => f.group))];
  settingsFieldsEl.innerHTML = groups
    .map(
      (group) => `
    <fieldset>
      <legend>${escapeHtml(group)}</legend>
      ${SETTINGS_FIELDS.filter((f) => f.group === group)
        .map(
          (f) => `
        <label class="field-row">
          <span>${escapeHtml(f.label)}</span>
          <input type="${f.type || "number"}" data-key="${f.key}" value="${getPath(config, f.key)}" ${f.step ? `step="${f.step}"` : ""} />
        </label>`
        )
        .join("")}
    </fieldset>`
    )
    .join("");

  assetFieldsEl.innerHTML = ASSET_FIELDS.map(
    (f) => `
    <div class="asset-field">
      <img class="thumb" src="${resolveUrl(getPath(config, f.key))}" />
      <span>${escapeHtml(f.label)}</span>
      <input type="file" accept="image/*" data-asset-key="${f.key}" />
    </div>`
  ).join("");

  rawJsonEl.value = JSON.stringify(config, null, 2);
}

async function loadSettings() {
  const res = await authedFetch("/api/admin/config");
  renderSettings(await res.json());
}

settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(settingsError);
  settingsSuccess.textContent = "";

  const updates = {};
  settingsFieldsEl.querySelectorAll("input[data-key]").forEach((input) => {
    const value = input.type === "number" ? Number(input.value) : input.value;
    setPath(updates, input.dataset.key, value);
  });

  try {
    const res = await authedFetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok) {
      showError(settingsError, data.error || "Could not save settings.");
      return;
    }
    renderSettings(data);
    settingsSuccess.textContent = "Settings saved.";
  } catch {
    showError(settingsError, "Request failed.");
  }
});

assetFieldsEl.addEventListener("change", async (e) => {
  if (!e.target.matches("input[type=file]")) return;
  const key = e.target.dataset.assetKey;
  const file = e.target.files[0];
  if (!file) return;

  try {
    const path = await uploadImage(file);
    const updates = {};
    setPath(updates, key, path);
    const res = await authedFetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    renderSettings(await res.json());
  } catch (err) {
    showError(settingsError, err.message || "Upload failed.");
  }
});

document.getElementById("settings-raw-save").addEventListener("click", async () => {
  clearError(rawJsonError);
  let parsed;
  try {
    parsed = JSON.parse(rawJsonEl.value);
  } catch (err) {
    showError(rawJsonError, "Invalid JSON: " + err.message);
    return;
  }

  const res = await authedFetch("/api/admin/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed)
  });
  const data = await res.json();
  if (!res.ok) {
    showError(rawJsonError, data.error || "Could not save.");
    return;
  }
  renderSettings(data);
});

// --- Brands ---
const brandForm = document.getElementById("brand-form");
const brandFormError = document.getElementById("brand-form-error");
const brandsListEl = document.getElementById("brands-list");

async function loadBrands() {
  const res = await authedFetch("/api/admin/brands");
  cachedBrands = await res.json();

  brandsListEl.innerHTML =
    cachedBrands
      .map(
        (b) => `
    <div class="entity-row" data-id="${b.id}">
      <div class="img-upload">
        <img class="thumb" src="${resolveUrl(b.logo_path)}" />
        <input type="file" accept="image/*" data-img-field="logoPath" title="Replace logo" />
        <span class="thumb-label">Logo</span>
      </div>
      <div class="img-upload">
        <img class="thumb" src="${resolveUrl(b.score_icon_path)}" />
        <input type="file" accept="image/*" data-img-field="scoreIconPath" title="Replace score icon" />
        <span class="thumb-label">Score icon</span>
      </div>
      <div class="entity-fields">
        <input class="field-input" data-field="name" value="${escapeHtml(b.name)}" />
        <span class="key-badge">${escapeHtml(b.key)}</span>
        <label class="checkbox-label"><input type="checkbox" data-field="active" ${b.active ? "checked" : ""}/> Active</label>
        <input type="number" class="sort-input" data-field="sortOrder" value="${b.sort_order}" title="Sort order" />
        <button type="button" class="delete-btn secondary" data-action="delete">Delete</button>
      </div>
    </div>`
      )
      .join("") || "<p>No brands yet.</p>";
}

brandForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(brandFormError);

  const key = document.getElementById("brand-key").value;
  const name = document.getElementById("brand-name").value;

  const res = await authedFetch("/api/admin/brands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, name })
  });
  const data = await res.json();
  if (!res.ok) {
    showError(brandFormError, data.error || "Could not add brand.");
    return;
  }
  brandForm.reset();
  loadBrands();
});

brandsListEl.addEventListener("change", async (e) => {
  const row = e.target.closest(".entity-row");
  if (!row) return;
  const id = row.dataset.id;

  if (e.target.matches("input[type=file]")) {
    try {
      const path = await uploadImage(e.target.files[0]);
      await authedFetch(`/api/admin/brands/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [e.target.dataset.imgField]: path })
      });
      loadBrands();
    } catch (err) {
      alert(err.message || "Upload failed.");
    }
    return;
  }

  if (e.target.matches("[data-field]")) {
    const field = e.target.dataset.field;
    const value =
      e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? Number(e.target.value) : e.target.value;
    await authedFetch(`/api/admin/brands/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value })
    });
  }
});

brandsListEl.addEventListener("click", async (e) => {
  if (e.target.dataset.action !== "delete") return;
  const row = e.target.closest(".entity-row");
  if (!confirm("Delete this brand? Its items will remain but become unreachable in-game.")) return;
  await authedFetch(`/api/admin/brands/${row.dataset.id}`, { method: "DELETE" });
  loadBrands();
});

// --- Items ---
const itemForm = document.getElementById("item-form");
const itemFormError = document.getElementById("item-form-error");
const itemsListEl = document.getElementById("items-list");
const itemBrandFilterEl = document.getElementById("item-brand-filter");

function brandOptionsHtml(selectedKey) {
  return (
    `<option value="" ${!selectedKey ? "selected" : ""}>Global</option>` +
    cachedBrands
      .map((b) => `<option value="${escapeHtml(b.key)}" ${selectedKey === b.key ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
      .join("")
  );
}

async function loadItems() {
  const filter = itemBrandFilterEl.value;
  const qs = filter === "" ? "" : filter === "__global__" ? "?brand=" : `?brand=${encodeURIComponent(filter)}`;

  const res = await authedFetch(`/api/admin/items${qs}`);
  const items = await res.json();

  itemsListEl.innerHTML =
    items
      .map(
        (it) => `
    <div class="entity-row" data-id="${it.id}">
      <div class="img-upload">
        <img class="thumb" src="${resolveUrl(it.image_path)}" />
        <input type="file" accept="image/*" data-img-field="imagePath" title="Replace image" />
      </div>
      <div class="entity-fields">
        <input class="field-input" data-field="label" value="${escapeHtml(it.label)}" />
        <span class="key-badge">${escapeHtml(it.key)}</span>
        <input type="number" class="points-input" data-field="points" value="${it.points}" title="Points" />
        <input type="number" class="weight-input" data-field="weight" value="${it.weight}" min="1" title="Spawn weight" />
        <select data-field="brand">${brandOptionsHtml(it.brand)}</select>
        <label class="checkbox-label"><input type="checkbox" data-field="active" ${it.active ? "checked" : ""}/> Active</label>
        <button type="button" class="delete-btn secondary" data-action="delete">Delete</button>
      </div>
    </div>`
      )
      .join("") || "<p>No items yet.</p>";
}

itemBrandFilterEl.addEventListener("change", loadItems);

itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(itemFormError);

  const file = document.getElementById("item-image").files[0];
  if (!file) {
    showError(itemFormError, "Image is required.");
    return;
  }

  try {
    const imagePath = await uploadImage(file);
    const body = {
      key: document.getElementById("item-key").value,
      label: document.getElementById("item-label").value,
      points: Number(document.getElementById("item-points").value),
      weight: Number(document.getElementById("item-weight").value),
      brand: document.getElementById("item-brand").value || null,
      imagePath
    };
    const res = await authedFetch("/api/admin/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      showError(itemFormError, data.error || "Could not add item.");
      return;
    }
    itemForm.reset();
    loadItems();
  } catch (err) {
    showError(itemFormError, err.message || "Failed to add item.");
  }
});

itemsListEl.addEventListener("change", async (e) => {
  const row = e.target.closest(".entity-row");
  if (!row) return;
  const id = row.dataset.id;

  if (e.target.matches("input[type=file]")) {
    try {
      const path = await uploadImage(e.target.files[0]);
      await authedFetch(`/api/admin/items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePath: path })
      });
      loadItems();
    } catch (err) {
      alert(err.message || "Upload failed.");
    }
    return;
  }

  if (e.target.matches("[data-field]")) {
    const field = e.target.dataset.field;
    const value =
      e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? Number(e.target.value) : e.target.value;
    await authedFetch(`/api/admin/items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value })
    });
  }
});

itemsListEl.addEventListener("click", async (e) => {
  if (e.target.dataset.action !== "delete") return;
  const row = e.target.closest(".entity-row");
  if (!confirm("Delete this item?")) return;
  await authedFetch(`/api/admin/items/${row.dataset.id}`, { method: "DELETE" });
  loadItems();
});

init();

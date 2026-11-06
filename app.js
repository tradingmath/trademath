"use strict";
/* ══════════════ SETTINGS ══════════════ */

function getAppSettings() {
  try { return JSON.parse(localStorage.getItem("tm_settings") || "{}"); } catch(e) { return {}; }
}

function loadSettings() {
  const s = getAppSettings();
  // Trading defaults
  if ($("s_default_cap"))  $("s_default_cap").value  = s.defaultCap  != null ? s.defaultCap  : 100000;
  if ($("s_default_risk")) $("s_default_risk").value = s.defaultRisk != null ? s.defaultRisk : 1;
  if ($("s_default_lev"))  $("s_default_lev").value  = s.defaultLev  != null ? s.defaultLev  : "5";
  if ($("s_default_rr"))   $("s_default_rr").value   = s.defaultRR   != null ? s.defaultRR   : 2;

  // Apply defaults to calculator inputs if not already modified
  if ($("i_cap") && s.defaultCap)   $("i_cap").value = s.defaultCap;
  if ($("i_rsk") && s.defaultRisk)  $("i_rsk").value = s.defaultRisk;
  if ($("i_rr")  && s.defaultRR)    $("i_rr").value  = s.defaultRR;
  if (s.defaultLev && typeof setLeverage === "function") setLeverage(s.defaultLev);

  // Workflow toggles
  if ($("tog_quick_log")) $("tog_quick_log").checked = s.quickLog !== false;
  if ($("tog_show_fo"))   $("tog_show_fo").checked   = s.showFO === true;
  if (typeof toggleFOMode === "function") toggleFOMode(s.showFO === true);

  // Daily risk rules
  if ($("s_max_loss"))   $("s_max_loss").value   = s.maxDailyLoss  || "";
  if ($("s_max_trades")) $("s_max_trades").value = s.maxDailyTrades || "";

  // Fee settings
  if ($("s_brokerage"))  $("s_brokerage").value  = s.brokerage != null ? s.brokerage : 20;
  if ($("s_gst_pct"))    $("s_gst_pct").value    = s.gstPct    != null ? s.gstPct    : 18;
  if ($("tog_show_fees"))$("tog_show_fees").checked = s.showFees !== false;

  // Theme
  if ($("tog_dark")) $("tog_dark").checked = s.darkMode !== false;
  applyDarkToggle(s.darkMode !== false);
  applyBaseTheme(s.baseTheme || "midnight");
  applyAccent(s.accentColor || "amber");
  renderChecklistSettings();
}

function saveSettings() {
  const s = getAppSettings();
  if ($("s_default_cap"))  s.defaultCap   = parseFloat($("s_default_cap").value)  || 100000;
  if ($("s_default_risk")) s.defaultRisk  = parseFloat($("s_default_risk").value) || 1;
  if ($("s_default_lev"))  s.defaultLev   = $("s_default_lev").value || "5";
  if ($("s_default_rr"))   s.defaultRR    = parseFloat($("s_default_rr").value)   || 2;

  if ($("tog_quick_log"))  s.quickLog     = $("tog_quick_log").checked;
  if ($("tog_show_fo"))    s.showFO       = $("tog_show_fo").checked;

  if ($("s_max_loss"))     s.maxDailyLoss   = $("s_max_loss").value   || "";
  if ($("s_max_trades"))   s.maxDailyTrades = $("s_max_trades").value || "";
  if ($("s_brokerage"))    s.brokerage      = parseFloat($("s_brokerage").value) || 20;
  if ($("s_gst_pct"))      s.gstPct         = parseFloat($("s_gst_pct").value)   || 18;
  if ($("tog_show_fees"))  s.showFees       = $("tog_show_fees").checked;
  try { localStorage.setItem("tm_settings", JSON.stringify(s)); } catch(e) {}
}

// Trading defaults inputs
["s_default_cap","s_default_risk","s_default_lev","s_default_rr"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("change", () => {
    saveSettings();
    const s = getAppSettings();
    if ($("i_cap")) $("i_cap").value = s.defaultCap || 100000;
    if ($("i_rsk")) $("i_rsk").value = s.defaultRisk || 1;
    if ($("i_rr"))  $("i_rr").value  = s.defaultRR || 2;
    if (s.defaultLev && typeof setLeverage === "function") setLeverage(s.defaultLev);
    if (typeof calc === "function") calc();
  });
});

// Calculator workflow toggles
const togQuickLog = $("tog_quick_log");
if (togQuickLog) togQuickLog.addEventListener("change", () => saveSettings());

const togShowFO = $("tog_show_fo");
if (togShowFO) togShowFO.addEventListener("change", () => {
  saveSettings();
  if (typeof toggleFOMode === "function") toggleFOMode(togShowFO.checked);
});

// Daily risk rule inputs
["s_max_loss","s_max_trades"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("change", () => { saveSettings(); renderDailyBanner(); });
});

// Fee setting inputs
["s_brokerage","s_gst_pct"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("change", () => { saveSettings(); calc(); });
});

const togShowFees = $("tog_show_fees");
if (togShowFees) togShowFees.addEventListener("change", () => { saveSettings(); calc(); renderFeeBreakdown(); });

/* ── Checklist management ── */
function getChecklistItems() {
  try { return JSON.parse(localStorage.getItem("tm_checklist") || "[]"); } catch(e) { return []; }
}
function saveChecklistItems(items) {
  try { localStorage.setItem("tm_checklist", JSON.stringify(items)); } catch(e) {}
}

function renderChecklistSettings() {
  const el = $("settings_checklist");
  if (!el) return;
  const items = getChecklistItems();
  if (!items.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--fg3);padding:8px 0">No items yet. Add your pre-trade rules below.</div>`;
    return;
  }
  el.innerHTML = items.map((item, i) => `
    <div class="chk-item">
      <div class="chk-box checked" style="cursor:default">✓</div>
      <span class="chk-label">${item}</span>
      <button class="chk-del" onclick="deleteChecklistItem(${i})" title="Remove">✕</button>
    </div>`).join("");
}

function deleteChecklistItem(i) {
  const items = getChecklistItems();
  items.splice(i, 1);
  saveChecklistItems(items);
  renderChecklistSettings();
}

$("add_checklist_btn").addEventListener("click", () => {
  const input = $("new_checklist_item");
  const text  = input.value.trim();
  if (!text) return;
  const items = getChecklistItems();
  items.push(text);
  saveChecklistItems(items);
  input.value = "";
  renderChecklistSettings();
});
$("new_checklist_item").addEventListener("keydown", e => {
  if (e.key === "Enter") $("add_checklist_btn").click();
});

/* ══════════════ TABS ══════════════ */
function switchTab(name) {
  ["calc","journal","settings"].forEach(t => {
    $("tab-"+t).hidden = t !== name;
    document.querySelector('.tab-btn[data-tab="'+t+'"]').classList.toggle("active", t === name);
  });
  if (name === "calc")    { renderTodayTrades(); renderDailyBanner(); }
  if (name === "journal") refreshJournal();
}
document.querySelectorAll(".tab-btn").forEach(b => {
  b.addEventListener("click", () => switchTab(b.dataset.tab));
});

/* ══════════════ THEME & PALETTES ══════════════ */
const ACCENT_COLORS = {
  amber:      { dark:"#f59e0b", light:"#d97706", dim:"rgba(245,158,11,.15)" },
  cyan:       { dark:"#06b6d4", light:"#0891b2", dim:"rgba(6,182,212,.15)"  },
  emerald:    { dark:"#10b981", light:"#059669", dim:"rgba(16,185,129,.15)" },
  blue:       { dark:"#3b82f6", light:"#2563eb", dim:"rgba(59,130,246,.15)" },
  purple:     { dark:"#8b5cf6", light:"#7c3aed", dim:"rgba(139,92,246,.15)" },
  rose:       { dark:"#f43f5e", light:"#e11d48", dim:"rgba(244,63,94,.15)"  },
  sunset:     { dark:"#f97316", light:"#ea580c", dim:"rgba(249,115,22,.15)" },
  lime:       { dark:"#84cc16", light:"#65a30d", dim:"rgba(132,204,22,.15)" },
  gold:       { dark:"#eab308", light:"#ca8a04", dim:"rgba(234,179,8,.15)"  },
  monochrome: { dark:"#94a3b8", light:"#475569", dim:"rgba(148,163,184,.15)" }
};

function applyAccent(name) {
  const c = ACCENT_COLORS[name] || ACCENT_COLORS.amber;
  const isDark = document.documentElement.dataset.theme !== "light";
  const val = isDark ? c.dark : c.light;
  document.documentElement.style.setProperty("--accent",     val);
  document.documentElement.style.setProperty("--accent-dim", c.dim);
  document.querySelectorAll(".palette-card").forEach(s => s.classList.toggle("active", s.dataset.color === name));
}

function applyBaseTheme(base) {
  const r = document.documentElement;
  if (!base || base === "midnight") {
    delete r.dataset.baseTheme;
  } else {
    r.dataset.baseTheme = base;
  }
  document.querySelectorAll(".theme-preset-btn").forEach(b => {
    b.classList.toggle("active", (b.dataset.base || "midnight") === (base || "midnight"));
  });
}

function applyDarkToggle(dark) {
  const r = document.documentElement;
  const baseWrap = $("base_theme_wrap");
  if (dark) {
    delete r.dataset.theme;
    $("themeBtn").textContent = "☀ Light";
    if (baseWrap) baseWrap.style.display = "";
  } else {
    r.dataset.theme = "light";
    $("themeBtn").textContent = "☾ Dark";
    if (baseWrap) baseWrap.style.display = "none";
  }
  const s = getAppSettings();
  applyBaseTheme(s.baseTheme || "midnight");
  applyAccent(s.accentColor || "amber");
}

// Header theme button (quick toggle)
$("themeBtn").addEventListener("click", () => {
  const isLight = document.documentElement.dataset.theme === "light";
  const goDark  = isLight;
  applyDarkToggle(goDark);
  const s = getAppSettings(); s.darkMode = goDark;
  try { localStorage.setItem("tm_settings", JSON.stringify(s)); } catch(e){}
  const togEl = $("tog_dark");
  if (togEl) togEl.checked = goDark;
});

// Settings dark toggle
const togDarkEl = $("tog_dark");
if (togDarkEl) togDarkEl.addEventListener("change", () => {
  applyDarkToggle(togDarkEl.checked);
  const s = getAppSettings(); s.darkMode = togDarkEl.checked;
  try { localStorage.setItem("tm_settings", JSON.stringify(s)); } catch(e){}
});

// Accent palette cards
document.querySelectorAll(".palette-card").forEach(card => {
  card.addEventListener("click", () => {
    const color = card.dataset.color;
    applyAccent(color);
    const s = getAppSettings(); s.accentColor = color;
    try { localStorage.setItem("tm_settings", JSON.stringify(s)); } catch(e){}
  });
});

// Base theme preset buttons (Midnight, OLED Black, Slate Navy)
document.querySelectorAll(".theme-preset-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const base = btn.dataset.base;
    applyBaseTheme(base);
    const s = getAppSettings(); s.baseTheme = base;
    try { localStorage.setItem("tm_settings", JSON.stringify(s)); } catch(e){}
  });
});

/* ══════════════ POP OUT ══════════════ */
$("popBtn").addEventListener("click", () => {
  const w = 420, h = 620;
  const left = Math.max(0, screen.width - w - 20);
  const top  = Math.max(0, Math.round((screen.height - h) / 2));
  const win  = window.open(location.href + "?popout=1", "trademath_popout",
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no`);
  if (!win) alert("Pop-up blocked — please allow pop-ups for this site in your browser.");
});

if (new URLSearchParams(location.search).get("popout") === "1") {
  const style = document.createElement("style");
  style.textContent = `
    #popBtn,#themeBtn{display:none!important}
    .tabs,#tab-journal,#tab-settings,#tab-analytics,#rep_body,.calc-right,.note{display:none!important}
    body{padding-bottom:16px}
    .header{padding:10px 0}
    .logo em{display:none}
  `;
  document.head.appendChild(style);
}

/* ══════════════ INIT ══════════════ */
loadTrades();
loadSettings();
calc();
renderTodayTrades();

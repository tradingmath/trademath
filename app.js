"use strict";
/* ══════════════ SETTINGS ══════════════ */

const MKT_KEYS = ["equity","nifty","bnf","gold","crude","btc","custom"];

function getAppSettings() {
  try { return JSON.parse(localStorage.getItem("tm_settings") || "{}"); } catch(e) { return {}; }
}

function loadSettings() {
  const s = getAppSettings();
  MKT_KEYS.forEach(k => { const el = $("tog_"+k); if (el) el.checked = s[k] !== false; });
  // Daily risk rules
  if ($("s_max_loss"))   $("s_max_loss").value   = s.maxDailyLoss  || "";
  if ($("s_max_trades")) $("s_max_trades").value = s.maxDailyTrades || "";
  applyMarketToggles();
  renderChecklistSettings();
}

function saveSettings() {
  const s = getAppSettings();
  MKT_KEYS.forEach(k => { const el = $("tog_"+k); if (el) s[k] = el.checked; });
  if ($("s_max_loss"))   s.maxDailyLoss   = $("s_max_loss").value   || "";
  if ($("s_max_trades")) s.maxDailyTrades = $("s_max_trades").value || "";
  try { localStorage.setItem("tm_settings", JSON.stringify(s)); } catch(e) {}
}

function applyMarketToggles() {
  MKT_KEYS.forEach(k => {
    const chip = document.querySelector('.chip[data-mkt="'+k+'"]');
    const tog  = $("tog_"+k);
    if (!chip || !tog) return;
    chip.style.display = tog.checked ? "" : "none";
  });
  const activeChip = document.querySelector('.chip.active');
  if (activeChip && activeChip.style.display === "none") {
    const firstVisible = document.querySelector('.chip:not([style*="none"])');
    if (firstVisible) firstVisible.click();
  }
}

MKT_KEYS.forEach(k => {
  const el = $("tog_"+k);
  if (el) el.addEventListener("change", () => { saveSettings(); applyMarketToggles(); });
});

// Daily risk rule inputs
["s_max_loss","s_max_trades"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("change", () => { saveSettings(); renderDailyBanner(); });
});

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
  ["calc","journal","analytics","settings"].forEach(t => {
    $("tab-"+t).hidden = t !== name;
    document.querySelector('.tab-btn[data-tab="'+t+'"]').classList.toggle("active", t === name);
  });
  if (name === "calc")      { renderTodayTrades(); renderDailyBanner(); }
  if (name === "journal")   refreshJournal();
  if (name === "analytics") renderAnalytics();
}
document.querySelectorAll(".tab-btn").forEach(b => {
  b.addEventListener("click", () => switchTab(b.dataset.tab));
});

/* ══════════════ THEME ══════════════ */
$("themeBtn").addEventListener("click", () => {
  const r = document.documentElement;
  if (r.dataset.theme === "light") { delete r.dataset.theme; $("themeBtn").textContent = "☀ Light"; }
  else { r.dataset.theme = "light"; $("themeBtn").textContent = "☾ Dark"; }
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

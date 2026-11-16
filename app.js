"use strict";
/* ══════════════ SETTINGS ══════════════
   The Settings page is STAGED: its controls only edit a draft. Nothing is saved or applied until the user
   presses "Save changes" and confirms. getAppSettings() always returns what is actually saved. */

function getAppSettings() {
  try { return JSON.parse(localStorage.getItem("tm_settings") || "{}"); } catch(e) { return {}; }
}
// For state that is NOT on the Settings page (lot size, level, options toggle). Page settings go through commitSettings().
function saveSetting(key, value) {
  const s = getAppSettings(); s[key] = value;
  try { localStorage.setItem("tm_settings", JSON.stringify(s)); } catch(e) {}
}
function getChecklistItems() {
  try { return JSON.parse(localStorage.getItem("tm_checklist") || "[]"); } catch(e) { return []; }
}
function saveChecklistItems(items) {
  try { localStorage.setItem("tm_checklist", JSON.stringify(items)); } catch(e) {}
}
const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ── draft state for controls that are not plain inputs ── */
let draftBase = "midnight", draftAccent = "blue", draftChecklist = [], draftMin = 5, minTouched = false;
const BASE_NAMES  = { midnight: "Midnight", oled: "OLED Black", slate: "Slate Navy" };
const paletteName = c => { const el = document.querySelector('.palette-card[data-color="' + c + '"] .palette-name'); return el ? el.textContent : c; };
const onOff       = v => v ? "On" : "Off";
const positive    = (id, fb) => { const v = parseFloat($(id).value); return v > 0 ? v : fb; };
const nonNeg      = (id, fb) => { const v = parseFloat($(id).value); return isNaN(v) || v < 0 ? fb : v; };
const rupees      = v => "₹" + Number(v).toLocaleString("en-IN");

/* One row per setting on the page: how to read the draft, how to fill the control, the default, and how to show it. */
const SETTINGS_FIELDS = [
  { scope: "settings", key: "darkMode",    label: "Dark mode",           fb: true,       get: () => $("tog_dark").checked,                 set: v => { $("tog_dark").checked = v; }, fmt: onOff },
  { scope: "settings", key: "baseTheme",   label: "Dark terminal theme", fb: "midnight", get: () => draftBase,                              set: v => { draftBase = v; },            fmt: v => BASE_NAMES[v] || v },
  { scope: "settings", key: "accentColor", label: "Accent colour",       fb: "blue",     get: () => draftAccent,                            set: v => { draftAccent = v; },          fmt: paletteName },
  { scope: "settings", key: "defaultCap",  label: "Default capital",     fb: 100000,     get: () => positive("s_default_cap", 100000),     set: v => { $("s_default_cap").value = v; },  fmt: rupees },
  { scope: "settings", key: "defaultRisk", label: "Default risk %",      fb: 1,          get: () => positive("s_default_risk", 1),         set: v => { $("s_default_risk").value = v; }, fmt: v => v + "%" },
  { scope: "settings", key: "defaultLev",  label: "Default leverage",    fb: "5",        get: () => $("s_default_lev").value,              set: v => { $("s_default_lev").value = v; }, fmt: v => v === "5" ? "5× intraday" : v === "1" ? "1× cash" : "Custom" },
  { scope: "settings", key: "defaultRR",   label: "Default target R:R",  fb: 2,          get: () => positive("s_default_rr", 2),           set: v => { $("s_default_rr").value = v; },  fmt: v => "1 : " + v },
  { scope: "settings", key: "defaultMarket", label: "I mainly trade",    fb: "NSE Equity", get: () => $("s_default_market").value,         set: v => { $("s_default_market").value = v; }, fmt: v => v },
  { scope: "settings", key: "quickLog",    label: "One-click quick log", fb: true,       get: () => $("tog_quick_log").checked,            set: v => { $("tog_quick_log").checked = v; }, fmt: onOff },
  { scope: "settings", key: "showFO",      label: "F&O mode by default", fb: false,      get: () => $("tog_show_fo").checked,              set: v => { $("tog_show_fo").checked = v; }, fmt: onOff },
  { scope: "settings", key: "showFees",    label: "Show fee breakdown",  fb: true,       get: () => $("tog_show_fees").checked,            set: v => { $("tog_show_fees").checked = v; }, fmt: onOff },
  { scope: "settings", key: "brokerage",   label: "Brokerage per order", fb: 20,         get: () => nonNeg("s_brokerage", 20),             set: v => { $("s_brokerage").value = v; },   fmt: v => "₹" + v },
  { scope: "settings", key: "gstPct",      label: "GST",                 fb: 18,         get: () => nonNeg("s_gst_pct", 18),               set: v => { $("s_gst_pct").value = v; },     fmt: v => v + "%" },
  { scope: "settings", key: "maxDailyLoss",   label: "Max daily loss",   fb: "",         get: () => $("s_max_loss").value.trim(),          set: v => { $("s_max_loss").value = v; },    fmt: v => v ? rupees(v) : "Off" },
  { scope: "settings", key: "maxDailyTrades", label: "Max trades / day", fb: "",         get: () => $("s_max_trades").value.trim(),        set: v => { $("s_max_trades").value = v; }, fmt: v => v || "Off" },
  { scope: "alert",    key: "min",    label: "Beep interval",      get: () => draftMin,                          set: v => { draftMin = v; },                 fmt: v => v + " min" },
  { scope: "alert",    key: "anchor", label: "Beep aligned to",    get: () => +$("alert_anchor").value,          set: v => { $("alert_anchor").value = String(v); }, fmt: v => +v === 0 ? "Clock (:00)" : "NSE candles (9:15)" },
  { scope: "alert",    key: "lead",   label: "Beep before close",  get: () => +$("alert_lead").value,            set: v => { $("alert_lead").value = String(v); },   fmt: v => +v ? v + " sec early" : "At the close" },
  { scope: "alert",    key: "sound",  label: "Beep sound",         get: () => $("alert_sound").value,            set: v => { $("alert_sound").value = v; },         fmt: v => (tmAlert.SOUNDS[v] || {}).label || v },
  { scope: "alert",    key: "vol",    label: "Beep volume",        get: () => +$("alert_vol").value,             set: v => { $("alert_vol").value = v; },           fmt: v => v + "%" },
  { scope: "alert",    key: "hours",  label: "Beep only in market hours", get: () => $("alert_hours").checked,   set: v => { $("alert_hours").checked = v; },    fmt: onOff },
  { scope: "checklist", key: "checklist", label: "Pre-trade checklist", get: () => JSON.stringify(draftChecklist), set: () => {}, fmt: v => JSON.parse(v).length + " item(s)" },
];

function savedOf(f) {
  if (f.scope === "alert")     return tmAlert.getConfig()[f.key];
  if (f.scope === "checklist") return JSON.stringify(getChecklistItems());
  const v = getAppSettings()[f.key];
  return v != null ? v : f.fb;
}
function changes() {
  return SETTINGS_FIELDS.map(f => ({ f, from: savedOf(f), to: f.get() })).filter(c => String(c.from) !== String(c.to));
}

/* Highlight the choices in the draft (this never applies a theme; only a confirmed save does). */
function paintChoices() {
  document.querySelectorAll(".palette-card").forEach(c => c.classList.toggle("active", c.dataset.color === draftAccent));
  document.querySelectorAll(".theme-preset-btn").forEach(b => b.classList.toggle("active", (b.dataset.base || "midnight") === draftBase));
}
function paintBeepChips() {
  let preset = false;
  document.querySelectorAll("#beep_settings .alert-chip").forEach(c => {
    const on = +c.dataset.min === draftMin; c.classList.toggle("active", on); if (on) preset = true;
  });
  const cu = $("alert_custom");
  if (document.activeElement !== cu) cu.value = preset ? "" : draftMin;
}
function renderChecklistSettings() {
  const el = $("settings_checklist");
  if (!el) return;
  if (!draftChecklist.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--fg3);padding:8px 0">No items yet. Add your pre-trade rules below.</div>`;
    return;
  }
  el.innerHTML = draftChecklist.map((item, i) => `
    <div class="chk-item">
      <div class="chk-box checked" style="cursor:default">✓</div>
      <span class="chk-label">${esc(item)}</span>
      <button class="chk-del" onclick="deleteChecklistItem(${i})" title="Remove">✕</button>
    </div>`).join("");
}
function deleteChecklistItem(i) {
  draftChecklist.splice(i, 1);
  renderChecklistSettings();
  refreshDirty();
}

function refreshDirty() {
  const n = changes().length;
  $("set_status").textContent = n ? `● ${n} unsaved change${n === 1 ? "" : "s"}` : "All changes saved";
  $("set_status").classList.toggle("dirty", n > 0);
  $("set_save").disabled = $("set_discard").disabled = !n;
  document.querySelector('.tab-btn[data-tab="settings"]').classList.toggle("dirty", n > 0);
}

/* Fill every control from what is saved (page load, and Discard). */
function populateForm() {
  SETTINGS_FIELDS.forEach(f => {
    if (f.scope === "checklist") draftChecklist = getChecklistItems().slice();
    else f.set(savedOf(f));
  });
  minTouched = false;
  paintChoices(); paintBeepChips(); renderChecklistSettings(); refreshDirty();
}

/* Apply what is saved to the running app (page load). */
function loadSettings() {
  const s = getAppSettings();
  if ($("i_lot")) $("i_lot").value = rememberedLot();
  if ($("i_cap") && s.defaultCap)  $("i_cap").value = s.defaultCap;
  if ($("i_rsk") && s.defaultRisk) $("i_rsk").value = s.defaultRisk;
  if ($("i_rr")  && s.defaultRR)   $("i_rr").value  = s.defaultRR;
  if (s.defaultLev) setLeverage(s.defaultLev);
  toggleFOMode(s.showFO === true);
  applyDarkToggle(s.darkMode !== false);               // also applies the saved base theme and accent
  populateForm();
}

/* ── confirm, then save ── */
function openSettingsConfirm() {
  const ch = changes(); if (!ch.length) return;
  const show = (f, v) => esc(f.fmt ? f.fmt(v) : String(v));
  $("set_changes").innerHTML = ch.map(c => `<li><b>${esc(c.f.label)}</b><span><s>${show(c.f, c.from)}</s> → ${show(c.f, c.to)}</span></li>`).join("");
  $("setConfirm").hidden = false;
  $("set_confirm_yes").focus();
}
function commitSettings() {
  const ch = changes();
  if (!ch.length) { $("setConfirm").hidden = true; return; }
  const changed = new Set(ch.map(c => c.f.key));
  const s = getAppSettings();
  const beep = {};
  ch.forEach(c => {
    if (c.f.scope === "settings") s[c.f.key] = c.to;
    else if (c.f.scope === "alert") beep[c.f.key] = c.to;
  });
  try { localStorage.setItem("tm_settings", JSON.stringify(s)); } catch(e) {}
  if (Object.keys(beep).length) tmAlert.setConfig(beep);
  if (changed.has("checklist")) saveChecklistItems(draftChecklist);

  // ── apply only what changed, so unrelated calculator inputs are left alone ──
  if (changed.has("darkMode") || changed.has("baseTheme") || changed.has("accentColor")) applyDarkToggle(s.darkMode !== false);
  if (["defaultCap", "defaultRisk", "defaultRR", "defaultLev"].some(k => changed.has(k))) {
    $("i_cap").value = s.defaultCap || 100000;
    $("i_rsk").value = s.defaultRisk || 1;
    $("i_rr").value  = s.defaultRR || 2;
    setLeverage(s.defaultLev || "5");
  }
  if (changed.has("showFO") && getLevel() === "pro") toggleFOMode(s.showFO === true);
  if (changed.has("maxDailyLoss") || changed.has("maxDailyTrades")) renderDailyBanner();
  calc();
  renderFeeBreakdown();

  $("setConfirm").hidden = true;
  populateForm();
  showToast("✓ Settings saved");
}
function discardSettings() { populateForm(); showToast("Changes discarded"); }

/* ── wiring: every control only updates the draft ── */
["tog_dark", "s_default_cap", "s_default_risk", "s_default_lev", "s_default_rr", "s_default_market", "tog_quick_log",
 "tog_show_fo", "tog_show_fees", "s_brokerage", "s_gst_pct", "s_max_loss", "s_max_trades",
 "alert_anchor", "alert_lead", "alert_hours", "alert_vol"].forEach(id => {
  const el = $(id); if (!el) return;
  ["input", "change"].forEach(ev => el.addEventListener(ev, refreshDirty));
});
document.querySelectorAll(".palette-card").forEach(card => card.addEventListener("click", () => { draftAccent = card.dataset.color; paintChoices(); refreshDirty(); }));
document.querySelectorAll(".theme-preset-btn").forEach(btn => btn.addEventListener("click", () => { draftBase = btn.dataset.base || "midnight"; paintChoices(); refreshDirty(); }));
document.querySelectorAll("#beep_settings .alert-chip").forEach(c => c.addEventListener("click", () => {
  draftMin = +c.dataset.min; minTouched = true; $("alert_custom").value = ""; paintBeepChips(); refreshDirty();
}));
$("alert_custom").addEventListener("input", e => {
  const v = Math.round(parseFloat(e.target.value));
  if (v >= 1 && v <= 720) { draftMin = v; minTouched = true; paintBeepChips(); refreshDirty(); }
});
const stagedBeep = () => ({ sound: $("alert_sound").value, vol: +$("alert_vol").value });
$("alert_sound").addEventListener("change", () => { refreshDirty(); tmAlert.preview(stagedBeep()); });     // hear it before saving
document.querySelectorAll("#beep_settings .alert-test").forEach(b => b.addEventListener("click", () => tmAlert.preview(stagedBeep())));
document.addEventListener("tm:beepchanged", () => {                       // the header menu changed the interval live
  if (!minTouched) { draftMin = tmAlert.getConfig().min; paintBeepChips(); }
  refreshDirty();
});

$("add_checklist_btn").addEventListener("click", () => {
  const input = $("new_checklist_item");
  const text  = input.value.trim();
  if (!text) return;
  draftChecklist.push(text);
  input.value = "";
  renderChecklistSettings();
  refreshDirty();
});
$("new_checklist_item").addEventListener("keydown", e => { if (e.key === "Enter") $("add_checklist_btn").click(); });

$("set_save").addEventListener("click", openSettingsConfirm);
$("set_discard").addEventListener("click", discardSettings);
$("set_confirm_yes").addEventListener("click", commitSettings);
$("set_confirm_no").addEventListener("click", () => { $("setConfirm").hidden = true; $("set_save").focus(); });
$("setConfirm").addEventListener("click", e => { if (e.target === $("setConfirm")) $("setConfirm").hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("setConfirm").hidden) $("setConfirm").hidden = true; });
window.addEventListener("beforeunload", e => { if (changes().length) { e.preventDefault(); e.returnValue = ""; } });

/* ══════════════ TABS ══════════════ */
/* Every page has its own link: #calc (home), #journal, #journal/projection, #settings.
   Hash links work on Netlify, on localhost and when index.html is opened straight from disk. */
const PAGES = ["calc", "journal", "settings"];
const PAGE_TITLES = { calc: "TradeMath", journal: "TradeMath · Journal", settings: "TradeMath · Settings" };
let currentRoute = null;

function parseRoute() {
  const [tab, sub] = location.hash.replace(/^#\/?/, "").split("/");
  return { tab: PAGES.includes(tab) ? tab : "calc", sub: sub || "" };
}
function showRoute(tab, sub) {
  if (tab === "journal" && sub === "projection" && getLevel() !== "pro") {   // Projection belongs to Pro
    sub = "";
    if (location.hash !== "#journal") location.hash = "#journal";
  }
  currentRoute = tab + "/" + sub;
  PAGES.forEach(t => {
    $("tab-"+t).hidden = t !== tab;
    document.querySelector('.tab-btn[data-tab="'+t+'"]').classList.toggle("active", t === tab);
  });
  document.title = sub === "projection" && tab === "journal" ? "TradeMath · Projection" : PAGE_TITLES[tab];
  if (tab === "calc")    { renderTodayTrades(); renderDailyBanner(); }
  if (tab === "journal") {
    const proj = sub === "projection";
    showJournalView(proj ? "projection" : "main");
    if (!proj) refreshJournal();
  }
}
function switchTab(tab, sub) {
  sub = sub || "";
  const h = "#" + tab + (sub ? "/" + sub : "");
  showRoute(tab, sub);                       // synchronous, so callers can act on the new page straight away
  if (location.hash !== h) location.hash = h; // hashchange then fires, but showRoute is skipped (already on this route)
}
window.addEventListener("hashchange", () => {  // back/forward buttons, typed or bookmarked links
  const { tab, sub } = parseRoute();
  if (tab + "/" + sub !== currentRoute) showRoute(tab, sub);
});
document.querySelectorAll(".tab-btn").forEach(b => {
  b.addEventListener("click", () => switchTab(b.dataset.tab));
});

/* ══════════════ INTERFACE LEVEL: Quick ⊂ Trader ⊂ Pro ══════════════
   Visibility is pure CSS (data-level attributes, see styles.css). This code only remembers the choice and
   resets state owned by features that just became hidden, so a control you can't see never changes results.
   Safety features (the daily-loss banner and your risk rules) stay visible at every level. */
const LEVELS = {
  quick:  { icon: "⚡", name: "Quick" },
  trader: { icon: "📈", name: "Trader" },
  pro:    { icon: "🛠", name: "Pro" },
};
const LEVEL_ORDER = ["quick", "trader", "pro"];

function getLevel() {
  const l = document.documentElement.dataset.ui;
  return LEVEL_ORDER.includes(l) ? l : "trader";
}

function setLevel(level, init) {
  if (!LEVEL_ORDER.includes(level)) level = "trader";
  document.documentElement.dataset.ui = level;
  const s = getAppSettings(); s.uiLevel = level;
  try { localStorage.setItem("tm_settings", JSON.stringify(s)); } catch (e) {}

  $("lvl_icon").textContent  = LEVELS[level].icon;
  $("lvl_label").textContent = LEVELS[level].name;
  document.querySelectorAll(".lvl-item").forEach(b => b.setAttribute("aria-checked", String(b.dataset.ui === level)));

  const rank = LEVEL_ORDER.indexOf(level);
  if (rank < 2) {                                   // Pro features are now hidden
    if (showFOMode) {
      const keepOptions = instrType === "options";  // options have their own toggle at every level
      toggleFOMode(false);                          // futures and the F&O tabs are Pro only
      if (keepOptions) setInstrType("options");
      else { const sym = getSelectedSymbol(); if (sym && sym.indexOnly) { $("sym_input").value = ""; updateLotLabel(); } }
    }
    if (currentRoute === "journal/projection") switchTab("journal");
  }
  if (rank < 1) {                                   // Trader features are now hidden: back to the plain defaults
    const d = getAppSettings();
    if (!$("flatRiskToggle").checked) { $("flatRiskToggle").checked = true; $("flatRiskToggle").dispatchEvent(new Event("change")); }
    if (!parseFloat($("i_flat").value)) $("i_flat").value = Math.round((d.defaultCap || 100000) * (d.defaultRisk || 1) / 100);
    setLeverage(d.defaultLev || "5");
    if ($("sym_input").value) { $("sym_input").value = ""; updateLotLabel(); }
    ["flt_market", "flt_dir", "flt_result"].forEach(id => { $(id).value = ""; });
    if (typeof renderReports === "function") renderReports();
  }
  calc();
}

(function initLevelMenu() {
  const btn = $("lvl_btn"), pop = $("lvl_pop");
  const setOpen = o => { pop.hidden = !o; btn.setAttribute("aria-expanded", String(o)); };
  btn.addEventListener("click", () => setOpen(pop.hidden));
  document.addEventListener("click", e => { if (!pop.hidden && !$("lvl_wrap").contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { setOpen(false); btn.focus(); } });
  document.querySelectorAll(".lvl-item").forEach(b => b.addEventListener("click", () => { setLevel(b.dataset.ui); setOpen(false); btn.focus(); }));
})();

/* ══════════════ THEME & PALETTES ══════════════ */
const ACCENT_COLORS = {
  amber:      { dark:"#f59e0b", light:"#d97706", dim:"rgba(245,158,11,.15)" },
  cyan:       { dark:"#06b6d4", light:"#0891b2", dim:"rgba(6,182,212,.15)"  },
  emerald:    { dark:"#10b981", light:"#059669", dim:"rgba(16,185,129,.15)" },
  blue:       { dark:"#3b82f6", light:"#2563eb", dim:"rgba(59,130,246,.15)", solid:"#2563eb" },
  purple:     { dark:"#8b5cf6", light:"#7c3aed", dim:"rgba(139,92,246,.15)", solid:"#7c3aed" },
  rose:       { dark:"#f43f5e", light:"#e11d48", dim:"rgba(244,63,94,.15)",  solid:"#e11d48" },
  sunset:     { dark:"#f97316", light:"#ea580c", dim:"rgba(249,115,22,.15)" },
  lime:       { dark:"#84cc16", light:"#65a30d", dim:"rgba(132,204,22,.15)" },
  gold:       { dark:"#eab308", light:"#ca8a04", dim:"rgba(234,179,8,.15)"  },
  monochrome: { dark:"#94a3b8", light:"#475569", dim:"rgba(148,163,184,.15)" }
};

// Black or white text, whichever has the higher contrast on the given hex fill.
function bestOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? "#ffffff" : "#000000";
}

function applyAccent(name) {
  const c = ACCENT_COLORS[name] || ACCENT_COLORS.blue;
  const isDark = document.documentElement.dataset.theme !== "light";
  const val = isDark ? c.dark : c.light;
  const solid = c.solid || val;
  const root = document.documentElement.style;
  root.setProperty("--accent",       val);
  root.setProperty("--accent-dim",   c.dim);
  root.setProperty("--accent-solid", solid);
  root.setProperty("--on-accent",    bestOn(solid));
}

function applyBaseTheme(base) {
  const r = document.documentElement;
  if (!base || base === "midnight") {
    delete r.dataset.baseTheme;
  } else {
    r.dataset.baseTheme = base;
  }
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
  applyAccent(s.accentColor || "blue");
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
  refreshDirty();
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
    .tabs,#tab-journal,#tab-settings,#rep_body,.calc-right,.note{display:none!important}
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
setLevel(getLevel(), true);                              // apply the saved level (and reset anything it hides)
if (getAppSettings().optionsOn) setInstrType("options"); // reopen in options mode if that is how you left it
{ const r = parseRoute(); showRoute(r.tab, r.sub); }   // open the page named in the link

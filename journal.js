"use strict";
/* ══════════════ JOURNAL ══════════════ */

let trades   = [];
let editId   = null;

/* Every trade has the same shape whichever level logged it: market (from the fixed MARKETS list), symbol,
   instrument ("equity" | "options" | "futures") and optType. Older trades stored a symbol name or "Options (CE)"
   in the market field, which broke the Market filter; this repairs them once on load. */
const TRADE_NUM_KEYS = ["entry", "sl", "target", "exit", "qty", "lots", "lotSize", "fees", "fx", "funding", "margin"];
function normalizeTrade(t) {
  let changed = false;
  const set = (k, v) => { if (t[k] !== v) { t[k] = v; changed = true; } };
  /* Data can come from an old version or a restored backup, so never trust its shape: ids, dates,
     symbols and numbers are forced into safe forms here, and text is escaped again wherever it is drawn. */
  if (typeof t.id !== "string" || !/^[\w-]{1,40}$/.test(t.id)) set("id", uid());
  if (t.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) set("date", "");
  if (t.symbol) set("symbol", cleanSymbol(String(t.symbol)) || null);
  if (t.optType && !/^(CE|PE)$/.test(t.optType)) set("optType", null);
  if (t.ccy && !/^[A-Z]{2,6}$/.test(t.ccy)) set("ccy", null);
  ["setup", "notes", "market"].forEach(k => { if (t[k] != null && typeof t[k] !== "string") set(k, String(t[k])); });
  const num = v => { if (v == null || v === "" || typeof v === "number") return v; const n = parseFloat(v); return isFinite(n) ? n : null; };
  TRADE_NUM_KEYS.forEach(k => { if (t[k] != null) { const n = num(t[k]); if (n !== t[k]) set(k, n); } });
  if (t.exits != null && !Array.isArray(t.exits)) { delete t.exits; changed = true; }
  if (Array.isArray(t.exits)) t.exits = t.exits.filter(ex => ex && typeof ex === "object");
  (t.exits || []).forEach(ex => {
    ["price", "qty", "fees"].forEach(k => { if (ex[k] != null) { const n = num(ex[k]); if (n !== ex[k]) { ex[k] = n; changed = true; } } });
    if (ex.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(ex.date)) { ex.date = ""; changed = true; }
  });
  const m = t.market || "";
  if (!MARKETS.includes(m)) {
    const sym = SYMBOLS.find(x => x.name === m.toUpperCase());
    if (m === "BTC Perp") set("market", "Crypto");
    else if (sym) {
      if (!t.symbol) set("symbol", sym.name);
      const inst = t.instrument || (t.lots || sym.indexOnly ? "options" : "equity");
      set("instrument", inst);
      set("market", marketForSymbol(sym, inst));
    } else if (/^options/i.test(m)) {
      set("instrument", "options");
      const mm = m.match(/\((CE|PE)\)/i);
      if (mm && !t.optType) set("optType", mm[1].toUpperCase());
      set("market", "Other");
    } else if (/^futures/i.test(m)) { set("instrument", "futures"); set("market", "Other"); }
    else set("market", "Other");
  }
  return changed;
}
function cleanSymbol(v) { return (v || "").toUpperCase().replace(/[^A-Z0-9&_.:-]/g, "").slice(0, 40); }

/* If the saved journal cannot be read, the raw text is kept under its own key (never thrown away) and offered as a download. */
function keepUnreadable(raw) {
  tmSet("tm_trades_corrupt", raw);
}
function showRescueBanner() {
  let raw = null;
  try { raw = localStorage.getItem("tm_trades_corrupt"); } catch (e) {}
  if (!raw) { tmBannerOff("tm_rescue_banner"); return; }
  tmBanner("tm_rescue_banner", '<span><b>Part of your saved journal could not be read.</b> A copy of the original data was kept so nothing is lost.</span><button type="button" id="rescue_dl">Download copy</button><button type="button" id="rescue_dismiss">Dismiss</button>', b => {
    b.querySelector("#rescue_dl").onclick = () => tmDownload("trademath-unreadable-journal.json", raw);
    b.querySelector("#rescue_dismiss").onclick = () => {
      if (confirm("Delete the kept copy? Download it first if you might need it.")) { try { localStorage.removeItem("tm_trades_corrupt"); } catch (e) {} tmBannerOff("tm_rescue_banner"); }
    };
  });
}
function loadTrades() {
  let raw = null, list = [];
  try { raw = localStorage.getItem("tm_trades"); } catch (e) {}
  if (raw) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (!Array.isArray(parsed)) keepUnreadable(raw);
    else {
      list = parsed.filter(t => t && typeof t === "object" && (t.dir === "LONG" || t.dir === "SHORT"));
      if (list.length !== parsed.length) keepUnreadable(raw);   // some entries were unusable; the original stays in the rescue copy
    }
  }
  trades = list;
  let changed = false;
  trades.forEach(t => { if (normalizeTrade(t)) changed = true; });
  if (changed) tmSet("tm_trades", trades);
  window.trades = trades; // expose for calc.js checkDailyLimits
  showRescueBanner();
  renderBackupInfo();
}
function saveTrades() {
  tmSet("tm_trades", trades);
  window.trades = trades;
  renderTodayTrades();
  renderBackupInfo();
}

/* ── Backup & restore (Settings → Your data) ── */
const BACKUP_KEYS = { settings: "tm_settings", checklist: "tm_checklist", alert: "tm_alert", projection: "tm_proj" };
function buildBackup() {
  const out = { app: "TradeMath", version: 1, exported: new Date().toISOString(), trades };
  Object.keys(BACKUP_KEYS).forEach(k => { out[k] = tmGet(BACKUP_KEYS[k], null); });
  return out;
}
function downloadBackup() {
  tmDownload("trademath-backup-" + todayStr() + ".json", JSON.stringify(buildBackup(), null, 1));
  tmSet("tm_last_backup", new Date().toISOString());
  renderBackupInfo();
}
function renderBackupInfo() {
  const el = $("bk_info"); if (!el) return;
  const last = tmGet("tm_last_backup", null);
  const when = last ? new Date(last).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
  el.textContent = trades.length + " trade" + (trades.length === 1 ? "" : "s") + " saved in this browser. " + (when ? "Last backup: " + when + "." : "You have never downloaded a backup.");
}
let pendingRestore = null;
function readBackupFile(file) {
  const msg = $("bk_msg"), box = $("bk_confirm");
  box.hidden = true; pendingRestore = null;
  const fail = t => { msg.textContent = t; msg.className = "bk-msg bad"; };
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return fail("That file is too large to be a TradeMath backup.");
  const r = new FileReader();
  r.onerror = () => fail("Could not read that file.");
  r.onload = () => {
    let data;
    try { data = JSON.parse(r.result); } catch (e) { return fail("That file is not a valid backup (it is not readable JSON)."); }
    if (!data || data.app !== "TradeMath" || !Array.isArray(data.trades)) return fail("That file is not a TradeMath backup.");
    const good = data.trades.filter(t => t && typeof t === "object" && (t.dir === "LONG" || t.dir === "SHORT"));
    if (!good.length && data.trades.length) return fail("No usable trades were found in that backup.");
    pendingRestore = { data, good };
    msg.className = "bk-msg";
    msg.textContent = "This backup has " + good.length + " trade" + (good.length === 1 ? "" : "s") + (data.exported ? " (saved " + new Date(data.exported).toLocaleDateString("en-IN") + ")" : "") + ". Restoring replaces the " + trades.length + " trade" + (trades.length === 1 ? "" : "s") + " and the settings currently in this browser. A copy of what is here now is kept first.";
    box.hidden = false;
  };
  r.readAsText(file);
}
function applyRestore() {
  if (!pendingRestore) return;
  const { data, good } = pendingRestore;
  tmSet("tm_prerestore", JSON.stringify(buildBackup()));   // the way back: what was here before
  const ok = tmSet("tm_trades", good) &&
    Object.keys(BACKUP_KEYS).every(k => data[k] == null || typeof data[k] !== "object" || tmSet(BACKUP_KEYS[k], data[k]));
  if (!ok) { $("bk_msg").textContent = "Restore failed: the browser would not store the data. Free some space and try again."; $("bk_msg").className = "bk-msg bad"; return; }
  location.reload();
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function isClosed(t) {
  if (t.exit) return true;
  if (t.exits && t.exits.length) {
    const exitedQty = t.exits.reduce((s, ex) => s + (ex.qty || 0), 0);
    return exitedQty >= (t.qty || 0);
  }
  return false;
}

function fxOf(t) { return t.instrument === "crypto" ? (t.fx || 1) : 1; }   // crypto prices are USDT; P&L is in ₹
function pnlForTrade(t) {
  const dir = t.dir === "LONG" ? 1 : -1;
  const k = fxOf(t);
  const funding = t.instrument === "crypto" ? (t.funding || 0) : 0;            // ₹ paid/received on the perpetual, counted once
  if (t.exits && t.exits.length) {
    return t.exits.reduce((sum, ex) => sum + dir * (ex.price - t.entry) * ex.qty * k - (ex.fees || 0), 0) - funding;
  }
  if (!t.exit) return null;
  return dir * (t.exit - t.entry) * t.qty * k - (t.fees || 0) - funding;
}

function rrActual(t) {
  if (!isClosed(t) || !t.sl || !t.entry) return null;
  const slDist = Math.abs(t.entry - t.sl);
  if (!slDist) return null;
  const dir = t.dir === "LONG" ? 1 : -1;
  if (t.exits && t.exits.length) {
    const avgExit = t.exits.reduce((s, ex) => s + ex.price * ex.qty, 0) /
                    t.exits.reduce((s, ex) => s + ex.qty, 0);
    return ((avgExit - t.entry) * dir) / slDist;
  }
  return ((t.exit - t.entry) * dir) / slDist;
}

function renderStats() {
  const closed = trades.filter(t => isClosed(t));
  const wins   = closed.filter(t => (pnlForTrade(t) || 0) > 0);
  const totalPnl = closed.reduce((s, t) => s + (pnlForTrade(t) || 0), 0);
  const rrs    = closed.map(rrActual).filter(r => r !== null);
  const avgRR  = rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : null;
  $("st_trades").textContent = trades.length;
  $("st_wr").textContent     = closed.length ? Math.round(wins.length / closed.length * 100) + "%" : "—";
  const pnlEl = $("st_pnl");
  pnlEl.textContent  = fmtINR(totalPnl);
  pnlEl.className    = "stat-card-val " + (totalPnl > 0 ? "pos" : totalPnl < 0 ? "neg" : "acc");
  $("st_rr").textContent = avgRR !== null ? avgRR.toFixed(2) : "—";
}

function refreshJournal() { renderStats(); renderReports(); renderCalendar(); }


/* ── Setup tags quick chips ── */
const SETUP_PRESETS   = ["Breakout","Pullback","Reversal","Trend Follow","Gap Play","Range","EMA Cross","VWAP"];
const MISTAKE_PRESETS = ["FOMO","Moved SL","Oversized","No Plan","Chased Entry","Revenge Trade","Early Exit"];

let selectedSetupTags   = [];
let selectedMistakeTags = [];

function renderSetupChips(containerId, presets, selected, onToggle) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = presets.map(tag => `
    <span class="tag-chip${selected.includes(tag) ? " active" : ""}" data-tag="${tag}">${tag}</span>
  `).join("");
  el.querySelectorAll(".tag-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const tag = chip.dataset.tag;
      const idx = selected.indexOf(tag);
      if (idx > -1) selected.splice(idx, 1); else selected.push(tag);
      renderSetupChips(containerId, presets, selected, onToggle);
      if (onToggle) onToggle();
    });
  });
}

/* ── Market dropdowns come from the single MARKETS list, so they can never drift apart ── */
function fillMarketSelects() {
  const opts = MARKETS.map(m => `<option>${m.replace("&", "&amp;")}</option>`).join("");
  ["j_market", "d_market", "s_default_market"].forEach(id => { const el = $(id); if (el) el.innerHTML = opts; });
  const f = $("flt_market"); if (f) f.innerHTML = '<option value="">All Markets</option>' + opts;
  const dl = $("sym_list"); if (dl) dl.innerHTML = SYMBOLS.map(x => `<option value="${x.name}">`).join("");
}
fillMarketSelects();

/* ── Add form ── */
$("showAddBtn").addEventListener("click", () => {
  editId = null;
  $("formTitle").textContent = "New Trade";
  $("j_date").value   = todayStr();
  $("j_symbol").value = "";
  $("j_hint").hidden = $("j_market").value !== "Crypto";
  $("j_exit").value   = "";
  $("j_notes").value  = "";
  $("j_setup").value  = "";
  $("j_entry").value  = ""; $("j_sl").value = ""; $("j_target").value = "";
  $("j_qty").value    = ""; $("j_fees").value = "";
  selectedSetupTags   = [];
  selectedMistakeTags = [];
  renderSetupChips("j_setup_chips",   SETUP_PRESETS,   selectedSetupTags,   null);
  renderSetupChips("j_mistake_chips", MISTAKE_PRESETS, selectedMistakeTags, null);
  $("addForm").hidden = false;
  $("addForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
});

/* ── Toast notification helper ── */
function showToast(msg, action) {
  let toast = document.getElementById("tm_toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "tm_toast";
    toast.className = "tm-toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.toggle("has-action", !!action);
  if (action) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tm-toast-btn"; b.textContent = action.label;
    b.onclick = () => { toast.classList.remove("show"); clearTimeout(toast._timer); action.fn(); };
    toast.appendChild(b);
  }
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.classList.remove("show"); }, action ? 8000 : 2600);
}

/* ── Pre-log modal & Quick Log (from Calc) ── */
$("logTradeBtn").addEventListener("click", () => {
  if (!lastCalc) {
    showToast("⚠️ Enter valid Entry & Stop Loss first");
    return;
  }
  const s = typeof getAppSettings === "function" ? getAppSettings() : {};
  // If quickLog is enabled (default), log directly without popup
  if (s.quickLog !== false || document.documentElement.dataset.ui === "quick") {
    quickLogTrade();
    return;
  }
  openPreLogModal();
});

function quickLogTrade() {
  if (!lastCalc) return;
  const lc = lastCalc;
  const unitWord = lc.instrument === "crypto" ? (lc.unitName || "coins") : lc.isLots ? (lc.units === 1 ? "lot" : "lots") : (lc.units === 1 ? "share" : "shares");
  const targetPx = lc.targetPrice || (lc.targets && lc.targets[2] ? lc.targets[2].tp : (lc.isLong ? lc.entry + Math.abs(lc.entry - lc.sl) * 2 : lc.entry - Math.abs(lc.entry - lc.sl) * 2));
  
  const symLabel = lc.symbolName && lc.symbolName !== "Equity" ? lc.symbolName : "";
  const t = {
    id: uid(),
    date: todayStr(),
    margin: lc.sellOpt ? Math.round(lc.margin) : null,   // short options only: an estimate until you enter the real one on close
    marginActual: false,
    market: lc.market || "NSE Equity",
    symbol: lc.symbol || null,
    instrument: lc.instrument || null,
    optType: lc.optType || null,
    leverage: lc.cryptoLev || null,
    fx: lc.fx || null,
    ccy: lc.instrument === "crypto" ? "USDT" : null,
    liq: lc.liq || null,
    dir: lc.isLong ? "LONG" : "SHORT",
    entry: lc.entry,
    sl: lc.sl,
    target: parseFloat(targetPx.toFixed(2)),
    qty: lc.units * (lc.isLots ? lc.lotSize : 1),
    lots: lc.isLots ? lc.units : null,
    lotSize: lc.isLots ? lc.lotSize : null,
    exit: null,
    exits: [],
    fees: 0,
    notes: "",
    setup: "",
    mistakes: [],
    confidence: 3,
    checklistSkipped: false
  };

  trades.push(t);
  saveTrades();
  renderTodayTrades();
  if (typeof renderDailyBanner === "function") renderDailyBanner();
  
  showToast(`✓ Logged: ${symLabel ? symLabel + " · " : ""}${t.dir === "LONG" ? "▲ LONG" : "▼ SHORT"} ${lc.units} ${unitWord} @ ${pxs(t, t.entry)}`);
}

function openPreLogModal() {
  if (!lastCalc) return;
  const lc = lastCalc;
  const unitWord = lc.instrument === "crypto" ? (lc.unitName || "coins") : lc.isLots ? (lc.units === 1 ? "lot" : "lots") : (lc.units === 1 ? "share" : "shares");
  const symLabel = lc.symbolName && lc.symbolName !== "Equity" ? lc.symbolName + " · " : "";
  $("pl_summary").textContent =
    `${symLabel}${lc.isLong ? "▲ LONG" : "▼ SHORT"} · ${lc.market} · Entry ₹${lc.entry} · SL ₹${lc.sl} · ${lc.units} ${unitWord}`;
  $("pl_notes").value  = "";
  $("pl_confidence").dataset.val = "3";
  renderStars(3);
  selectedSetupTags   = [];
  selectedMistakeTags = [];
  renderSetupChips("pl_setup_chips",   SETUP_PRESETS,   selectedSetupTags,   null);
  renderSetupChips("pl_mistake_chips", MISTAKE_PRESETS, selectedMistakeTags, null);
  renderPreLogChecklist();
  $("preLogModal").hidden = false;
}

/* Stars */
function renderStars(val) {
  document.querySelectorAll(".star-btn").forEach((s, i) => {
    s.classList.toggle("lit", i < val);
  });
}
document.querySelectorAll(".star-btn").forEach((s, i) => {
  s.addEventListener("click", () => {
    $("pl_confidence").dataset.val = String(i + 1);
    renderStars(i + 1);
  });
});

/* Pre-log checklist */
function renderPreLogChecklist() {
  const el = $("pl_checklist");
  if (!el) return;
  const items = getChecklistItems();
  if (!items.length) { el.innerHTML = `<div style="font-size:12px;color:var(--fg3);padding:4px 0">No checklist items. Add them in Settings.</div>`; return; }
  el.innerHTML = `<div class="chk-list">${items.map((item, i) => `
    <div class="chk-item">
      <div class="chk-box" data-i="${i}" onclick="togglePreCheck(this)">✓</div>
      <span class="chk-label">${esc(item)}</span>
    </div>`).join("")}</div>`;
}

function togglePreCheck(el) {
  el.classList.toggle("checked");
}

$("pl_confirm").addEventListener("click", () => {
  if (!lastCalc) return;
  const lc = lastCalc;
  const confidence = parseInt($("pl_confidence").dataset.val) || 3;
  const unchecked  = document.querySelectorAll("#pl_checklist .chk-box:not(.checked)").length;
  const targetPx   = lc.targetPrice || (lc.targets && lc.targets[2] ? lc.targets[2].tp : (lc.isLong ? lc.entry + Math.abs(lc.entry - lc.sl) * 2 : lc.entry - Math.abs(lc.entry - lc.sl) * 2));
  const symLabel   = lc.symbolName && lc.symbolName !== "Equity" ? lc.symbolName : "";

  const t = {
    id: uid(),
    date: todayStr(),
    margin: lc.sellOpt ? Math.round(lc.margin) : null,   // short options only: an estimate until you enter the real one on close
    marginActual: false,
    market: lc.market || "NSE Equity",
    symbol: lc.symbol || null,
    instrument: lc.instrument || null,
    optType: lc.optType || null,
    leverage: lc.cryptoLev || null,
    fx: lc.fx || null,
    ccy: lc.instrument === "crypto" ? "USDT" : null,
    liq: lc.liq || null,
    dir:    lc.isLong ? "LONG" : "SHORT",
    entry:  lc.entry,
    sl:     lc.sl,
    target: parseFloat(targetPx.toFixed(2)),
    qty:    lc.units * (lc.isLots ? lc.lotSize : 1),
    lots:   lc.isLots ? lc.units : null,
    lotSize: lc.isLots ? lc.lotSize : null,
    exit:   null,
    exits:  [],
    fees:   0,
    notes:  $("pl_notes").value.trim(),
    setup:  selectedSetupTags.join(", ") || "",
    mistakes: [...selectedMistakeTags],
    confidence,
    checklistSkipped: unchecked > 0 && document.documentElement.dataset.ui === "pro",
  };
  trades.push(t);
  saveTrades();
  $("preLogModal").hidden = true;
  renderTodayTrades();
  if (typeof renderDailyBanner === "function") renderDailyBanner();
  showToast(`✓ Logged ${lc.units} ${lc.isLots ? (lc.units === 1 ? "lot" : "lots") : "shares"} to Journal`);
});

$("pl_cancel").addEventListener("click", () => { $("preLogModal").hidden = true; });
$("preLogModal").addEventListener("click", e => { if (e.target === $("preLogModal")) $("preLogModal").hidden = true; });

$("j_market").addEventListener("change", () => { $("j_hint").hidden = $("j_market").value !== "Crypto"; });
$("j_symbol").addEventListener("input", () => {
  const sym = SYMBOLS.find(x => x.name === cleanSymbol($("j_symbol").value));
  if (sym) $("j_market").value = marketForSymbol(sym, sym.indexOnly || FNO_MARKETS.includes($("j_market").value) ? "options" : "equity");
});

$("cancelAddBtn").addEventListener("click", () => { $("addForm").hidden = true; editId = null; });

$("saveTradeBtn").addEventListener("click", () => {
  const t = {
    id:     editId || uid(),
    date:   $("j_date").value,
    market: $("j_market").value,
    symbol: cleanSymbol($("j_symbol").value) || null,
    ...($("j_market").value === "Crypto" ? { instrument: "crypto", fx: rememberedFx(), ccy: "USDT" } : {}),
    dir:    $("j_dir").value,
    entry:  parseFloat($("j_entry").value)  || null,
    sl:     parseFloat($("j_sl").value)     || null,
    target: parseFloat($("j_target").value) || null,
    exit:   parseFloat($("j_exit").value)   || null,
    qty:    parseFloat($("j_qty").value)    || null,
    fees:   parseFloat($("j_fees").value)   || 0,
    notes:  $("j_notes").value.trim(),
    setup:  $("j_setup").value.trim() || selectedSetupTags.join(", "),
    mistakes: [...selectedMistakeTags],
    exits: [],
  };
  if (!t.entry || !t.qty) { alert("Entry price and Qty are required."); return; }
  if (editId) { trades = trades.map(x => x.id === editId ? t : x); }
  else { trades.push(t); }
  saveTrades();
  $("addForm").hidden = true;
  editId = null;
  refreshJournal();
});

/* ── Filters ── */
["flt_market","flt_dir","flt_result"].forEach(id => { $(id).addEventListener("change", renderReports); });

/* ── Export CSV ── */
$("exportBtn").addEventListener("click", () => {
  const cols = ["date","market","symbol","instrument","ccy","fx","leverage","funding","dir","entry","sl","target","exit","qty","fees","pnl","rr","setup","notes"];
  const rows = trades.map(t => {
    const pnl = pnlForTrade(t);
    const rr  = rrActual(t);
    return [t.date, t.market, '"' + (t.symbol || "") + '"', t.instrument || "", t.ccy || "", t.fx || "", t.leverage || "", t.funding || "", t.dir, t.entry, t.sl, t.target, t.exit, t.qty, t.fees,
      pnl !== null ? pnl.toFixed(2) : "", rr !== null ? rr.toFixed(2) : "",
      '"' + (t.setup || "").replace(/"/g,'""') + '"',
      '"' + (t.notes || "").replace(/"/g,'""') + '"'].join(",");
  });
  const csv = [cols.join(","), ...rows].join("\n");
  const a   = document.createElement("a");
  a.href    = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = "trademath_journal.csv";
  a.click();
});

/* ══════════════ TRADE DETAILS: the one-tap way to tidy a trade you logged in a hurry ══════════════ */
let detailsId = null;
function openDetails(id) {
  const t = trades.find(x => x.id === id); if (!t) return;
  detailsId = id;
  $("d_info").textContent = `${t.dir} · ${t.date} · Entry ₹${t.entry}`;
  $("d_market").value = MARKETS.includes(t.market) ? t.market : "Other";
  $("d_symbol").value = t.symbol || "";
  $("d_setup").value  = t.setup || "";
  $("d_notes").value  = t.notes || "";
  $("d_cry").hidden = t.instrument !== "crypto";
  $("d_lev").value  = t.leverage || "";
  $("d_fx").value   = t.fx || "";
  $("detailsModal").hidden = false;
  $("d_symbol").focus();
}
function closeDetails() { $("detailsModal").hidden = true; detailsId = null; }
$("d_symbol").addEventListener("input", () => {            // a known symbol picks its own market
  const sym = SYMBOLS.find(x => x.name === cleanSymbol($("d_symbol").value));
  if (!sym) return;
  const t = trades.find(x => x.id === detailsId);
  const inst = sym.indexOnly ? "options" : ((t && t.instrument) || (FNO_MARKETS.includes($("d_market").value) ? "options" : "equity"));
  $("d_market").value = marketForSymbol(sym, inst);
});
$("d_save").addEventListener("click", () => {
  const t = trades.find(x => x.id === detailsId); if (!t) return;
  t.market = $("d_market").value;
  t.symbol = cleanSymbol($("d_symbol").value) || null;
  t.setup  = $("d_setup").value.trim();
  t.notes  = $("d_notes").value.trim();
  if (t.instrument === "crypto") {
    t.leverage = parseFloat($("d_lev").value) || null;
    const fx = parseFloat($("d_fx").value); if (fx > 0) t.fx = fx;
  }
  saveTrades();
  closeDetails();
  if (!$("tab-journal").hidden) refreshJournal();
  showToast("✓ Trade updated");
});
$("d_cancel").addEventListener("click", closeDetails);
$("detailsModal").addEventListener("click", e => { if (e.target === $("detailsModal")) closeDetails(); });

/* ══════════════ CLOSE TRADE MODAL ══════════════ */
let closeTradeId  = null;
let partialMode   = false;

function openCloseModal(id) {
  const t = trades.find(x => x.id === id); if (!t) return;
  closeTradeId = id;
  partialMode  = false;
  $("cm_info").textContent  = `${t.dir} · ${t.market} · ${t.date}`;
  $("cm_entry").value = t.entry || "";
  $("cm_exit").value  = "";
  $("cm_qty").value   = t.qty   || "";
  $("cm_fees").value  = "";
  feesTouched = false;
  $("cm_funding_wrap").hidden = t.instrument !== "crypto";
  const shortOpt = t.margin != null && t.instrument === "options" && t.dir === "SHORT";
  $("cm_margin_wrap").hidden = !shortOpt;
  $("cm_margin").value = shortOpt ? t.margin : "";
  $("cm_funding").value = "";
  $("cm_notes").value = t.notes || "";
  // Show existing partial exits
  renderPartialExitList(t);
  $("cm_full_btn").classList.add("active");
  $("cm_partial_btn").classList.remove("active");
  $("cm_partial_label").textContent = `Exit Qty (total: ${t.qty})`;
  $("cm_hit_sl").onclick = () => { $("cm_exit").value = t.sl     || ""; autoCryptoFees(); $("cm_exit").focus(); };
  $("cm_hit_tp").onclick = () => { $("cm_exit").value = t.target || ""; autoCryptoFees(); $("cm_exit").focus(); };
  $("closeModal").hidden = false;
  $("cm_exit").focus();
}

let feesTouched = false;
/* Fill the Fees box with the round-trip taker fee + GST for the quantity being closed, unless the user typed their own. */
function autoCryptoFees() {
  const t = trades.find(x => x.id === closeTradeId);
  if (!t || t.instrument !== "crypto" || feesTouched) return;
  const exit = parseFloat($("cm_exit").value), qty = parseFloat($("cm_qty").value) || t.qty;
  if (!(exit > 0) || !(qty > 0)) return;
  const f = cryptoFeeCfg(), entry = parseFloat($("cm_entry").value) || t.entry;
  $("cm_fees").value = Math.round(qty * (entry + exit) * (f.taker / 100) * (1 + f.gst / 100) * (t.fx || 1) * 100) / 100;
}
$("cm_exit").addEventListener("input", autoCryptoFees);
$("cm_qty").addEventListener("input", autoCryptoFees);
$("cm_fees").addEventListener("input", () => { feesTouched = true; });

function renderPartialExitList(t) {
  const wrap = $("cm_exits_list"); if (!wrap) return;
  if (!t.exits || !t.exits.length) { wrap.innerHTML = ""; return; }
  const dir = t.dir === "LONG" ? 1 : -1;
  wrap.innerHTML = `<div style="font-size:11px;color:var(--fg3);margin-bottom:4px">Previous exits:</div>` +
    t.exits.map(ex => {
      const pnl = dir * (ex.price - t.entry) * ex.qty * fxOf(t) - (ex.fees || 0);
      return `<div class="exit-item">
        <span>${esc(ex.date || "")}</span>
        <span class="td-mono">Qty ${esc(ex.qty)} @ ${esc(ex.price)}</span>
        <span class="${pnl >= 0 ? "td-pos" : "td-neg"}">${fmtINR(pnl)}</span>
      </div>`;
    }).join("");
}

$("cm_full_btn").addEventListener("click", () => {
  partialMode = false;
  $("cm_full_btn").classList.add("active");
  $("cm_partial_btn").classList.remove("active");
  const t = trades.find(x => x.id === closeTradeId);
  if (t) $("cm_partial_label").textContent = `Exit Qty (total: ${t.qty})`;
  $("cm_qty").value = t ? t.qty : "";
});

$("cm_partial_btn").addEventListener("click", () => {
  partialMode = true;
  $("cm_partial_btn").classList.add("active");
  $("cm_full_btn").classList.remove("active");
  const t = trades.find(x => x.id === closeTradeId);
  const remaining = t ? (t.qty - (t.exits || []).reduce((s, ex) => s + ex.qty, 0)) : "";
  $("cm_partial_label").textContent = `Exit Qty (remaining: ${remaining})`;
  $("cm_qty").value = "";
});

$("cm_cancel").addEventListener("click",  () => { $("closeModal").hidden = true; closeTradeId = null; });
$("closeModal").addEventListener("click", e  => { if (e.target === $("closeModal")) { $("closeModal").hidden = true; closeTradeId = null; } });

$("cm_confirm").addEventListener("click", () => {
  const exit = parseFloat($("cm_exit").value);
  if (!exit) { $("cm_exit").focus(); return; }
  const exitQty  = parseFloat($("cm_qty").value)  || 0;
  const exitFees = parseFloat($("cm_fees").value) || 0;
  const funding  = parseFloat($("cm_funding").value) || 0;
  trades = trades.map(t => {
    if (t.id !== closeTradeId) return t;
    const updated = { ...t,
      entry: parseFloat($("cm_entry").value) || t.entry,
      notes: $("cm_notes").value.trim() || t.notes || "",
    };
    if (t.instrument === "crypto") updated.funding = (t.funding || 0) + funding;
    const realMgn = parseFloat($("cm_margin").value);
    if (!$("cm_margin_wrap").hidden && realMgn >= 0) { if (realMgn !== t.margin) updated.marginActual = true; updated.margin = realMgn; }
    const partialExit = { price: exit, qty: exitQty || t.qty, fees: exitFees, date: todayStr() };
    if (!updated.exits) updated.exits = [];
    updated.exits = [...updated.exits, partialExit];
    if (!partialMode) {
      // Full exit: also set legacy exit field
      updated.exit = exit;
      updated.fees = exitFees;
      updated.qty  = parseFloat($("cm_qty").value) || t.qty;
    }
    return updated;
  });
  saveTrades();
  $("closeModal").hidden = true; closeTradeId = null;
  refreshJournal();
});

/* ══════════════ TODAY'S TRADES ══════════════ */
function deleteTrade(id) {
  const i = trades.findIndex(t => t.id === id);
  if (i < 0) return;
  const removed = trades.splice(i, 1)[0];
  const redraw = () => { saveTrades(); if (typeof refreshJournal === "function") refreshJournal(); if (typeof renderDailyBanner === "function") renderDailyBanner(); };
  redraw();
  showToast("Trade deleted", { label: "Undo", fn: () => { trades.splice(Math.min(i, trades.length), 0, removed); redraw(); showToast("Trade restored"); } });
}
const deleteTodayTrade = deleteTrade;

function symChip(t) {
  return t.symbol ? ` <span class="sym-chip">${esc(t.symbol)}${t.optType ? " " + esc(t.optType) : ""}</span>` : "";
}
function editBtnFor(t) {
  return `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 6px;color:var(--fg3)" onclick="openDetails('${t.id}')" title="Edit market, symbol and notes">✎</button>`;
}

const px  = (t, v) => v ? (t.instrument === "crypto" ? "$" + fmtUsd(v) : v) : "—";          // table cells
const pxs = (t, v) => v ? (t.instrument === "crypto" ? "$" + fmtUsd(v) : "₹" + v) : "—";   // with currency symbol
function qtyLabel(t) {
  if (t.instrument === "crypto") return `${t.qty}${t.leverage ? " · " + esc(t.leverage) + "× lev" : ""}`;
  return t.lots ? `${t.lots} lot${t.lots === 1 ? "" : "s"} × ${t.lotSize} = ${t.qty}` : (t.qty || "—");
}

function renderTodayTrades() {
  const today  = todayStr();
  $("today_date").textContent = new Date().toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" });
  const todays = trades.filter(t => t.date === today);
  const list   = $("today_list");
  const empty  = $("today_empty");
  if (!todays.length) { list.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";

  const closedTodays = todays.filter(t => isClosed(t));
  const todayPnlVal = closedTodays.reduce((s, t) => s + (pnlForTrade(t) || 0), 0);
  const pnlSummaryHTML = closedTodays.length ? `
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--card);border-radius:8px;padding:8px 12px;margin-bottom:10px;border:1px solid var(--border)">
      <span style="font-size:11px;color:var(--fg2);font-weight:500">Today's Realized P&amp;L</span>
      <span class="td-mono ${todayPnlVal>=0?'td-pos':'td-neg'}" style="font-weight:700;font-size:14px">${fmtINR(todayPnlVal)}</span>
    </div>` : "";

  list.innerHTML = pnlSummaryHTML + todays.map(t => {
    const pnl    = pnlForTrade(t);
    const closed = isClosed(t);
    const pnlStr = !closed ? `<span style="color:var(--fg3)">OPEN</span>` : `<span class="${pnl>=0?'td-pos':'td-neg'}">${fmtINR(pnl)}</span>`;
    const badge  = t.dir === "LONG" ? `<span class="badge long">▲ LONG</span>` : `<span class="badge short">▼ SHORT</span>`;
    const res    = !closed ? `<span class="badge open" style="font-size:10px">OPEN</span>`
      : pnl > 0 ? `<span class="badge win" style="font-size:10px">WIN</span>`
      : `<span class="badge loss" style="font-size:10px">LOSS</span>`;
    const closeBtn = !closed ? `<button class="btn btn-danger btn-sm" style="font-size:11px;padding:3px 10px" onclick="openCloseModal('${t.id}')">Close</button>` : "";
    const delBtn   = `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 6px;color:var(--fg3)" onclick="deleteTodayTrade('${t.id}')" title="Delete trade">✕</button>`;
    const setupTag = t.setup ? `<span style="font-size:10px;color:var(--accent);background:var(--accent-dim);border-radius:3px;padding:1px 6px">${esc(t.setup)}</span>` : "";
    return `<div class="today-trade" data-id="${t.id}">
      <div class="today-trade-top">
        ${badge}
        <span style="font-size:12px;font-weight:600">${esc(t.market)}</span>${symChip(t)}
        ${res}
        ${setupTag}
        <span class="today-trade-pnl">${pnlStr}</span>
        ${editBtnFor(t)}
        ${delBtn}
      </div>
      <div class="today-trade-meta">E: ${pxs(t, t.entry)} · SL: ${pxs(t, t.sl)} · Qty: ${qtyLabel(t)}${t.margin != null ? ` · Margin: ₹${fmtP(t.margin, 0)} (${t.marginActual ? "actual" : "est."})` : ""}${closed?` · Exit: ${t.exit ? pxs(t, t.exit) : "partial"}`:""}</div>
      ${closeBtn ? `<div style="margin-top:8px;text-align:right">${closeBtn}</div>` : ""}
    </div>`;
  }).join("");
  if (typeof renderDailyBanner === "function") renderDailyBanner();
}

/* ══════════════ MONTHLY CALENDAR ══════════════ */
function renderCalendar() {
  const wrap = $("cal_wrap"); if (!wrap) return;
  if (!trades.length) { wrap.innerHTML = ""; return; }
  const dayPnl = {};
  trades.forEach(t => {
    if (!isClosed(t) || !t.date) return;
    const pnl = pnlForTrade(t); if (pnl === null) return;
    dayPnl[t.date] = (dayPnl[t.date] || 0) + pnl;
  });
  const today     = todayStr();
  const monthsWithData = [...new Set(trades.filter(t => t.date).map(t => t.date.slice(0,7)))].sort();
  const currentMo = today.slice(0,7);
  if (!monthsWithData.includes(currentMo)) monthsWithData.push(currentMo);
  const showMonths = monthsWithData.slice(-2);
  const DOWS = ["S","M","T","W","T","F","S"];

  const monthHTML = showMonths.map(mo => {
    const [yr, mn] = mo.split("-").map(Number);
    const firstDay   = new Date(yr, mn-1, 1).getDay();
    const daysInMonth = new Date(yr, mn, 0).getDate();
    const label      = new Date(yr, mn-1, 1).toLocaleString("default", { month:"short", year:"numeric" });
    const moPnl      = Object.entries(dayPnl).filter(([d]) => d.startsWith(mo)).reduce((s,[,v]) => s+v, 0);
    const tradingDays = Object.keys(dayPnl).filter(d => d.startsWith(mo)).length;
    const cells = [];
    DOWS.forEach(d => cells.push(`<div class="cal-dow">${d}</div>`));
    for (let i = 0; i < firstDay; i++) cells.push(`<div class="cal-day"></div>`);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${yr}-${String(mn).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const pnl     = dayPnl[dateStr];
      const cls     = pnl === undefined ? "cal-day" : pnl > 0 ? "cal-day win" : "cal-day loss";
      const todayCls = dateStr === today ? " today-dot" : "";
      cells.push(`<div class="${cls}${todayCls}" title="${dateStr}${pnl!==undefined?" · "+fmtINR(pnl):""}">${d}</div>`);
    }
    const pnlStr = tradingDays
      ? `<span class="${moPnl>=0?"td-pos":"td-neg"}">${fmtINR(moPnl)}</span> · ${tradingDays} day${tradingDays!==1?"s":""}`
      : `<span style="color:var(--fg3)">No closed trades</span>`;
    return `<div class="cal-month">
      <div class="cal-month-title">${label}</div>
      <div class="cal-grid">${cells.join("")}</div>
      <div class="cal-summary">${pnlStr}</div>
    </div>`;
  }).join("");

  wrap.innerHTML = `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--fg3);margin-bottom:10px">Monthly Performance</div><div class="cal-section">${monthHTML}</div>`;
}

/* ══════════════ TOGGLE FUNCTIONS (called from HTML onclick) ══════════════ */
function toggleMonth(btn, moId) {
  const opening = !btn.querySelector('.rep-caret').classList.contains('open');
  document.querySelectorAll('tr.dy-row[data-mo="'+moId+'"]').forEach(r => { r.style.display = opening ? '' : 'none'; });
  if (!opening) {
    document.querySelectorAll('tr.tr-row[data-mo="'+moId+'"]').forEach(r => { r.style.display = 'none'; });
    document.querySelectorAll('tr.dy-row[data-mo="'+moId+'"] .rep-caret').forEach(c => c.classList.remove('open'));
  }
  btn.querySelector('.rep-caret').classList.toggle('open');
}
function toggleDay(btn, dayId) {
  const caret = btn.querySelector('.rep-caret');
  const opening = !caret.classList.contains('open');
  if (opening && !btn.dataset.loaded) {          // trade rows are only built the first time a day is opened
    const d = repDays.get(dayId);
    if (d) btn.insertAdjacentHTML("afterend", d.trades.map(t => repTradeRow(t, dayId, d.mo)).join(""));
    btn.dataset.loaded = "1";
  }
  document.querySelectorAll('tr.tr-row[data-grp="'+dayId+'"]').forEach(r => { r.style.display = opening ? '' : 'none'; });
  caret.classList.toggle('open');
}

/* ══════════════ REPORTS ══════════════ */
function repTradeRow(t, dayId, moKey) {
    const pnl = pnlForTrade(t);
    const rr  = rrActual(t);
    const closed = isClosed(t);
    const res = !closed ? `<span class="badge open">OPEN</span>` : pnl > 0 ? `<span class="badge win">WIN</span>` : `<span class="badge loss">LOSS</span>`;
    const pc  = pnl === null ? "td-muted" : pnl > 0 ? "td-pos" : "td-neg";
    const gv  = pnl !== null ? fmtINR((t.exit - t.entry) * (t.dir === "LONG" ? 1 : -1) * t.qty * fxOf(t)) : "—";
    const gc  = pnl !== null ? (pnl > 0 ? "td-pos" : "td-neg") : "td-muted";
    const setupTag = t.setup ? `<span style="font-size:10px;color:var(--accent)">${esc(t.setup)}</span>` : "—";
    const partialBadge = (!t.exit && t.exits && t.exits.length) ? ` <span style="font-size:10px;color:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;padding:0 4px">partial</span>` : "";
    return `<tr class="tr-row" data-id="${t.id}" data-grp="${dayId}" data-mo="${moKey}">
      <td class="td-muted td-mono">${esc(t.date||"—")}</td>
      <td>${esc(t.market||"—")}${symChip(t)}</td>
      <td><span class="badge ${t.dir.toLowerCase()}">${t.dir==="LONG"?"▲":"▼"} ${t.dir}</span></td>
      <td class="td-mono">${px(t, t.entry)}</td><td class="td-mono">${px(t, t.sl)}</td>
      <td class="td-mono">${px(t, t.target)}</td><td class="td-mono">${px(t, t.exit)}${partialBadge}</td>
      <td class="td-mono">${t.qty||"—"}</td>
      <td class="td-mono ${gc}">${gv}</td>
      <td class="td-mono td-muted">${t.fees ? fmtINR(t.fees) : "₹0"}</td>
      <td class="td-mono ${pc}">${pnl !== null ? fmtINR(pnl) : "—"}</td>
      <td class="td-mono td-muted">${rr !== null ? rr.toFixed(2) : "—"}</td>
      <td>${setupTag}</td>
      <td>${res}</td>
      <td>
        ${!closed ? `<button class="btn btn-danger btn-sm rep-close-btn" data-id="${t.id}" style="font-size:10px;padding:1px 6px">Close</button>` : ""}
        <button class="btn btn-ghost btn-sm rep-edit-btn" data-id="${t.id}" style="font-size:10px;padding:1px 5px;color:var(--fg3)" title="Edit market, symbol and notes">✎</button>
        <button class="btn btn-ghost btn-sm rep-del-btn" data-id="${t.id}" style="font-size:10px;padding:1px 5px;color:var(--fg3)">✕</button>
      </td>
    </tr>`;
}

const repDays = new Map();   // dayId -> { trades, mo } so a day's rows can be built when it is first opened

function renderReports() {
  if (!trades.length) { $("rep_body").innerHTML = ""; return; }

  const fMkt = $("flt_market").value;
  const fDir = $("flt_dir").value;
  const fRes = $("flt_result").value;
  const filtered = trades.filter(t => {
    if (fMkt && t.market !== fMkt)                          return false;
    if (fDir && t.dir !== fDir)                             return false;
    if (fRes === "win"  && !(isClosed(t) && (pnlForTrade(t)||0) > 0))  return false;
    if (fRes === "loss" && !(isClosed(t) && (pnlForTrade(t)||0) <= 0)) return false;
    if (fRes === "open" && isClosed(t))                     return false;
    return true;
  });

  const jEmpty = $("jnl_empty");
  if (!filtered.length) { $("rep_body").innerHTML = ""; if (jEmpty) jEmpty.style.display = "block"; return; }
  if (jEmpty) jEmpty.style.display = "none";

  const fset = new Set(filtered);
  repDays.clear();
  const byMonth = {};
  [...trades].sort((a,b) => b.date > a.date ? 1 : -1).forEach(t => {
    const mo  = t.date ? t.date.slice(0,7) : "unknown";
    const day = t.date || "unknown";
    if (!byMonth[mo]) byMonth[mo] = { days:{} };
    if (!byMonth[mo].days[day]) byMonth[mo].days[day] = [];
    byMonth[mo].days[day].push(t);
  });

  $("rep_body").innerHTML = Object.entries(byMonth).map(([mo, {days}]) => {
    const allTrades = Object.values(days).flat().filter(t => fset.has(t));
    if (!allTrades.length) return "";
    const moClosed = allTrades.filter(t => isClosed(t));
    const moWins   = moClosed.filter(t => (pnlForTrade(t)||0) > 0);
    const moPnl    = moClosed.reduce((s,t) => s + (pnlForTrade(t)||0), 0);
    const moLabel  = mo === "unknown" ? "Unknown" : new Date(mo+"-01").toLocaleString("default",{month:"long",year:"numeric"});
    const pnlCls   = moPnl > 0 ? "td-pos" : moPnl < 0 ? "td-neg" : "";

    const daysHTML = Object.entries(days).map(([day, dayTrades]) => {
      const filteredDay = dayTrades.filter(t => fset.has(t));
      if (!filteredDay.length) return "";
      const dayClosed = filteredDay.filter(t => isClosed(t));
      const dayPnlVal = dayClosed.reduce((s,t) => s + (pnlForTrade(t)||0), 0);
      const dayWins   = dayClosed.filter(t => (pnlForTrade(t)||0) > 0);
      const dayLosses = dayClosed.filter(t => (pnlForTrade(t)||0) <= 0);
      const pCls      = dayPnlVal > 0 ? "td-pos" : dayPnlVal < 0 ? "td-neg" : "td-muted";
      const dayLabel  = day === "unknown" ? "Unknown" : new Date(day).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"});
      const dayId     = `d${mo}${day}`.replace(/[^a-z0-9]/gi,"");
      const wl        = `${dayWins.length}W / ${dayLosses.length}L`;

      repDays.set(dayId, { trades: filteredDay, mo: mo.replace(/[^a-z0-9]/gi, "") });

      return `<tr class="dy-row" data-mo="${mo.replace(/[^a-z0-9]/gi,'')}" data-grp="${dayId}" onclick="toggleDay(this,'${dayId}')">
        <td><span class="rep-caret">▶</span>${dayLabel}</td>
        <td colspan="8" class="td-muted" style="font-size:11px">${filteredDay.length} trade${filteredDay.length!==1?"s":""} · Daily Total</td>
        <td colspan="2"></td>
        <td class="td-mono ${pCls}" style="font-weight:600">${dayClosed.length ? fmtINR(dayPnlVal) : "—"}</td>
        <td></td><td class="td-muted" style="font-size:11px">${wl}</td><td></td>
      </tr>`;
    }).join("");

    const moId = mo.replace(/[^a-z0-9]/gi,"");
    return `<div class="rep-log">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 4px 0">
        <span></span>
        <button class="btn btn-ghost btn-sm" data-level="trader" style="font-size:10px;padding:3px 8px;margin:4px" onclick="openReportCard('${mo}')">📊 Share Card</button>
      </div>
      <table class="rep-log-tbl">
        <thead><tr><th>Date</th><th>Market</th><th>Dir</th><th>Entry</th><th>SL</th><th>Target</th><th>Exit</th><th>Qty</th><th>Gross P&L</th><th>Fees</th><th>Net P&L</th><th>R:R</th><th>Setup</th><th>Result</th><th></th></tr></thead>
        <tbody>
          <tr class="mo-row" onclick="toggleMonth(this,'${moId}')">
            <td><span class="rep-caret open">▶</span><span style="text-transform:uppercase;letter-spacing:.04em">${moLabel}</span></td>
            <td colspan="8" class="td-muted" style="font-size:11px">${allTrades.length} TRADES · MONTHLY TOTAL</td>
            <td colspan="2"></td>
            <td class="td-mono ${pnlCls}" style="font-size:13px">${moClosed.length ? fmtINR(moPnl) : "—"}</td>
            <td class="td-muted" style="font-size:11px">${moClosed.length ? Math.round(moWins.length/moClosed.length*100)+"% win" : ""}</td>
            <td class="td-muted" style="font-size:11px">${moWins.length}W / ${moClosed.length-moWins.length}L</td>
            <td></td>
          </tr>
          ${daysHTML}
        </tbody>
      </table>
    </div>`;
  }).join("");

}

$("rep_body").addEventListener("click", e => {
  const edit = e.target.closest(".rep-edit-btn");
  if (edit) { e.stopPropagation(); openDetails(edit.dataset.id); return; }
  const close = e.target.closest(".rep-close-btn");
  if (close) { e.stopPropagation(); openCloseModal(close.dataset.id); return; }
  const del = e.target.closest(".rep-del-btn");
  if (del) { e.stopPropagation(); deleteTrade(del.dataset.id); }
});

function drawEquityCurve(closed) {
  if (!closed.length) return '<div class="an-empty">Not enough data</div>';
  let cum = 0;
  const points = [0];
  closed.forEach(t => { cum += pnlForTrade(t)||0; points.push(cum); });
  const W = 560, H = 160, PL = 50, PR = 10, PT = 10, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;
  const maxV = Math.max(...points), minV = Math.min(...points);
  const range = (maxV - minV) || 1;
  const xS = i => PL + (i / (points.length - 1)) * cW;
  const yS = v => PT + cH - ((v - minV) / range) * cH;
  const zY = yS(0);
  const lineD = points.map((v,i) => `${i===0?"M":"L"}${xS(i).toFixed(1)},${yS(v).toFixed(1)}`).join(" ");
  const fillD = `M${xS(0).toFixed(1)},${zY.toFixed(1)} ` + points.map((v,i) => `L${xS(i).toFixed(1)},${yS(v).toFixed(1)}`).join(" ") + ` L${xS(points.length-1).toFixed(1)},${zY.toFixed(1)} Z`;
  const finalColor = cum >= 0 ? "#22c55e" : "#ef4444";
  const fillColor  = cum >= 0 ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)";

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-height:180px;display:block">
    <defs><clipPath id="ec"><rect x="${PL}" y="${PT}" width="${cW}" height="${cH}"/></clipPath></defs>
    <line x1="${PL}" y1="${zY.toFixed(1)}" x2="${W-PR}" y2="${zY.toFixed(1)}" stroke="rgba(148,163,184,.2)" stroke-width="1" stroke-dasharray="3,3"/>
    <path d="${fillD}" fill="${fillColor}" clip-path="url(#ec)"/>
    <path d="${lineD}" fill="none" stroke="${finalColor}" stroke-width="2" clip-path="url(#ec)"/>
    <text x="${PL-4}" y="${PT+10}" text-anchor="end" font-size="10" fill="rgba(148,163,184,.6)">${fmtINR(maxV)}</text>
    <text x="${PL-4}" y="${(PT+cH+PB-4).toFixed(0)}" text-anchor="end" font-size="10" fill="rgba(148,163,184,.6)">${fmtINR(minV)}</text>
    <text x="${PL-4}" y="${(zY+4).toFixed(0)}" text-anchor="end" font-size="10" fill="rgba(148,163,184,.4)">₹0</text>
    <text x="${(W/2).toFixed(0)}" y="${H}" text-anchor="middle" font-size="10" fill="rgba(148,163,184,.5)">${closed.length} trades</text>
  </svg>`;
}

/* ══════════════ REPORT CARD ══════════════ */
function openReportCard(monthStr) {
  const moTrades  = trades.filter(t => t.date && t.date.startsWith(monthStr));
  const moClosed  = moTrades.filter(t => isClosed(t));
  const moWins    = moClosed.filter(t => (pnlForTrade(t)||0) > 0);
  const moPnl     = moClosed.reduce((s,t) => s + (pnlForTrade(t)||0), 0);
  const moWR      = moClosed.length ? Math.round(moWins.length / moClosed.length * 100) : 0;
  const rrs       = moClosed.map(rrActual).filter(r => r !== null);
  const avgRR     = rrs.length ? (rrs.reduce((a,b)=>a+b,0)/rrs.length).toFixed(2) : "—";
  const label     = new Date(monthStr+"-01").toLocaleString("default",{month:"long",year:"numeric"});
  const pnlColor  = moPnl >= 0 ? "var(--green)" : "var(--red)";

  $("rc_title").textContent  = label;
  $("rc_trades").textContent = moTrades.length;
  $("rc_wr").textContent     = moClosed.length ? moWR + "%" : "—";
  $("rc_pnl").textContent    = fmtINR(moPnl);
  $("rc_pnl").style.color    = pnlColor;
  $("rc_rr").textContent     = avgRR;
  $("rc_wins").textContent   = moWins.length + "W / " + (moClosed.length - moWins.length) + "L";
  $("rc_equity").innerHTML   = drawEquityCurve(moClosed.sort((a,b) => a.date > b.date ? 1 : -1));
  $("reportCardModal").hidden = false;
}

$("rc_close").addEventListener("click", () => { $("reportCardModal").hidden = true; });
$("reportCardModal").addEventListener("click", e => { if (e.target === $("reportCardModal")) $("reportCardModal").hidden = true; });

$("rc_download").addEventListener("click", () => {
  // Basic SVG export of card stats as a shareable image
  const title = $("rc_title").textContent;
  const stats  = [
    ["Trades",  $("rc_trades").textContent],
    ["Win Rate",$("rc_wr").textContent],
    ["Net P&L", $("rc_pnl").textContent],
    ["Avg R:R", $("rc_rr").textContent],
    ["Record",  $("rc_wins").textContent],
  ];
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3b82f6";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" style="font-family:monospace">
    <rect width="480" height="300" fill="#0f1623" rx="12"/>
    <rect x="1" y="1" width="478" height="298" fill="none" stroke="#1e2d45" stroke-width="2" rx="12"/>
    <text x="240" y="44" text-anchor="middle" font-size="22" font-weight="bold" fill="${accent}">TradeMath</text>
    <text x="240" y="68" text-anchor="middle" font-size="14" fill="#94a3b8">${title}</text>
    <line x1="24" y1="80" x2="456" y2="80" stroke="#1e2d45" stroke-width="1"/>
    ${stats.map((s,i) => {
      const col = i % 2 === 0 ? 90 : 330;
      const row = Math.floor(i / 2);
      const y = 120 + row * 60;
      return `<text x="${col}" y="${y-2}" font-size="10" fill="#475569" text-transform="uppercase" letter-spacing="1">${s[0].toUpperCase()}</text>
               <text x="${col}" y="${y+22}" font-size="20" font-weight="bold" fill="${s[0]==='Net P&L'?($("rc_pnl").style.color||'#e2e8f0'):'#e2e8f0'}">${s[1]}</text>`;
    }).join("")}
    <text x="240" y="288" text-anchor="middle" font-size="11" fill="#1e2d45">trademath.in</text>
  </svg>`;
  const blob = new Blob([svg], { type:"image/svg+xml" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `trademath-${title.replace(/\s+/g,"-")}.svg`;
  a.click();
});


/* ── Your data: backup / restore wiring ── */
$("bk_download").addEventListener("click", downloadBackup);
$("bk_pick").addEventListener("click", () => $("bk_file").click());
$("bk_file").addEventListener("change", e => { readBackupFile(e.target.files[0]); e.target.value = ""; });
$("bk_apply").addEventListener("click", applyRestore);
$("bk_cancel").addEventListener("click", () => { pendingRestore = null; $("bk_confirm").hidden = true; $("bk_msg").textContent = ""; });

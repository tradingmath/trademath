"use strict";
/* ══════════════ JOURNAL ══════════════ */

let trades   = [];
let editId   = null;

function loadTrades() {
  try { trades = JSON.parse(localStorage.getItem("tm_trades") || "[]"); } catch(e) { trades = []; }
  window.trades = trades; // expose for calc.js checkDailyLimits
}
function saveTrades() {
  try { localStorage.setItem("tm_trades", JSON.stringify(trades)); } catch(e) {}
  window.trades = trades;
  renderTodayTrades();
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

function pnlForTrade(t) {
  const dir = t.dir === "LONG" ? 1 : -1;
  if (t.exits && t.exits.length) {
    return t.exits.reduce((sum, ex) => sum + dir * (ex.price - t.entry) * ex.qty - (ex.fees || 0), 0);
  }
  if (!t.exit) return null;
  return dir * (t.exit - t.entry) * t.qty - (t.fees || 0);
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

function todayStr() { return new Date().toISOString().slice(0, 10); }

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

/* ── Add form ── */
$("showAddBtn").addEventListener("click", () => {
  editId = null;
  $("formTitle").textContent = "New Trade";
  $("j_date").value   = todayStr();
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

/* ── Pre-log modal (Log from Calc) ── */
$("logTradeBtn").addEventListener("click", () => {
  if (!lastCalc) { switchTab("journal"); $("showAddBtn").click(); return; }
  // Open pre-log modal
  const lc = lastCalc;
  const mktMap = { equity:"NSE Equity", nifty:"Nifty F&O", bnf:"BankNifty F&O", gold:"MCX Gold", crude:"MCX Crude", btc:"BTC Perp", custom:"Other" };
  $("pl_summary").textContent =
    `${lc.isLong ? "▲ LONG" : "▼ SHORT"} · ${mktMap[lc.market] || "Other"} · Entry ${lc.entry} · SL ${lc.sl} · ${lc.units} ${lc.m.lots ? "lots" : "shares"}`;
  $("pl_notes").value  = "";
  $("pl_confidence").dataset.val = "3";
  renderStars(3);
  selectedSetupTags   = [];
  selectedMistakeTags = [];
  renderSetupChips("pl_setup_chips",   SETUP_PRESETS,   selectedSetupTags,   null);
  renderSetupChips("pl_mistake_chips", MISTAKE_PRESETS, selectedMistakeTags, null);
  renderPreLogChecklist();
  $("preLogModal").hidden = false;
});

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
      <span class="chk-label">${item}</span>
    </div>`).join("")}</div>`;
}

function togglePreCheck(el) {
  el.classList.toggle("checked");
}

$("pl_confirm").addEventListener("click", () => {
  if (!lastCalc) return;
  const lc   = lastCalc;
  const mktMap = { equity:"NSE Equity", nifty:"Nifty F&O", bnf:"BankNifty F&O", gold:"MCX Gold", crude:"MCX Crude", btc:"BTC Perp", custom:"Other" };
  const confidence = parseInt($("pl_confidence").dataset.val) || 3;
  const unchecked  = document.querySelectorAll("#pl_checklist .chk-box:not(.checked)").length;
  const t = {
    id: uid(), date: todayStr(),
    market: mktMap[lc.market] || "Other",
    dir:    lc.isLong ? "LONG" : "SHORT",
    entry:  lc.entry, sl: lc.sl,
    target: parseFloat(lc.targets[2].tp.toFixed(lc.m.dec)),
    qty:    lc.units, exit: null, exits: [], fees: 0,
    notes:  $("pl_notes").value.trim(),
    setup:  selectedSetupTags.join(", ") || "",
    mistakes: [...selectedMistakeTags],
    confidence,
    checklistSkipped: unchecked,
  };
  trades.push(t);
  saveTrades();
  $("preLogModal").hidden = true;
  switchTab("journal");
  refreshJournal();
});

$("pl_cancel").addEventListener("click", () => { $("preLogModal").hidden = true; });
$("preLogModal").addEventListener("click", e => { if (e.target === $("preLogModal")) $("preLogModal").hidden = true; });

$("cancelAddBtn").addEventListener("click", () => { $("addForm").hidden = true; editId = null; });

$("saveTradeBtn").addEventListener("click", () => {
  const t = {
    id:     editId || uid(),
    date:   $("j_date").value,
    market: $("j_market").value,
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
  const cols = ["date","market","dir","entry","sl","target","exit","qty","fees","pnl","rr","setup","notes"];
  const rows = trades.map(t => {
    const pnl = pnlForTrade(t);
    const rr  = rrActual(t);
    return [t.date, t.market, t.dir, t.entry, t.sl, t.target, t.exit, t.qty, t.fees,
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

/* ══════════════ ZERODHA CSV IMPORT ══════════════ */
let importedTrades = [];

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const parseRow = line => {
    const cols = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === delim && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    cols.push(cur.trim()); return cols;
  };
  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseRow(lines[i]);
    const obj  = {};
    headers.forEach((h, idx) => { obj[h] = (vals[idx] || '').trim(); });
    rows.push(obj);
  }
  return rows;
}

function detectCol(headers, ...patterns) {
  for (const p of patterns) { const f = headers.find(h => h.includes(p)); if (f) return f; }
  return null;
}

function parseZerodhaDate(str) {
  if (!str) return '';
  str = str.replace(/\s+/g,' ').trim();
  let m;
  if ((m = str.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1]+'-'+m[2]+'-'+m[3];
  if ((m = str.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/))) return m[3]+'-'+m[2]+'-'+m[1];
  const months={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  if ((m = str.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/))) {
    const mo = months[m[2].toLowerCase().slice(0,3)] || '01';
    return m[3]+'-'+mo+'-'+m[1].padStart(2,'0');
  }
  return str.slice(0,10);
}

function processZerodhaRows(rows) {
  if (!rows.length) return [];
  const headers  = Object.keys(rows[0]);
  const colDate  = detectCol(headers,'trade_date','date','order_exec','time');
  const colSym   = detectCol(headers,'symbol','scrip','instrument','trading_symbol');
  const colType  = detectCol(headers,'trade_type','type','buy_sell','side','order_type');
  const colQty   = detectCol(headers,'quantity','qty','shares');
  const colPrice = detectCol(headers,'price','gross_price','trade_price','rate','avg_price');
  const colExch  = detectCol(headers,'exchange','exch','segment');
  if (!colSym || !colType || !colQty || !colPrice) return null;

  const txns = rows.map(r => ({
    date:   parseZerodhaDate(r[colDate] || ''),
    symbol: (r[colSym] || '').toUpperCase(),
    type:   (r[colType] || '').toLowerCase().includes('buy') ? 'buy' : 'sell',
    qty:    parseFloat(r[colQty])   || 0,
    price:  parseFloat(r[colPrice]) || 0,
    exch:   (r[colExch] || '').toUpperCase(),
  })).filter(t => t.qty > 0 && t.price > 0 && t.symbol);

  const byKey = {};
  txns.forEach(t => {
    const key = t.symbol + '|' + t.date;
    if (!byKey[key]) byKey[key] = { buys:[], sells:[], symbol:t.symbol, date:t.date, exch:t.exch };
    byKey[key][t.type === 'buy' ? 'buys' : 'sells'].push(t);
  });

  const result = [];
  Object.values(byKey).forEach(g => {
    const buys = [...g.buys], sells = [...g.sells];
    while (buys.length && sells.length) {
      const b = buys.shift(), s = sells.shift();
      const qty = Math.min(b.qty, s.qty);
      result.push({ date:b.date, symbol:g.symbol, dir:'LONG', entry:b.price, exit:s.price, qty, exch:g.exch });
    }
    sells.forEach(s => result.push({ date:s.date, symbol:g.symbol, dir:'SHORT', entry:s.price, exit:null, qty:s.qty, exch:g.exch }));
    buys.forEach(b  => result.push({ date:b.date, symbol:g.symbol, dir:'LONG',  entry:b.price, exit:null, qty:b.qty, exch:g.exch }));
  });
  return result.sort((a,b) => a.date > b.date ? -1 : 1);
}

function guessMarket(symbol, exch) {
  const s = symbol.toUpperCase(), e = (exch||'').toUpperCase();
  if (e.includes('MCX') || s.includes('GOLD'))  return 'MCX Gold';
  if (s.includes('CRUDE'))                       return 'MCX Crude';
  if (s.includes('NIFTY') || s.includes('BANKNIFTY')) return 'Nifty F&O';
  if (e.includes('NFO') || e.includes('BFO'))    return 'Nifty F&O';
  return 'NSE Equity';
}

$("importBtn").addEventListener("click", () => $("csvFileInput").click());

$("csvFileInput").addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  e.target.value = '';
  const reader = new FileReader();
  reader.onload = ev => {
    const rows   = parseCSV(ev.target.result);
    const parsed = processZerodhaRows(rows);
    if (!parsed || !parsed.length) {
      $("importInfo").textContent = "Could not parse this CSV. Make sure it is a Zerodha Tradebook export.";
      $("importPreviewBody").innerHTML = '';
      importedTrades = [];
      $("importPanel").hidden = false; return;
    }
    importedTrades = parsed;
    $("importInfo").textContent = `Found ${parsed.length} trade(s) in ${file.name}. Review below and click Import.`;
    $("importWarn").textContent = parsed.filter(t => !t.exit).length + ' open (no exit yet).';
    $("importPreviewBody").innerHTML = parsed.map(t => {
      const pnl    = t.exit ? ((t.dir==='LONG'?1:-1)*(t.exit-t.entry)*t.qty) : null;
      const pnlStr = pnl !== null
        ? `<span style="color:${pnl>=0?'var(--green)':'var(--red)'};">${pnl>=0?'+':''}₹${Math.abs(pnl).toFixed(0)}</span>`
        : '<span style="color:var(--fg3)">Open</span>';
      return `<tr>
        <td class="td-muted">${t.date}</td>
        <td style="font-weight:500">${t.symbol}</td>
        <td><span class="badge ${t.dir.toLowerCase()}">${t.dir==='LONG'?'▲':'▼'} ${t.dir}</span></td>
        <td class="td-mono">${t.entry}</td>
        <td class="td-mono">${t.exit||'—'}</td>
        <td class="td-mono">${t.qty}</td>
        <td>${pnlStr}</td></tr>`;
    }).join('');
    $("importPanel").hidden = false;
    $("importPanel").scrollIntoView({ behavior:'smooth', block:'nearest' });
  };
  reader.readAsText(file);
});

$("confirmImportBtn").addEventListener("click", () => {
  importedTrades.forEach(t => {
    trades.push({ id:uid(), date:t.date, market:guessMarket(t.symbol,t.exch),
      dir:t.dir, entry:t.entry, sl:null, target:null, exit:t.exit||null,
      qty:t.qty, fees:0, exits:[], notes:'Zerodha import · '+t.symbol, setup:'', mistakes:[] });
  });
  saveTrades(); $("importPanel").hidden = true; importedTrades = []; refreshJournal();
});

$("cancelImportBtn").addEventListener("click", () => { $("importPanel").hidden = true; importedTrades = []; });

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
  $("cm_notes").value = t.notes || "";
  // Show existing partial exits
  renderPartialExitList(t);
  $("cm_full_btn").classList.add("active");
  $("cm_partial_btn").classList.remove("active");
  $("cm_partial_label").textContent = `Exit Qty (total: ${t.qty})`;
  $("cm_hit_sl").onclick = () => { $("cm_exit").value = t.sl     || ""; $("cm_exit").focus(); };
  $("cm_hit_tp").onclick = () => { $("cm_exit").value = t.target || ""; $("cm_exit").focus(); };
  $("closeModal").hidden = false;
  $("cm_exit").focus();
}

function renderPartialExitList(t) {
  const wrap = $("cm_exits_list"); if (!wrap) return;
  if (!t.exits || !t.exits.length) { wrap.innerHTML = ""; return; }
  const dir = t.dir === "LONG" ? 1 : -1;
  wrap.innerHTML = `<div style="font-size:11px;color:var(--fg3);margin-bottom:4px">Previous exits:</div>` +
    t.exits.map(ex => {
      const pnl = dir * (ex.price - t.entry) * ex.qty - (ex.fees || 0);
      return `<div class="exit-item">
        <span>${ex.date || ""}</span>
        <span class="td-mono">Qty ${ex.qty} @ ${ex.price}</span>
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
  trades = trades.map(t => {
    if (t.id !== closeTradeId) return t;
    const updated = { ...t,
      entry: parseFloat($("cm_entry").value) || t.entry,
      notes: $("cm_notes").value.trim() || t.notes || "",
    };
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
function renderTodayTrades() {
  const today  = todayStr();
  $("today_date").textContent = new Date().toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" });
  const todays = trades.filter(t => t.date === today);
  const list   = $("today_list");
  const empty  = $("today_empty");
  if (!todays.length) { list.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";
  list.innerHTML = todays.map(t => {
    const pnl    = pnlForTrade(t);
    const closed = isClosed(t);
    const pnlStr = !closed ? `<span style="color:var(--fg3)">OPEN</span>` : `<span class="${pnl>=0?'td-pos':'td-neg'}">${fmtINR(pnl)}</span>`;
    const badge  = t.dir === "LONG" ? `<span class="badge long">▲ LONG</span>` : `<span class="badge short">▼ SHORT</span>`;
    const res    = !closed ? `<span class="badge open" style="font-size:10px">OPEN</span>`
      : pnl > 0 ? `<span class="badge win" style="font-size:10px">WIN</span>`
      : `<span class="badge loss" style="font-size:10px">LOSS</span>`;
    const closeBtn = !closed ? `<button class="btn btn-danger btn-sm" style="font-size:11px;padding:3px 10px" onclick="openCloseModal('${t.id}')">Close</button>` : "";
    const setupTag = t.setup ? `<span style="font-size:10px;color:var(--accent);background:var(--accent-dim);border-radius:3px;padding:1px 6px">${t.setup}</span>` : "";
    return `<div class="today-trade" data-id="${t.id}">
      <div class="today-trade-top">${badge}<span style="font-size:12px;font-weight:600">${t.market}</span>${res}${setupTag}<span class="today-trade-pnl">${pnlStr}</span></div>
      <div class="today-trade-meta">E: ${t.entry||"—"} · SL: ${t.sl||"—"} · Qty: ${t.qty||"—"}${closed?` · Exit: ${t.exit||"partial"}`:""}</div>
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
  if (!opening) document.querySelectorAll('tr.tr-row[data-mo="'+moId+'"]').forEach(r => { r.style.display = 'none'; });
  btn.querySelector('.rep-caret').classList.toggle('open');
}
function toggleDay(btn, dayId) {
  const opening = !btn.querySelector('.rep-caret').classList.contains('open');
  document.querySelectorAll('tr.tr-row[data-grp="'+dayId+'"]').forEach(r => { r.style.display = opening ? '' : 'none'; });
  btn.querySelector('.rep-caret').classList.toggle('open');
}

/* ══════════════ REPORTS ══════════════ */
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

  const byMonth = {};
  [...trades].sort((a,b) => b.date > a.date ? 1 : -1).forEach(t => {
    const mo  = t.date ? t.date.slice(0,7) : "unknown";
    const day = t.date || "unknown";
    if (!byMonth[mo]) byMonth[mo] = { days:{} };
    if (!byMonth[mo].days[day]) byMonth[mo].days[day] = [];
    byMonth[mo].days[day].push(t);
  });

  $("rep_body").innerHTML = Object.entries(byMonth).map(([mo, {days}]) => {
    const allTrades = Object.values(days).flat().filter(t => filtered.includes(t));
    if (!allTrades.length) return "";
    const moClosed = allTrades.filter(t => isClosed(t));
    const moWins   = moClosed.filter(t => (pnlForTrade(t)||0) > 0);
    const moPnl    = moClosed.reduce((s,t) => s + (pnlForTrade(t)||0), 0);
    const moLabel  = mo === "unknown" ? "Unknown" : new Date(mo+"-01").toLocaleString("default",{month:"long",year:"numeric"});
    const pnlCls   = moPnl > 0 ? "td-pos" : moPnl < 0 ? "td-neg" : "";

    const daysHTML = Object.entries(days).map(([day, dayTrades]) => {
      const filteredDay = dayTrades.filter(t => filtered.includes(t));
      if (!filteredDay.length) return "";
      const dayClosed = filteredDay.filter(t => isClosed(t));
      const dayPnlVal = dayClosed.reduce((s,t) => s + (pnlForTrade(t)||0), 0);
      const dayWins   = dayClosed.filter(t => (pnlForTrade(t)||0) > 0);
      const dayLosses = dayClosed.filter(t => (pnlForTrade(t)||0) <= 0);
      const pCls      = dayPnlVal > 0 ? "td-pos" : dayPnlVal < 0 ? "td-neg" : "td-muted";
      const dayLabel  = day === "unknown" ? "Unknown" : new Date(day).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"});
      const dayId     = `d${mo}${day}`.replace(/[^a-z0-9]/gi,"");
      const wl        = `${dayWins.length}W / ${dayLosses.length}L`;

      const dayTradeRows = filteredDay.map(t => {
        const pnl = pnlForTrade(t);
        const rr  = rrActual(t);
        const closed = isClosed(t);
        const res = !closed ? `<span class="badge open">OPEN</span>` : pnl > 0 ? `<span class="badge win">WIN</span>` : `<span class="badge loss">LOSS</span>`;
        const pc  = pnl === null ? "td-muted" : pnl > 0 ? "td-pos" : "td-neg";
        const gv  = pnl !== null ? fmtINR((t.exit - t.entry) * (t.dir === "LONG" ? 1 : -1) * t.qty) : "—";
        const gc  = pnl !== null ? (pnl > 0 ? "td-pos" : "td-neg") : "td-muted";
        const setupTag = t.setup ? `<span style="font-size:10px;color:var(--accent)">${t.setup}</span>` : "—";
        const partialBadge = (!t.exit && t.exits && t.exits.length) ? ` <span style="font-size:10px;color:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;padding:0 4px">partial</span>` : "";
        return `<tr class="tr-row" data-id="${t.id}" data-grp="${dayId}" data-mo="${mo.replace(/[^a-z0-9]/gi,'')}" style="display:none">
          <td class="td-muted td-mono">${t.date||"—"}</td>
          <td>${t.market||"—"}</td>
          <td><span class="badge ${t.dir.toLowerCase()}">${t.dir==="LONG"?"▲":"▼"} ${t.dir}</span></td>
          <td class="td-mono">${t.entry||"—"}</td><td class="td-mono">${t.sl||"—"}</td>
          <td class="td-mono">${t.target||"—"}</td><td class="td-mono">${t.exit||"—"}${partialBadge}</td>
          <td class="td-mono">${t.qty||"—"}</td>
          <td class="td-mono ${gc}">${gv}</td>
          <td class="td-mono td-muted">${t.fees ? fmtINR(t.fees) : "₹0"}</td>
          <td class="td-mono ${pc}">${pnl !== null ? fmtINR(pnl) : "—"}</td>
          <td class="td-mono td-muted">${rr !== null ? rr.toFixed(2) : "—"}</td>
          <td>${setupTag}</td>
          <td>${res}</td>
          <td>
            ${!closed ? `<button class="btn btn-danger btn-sm rep-close-btn" data-id="${t.id}" style="font-size:10px;padding:1px 6px">Close</button>` : ""}
            <button class="btn btn-ghost btn-sm rep-del-btn" data-id="${t.id}" style="font-size:10px;padding:1px 5px;color:var(--fg3)">✕</button>
          </td>
        </tr>`;
      }).join("");

      return `<tr class="dy-row" data-mo="${mo.replace(/[^a-z0-9]/gi,'')}" data-grp="${dayId}" onclick="toggleDay(this,'${dayId}')">
        <td><span class="rep-caret">▶</span>${dayLabel}</td>
        <td colspan="8" class="td-muted" style="font-size:11px">${filteredDay.length} trade${filteredDay.length!==1?"s":""} · Daily Total</td>
        <td colspan="2"></td>
        <td class="td-mono ${pCls}" style="font-weight:600">${dayClosed.length ? fmtINR(dayPnlVal) : "—"}</td>
        <td></td><td class="td-muted" style="font-size:11px">${wl}</td><td></td>
      </tr>${dayTradeRows}`;
    }).join("");

    const moId = mo.replace(/[^a-z0-9]/gi,"");
    return `<div class="rep-log">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 4px 0">
        <span></span>
        <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 8px;margin:4px" onclick="openReportCard('${mo}')">📊 Share Card</button>
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

  $("rep_body").querySelectorAll(".rep-close-btn").forEach(b => {
    b.addEventListener("click", e => { e.stopPropagation(); openCloseModal(b.dataset.id); });
  });
  $("rep_body").querySelectorAll(".rep-del-btn").forEach(b => {
    b.addEventListener("click", e => { e.stopPropagation(); trades = trades.filter(t => t.id !== b.dataset.id); saveTrades(); refreshJournal(); });
  });
}

/* ══════════════ ANALYTICS ══════════════ */
function renderAnalytics() {
  const closed = trades.filter(t => isClosed(t)).sort((a,b) => a.date > b.date ? 1 : -1);
  const el = $("an_content");
  if (!el) return;
  if (!closed.length) { el.innerHTML = '<div class="an-empty">No closed trades yet. Close some trades to see analytics.</div>'; return; }

  const wins   = closed.filter(t => (pnlForTrade(t)||0) > 0);
  const losses = closed.filter(t => (pnlForTrade(t)||0) <= 0);
  const grossW = wins.reduce((s,t) => s + (pnlForTrade(t)||0), 0);
  const grossL = Math.abs(losses.reduce((s,t) => s + (pnlForTrade(t)||0), 0));
  const pf     = grossL > 0 ? (grossW / grossL) : null;
  const expect = closed.reduce((s,t) => s + (pnlForTrade(t)||0), 0) / closed.length;

  let peak = 0, cum = 0, maxDD = 0;
  closed.forEach(t => {
    cum += pnlForTrade(t) || 0;
    if (cum > peak) peak = cum;
    const dd = peak - cum; if (dd > maxDD) maxDD = dd;
  });

  let bestStreak = 0, curStreak = 0;
  closed.forEach(t => {
    if ((pnlForTrade(t)||0) > 0) { curStreak++; bestStreak = Math.max(bestStreak, curStreak); } else curStreak = 0;
  });

  // Stats row
  $("an_pf").textContent  = pf !== null ? pf.toFixed(2) : "—";
  $("an_exp").textContent = fmtINR(expect) + "/trade";
  $("an_dd").textContent  = fmtINR(maxDD);
  $("an_str").textContent = bestStreak + " W";

  // Equity curve
  $("an_equity").innerHTML = drawEquityCurve(closed);

  // P&L by market
  const byMkt = {};
  closed.forEach(t => {
    if (!byMkt[t.market]) byMkt[t.market] = { pnl:0, count:0 };
    byMkt[t.market].pnl += pnlForTrade(t)||0;
    byMkt[t.market].count++;
  });
  const mktMax = Math.max(...Object.values(byMkt).map(v => Math.abs(v.pnl)), 1);
  $("an_market").innerHTML = Object.entries(byMkt).sort((a,b) => b[1].pnl - a[1].pnl).map(([mkt, v]) => {
    const pct  = Math.abs(v.pnl) / mktMax * 100;
    const col  = v.pnl >= 0 ? "var(--green)" : "var(--red)";
    return `<div class="an-bar-row">
      <div class="an-bar-lbl" title="${mkt}">${mkt}</div>
      <div class="an-bar-track"><div class="an-bar-fill" style="width:${pct}%;background:${col}"></div></div>
      <div class="an-bar-val ${v.pnl >= 0 ? "td-pos" : "td-neg"}">${fmtINR(v.pnl)}</div>
    </div>`;
  }).join("");

  // P&L by day of week
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const byDow = {};
  closed.forEach(t => {
    if (!t.date) return;
    const dow = new Date(t.date+"T00:00:00").getDay();
    if (!byDow[dow]) byDow[dow] = { pnl:0, count:0 };
    byDow[dow].pnl += pnlForTrade(t)||0;
    byDow[dow].count++;
  });
  const dowMax = Math.max(...Object.values(byDow).map(v => Math.abs(v.pnl)), 1);
  $("an_dow").innerHTML = [1,2,3,4,5].map(d => {
    const v = byDow[d] || { pnl:0, count:0 };
    const pct = Math.abs(v.pnl) / dowMax * 100;
    const col = v.pnl >= 0 ? "var(--green)" : v.pnl < 0 ? "var(--red)" : "var(--border)";
    return `<div class="an-bar-row">
      <div class="an-bar-lbl">${DAYS[d]}</div>
      <div class="an-bar-track"><div class="an-bar-fill" style="width:${Math.max(pct,2)}%;background:${col}"></div></div>
      <div class="an-bar-val ${v.pnl > 0 ? "td-pos" : v.pnl < 0 ? "td-neg" : "td-muted"}">${v.count ? fmtINR(v.pnl) : "—"}</div>
    </div>`;
  }).join("");

  // P&L by setup
  const bySetup = {};
  closed.forEach(t => {
    const s = t.setup || "Untagged";
    if (!bySetup[s]) bySetup[s] = { pnl:0, count:0, wins:0 };
    bySetup[s].pnl += pnlForTrade(t)||0;
    bySetup[s].count++;
    if ((pnlForTrade(t)||0) > 0) bySetup[s].wins++;
  });
  $("an_setup").innerHTML = `
    <div class="an-setup-row an-setup-head"><span>Setup</span><span>Net P&L</span><span>Trades</span><span>Win %</span></div>
    ${Object.entries(bySetup).sort((a,b) => b[1].pnl - a[1].pnl).map(([s,v]) => `
    <div class="an-setup-row">
      <span style="font-size:12px">${s}</span>
      <span class="td-mono ${v.pnl>=0?"td-pos":"td-neg"}">${fmtINR(v.pnl)}</span>
      <span class="td-muted">${v.count}</span>
      <span class="td-muted">${v.count ? Math.round(v.wins/v.count*100)+"%" : "—"}</span>
    </div>`).join("")}`;
}

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
  const card = $("rc_card");
  // Basic SVG export of card stats as a shareable image
  const title = $("rc_title").textContent;
  const stats  = [
    ["Trades",  $("rc_trades").textContent],
    ["Win Rate",$("rc_wr").textContent],
    ["Net P&L", $("rc_pnl").textContent],
    ["Avg R:R", $("rc_rr").textContent],
    ["Record",  $("rc_wins").textContent],
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" style="font-family:monospace">
    <rect width="480" height="300" fill="#0f1623" rx="12"/>
    <rect x="1" y="1" width="478" height="298" fill="none" stroke="#1e2d45" stroke-width="2" rx="12"/>
    <text x="240" y="44" text-anchor="middle" font-size="22" font-weight="bold" fill="#f0a030">TradeMath</text>
    <text x="240" y="68" text-anchor="middle" font-size="14" fill="#94a3b8">${title}</text>
    <line x1="24" y1="80" x2="456" y2="80" stroke="#1e2d45" stroke-width="1"/>
    ${stats.map((s,i) => {
      const col = i % 2 === 0 ? 90 : 330;
      const row = Math.floor(i / 2);
      const y = 120 + row * 60;
      return `<text x="${col}" y="${y-2}" font-size="10" fill="#475569" text-transform="uppercase" letter-spacing="1">${s[0].toUpperCase()}</text>
               <text x="${col}" y="${y+22}" font-size="20" font-weight="bold" fill="${s[0]==='Net P&L'?($("rc_pnl").style.color||'#e2e8f0'):'#e2e8f0'}">${s[1]}</text>`;
    }).join("")}
    <text x="240" y="288" text-anchor="middle" font-size="11" fill="#1e2d45">tradingmath.netlify.app</text>
  </svg>`;
  const blob = new Blob([svg], { type:"image/svg+xml" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `trademath-${title.replace(/\s+/g,"-")}.svg`;
  a.click();
});

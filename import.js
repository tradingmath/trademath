"use strict";
/* ══════════════ BROKER TRADE-BOOK IMPORT ══════════════
   Reads a CSV / TSV trade-book from most brokers. Columns are found by name; when that fails the user maps them.
   Fills are merged per order/day, then matched FIFO per symbol, so partial fills, scale-outs, shorts and
   multi-day holds come out as the trades you actually made. Nothing here is specific to one broker. */

let importedTrades = [];       // journal-ready trade objects (no ids yet)
let importCtx = null;          // { name, headers, rows } kept so the column mapper can re-run

const IMPORT_CONCEPTS = {
  symbol: ["trading_symbol", "tradingsymbol", "symbol", "scrip_name", "scrip", "stock_name", "instrument", "security", "contract", "script", "name"],
  side:   ["trade_type", "buy_sell", "buy_or_sell", "transaction_type", "order_side", "side", "b_s", "action", "type"],
  qty:    ["quantity", "traded_qty", "trade_qty", "filled_qty", "executed_qty", "qty", "shares"],
  price:  ["trade_price", "executed_price", "average_price", "avg_price", "net_rate", "gross_rate", "price", "rate"],
  date:   ["trade_date", "tradedate", "execution_date", "executed_on", "date"],
  time:   ["order_execution_time", "execution_time", "trade_time", "exchange_time", "timestamp", "time"],
  exch:   ["exchange", "exch", "segment"],
  order:  ["order_id", "orderid", "order_no", "order_number"],
};
const IMPORT_NO_LOOSE = new Set(["type", "rate", "name", "date", "time", "side", "action", "b_s", "exch", "price", "qty", "scrip", "symbol"]);
const IMPORT_REQUIRED = ["symbol", "side", "qty", "price"];

const impEsc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const impKey = h => String(h || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/* ── CSV text → { headers, rows } ── */
function splitLine(line, delim) {
  const cols = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === delim && !inQ) { cols.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  cols.push(cur.trim());
  return cols;
}
function detectDelim(lines) {
  const sample = lines.slice(0, 10).join("\n");
  const n = ch => sample.split(ch).length - 1;
  const best = [[",", n(",")], ["\t", n("\t")], [";", n(";")], ["|", n("|")]].sort((a, b) => b[1] - a[1])[0];
  return best[1] ? best[0] : ",";
}
function findColumn(keys, concept) {
  const syn = IMPORT_CONCEPTS[concept];
  for (const s of syn) { const i = keys.indexOf(s); if (i >= 0) return i; }                       // exact name first
  for (const s of syn) { if (IMPORT_NO_LOOSE.has(s)) continue; const i = keys.findIndex(k => k.includes(s)); if (i >= 0) return i; }
  return -1;
}
function readTable(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const delim = detectDelim(lines);
  let head = 0, bestScore = -1;
  for (let i = 0; i < Math.min(40, lines.length - 1); i++) {            // brokers often put account details above the table
    const keys = splitLine(lines[i], delim).map(impKey);
    const score = IMPORT_REQUIRED.filter(c => findColumn(keys, c) >= 0).length;
    if (score > bestScore) { bestScore = score; head = i; }
    if (score === IMPORT_REQUIRED.length) break;
  }
  const headers = splitLine(lines[head], delim);
  const rows = [];
  for (let i = head + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delim);
    if (cells.filter(Boolean).length < 3) continue;                     // totals / footers
    rows.push(cells);
  }
  return { headers, rows };
}

/* ── cell parsing ── */
function impNum(v) {
  const x = parseFloat(String(v == null ? "" : v).replace(/[₹$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return isNaN(x) ? 0 : x;
}
function impSide(v) {
  const s = String(v || "").trim().toLowerCase();
  if (/^(b$|buy|bought|purchase|long)/.test(s)) return "buy";
  if (/^(s$|sell|sold|sale|short)/.test(s)) return "sell";
  return null;
}
const MON = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
function parseTradeDate(str) {                                         // day-first, as used in India
  str = String(str || "").replace(/\s+/g, " ").trim();
  let m;
  if ((m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  if ((m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  if ((m = str.match(/^(\d{1,2})[\s\-]([a-zA-Z]{3,})[\s\-,]*(\d{2,4})/))) {
    const mo = MON[m[2].toLowerCase().slice(0, 3)];
    if (mo) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + mo + "-" + m[1].padStart(2, "0");
  }
  return "";
}
function parseTimeOfDay(str) {                                         // seconds since midnight, for ordering only
  const m = String(str || "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return 0;
  let h = +m[1]; if (m[4]) { const pm = m[4].toLowerCase() === "pm"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return h * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
}

/* ── what kind of instrument is this symbol? ── */
function contractInfo(symbol, exch) {
  const raw = (symbol || "").toUpperCase().trim(), s = raw.replace(/\s+/g, ""), e = (exch || "").toUpperCase();
  if (/(USDT|USDC|BUSD)$/.test(s) || /-?PERP$/.test(s)) return { market: "Crypto", instrument: "crypto", optType: null };
  // Option symbols: "...24500CE", "NIFTY 24500 CE 28 NOV". Futures: "...25NOVFUT", "... FUT". A bare CE/PE ending is NOT enough (RELIANCE ends in CE).
  const optM = raw.match(/\b(CE|PE)\b/) || s.match(/\d(CE|PE)$/);
  const isFut = /\bFUT\b/.test(raw) || /\d(?:[A-Z]{3})?FUT$/.test(s);
  const isFno = /NFO|BFO|FNO|_FO|\bFO\b/.test(e) || !!optM || isFut;
  const instrument = optM ? "options" : isFut ? "futures" : isFno ? "options" : "equity";
  let market;
  if (e.includes("MCX") || (!e && /GOLD|CRUDE/.test(s))) market = s.includes("GOLD") ? "MCX Gold" : s.includes("CRUDE") ? "MCX Crude" : "Other";
  else if (isFno) market = s.startsWith("BANKNIFTY") ? "BankNifty F&O" : s.startsWith("NIFTY") ? "Nifty F&O" : /^(FINNIFTY|MIDCPNIFTY|SENSEX|BANKEX)/.test(s) ? "Other Index F&O" : "Stock F&O";
  else market = "NSE Equity";
  return { market, instrument, optType: optM ? optM[1] : null };
}

/* ── rows → transactions → matched trades ── */
function toTransactions(table, map) {
  const out = []; let skipped = 0, undated = 0;
  table.rows.forEach((cells, idx) => {
    const g = k => (map[k] >= 0 ? cells[map[k]] : "");
    const side = impSide(g("side")), qty = impNum(g("qty")), price = impNum(g("price")), symbol = String(g("symbol") || "").trim();
    if (!side || !(qty > 0) || !(price > 0) || !symbol) { skipped++; return; }
    let date = parseTradeDate(g("date")) || parseTradeDate(g("time"));
    if (!date) { date = todayStr(); undated++; }
    out.push({ idx, side, qty, price, symbol: symbol.toUpperCase(), date, t: parseTimeOfDay(g("time")) || parseTimeOfDay(g("date")),
               exch: String(g("exch") || "").toUpperCase(), order: String(g("order") || "") });
  });
  return { txns: out, skipped, undated };
}

function matchTransactions(txns) {
  const bySym = new Map();
  txns.forEach(t => { if (!bySym.has(t.symbol)) bySym.set(t.symbol, []); bySym.get(t.symbol).push(t); });
  const trades = [];
  bySym.forEach((list, symbol) => {
    list.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.t - b.t) || (a.idx - b.idx));
    // 1. merge the fills of one order (same order id, or consecutive same-side fills on the same day) into one weighted-average fill
    const fills = [];
    list.forEach(t => {
      const last = fills[fills.length - 1];
      const same = last && last.side === t.side && last.date === t.date && (!t.order || !last.order || t.order === last.order);
      if (same) { const q = last.qty + t.qty; last.price = (last.price * last.qty + t.price * t.qty) / q; last.qty = q; }
      else fills.push({ ...t });
    });
    // 2. FIFO: each fill first closes opposite-side lots, anything left opens a new lot
    const open = [], done = [];
    const finish = lot => done.push(lot);
    fills.forEach(f => {
      let rest = f.qty;
      while (rest > 1e-9 && open.length && open[0].side !== f.side) {
        const lot = open[0], q = Math.min(lot.qty, rest);
        lot.exits.push({ price: f.price, qty: q, fees: 0, date: f.date });
        lot.qty -= q; rest -= q;
        if (lot.qty <= 1e-9) finish(open.shift());
      }
      if (rest > 1e-9) open.push({ side: f.side, qty: rest, qty0: rest, price: f.price, date: f.date, exch: f.exch, exits: [] });
    });
    open.forEach(finish);
    done.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).forEach(lot => {
      const closedQty = lot.exits.reduce((s, x) => s + x.qty, 0);
      const full = lot.qty <= 1e-9;
      const entry = { symbol, exch: lot.exch, date: lot.date, dir: lot.side === "buy" ? "LONG" : "SHORT", entry: lot.price, qty: lot.qty0 };
      if (!lot.exits.length) { entry.exit = null; entry.exits = []; }
      else if (lot.exits.length === 1 && full) { entry.exit = lot.exits[0].price; entry.exits = []; }
      else { entry.exits = lot.exits; entry.exit = full ? lot.exits[lot.exits.length - 1].price : null; }   // scaled out, or still partly open
      trades.push(entry);
    });
  });
  return trades.sort((a, b) => a.date > b.date ? -1 : a.date < b.date ? 1 : 0);
}

/* A matched trade becomes a normal journal trade, filed under the right market. */
function toJournalTrade(m) {
  const ci = contractInfo(m.symbol, m.exch);
  const t = { date: m.date, market: ci.market, symbol: cleanSymbol(m.symbol), instrument: ci.instrument, optType: ci.optType,
              dir: m.dir, entry: m.entry, sl: null, target: null, exit: m.exit, qty: m.qty, fees: 0, exits: m.exits || [],
              notes: "Imported from broker file", setup: "", mistakes: [], src: "import" };
  if (ci.instrument === "crypto") { t.fx = rememberedFx(); t.ccy = "USDT"; }
  return t;
}
const tradeSig = t => [cleanSymbol(t.symbol || ""), t.date, t.dir, (+t.entry || 0).toFixed(2), +(+t.qty || 0).toFixed(4)].join("|");
function legacySymbol(t) { const m = /import · (.+)$/.exec(t.notes || ""); return m ? m[1] : ""; }

/* ── UI ── */
const importTable = () => $("importPreviewTable").closest(".tbl-wrap");
function showImportPreview(on) { importTable().hidden = !on; $("confirmImportBtn").hidden = !on; }   // hidden while there is nothing to preview
function showImportMessage(text, warn) {
  showImportPreview(false);
  $("importInfo").textContent = text;
  $("importWarn").textContent = warn || "";
  $("importPreviewBody").innerHTML = "";
  $("importMap").hidden = true;
  $("confirmImportBtn").disabled = true;
  $("importPanel").hidden = false;
}

function buildMapper(table, map) {
  const opts = (optional) => (optional ? '<option value="-1">(none)</option>' : '<option value="-1">Choose a column…</option>') +
    table.headers.map((h, i) => `<option value="${i}">${impEsc(h || "Column " + (i + 1))}</option>`).join("");
  const labels = { symbol: "Symbol / instrument", side: "Buy / Sell", qty: "Quantity", price: "Price", date: "Date", time: "Time", exch: "Exchange / segment" };
  $("importMapFields").innerHTML = Object.keys(labels).map(k => {
    const optional = !IMPORT_REQUIRED.includes(k);
    return `<div class="field"><label for="im_${k}">${labels[k]}${optional ? ' <span class="proj-hint">optional</span>' : ""}</label><select id="im_${k}">${opts(optional)}</select></div>`;
  }).join("");
  Object.keys(labels).forEach(k => { $("im_" + k).value = String(map[k] >= 0 ? map[k] : -1); });
  $("importMap").hidden = false;
}

function runImport(map) {
  const { txns, skipped, undated } = toTransactions(importCtx, map);
  if (!txns.length) { showImportMessage("No buy/sell rows were found in " + importCtx.name + ".", skipped ? skipped + " row(s) had an unrecognised side, quantity or price." : ""); buildMapper(importCtx, map); return; }
  const mine = new Map();                                              // what is already in the journal, so re-importing is safe
  trades.forEach(t => { const k = tradeSig({ ...t, symbol: t.symbol || legacySymbol(t) }); mine.set(k, (mine.get(k) || 0) + 1); });
  let dupes = 0;
  importedTrades = matchTransactions(txns).map(toJournalTrade).filter(t => {
    const k = tradeSig(t), n = mine.get(k) || 0;
    if (n > 0) { mine.set(k, n - 1); dupes++; return false; }
    return true;
  });
  const closed = importedTrades.filter(isClosed).length;
  $("importInfo").textContent = importedTrades.length
    ? `Found ${importedTrades.length} trade(s) in ${importCtx.name}: ${closed} closed, ${importedTrades.length - closed} open. Review below, then import.`
    : `Nothing new to import from ${importCtx.name}.`;
  $("importWarn").textContent = [dupes ? dupes + " already in your journal (skipped)" : "", skipped ? skipped + " row(s) skipped (unrecognised side, quantity or price)" : "",
                                 undated ? undated + " row(s) had no readable date and were dated today" : ""].filter(Boolean).join(" · ");
  const shown = importedTrades.slice(0, 300);
  $("importPreviewBody").innerHTML = shown.map(t => {
    const pnl = isClosed(t) || (t.exits && t.exits.length) ? pnlForTrade(t) : null;
    const pnlStr = pnl !== null ? `<span style="color:${pnl >= 0 ? "var(--green)" : "var(--red)"};">${pnl >= 0 ? "+" : "−"}₹${Math.abs(pnl).toFixed(0)}</span>` : '<span style="color:var(--fg3)">Open</span>';
    const exitTxt = t.exit != null ? impEsc(t.exit) : (t.exits && t.exits.length ? "partial" : "—");
    return `<tr><td class="td-muted">${impEsc(t.date)}</td><td style="font-weight:500">${impEsc(t.symbol)}</td>
      <td><span class="badge ${t.dir === "LONG" ? "long" : "short"}">${t.dir === "LONG" ? "▲" : "▼"} ${t.dir}</span></td>
      <td class="td-mono">${impEsc(t.entry)}</td><td class="td-mono">${exitTxt}</td><td class="td-mono">${impEsc(t.qty)}</td><td>${pnlStr}</td></tr>`;
  }).join("") + (importedTrades.length > shown.length ? `<tr><td colspan="7" class="td-muted">…and ${importedTrades.length - shown.length} more</td></tr>` : "");
  $("importMap").hidden = true;
  showImportPreview(importedTrades.length > 0);
  $("confirmImportBtn").disabled = !importedTrades.length;
  $("importPanel").hidden = false;
  $("importPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function startImport(text, name) {
  const table = readTable(text);
  if (!table || !table.rows.length) { showImportMessage("This file doesn't look like a trade list (no rows found).", "Export your trade-book as CSV from your broker and try again."); return; }
  importCtx = { name, headers: table.headers, rows: table.rows };
  const keys = table.headers.map(impKey);
  const map = {}; Object.keys(IMPORT_CONCEPTS).forEach(c => { map[c] = findColumn(keys, c); });
  if (IMPORT_REQUIRED.some(c => map[c] < 0)) {                         // couldn't recognise everything: let the user say which column is which
    showImportMessage("We couldn't recognise every column in " + name + ". Pick which column holds what, then continue.");
    buildMapper(importCtx, map);
    return;
  }
  runImport(map);
}

$("importBtn").addEventListener("click", () => $("csvFileInput").click());
$("csvFileInput").addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  e.target.value = "";
  if (file.size > 8 * 1024 * 1024) { showImportMessage("That file is over 8 MB. Export a shorter date range.", ""); return; }
  const reader = new FileReader();
  reader.onload = ev => startImport(String(ev.target.result || ""), file.name);
  reader.onerror = () => showImportMessage("Could not read that file.", "");
  reader.readAsText(file);
});
$("im_apply").addEventListener("click", () => {
  const map = {};
  Object.keys(IMPORT_CONCEPTS).forEach(c => { const el = $("im_" + c); map[c] = el ? parseInt(el.value, 10) : -1; });
  if (IMPORT_REQUIRED.some(c => !(map[c] >= 0))) { $("importWarn").textContent = "Symbol, Buy/Sell, Quantity and Price are required."; return; }
  runImport(map);
});
$("confirmImportBtn").addEventListener("click", () => {
  importedTrades.forEach(t => trades.push({ ...t, id: uid() }));
  const n = importedTrades.length;
  saveTrades(); $("importPanel").hidden = true; importedTrades = []; importCtx = null; refreshJournal();
  showToast("✓ Imported " + n + " trade" + (n === 1 ? "" : "s"));
});
$("cancelImportBtn").addEventListener("click", () => { $("importPanel").hidden = true; importedTrades = []; importCtx = null; });

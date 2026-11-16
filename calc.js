"use strict";
/* ══════════════ SAFE STORAGE ══════════════
   Every write goes through tmSet(). If the browser refuses (storage full, private window, blocked), a banner stays on
   screen so a trader never believes a trade was saved when it was not. */
function tmBanner(id, html, onMount) {
  let b = document.getElementById(id);
  if (!b) {
    b = document.createElement("div");
    b.id = id; b.className = "tm-banner"; b.setAttribute("role", "alert");
    document.body.insertBefore(b, document.body.firstChild);
  }
  b.innerHTML = html;
  if (onMount) onMount(b);
}
function tmBannerOff(id) { const b = document.getElementById(id); if (b) b.remove(); }
function tmSet(key, value) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    tmBannerOff("tm_store_banner");
    return true;
  } catch (e) {
    tmBanner("tm_store_banner", "<b>Not saved.</b> Your browser is not letting TradeMath store data (storage is full or blocked, or this is a private window). What you do now will be lost when you close this tab. Use <b>Settings → Your data → Download backup</b> to keep a copy.");
    return false;
  }
}
function tmGet(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch (e) { return fallback; }
}
/* Save text as a file the user can keep (used for backups and for recovering unreadable data). */
function tmDownload(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type || "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ══════════════ CALCULATOR ══════════════ */

let instrType          = "equity"; // "options" | "futures" | "equity" (default simple equity)
let optType            = "CE";      // "CE" | "PE"
let orderType          = "MIS";     // derived: equity → from leverage, F&O → foOrderType
let foOrderType        = "NRML";    // user's MIS/NRML pick for futures & options
let leverageMultiplier = 5;         // default 5x intraday
let leverageMode       = "5";       // "5" | "1" | "custom"
let lastCalc           = null;
const DEFAULT_LOT      = 65;        // Nifty; the lot field is editable and remembers the last value you typed

/* ── Markets: ONE fixed list used by the calculator, journal, filters and settings, so data stays consistent
   whichever level (Quick / Trader / Pro) a trade was logged from. ── */
const MARKETS     = ["NSE Equity", "Nifty F&O", "BankNifty F&O", "Stock F&O", "Other Index F&O", "MCX Gold", "MCX Crude", "Crypto", "Other"];
const FNO_MARKETS = ["Nifty F&O", "BankNifty F&O", "Stock F&O", "Other Index F&O"];

function marketForSymbol(sym, instr) {
  if (sym.indexOnly) return sym.name === "NIFTY" ? "Nifty F&O" : sym.name === "BANKNIFTY" ? "BankNifty F&O" : "Other Index F&O";
  return instr === "equity" ? "NSE Equity" : "Stock F&O";
}
/* A known symbol decides the market. Without one (Quick has no symbol box) the "I mainly trade" setting does,
   adjusted for the Options toggle, so a Quick log is still filed under the right market. */
function deriveMarket(sym, instr) {
  if (instr === "crypto") return "Crypto";
  if (sym) return marketForSymbol(sym, instr);
  const dm = (typeof getAppSettings === "function" && getAppSettings().defaultMarket) || "NSE Equity";
  const isFno = instr !== "equity";
  if (isFno && dm === "NSE Equity") return "Nifty F&O";
  if (!isFno && FNO_MARKETS.includes(dm)) return "NSE Equity";
  return MARKETS.includes(dm) ? dm : (isFno ? "Nifty F&O" : "NSE Equity");
}

/* ── Crypto perpetuals: prices in USDT, risk / margin / P&L in ₹ ──
   Rates are editable in Settings (exchanges differ and change them); these defaults are typical, not any one exchange's. */
const CRYPTO_DEFAULTS = { taker: 0.05, gst: 18, funding: 0.01, mmr: 0.5 };
const DEFAULT_FX = 88, DEFAULT_CRYPTO_LEV = 10;
function cryptoFeeCfg() {
  const s = typeof getAppSettings === "function" ? getAppSettings() : {};
  const n = (v, d) => { const x = parseFloat(v); return isNaN(x) || x < 0 ? d : x; };
  return { taker: n(s.cryptoTaker, CRYPTO_DEFAULTS.taker), gst: n(s.cryptoGst, CRYPTO_DEFAULTS.gst),
           funding: n(s.cryptoFunding, CRYPTO_DEFAULTS.funding), mmr: n(s.cryptoMmr, CRYPTO_DEFAULTS.mmr) };
}
function rememberedFx() { const v = parseFloat(typeof getAppSettings === "function" ? getAppSettings().usdInr : 0); return v > 0 ? v : DEFAULT_FX; }
function getFx()        { const v = parseFloat($("i_fx") ? $("i_fx").value : ""); return v > 0 ? v : DEFAULT_FX; }
function getCryptoLev() { const v = parseFloat($("i_lev") ? $("i_lev").value : ""); return v >= 1 ? Math.min(125, v) : DEFAULT_CRYPTO_LEV; }
const fmtUsd = n => {                           // 97,000.00  |  1.2345  |  0.05  (small prices keep their precision, trailing zeros trimmed)
  const a = Math.abs(n), t = fmtP(n, a >= 1000 ? 2 : a >= 1 ? 4 : 6);
  return a >= 1000 ? t : t.replace(/(\.\d{2}\d*?)0+$/, "$1");
};
function cryptoBase() {
  const t = ($("sym_input") ? $("sym_input").value : "").trim().toUpperCase().replace(/(-?PERP|USDT|USD)$/, "");
  return t || "coins";
}

const $ = id => document.getElementById(id);
const comma = n => Math.abs(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function fmtINR(n) {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e7) return s + "₹" + (a / 1e7).toFixed(2) + "Cr";
  if (a >= 1e5) return s + "₹" + (a / 1e5).toFixed(2) + "L";
  if (a >= 1000) return s + "₹" + comma(n);
  return s + "₹" + a.toFixed(2);
}
function fmtP(n, dec) {                         // thousands commas on the whole part only, never inside the decimals
  const [i, d] = Math.abs(n).toFixed(dec).split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d ? "." + d : "");
}

// Local calendar date (not UTC, which is "yesterday" in India before 5:30 AM).
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/* ══════════════ SYMBOL DATABASE ══════════════ */
// lot = F&O lot size, marginNRML = approx SPAN+exposure per lot (₹).
// verified:true means the lot size was checked against the exchange list. Every other lot size, and every margin, is an
// approximation: the app labels them "approx." and warns, because exchanges revise lot sizes and brokers change margins.
const SYMBOLS = [
  // Index derivatives (F&O only)
  {name:"NIFTY",       lot:65,   sector:"Index",    marginNRML:112000, indexOnly:true, verified:true},
  {name:"BANKNIFTY",   lot:30,   sector:"Index",    marginNRML:51000,  indexOnly:true, verified:true},
  {name:"FINNIFTY",    lot:60,   sector:"Index",    marginNRML:91000,  indexOnly:true, verified:true},
  {name:"MIDCPNIFTY",  lot:120,  sector:"Index",    marginNRML:88000,  indexOnly:true, verified:true},
  {name:"SENSEX",      lot:10,   sector:"Index",    marginNRML:90000,  indexOnly:true},
  {name:"BANKEX",      lot:15,   sector:"Index",    marginNRML:58000,  indexOnly:true},
  // Stocks
  {name:"RELIANCE",    lot:250,  sector:"Energy",   marginNRML:200000},
  {name:"TCS",         lot:175,  sector:"IT",       marginNRML:190000},
  {name:"INFY",        lot:400,  sector:"IT",       marginNRML:130000},
  {name:"HDFCBANK",    lot:550,  sector:"Banking",  marginNRML:120000},
  {name:"ICICIBANK",   lot:700,  sector:"Banking",  marginNRML:120000},
  {name:"SBIN",        lot:1500, sector:"Banking",  marginNRML:110000},
  {name:"AXISBANK",    lot:625,  sector:"Banking",  marginNRML:95000},
  {name:"KOTAKBANK",   lot:400,  sector:"Banking",  marginNRML:165000},
  {name:"INDUSINDBK",  lot:500,  sector:"Banking",  marginNRML:90000},
  {name:"BAJFINANCE",  lot:125,  sector:"Finance",  marginNRML:130000},
  {name:"BAJAJFINSV",  lot:500,  sector:"Finance",  marginNRML:90000},
  {name:"CHOLAFIN",    lot:625,  sector:"Finance",  marginNRML:90000},
  {name:"MUTHOOTFIN",  lot:300,  sector:"Finance",  marginNRML:90000},
  {name:"HDFCLIFE",    lot:1100, sector:"Finance",  marginNRML:85000},
  {name:"SBILIFE",     lot:750,  sector:"Finance",  marginNRML:90000},
  {name:"LICI",        lot:700,  sector:"Finance",  marginNRML:80000},
  {name:"BHARTIARTL",  lot:475,  sector:"Telecom",  marginNRML:115000},
  {name:"HINDUNILVR",  lot:300,  sector:"FMCG",     marginNRML:155000},
  {name:"ITC",         lot:1600, sector:"FMCG",     marginNRML:90000},
  {name:"NESTLEIND",   lot:25,   sector:"FMCG",     marginNRML:125000},
  {name:"TATACONSUM",  lot:900,  sector:"FMCG",     marginNRML:80000},
  {name:"BRITANNIA",   lot:100,  sector:"FMCG",     marginNRML:120000},
  {name:"WIPRO",       lot:1500, sector:"IT",       marginNRML:70000},
  {name:"HCLTECH",     lot:350,  sector:"IT",       marginNRML:115000},
  {name:"TECHM",       lot:600,  sector:"IT",       marginNRML:85000},
  {name:"LTI",         lot:150,  sector:"IT",       marginNRML:120000},
  {name:"MPHASIS",     lot:175,  sector:"IT",       marginNRML:115000},
  {name:"PERSISTENT",  lot:125,  sector:"IT",       marginNRML:120000},
  {name:"SUNPHARMA",   lot:350,  sector:"Pharma",   marginNRML:130000},
  {name:"DRREDDY",     lot:125,  sector:"Pharma",   marginNRML:130000},
  {name:"CIPLA",       lot:650,  sector:"Pharma",   marginNRML:90000},
  {name:"DIVISLAB",    lot:150,  sector:"Pharma",   marginNRML:120000},
  {name:"APOLLOHOSP",  lot:125,  sector:"Pharma",   marginNRML:130000},
  {name:"AUROPHARMA",  lot:650,  sector:"Pharma",   marginNRML:85000},
  {name:"BIOCON",      lot:2800, sector:"Pharma",   marginNRML:75000},
  {name:"IPCALAB",     lot:350,  sector:"Pharma",   marginNRML:80000},
  {name:"TATAMOTORS",  lot:1425, sector:"Auto",     marginNRML:90000},
  {name:"MARUTI",      lot:37,   sector:"Auto",     marginNRML:145000},
  {name:"BAJAJ-AUTO",  lot:125,  sector:"Auto",     marginNRML:135000},
  {name:"EICHERMOT",   lot:175,  sector:"Auto",     marginNRML:130000},
  {name:"HEROMOTOCO",  lot:150,  sector:"Auto",     marginNRML:140000},
  {name:"TVSMOTOR",    lot:350,  sector:"Auto",     marginNRML:100000},
  {name:"M&M",         lot:350,  sector:"Auto",     marginNRML:120000},
  {name:"MOTHERSON",   lot:7750, sector:"Auto",     marginNRML:70000},
  {name:"LT",          lot:175,  sector:"Infra",    marginNRML:165000},
  {name:"NTPC",        lot:2250, sector:"Power",    marginNRML:90000},
  {name:"POWERGRID",   lot:2700, sector:"Power",    marginNRML:80000},
  {name:"ADANIPOWER",  lot:2750, sector:"Power",    marginNRML:85000},
  {name:"TATAPOWER",   lot:3225, sector:"Power",    marginNRML:80000},
  {name:"PFC",         lot:2250, sector:"Power",    marginNRML:90000},
  {name:"RECLTD",      lot:2450, sector:"Power",    marginNRML:90000},
  {name:"NHPC",        lot:5750, sector:"Power",    marginNRML:70000},
  {name:"SJVN",        lot:7250, sector:"Power",    marginNRML:65000},
  {name:"ONGC",        lot:1975, sector:"Energy",   marginNRML:90000},
  {name:"BPCL",        lot:3750, sector:"Energy",   marginNRML:90000},
  {name:"COALINDIA",   lot:4200, sector:"Energy",   marginNRML:90000},
  {name:"IOC",         lot:5600, sector:"Energy",   marginNRML:80000},
  {name:"GAIL",        lot:3825, sector:"Energy",   marginNRML:80000},
  {name:"VEDL",        lot:3500, sector:"Metal",    marginNRML:90000},
  {name:"HINDALCO",    lot:1400, sector:"Metal",    marginNRML:90000},
  {name:"TATASTEEL",   lot:5500, sector:"Metal",    marginNRML:90000},
  {name:"JSWSTEEL",    lot:900,  sector:"Metal",    marginNRML:90000},
  {name:"SAIL",        lot:5500, sector:"Metal",    marginNRML:80000},
  {name:"ADANIENT",    lot:300,  sector:"Conglom",  marginNRML:120000},
  {name:"ADANIPORTS",  lot:625,  sector:"Logistics",marginNRML:105000},
  {name:"ADANIGREEN",  lot:775,  sector:"Power",    marginNRML:105000},
  {name:"GRASIM",      lot:250,  sector:"Cement",   marginNRML:130000},
  {name:"ULTRACEMCO",  lot:100,  sector:"Cement",   marginNRML:170000},
  {name:"SHREECEM",    lot:25,   sector:"Cement",   marginNRML:165000},
  {name:"ACC",         lot:250,  sector:"Cement",   marginNRML:115000},
  {name:"AMBUJACEM",   lot:1900, sector:"Cement",   marginNRML:90000},
  {name:"ASIANPAINT",  lot:200,  sector:"Chemicals",marginNRML:165000},
  {name:"PIDILITIND",  lot:250,  sector:"Chemicals",marginNRML:130000},
  {name:"TITAN",       lot:175,  sector:"Consumer", marginNRML:165000},
  {name:"TRENT",       lot:175,  sector:"Consumer", marginNRML:155000},
  {name:"ZOMATO",      lot:4500, sector:"Internet", marginNRML:90000},
  {name:"PAYTM",       lot:2000, sector:"Fintech",  marginNRML:80000},
  {name:"NYKAA",       lot:2750, sector:"Internet", marginNRML:75000},
  {name:"DELHIVERY",   lot:2125, sector:"Logistics",marginNRML:75000},
  {name:"IRCTC",       lot:825,  sector:"PSU",      marginNRML:95000},
  {name:"IRFC",        lot:4375, sector:"PSU",      marginNRML:75000},
  {name:"HAL",         lot:150,  sector:"Defence",  marginNRML:130000},
  {name:"BEL",         lot:2900, sector:"Defence",  marginNRML:80000},
  {name:"BHEL",        lot:5425, sector:"Infra",    marginNRML:75000},
  {name:"SIEMENS",     lot:200,  sector:"Infra",    marginNRML:160000},
  {name:"ABB",         lot:125,  sector:"Infra",    marginNRML:160000},
  {name:"HAVELLS",     lot:500,  sector:"Consumer", marginNRML:100000},
  {name:"POLYCAB",     lot:150,  sector:"Consumer", marginNRML:130000},
  {name:"DIXON",       lot:125,  sector:"Consumer", marginNRML:130000},
  {name:"VOLTAS",      lot:500,  sector:"Consumer", marginNRML:95000},
  {name:"BLUEDART",    lot:75,   sector:"Logistics",marginNRML:110000},
  {name:"CONCOR",      lot:900,  sector:"Logistics",marginNRML:95000},
  {name:"BALKRISIND",  lot:200,  sector:"Auto",     marginNRML:115000},
  {name:"EXIDEIND",    lot:2200, sector:"Auto",     marginNRML:80000},
  {name:"MINDA",       lot:1625, sector:"Auto",     marginNRML:80000},
  {name:"BANKBARODA",  lot:3750, sector:"Banking",  marginNRML:85000},
  {name:"CANBK",       lot:5400, sector:"Banking",  marginNRML:80000},
  {name:"PNB",         lot:8000, sector:"Banking",  marginNRML:75000},
  {name:"FEDERALBNK",  lot:5000, sector:"Banking",  marginNRML:75000},
  {name:"IDFCFIRSTB",  lot:7500, sector:"Banking",  marginNRML:75000},
  {name:"BANDHANBNK",  lot:2500, sector:"Banking",  marginNRML:80000},
  {name:"AUBANK",      lot:1000, sector:"Banking",  marginNRML:85000},
  {name:"ICICIPRULI",  lot:1500, sector:"Finance",  marginNRML:80000},
  {name:"ABCAPITAL",   lot:3800, sector:"Finance",  marginNRML:75000},
  {name:"LICHSGFIN",   lot:1250, sector:"Finance",  marginNRML:85000},
  {name:"MANAPPURAM",  lot:3000, sector:"Finance",  marginNRML:75000},
  {name:"LUPIN",       lot:650,  sector:"Pharma",   marginNRML:90000},
  {name:"TORNTPHARM",  lot:250,  sector:"Pharma",   marginNRML:105000},
  {name:"ALKEM",       lot:175,  sector:"Pharma",   marginNRML:115000},
  {name:"ABBOTINDIA",  lot:40,   sector:"Pharma",   marginNRML:175000},
  {name:"GLAXO",       lot:200,  sector:"Pharma",   marginNRML:110000},
  {name:"FORTIS",      lot:2500, sector:"Hospital", marginNRML:75000},
  {name:"MAXHEALTH",   lot:1200, sector:"Hospital", marginNRML:80000},
  {name:"METROPOLIS",  lot:400,  sector:"Hospital", marginNRML:85000},
  {name:"INDIGO",      lot:300,  sector:"Aviation", marginNRML:110000},
  {name:"SPICEJET",    lot:7500, sector:"Aviation", marginNRML:70000},
  {name:"INDHOTEL",    lot:1500, sector:"Hotels",   marginNRML:85000},
  {name:"LEMONTREE",   lot:5500, sector:"Hotels",   marginNRML:70000},
  {name:"ASTRAL",      lot:400,  sector:"Plumbing", marginNRML:95000},
  {name:"SUPREMEIND",  lot:400,  sector:"Plastic",  marginNRML:100000},
  {name:"DELTACORP",   lot:3750, sector:"Gaming",   marginNRML:70000},
  {name:"GMRAIRPORT",  lot:6250, sector:"Infra",    marginNRML:75000},
  {name:"NAUKRI",      lot:125,  sector:"Internet", marginNRML:145000},
  {name:"JUSTDIAL",    lot:500,  sector:"Internet", marginNRML:90000},
  {name:"MARICO",      lot:1200, sector:"FMCG",     marginNRML:85000},
  {name:"COLPAL",      lot:350,  sector:"FMCG",     marginNRML:105000},
  {name:"DABUR",       lot:1250, sector:"FMCG",     marginNRML:85000},
  {name:"EMAMILTD",    lot:1700, sector:"FMCG",     marginNRML:80000},
  {name:"GODREJCP",    lot:500,  sector:"FMCG",     marginNRML:95000},
  {name:"UBL",         lot:375,  sector:"FMCG",     marginNRML:100000},
  {name:"MCDOWELL-N",  lot:500,  sector:"FMCG",     marginNRML:90000},
  {name:"RADICO",      lot:475,  sector:"FMCG",     marginNRML:90000},
  {name:"PAGEIND",     lot:15,   sector:"Textile",  marginNRML:175000},
  {name:"VBL",         lot:500,  sector:"Beverages", marginNRML:95000},
  {name:"TATACOMM",    lot:525,  sector:"Telecom",  marginNRML:95000},
  {name:"IDEA",        lot:40000,sector:"Telecom",  marginNRML:70000},
  {name:"ROUTE",       lot:300,  sector:"Telecom",  marginNRML:95000},
  {name:"TATAELXSI",   lot:200,  sector:"IT",       marginNRML:150000},
  {name:"COFORGE",     lot:200,  sector:"IT",       marginNRML:140000},
  {name:"OFSS",        lot:100,  sector:"IT",       marginNRML:195000},
  {name:"KPITTECH",    lot:750,  sector:"IT",       marginNRML:100000},
  {name:"ZENSARTECH",  lot:1900, sector:"IT",       marginNRML:75000},
  {name:"NIITTECH",    lot:200,  sector:"IT",       marginNRML:135000},
  {name:"AFFLE",       lot:400,  sector:"Internet", marginNRML:95000},
  {name:"NAZARA",      lot:500,  sector:"Gaming",   marginNRML:90000},
  {name:"CAMS",        lot:350,  sector:"Finance",  marginNRML:110000},
  {name:"CDSL",        lot:475,  sector:"Finance",  marginNRML:100000},
  {name:"BSE",         lot:375,  sector:"Finance",  marginNRML:105000},
  {name:"MCX",         lot:250,  sector:"Finance",  marginNRML:120000},
  {name:"ANGELONE",    lot:500,  sector:"Finance",  marginNRML:100000},
  {name:"360ONE",      lot:625,  sector:"Finance",  marginNRML:95000},
  {name:"FINCABLES",   lot:800,  sector:"Consumer", marginNRML:90000},
  {name:"KEI",         lot:250,  sector:"Consumer", marginNRML:110000},
  {name:"KALYANKJIL",  lot:2250, sector:"Jewellery",marginNRML:80000},
  {name:"SENCO",       lot:1000, sector:"Jewellery",marginNRML:85000},
  {name:"PNBHOUSING",  lot:1000, sector:"Finance",  marginNRML:90000},
  {name:"HUDCO",       lot:5000, sector:"Finance",  marginNRML:75000},
  {name:"IREDA",       lot:4375, sector:"Finance",  marginNRML:75000},
  {name:"RVNL",        lot:4250, sector:"Infra",    marginNRML:75000},
  {name:"TIINDIA",     lot:300,  sector:"Auto",     marginNRML:105000},
  {name:"CRAFTSMAN",   lot:125,  sector:"Auto",     marginNRML:115000},
  {name:"ESCORTS",     lot:275,  sector:"Auto",     marginNRML:110000},
  {name:"MAHINDCIE",   lot:1625, sector:"Auto",     marginNRML:80000},
];

/* ── Symbol autocomplete ── */
let symDropdownOpen = false;

function initSymbolAutocomplete() {
  const inp = $("sym_input");
  const drop = $("sym_dropdown");
  if (!inp || !drop) return;

  inp.addEventListener("input", () => {
    const q = inp.value.toUpperCase().trim();
    if (!q) { drop.hidden = true; return; }
    const matches = SYMBOLS.filter(s => s.name.startsWith(q)).slice(0, 10);
    if (!matches.length) { drop.hidden = true; return; }
    drop.innerHTML = matches.map(s =>
      `<div class="sym-opt" data-name="${s.name}">
        <span class="sym-name">${s.name}</span>
        <span class="sym-meta">${s.sector}${s.lot ? ' · lot ' + (s.verified ? '' : '~') + s.lot : ''}</span>
      </div>`
    ).join("");
    drop.hidden = false;
    drop.querySelectorAll(".sym-opt").forEach(el => {
      el.addEventListener("mousedown", e => {
        e.preventDefault();
        selectSymbol(el.dataset.name);
      });
    });
  });

  inp.addEventListener("keydown", e => {
    if (e.key === "Escape") { drop.hidden = true; return; }
    if (e.key === "Enter" || e.key === "Tab") {
      const first = drop.querySelector(".sym-opt");
      if (first) { e.preventDefault(); selectSymbol(first.dataset.name); }
    }
    if (e.key === "ArrowDown") {
      const opts = drop.querySelectorAll(".sym-opt");
      if (opts.length) { opts[0].focus(); e.preventDefault(); }
    }
  });

  inp.addEventListener("blur", () => setTimeout(() => { drop.hidden = true; }, 150));
}

function selectSymbol(name) {
  const sym = SYMBOLS.find(s => s.name === name);
  const inp = $("sym_input");
  const drop = $("sym_dropdown");
  inp.value = name;
  drop.hidden = true;
  // Auto-switch: index symbols → suggest futures/options
  if (sym && sym.indexOnly && instrType === "equity") {
    setInstrType(typeof getLevel === "function" && getLevel() === "pro" ? "futures" : "options");
    rememberInstr();
  }
  if (instrType !== "equity") autoLot(sym);       // the moment you pick an option/future its lot size is filled in
  updateLotLabel();
  updateTypeOptions();
  calc();
}

function getSelectedSymbol() {
  const name = ($("sym_input") ? $("sym_input").value : "").toUpperCase().trim();
  return SYMBOLS.find(s => s.name === name) || null;
}

function updateLotLabel() {
  const sym = getSelectedSymbol();
  const el = $("lot_label");
  if (!el) return;
  if (sym && sym.lot && instrType !== "equity") {
    el.textContent = `1 lot ${sym.verified ? "=" : "≈"} ${getLotSize(sym).toLocaleString()}${sym.verified ? "" : " (approx.)"}`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

/* ── Leverage Selection ── */
function setLeverage(mode, customVal) {
  leverageMode = mode;
  const btn5 = $("lev_btn_5");
  const btn1 = $("lev_btn_1");
  const btnC = $("lev_btn_custom");
  const customWrap = $("custom_lev_wrap");
  const infoBadge = $("lev_info_badge");

  if (btn5) btn5.classList.toggle("active", mode === "5");
  if (btn1) btn1.classList.toggle("active", mode === "1");
  if (btnC) btnC.classList.toggle("active", mode === "custom");

  if (mode === "5") {
    leverageMultiplier = 5;
    if (customWrap) customWrap.style.display = "none";
    if (infoBadge) infoBadge.textContent = "5× Intraday MIS (20% margin)";
  } else if (mode === "1") {
    leverageMultiplier = 1;
    if (customWrap) customWrap.style.display = "none";
    if (infoBadge) infoBadge.textContent = "1× Cash Delivery (100% margin)";
  } else {
    if (customWrap) customWrap.style.display = "block";
    const inp = $("i_custom_lev");
    const val = customVal || (inp ? parseFloat(inp.value) : 5) || 5;
    leverageMultiplier = Math.max(1, val);
    const marginPct = (100 / leverageMultiplier).toFixed(1);
    if ($("custom_margin_pct")) $("custom_margin_pct").textContent = marginPct + "%";
    if (infoBadge) infoBadge.textContent = `${leverageMultiplier}× Leverage (${marginPct}% margin)`;
  }
  applyOrderType();
  calc();
}

// Single source of truth for orderType; keeps the MIS/NRML buttons in sync with it.
function applyOrderType() {
  orderType = instrType === "equity" ? (leverageMultiplier > 1 ? "MIS" : "NRML") : instrType === "futures" ? foOrderType : "NRML";
  const mis = $("mis_btn"), nrml = $("nrml_btn");
  if (mis)  mis.classList.toggle("active",  orderType === "MIS");
  if (nrml) nrml.classList.toggle("active", orderType === "NRML");
}

["5", "1", "custom"].forEach(m => {
  const btn = $("lev_btn_" + m);
  if (btn) btn.addEventListener("click", () => setLeverage(m));
});

const customLevInp = $("i_custom_lev");
if (customLevInp) {
  customLevInp.addEventListener("input", () => {
    const val = parseFloat(customLevInp.value) || 1;
    setLeverage("custom", val);
  });
}

/* ── Instrument type tabs ── */
function setInstrType(type) {
  const prev = instrType;
  instrType = type;
  // Show/hide type dropdown
  const typeRow = $("type_row");
  if (typeRow) typeRow.hidden = instrType !== "options";
  const symRow2 = $("sym_row2");
  if (symRow2) symRow2.hidden = instrType === "equity" || instrType === "crypto";
  const levField = $("lev_field");
  if (levField) levField.style.display = instrType === "equity" ? "" : "none";

  syncOptionsUI(prev);
  updateLotLabel();
  updateTypeOptions();
  applyOrderType();
  calc();
}

/* ── Options toggle + lot size (available at every level) ── */
function rememberedLot() {
  const v = parseInt(typeof getAppSettings === "function" ? getAppSettings().lotSize : 0, 10);
  return v >= 1 ? v : DEFAULT_LOT;
}
function autoLot(sym) {
  const el = $("i_lot");
  if (el) el.value = sym && sym.lot ? sym.lot : rememberedLot();
}
function syncOptionsUI(prev) {
  const t = $("optToggle"), ft = $("futToggle"), wrap = $("lot_wrap"), hint = $("lot_hint"), fo = $("fut_order");
  const lots = instrType === "options" || instrType === "futures";
  if (t)    t.checked  = instrType === "options";
  if (ft)   ft.checked = instrType === "futures";
  if (wrap) wrap.hidden = !lots;
  if (fo)   fo.hidden = instrType !== "futures";
  if (hint) hint.textContent = instrType === "futures" ? "Enter the futures price for Entry and SL." : "Enter option premiums for Entry and SL.";
  const ct = $("cryToggle");
  if (ct) ct.checked = instrType === "crypto";
  const ccy = instrType === "crypto" ? "USDT" : "₹";           // crypto prices are typed in USDT
  if ($("lbl_e")) $("lbl_e").textContent = "Entry Price (" + ccy + ")";
  if ($("lbl_s")) $("lbl_s").textContent = "Stop Loss (" + ccy + ")";
  if ($("cry_row"))  $("cry_row").hidden  = instrType !== "crypto";
  if ($("cry_hint")) $("cry_hint").hidden = instrType !== "crypto";
  if ((prev === "equity" || prev === "crypto") && (instrType === "options" || instrType === "futures")) autoLot(getSelectedSymbol());   // switching on picks the lot size
}

function updateTypeOptions() {
  const t0lbl = $("t0lbl");
  if (!t0lbl) return;
  if (instrType === "equity")  t0lbl.textContent = "Position (Shares)";
  else if (instrType === "options") t0lbl.textContent = "Position (Lots)";
  else t0lbl.textContent = "Position (Lots)";
}

/* ── MIS / NRML ── */
function setOrderType(type) {
  if (instrType === "equity") {
    setLeverage(type === "MIS" ? "5" : "1");
    return;
  }
  foOrderType = type;
  applyOrderType();
  calc();
}

/* ── Margin per lot/share ── */
function getMarginPerUnit(sym, entry) {
  if (instrType === "equity") {
    return entry / (leverageMultiplier || 1);
  }
  if (instrType === "options") {
    // Buyer pays premium × lot. No leverage.
    return entry * (sym ? sym.lot : 1);
  }
  // Futures
  if (!sym) {
    return entry * 75 * 0.15;
  }
  const nrml = sym.marginNRML || (entry * sym.lot * 0.15);
  return orderType === "MIS" ? nrml * 0.5 : nrml;
}

function getLotSize(sym) {
  if (instrType === "equity" || instrType === "crypto") return 1;
  const v = parseInt($("i_lot") ? $("i_lot").value : "", 10);
  return v >= 1 ? v : (sym && sym.lot ? sym.lot : DEFAULT_LOT);
}

/* ══════════════ INDIAN TRADING CHARGES ══════════════ */
// Statutory and exchange charges (NSE rates). F&O STT per Budget 2026, effective 1 Apr 2026. Brokerage and GST are editable in Settings.
// stt is charged on the sell side only, except delivery (both sides). Re-check these when SEBI/NSE revise.
const FEE_RATES = {
  eqDelivery: { stt: 0.001,   exch: 0.0000307, stamp: 0.00015 },
  eqIntraday: { stt: 0.00025, exch: 0.0000307, stamp: 0.00003 },
  futures:    { stt: 0.0005,  exch: 0.0000183, stamp: 0.00002 },
  options:    { stt: 0.0015,  exch: 0.0003553, stamp: 0.00003 },
  sebi: 0.000001,                     // ₹10 per crore
};

function feeSettings() {
  const s = typeof getAppSettings === "function" ? getAppSettings() : {};
  const brok = parseFloat(s.brokerage), gst = parseFloat(s.gstPct);
  return {
    brok:   isNaN(brok) || brok < 0 ? 20 : brok,
    gstPct: isNaN(gst)  || gst  < 0 ? 18 : gst,
  };
}

function feeSegment() {
  if (instrType === "futures") return "futures";
  if (instrType === "options") return "options";
  return orderType === "NRML" ? "eqDelivery" : "eqIntraday";
}

function calcFees(entry, exit, qty, lotSize, isLong) {
  const units    = qty * lotSize;
  const buyVal   = (isLong ? entry : exit)  * units;
  const sellVal  = (isLong ? exit  : entry) * units;
  const turnover = buyVal + sellVal;
  const seg = feeSegment(), r = FEE_RATES[seg];
  const { brok, gstPct } = feeSettings();

  let brokerage;
  if (seg === "eqDelivery")    brokerage = 0;
  else if (seg === "options")  brokerage = brok * 2;
  else brokerage = Math.min(brok, buyVal * 0.0003) + Math.min(brok, sellVal * 0.0003);

  const stt      = (seg === "eqDelivery" ? turnover : sellVal) * r.stt;
  const exchange = turnover * r.exch;
  const sebi     = turnover * FEE_RATES.sebi;
  const stamp    = buyVal * r.stamp;
  const gst      = (brokerage + exchange + sebi) * gstPct / 100;

  const total = brokerage + stt + exchange + sebi + stamp + gst;
  return { brokerage, stt, exchange, sebi, stamp, gst, total };
}

/* ── Daily limit checker ── */
function checkDailyLimits() {
  const today = todayStr();
  const todayTrades = (window.trades || []).filter(t => t.date === today);
  const todayClosed = todayTrades.filter(t => t.exit || (t.exits && t.exits.length));
  const todayLoss   = todayClosed.reduce((s, t) => s + (typeof pnlForTrade === "function" ? (pnlForTrade(t) || 0) : 0), 0);
  const settings = typeof getAppSettings === "function" ? getAppSettings() : {};
  const maxLoss   = parseFloat(settings.maxDailyLoss)  || 0;
  const maxTrades = parseInt(settings.maxDailyTrades)  || 0;
  return {
    lossExceeded:   maxLoss   > 0 && todayLoss < -maxLoss,
    tradesExceeded: maxTrades > 0 && todayTrades.length >= maxTrades,
    todayLoss, todayCount: todayTrades.length, maxLoss, maxTrades
  };
}

function renderDailyBanner() {
  const el = $("daily_banner");
  if (!el) return;
  const lim = checkDailyLimits();
  const msgs = [];
  if (lim.tradesExceeded) msgs.push(`⛔ Max trades reached (${lim.todayCount}/${lim.maxTrades})`);
  if (lim.lossExceeded)   msgs.push(`⛔ Daily loss limit hit (${fmtINR(lim.todayLoss)} / −${fmtINR(lim.maxLoss)})`);
  if (msgs.length) {
    el.className = "risk-banner danger"; el.innerHTML = msgs.join(" &nbsp;·&nbsp; "); el.hidden = false;
  } else if (lim.maxTrades > 0 || lim.maxLoss > 0) {
    const w = [];
    if (lim.maxTrades > 0) w.push(`${lim.todayCount}/${lim.maxTrades} trades`);
    if (lim.maxLoss   > 0) w.push(`${fmtINR(Math.abs(lim.todayLoss))} / ${fmtINR(lim.maxLoss)} loss`);
    el.className = "risk-banner warn"; el.innerHTML = "📊 Today: " + w.join(" &nbsp;·&nbsp; "); el.hidden = false;
  } else { el.hidden = true; }
}

/* ── Fee breakdown section ── */
function renderFeeBreakdown() {
  const fb = $("fee_breakdown_body");
  if (!fb) return;
  // Check settings toggle
  const showFees = typeof getAppSettings === "function" ? getAppSettings().showFees !== false : true;
  const feeSection = $("fee_section");
  if (feeSection) feeSection.hidden = !showFees;
  if (!showFees || !lastCalc) { fb.innerHTML = ""; return; }

  const { entry, sl, isLong, units, lotSize } = lastCalc;
  const slDist = Math.abs(entry - sl);
  const tp2    = isLong ? entry + slDist * 2 : entry - slDist * 2;

  if (lastCalc.instrument === "crypto") {
    const f = cryptoFeeCfg(), fx = lastCalc.fx;
    const entryFee = units * entry * f.taker / 100 * fx, exitFee = units * tp2 * f.taker / 100 * fx;
    const gst = (entryFee + exitFee) * f.gst / 100;
    fb.innerHTML = `
      <div class="fee-row"><span class="fee-lbl">Entry fee (taker ${f.taker}%)</span><span class="fee-val">${fmtINR(entryFee)}</span></div>
      <div class="fee-row"><span class="fee-lbl">Exit fee (taker ${f.taker}%)</span><span class="fee-val">${fmtINR(exitFee)}</span></div>
      <div class="fee-row"><span class="fee-lbl">GST (${f.gst}%)</span><span class="fee-val">${fmtINR(gst)}</span></div>
      <div class="fee-row total"><span class="fee-lbl">Total fees (1:2 trade)</span><span class="fee-val">${fmtINR(entryFee + exitFee + gst)}</span></div>
      <div class="fee-row"><span class="fee-lbl">Funding per 8h held (${f.funding}%, not included)</span><span class="fee-val">${fmtINR(units * entry * f.funding / 100 * fx)}</span></div>
      <div class="fee-row"><span class="fee-lbl">Estimated liquidation price</span><span class="fee-val">$${fmtUsd(lastCalc.liq)}</span></div>`;
    return;
  }
  const fees   = calcFees(entry, tp2, units, lotSize, isLong);

  const { brok, gstPct } = feeSettings();
  const seg = feeSegment();
  const label1 = seg === "eqDelivery" ? "Brokerage (₹0 delivery)"
               : seg === "options"    ? `Brokerage (₹${brok} × 2 orders)`
               :                        `Brokerage (≤₹${brok} × 2 orders)`;

  fb.innerHTML = `
    <div class="fee-row"><span class="fee-lbl">${label1}</span><span class="fee-val">${fmtINR(fees.brokerage)}</span></div>
    <div class="fee-row"><span class="fee-lbl">STT</span><span class="fee-val">${fmtINR(fees.stt)}</span></div>
    <div class="fee-row"><span class="fee-lbl">Exchange charges</span><span class="fee-val">${fmtINR(fees.exchange)}</span></div>
    <div class="fee-row"><span class="fee-lbl">SEBI fee</span><span class="fee-val">${fmtINR(fees.sebi)}</span></div>
    <div class="fee-row"><span class="fee-lbl">Stamp duty</span><span class="fee-val">${fmtINR(fees.stamp)}</span></div>
    <div class="fee-row"><span class="fee-lbl">GST (${gstPct}%)</span><span class="fee-val">${fmtINR(fees.gst)}</span></div>
    <div class="fee-row total"><span class="fee-lbl">Total fees (1:2 trade)</span><span class="fee-val">${fmtINR(fees.total)}</span></div>`;
}

function getInputs() {
  const flatOn  = $("flatRiskToggle").checked;
  const cap     = parseFloat($("i_cap").value)  || 100000;
  const rsk     = parseFloat($("i_rsk").value)  || 1;
  const flatAmt = parseFloat($("i_flat").value) || 0;
  const riskINR = flatOn && flatAmt > 0 ? flatAmt : cap * rsk / 100;
  return {
    entry:   parseFloat($("i_entry").value) || 0,
    sl:      parseFloat($("i_sl").value)    || 0,
    cap, rsk,
    rr:      parseFloat($("i_rr").value)    || 2,
    riskINR, flatOn,
  };
}

$("flatRiskToggle").addEventListener("change", () => {
  const on = $("flatRiskToggle").checked;
  $("i_rsk").style.display  = on ? "none" : "";
  $("i_flat").style.display = on ? ""     : "none";
  $("rsk_label").textContent = on ? "Risk (₹)" : "Risk %";
  calc();
});

/* Position sizing. Standard = equity / options / futures (whole shares or lots, ₹ prices).
   Crypto = fractional coins, USDT prices, risk and results in ₹ at the USD/INR rate. */
const RRS = [1, 1.5, 2, 3];
const feesOn = () => (typeof getAppSettings === "function" ? getAppSettings().showFees !== false : true);

function sizeStandard(c) {
  const { entry, isLong, slDist, riskINR, defRR, sym, lotSize } = c;
  const slPerUnit = slDist * lotSize;
  if (slPerUnit <= 0) return null;
  const units = Math.max(1, Math.floor(riskINR / slPerUnit));
  const marginPerUnit = getMarginPerUnit(sym, entry);
  const tradeVal = units * lotSize * entry;
  const totalMgn = instrType === "options" ? tradeVal
                 : instrType === "equity"  ? tradeVal / (leverageMultiplier || 1)
                 : marginPerUnit * units;
  const actualRisk = units * slPerUnit;
  const targets = RRS.map(rr => {
    const tp    = isLong ? entry + slDist * rr : entry - slDist * rr;
    const gross = slDist * rr * lotSize * units;
    const fees  = feesOn() ? calcFees(entry, tp, units, lotSize, isLong).total : 0;
    return { rr, tp, gross, net: gross - fees };
  });
  return { units, tradeVal, totalMgn, actualRisk, targets,
           profitTP: isLong ? entry + slDist * defRR : entry - slDist * defRR,
           profitGross: slDist * defRR * lotSize * units };
}

function sizeCrypto(c) {
  const { entry, sl, isLong, slDist, riskINR, defRR } = c;
  const fx = getFx(), lev = getCryptoLev(), f = cryptoFeeCfg();
  const units = Math.floor(riskINR / fx / slDist * 1e4) / 1e4;          // coins, rounded DOWN to 4 decimals
  if (!(units > 0)) return null;
  const tradeVal   = units * entry * fx;                                 // ₹ notional
  const totalMgn   = tradeVal / lev;                                    // isolated-margin estimate
  const actualRisk = units * slDist * fx;
  const feeINR = tp => units * (entry + tp) * (f.taker / 100) * (1 + f.gst / 100) * fx;   // entry + exit, taker both sides, plus GST
  const targets = RRS.map(rr => {
    const tp    = isLong ? entry + slDist * rr : entry - slDist * rr;
    const gross = slDist * rr * units * fx;
    return { rr, tp, gross, net: gross - (feesOn() ? feeINR(tp) : 0) };
  });
  const mm  = f.mmr / 100;
  const liq = isLong ? entry * (1 - 1 / lev + mm) : entry * (1 + 1 / lev - mm);   // estimate, ignores fees and funding
  return { units, tradeVal, totalMgn, actualRisk, targets,
           profitTP: isLong ? entry + slDist * defRR : entry - slDist * defRR,
           profitGross: slDist * defRR * units * fx,
           crypto: { fx, lev, liq, liqBeforeSL: isLong ? liq >= sl : liq <= sl } };
}

/* ── Main calc ── */
function calc() {
  const { entry, sl, cap, rsk, rr: defRR, riskINR, flatOn } = getInputs();
  if (!entry || !sl || entry === sl || entry <= 0 || sl <= 0) { showEmpty(); return; }
  const isLong  = sl < entry;
  const slDist  = Math.abs(entry - sl);
  const sym     = getSelectedSymbol();
  const lotSize = getLotSize(sym);
  const crypto  = instrType === "crypto";
  const cur     = crypto ? "$" : "₹";

  const slDistBadge = $("sl_dist_badge");
  if (slDistBadge) {
    slDistBadge.textContent = `· SL: ${cur}${crypto ? fmtUsd(slDist) : slDist.toFixed(2)} (${((slDist/entry)*100).toFixed(1)}%)`;
  }

  const M = crypto
    ? sizeCrypto({ entry, sl, isLong, slDist, riskINR, defRR })
    : sizeStandard({ entry, isLong, slDist, riskINR, defRR, sym, lotSize });
  if (!M) { showEmpty(); return; }
  const { units, tradeVal, totalMgn, actualRisk, targets, profitTP, profitGross } = M;
  const mgnPct        = (totalMgn / cap) * 100;
  const actualRiskPct = (actualRisk / cap) * 100;

  const typed     = $("sym_input") ? $("sym_input").value.trim().toUpperCase() : "";
  const symName   = sym ? sym.name : (typed || "Equity");
  const optShown  = instrType === "options" && $("type_row") && $("type_row").offsetParent !== null;

  lastCalc = {
    entry, sl, isLong, units, lotSize, actualRisk, targets, sym,
    symbolName: symName,
    market: deriveMarket(sym, instrType),
    symbol: sym ? sym.name : (typed || null),
    instrument: instrType,
    optType: optShown ? optType : null,
    isLots: instrType !== "equity" && !crypto && lotSize > 1,
    dec: 2,
    margin: totalMgn,
    tradeValue: tradeVal,
    leverage: crypto ? M.crypto.lev : (instrType === "equity" ? leverageMultiplier : orderType),
    targetPrice: profitTP,
    cur, unitName: crypto ? cryptoBase() : null,
    cryptoLev: crypto ? M.crypto.lev : null, fx: crypto ? M.crypto.fx : null, liq: crypto ? M.crypto.liq : null
  };

  $("r_empty").hidden   = true;
  $("r_content").hidden = false;
  $("tgt_empty").hidden = true;
  $("tgt_wrap").hidden  = false;

  const db = $("dir_badge");
  if (db) {
    db.className = "dir-badge " + (isLong ? "long" : "short");
    db.textContent = isLong ? "▲ LONG" : "▼ SHORT";
  }

  const warns = [];
  if (totalMgn > cap) {
    if (instrType === "equity") {
      const maxAffordable = Math.floor((cap * (leverageMultiplier || 1)) / entry);
      warns.push(`⚠ Margin required (${fmtINR(totalMgn)}) exceeds capital (${fmtINR(cap)}). Max affordable with ${leverageMultiplier}× leverage: <strong>${comma(maxAffordable)} shares</strong>.`);
    } else {
      warns.push(`⚠ Margin required (${fmtINR(totalMgn)}) exceeds your capital (${fmtINR(cap)}).`);
    }
  }
  if (actualRiskPct > 5) {
    warns.push(`⚠ Max risk is ${actualRiskPct.toFixed(1)}% of your capital.`);
  }
  if ((instrType === "options" || instrType === "futures") && sym && !sym.verified && lotSize === sym.lot) {
    warns.push(`⚠ The ${sym.name} lot size (${comma(sym.lot)}) is approximate. Check it with your broker, or type the right number in the lot box.`);
  }

  if (crypto && M.crypto.liqBeforeSL) warns.push(`⚠ Estimated liquidation ($${fmtUsd(M.crypto.liq)}) comes BEFORE your stop-loss ($${fmtUsd(sl)}). Lower the leverage or tighten the stop.`);

  const wb = $("r_warn");
  if (wb) {
    if (warns.length) {
      wb.innerHTML = warns.join("<br>");
      wb.hidden = false;
    } else {
      wb.hidden = true;
    }
  }

  const unitWord = instrType === "equity"
    ? (units === 1 ? "share" : "shares")
    : (units === 1 ? "lot" : "lots");

  if (crypto) {
    const base = cryptoBase();
    $("t0lbl").textContent = "Position (" + base + ")";
    $("t0val").textContent = fmtP(units, 4).replace(/\.?0+$/, "") + " " + base;
    $("t0sub").textContent = `Notional: $${fmtP(tradeVal / M.crypto.fx, 2)} · ${fmtINR(tradeVal)}`;
    $("t1val").textContent = fmtINR(totalMgn);
    $("t1sub").textContent = `${mgnPct.toFixed(1)}% of capital · ${M.crypto.lev}× · Liq $${fmtUsd(M.crypto.liq)}`;
  } else {
    // Tile 0: Position
    $("t0lbl").textContent = instrType === "equity" ? "Position (Shares)" : "Position (Lots)";
    $("t0val").textContent = comma(units) + " " + unitWord;
    $("t0sub").textContent = `Trade Value: ${fmtINR(tradeVal)}${lotSize > 1 ? ` · ${comma(units * lotSize)} units` : ""}`;

    // Tile 1: Margin Required
    $("t1val").textContent = fmtINR(totalMgn);
    $("t1sub").textContent = `${mgnPct.toFixed(1)}% of capital · ${instrType === "equity" ? leverageMultiplier + "× leverage" : orderType}${instrType === "futures" ? " · approx., brokers vary" : ""}`;
  }

  // Tile 2: Max Risk
  $("t2val").textContent = fmtINR(actualRisk);
  $("t2sub").textContent = `${actualRiskPct.toFixed(2)}% of capital${flatOn ? " · flat risk" : ""}`;

  // Tile 3: Profit
  $("t_profit_lbl").textContent = "Profit (1:" + defRR + ")";
  $("t_profit_val").textContent = "+₹" + fmtP(profitGross, 0);
  $("t_profit_sub").innerHTML = '<span class="tile-target"><i>🎯 Target</i><b>' + cur + (crypto ? fmtUsd(profitTP) : fmtP(profitTP, 2)) + '</b></span>';

  const showFees = typeof getAppSettings === "function" ? getAppSettings().showFees !== false : true;
  $("tgt_body").innerHTML = targets.map(t => `
    <div class="tgt-row">
      <div class="rr-pill">1:${t.rr}</div>
      <div class="tp-px">${cur}${crypto ? fmtUsd(t.tp) : fmtP(t.tp, 2)}</div>
      <div class="v-pos">₹${fmtP(t.gross, 0)}</div>
      ${showFees
        ? `<div class="v-dim ${t.net >= 0 ? "pos" : "neg"}">${t.net < 0 ? "−" : ""}₹${fmtP(Math.abs(t.net), 0)}</div>`
        : `<div class="v-dim" style="color:var(--fg3)">—</div>`}
    </div>`).join("");

  renderFeeBreakdown();
  renderDailyBanner();
}

function showEmpty() {
  $("r_empty").hidden   = false;
  $("r_content").hidden = true;
  $("tgt_wrap").hidden  = true;
  $("tgt_empty").hidden = false;
  const slDistBadge = $("sl_dist_badge");
  if (slDistBadge) slDistBadge.textContent = "";
  lastCalc = null;
}

/* ── Input listeners ── */
["i_entry","i_sl","i_cap","i_rsk","i_flat","i_rr","i_lot","i_lev","i_fx"]
  .forEach(id => { const el = $(id); if (el) el.addEventListener("input", calc); });

/* ── Options toggle and editable lot size ── */
const optToggleEl = $("optToggle");
if (optToggleEl) optToggleEl.addEventListener("change", () => {
  setInstrType(optToggleEl.checked ? "options" : "equity");
  rememberInstr();
});
/* ── Futures toggle (Pro) ── */
const futToggleEl = $("futToggle");
if (futToggleEl) futToggleEl.addEventListener("change", () => {
  setInstrType(futToggleEl.checked ? "futures" : "equity");
  rememberInstr();
});
function rememberInstr() {                          // options, futures and crypto are mutually exclusive; remember which one is on
  saveSetting("optionsOn", instrType === "options");
  saveSetting("futuresOn", instrType === "futures");
  saveSetting("cryptoOn",  instrType === "crypto");
}

/* ── Crypto toggle, leverage and USD/INR (remembered) ── */
const cryToggleEl = $("cryToggle");
if (cryToggleEl) cryToggleEl.addEventListener("change", () => {
  setInstrType(cryToggleEl.checked ? "crypto" : "equity");
  rememberInstr();
});
const levEl = $("i_lev"), fxEl = $("i_fx");
if (levEl) levEl.addEventListener("input", () => { const v = parseFloat(levEl.value); if (v >= 1) saveSetting("cryptoLev", Math.min(125, v)); });
if (fxEl)  fxEl.addEventListener("input",  () => { const v = parseFloat(fxEl.value);  if (v > 0)  saveSetting("usdInr", v); });
const lotEl = $("i_lot");
if (lotEl) lotEl.addEventListener("input", () => {
  const v = parseInt(lotEl.value, 10);
  if (v >= 1) saveSetting("lotSize", v);          // remembered for next time
  updateLotLabel();
});

/* ── CE / PE dropdown ── */
const optTypeEl = $("opt_type");
if (optTypeEl) optTypeEl.addEventListener("change", () => { optType = optTypeEl.value; calc(); });

/* ── MIS / NRML ── */
const misBtnEl  = $("mis_btn");
const nrmlBtnEl = $("nrml_btn");
if (misBtnEl)  misBtnEl.addEventListener("click",  () => setOrderType("MIS"));
if (nrmlBtnEl) nrmlBtnEl.addEventListener("click", () => setOrderType("NRML"));

/* ── Fee toggle ── */
const feeToggleBtn = $("fee_toggle_btn");
const feeBody      = $("fee_breakdown_body");
if (feeToggleBtn && feeBody) {
  feeToggleBtn.addEventListener("click", () => {
    feeBody.classList.toggle("open");
    const arrow = feeToggleBtn.querySelector(".fee-arrow");
    if (arrow) arrow.textContent = feeBody.classList.contains("open") ? "▲" : "▼";
  });
}

/* ── Init ── */
initSymbolAutocomplete();
setInstrType("equity");
setLeverage("5");

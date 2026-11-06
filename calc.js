"use strict";
/* ══════════════ CALCULATOR ══════════════ */

let instrType          = "equity"; // "options" | "futures" | "equity" (default simple equity)
let optType            = "CE";      // "CE" | "PE"
let orderType          = "MIS";     // "MIS" | "NRML"
let leverageMultiplier = 5;         // default 5x intraday
let leverageMode       = "5";       // "5" | "1" | "custom"
let showFOMode         = false;     // hidden by default for maximum simplicity
let lastCalc           = null;

const $ = id => document.getElementById(id);
const comma = n => Math.abs(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function fmtINR(n) {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e7) return s + "₹" + (a / 1e7).toFixed(2) + "Cr";
  if (a >= 1e5) return s + "₹" + (a / 1e5).toFixed(2) + "L";
  if (a >= 1000) return s + "₹" + comma(n);
  return s + "₹" + a.toFixed(2);
}
function fmtP(n, dec) { return Math.abs(n).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* ══════════════ SYMBOL DATABASE ══════════════ */
// lot = F&O lot size, marginNRML = approx SPAN+exposure per lot (₹), equityOnly = no F&O
const SYMBOLS = [
  // Index derivatives (F&O only)
  {name:"NIFTY",       lot:75,   sector:"Index",    marginNRML:130000, indexOnly:true},
  {name:"BANKNIFTY",   lot:35,   sector:"Index",    marginNRML:60000,  indexOnly:true},
  {name:"FINNIFTY",    lot:25,   sector:"Index",    marginNRML:38000,  indexOnly:true},
  {name:"MIDCPNIFTY",  lot:75,   sector:"Index",    marginNRML:55000,  indexOnly:true},
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
        <span class="sym-meta">${s.sector}${s.lot ? ' · lot ' + s.lot : ''}</span>
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
    setInstrType("futures");
  }
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
    el.textContent = `1 lot = ${sym.lot.toLocaleString()}`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

/* ── Mode Toggle (Simple Equity vs F&O) ── */
function toggleFOMode(forceState) {
  showFOMode = typeof forceState === "boolean" ? forceState : !showFOMode;
  const wrap = $("fo_tabs_wrap");
  const btn  = $("fo_toggle_btn");
  const badge = $("mode_badge");
  const levField = $("lev_field");
  const symRow2 = $("sym_row2");

  if (wrap) wrap.hidden = !showFOMode;
  if (symRow2) symRow2.hidden = !showFOMode && instrType === "equity";
  if (btn) btn.classList.toggle("active", showFOMode);

  if (showFOMode) {
    if (badge) badge.textContent = "⚡ F&O Mode";
  } else {
    // In simple mode, default to equity
    if (badge) badge.textContent = "🏢 Equity / Stocks";
    if (instrType !== "equity") setInstrType("equity");
  }
  if (levField) levField.style.display = instrType === "equity" ? "" : "none";
  calc();
}

const foBtn = $("fo_toggle_btn");
if (foBtn) foBtn.addEventListener("click", () => toggleFOMode());

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
    orderType = "MIS";
    if (customWrap) customWrap.style.display = "none";
    if (infoBadge) infoBadge.textContent = "5× Intraday MIS (20% margin)";
  } else if (mode === "1") {
    leverageMultiplier = 1;
    orderType = "NRML";
    if (customWrap) customWrap.style.display = "none";
    if (infoBadge) infoBadge.textContent = "1× Cash Delivery (100% margin)";
  } else {
    if (customWrap) customWrap.style.display = "block";
    const inp = $("i_custom_lev");
    const val = customVal || (inp ? parseFloat(inp.value) : 5) || 5;
    leverageMultiplier = Math.max(1, val);
    orderType = leverageMultiplier > 1 ? "MIS" : "NRML";
    const marginPct = (100 / leverageMultiplier).toFixed(1);
    if ($("custom_margin_pct")) $("custom_margin_pct").textContent = marginPct + "%";
    if (infoBadge) infoBadge.textContent = `${leverageMultiplier}× Leverage (${marginPct}% margin)`;
  }
  calc();
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
  instrType = type;
  ["options","futures","equity"].forEach(t => {
    const btn = $("instr_" + t);
    if (btn) btn.classList.toggle("active", t === type);
  });
  // Show/hide type dropdown
  const typeRow = $("type_row");
  if (typeRow) typeRow.hidden = instrType !== "options";
  const symRow2 = $("sym_row2");
  if (symRow2) symRow2.hidden = !showFOMode && instrType === "equity";
  const levField = $("lev_field");
  if (levField) levField.style.display = instrType === "equity" ? "" : "none";

  const badge = $("mode_badge");
  if (badge) {
    badge.textContent = instrType === "equity"
      ? (showFOMode ? "🏢 Equity" : "🏢 Equity / Stocks")
      : instrType === "options" ? `⚡ Options (${optType})` : "📈 Futures";
  }

  updateLotLabel();
  updateTypeOptions();
  updateMISNRML();
  calc();
}

function updateTypeOptions() {
  const t0lbl = $("t0lbl");
  if (!t0lbl) return;
  if (instrType === "equity")  t0lbl.textContent = "Position (Shares)";
  else if (instrType === "options") t0lbl.textContent = "Position (Lots)";
  else t0lbl.textContent = "Position (Lots)";
}

function updateMISNRML() {
  const misBtnEl = $("mis_btn");
  if (!misBtnEl) return;
}

/* ── MIS / NRML ── */
function setOrderType(type) {
  orderType = type;
  $("mis_btn").classList.toggle("active",  type === "MIS");
  $("nrml_btn").classList.toggle("active", type === "NRML");
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
  if (instrType === "equity") return 1;
  return sym ? sym.lot : 75;
}

/* ══════════════ ZERODHA FEE CALCULATOR ══════════════ */
function calcZerodhaFees(entry, exit, qty, lotSize, isLong) {
  const totalUnits = qty * lotSize;
  const buyPx  = isLong ? entry : exit;
  const sellPx = isLong ? exit  : entry;
  const buyVal  = buyPx  * totalUnits;
  const sellVal = sellPx * totalUnits;
  const totalVal = buyVal + sellVal;

  let brokerage, stt, exchange, sebi, stamp, gst;

  if (instrType === "equity" && orderType === "NRML") {
    // Delivery: Zerodha = 0 brokerage for delivery
    brokerage = 0;
    stt       = (buyVal + sellVal) * 0.001;   // 0.1% both sides
    exchange  = totalVal * 0.0000345;
    sebi      = totalVal * 0.000001;
    stamp     = buyVal   * 0.00015;           // 0.015% on buy
    gst       = (brokerage + exchange + sebi) * 0.18;
  } else if (instrType === "equity" && orderType === "MIS") {
    // Intraday equity
    brokerage = Math.min(20, buyVal * 0.0003) + Math.min(20, sellVal * 0.0003);
    stt       = sellVal * 0.00025;            // 0.025% sell
    exchange  = totalVal * 0.0000345;
    sebi      = totalVal * 0.000001;
    stamp     = buyVal   * 0.00003;           // 0.003% buy
    gst       = (brokerage + exchange + sebi) * 0.18;
  } else if (instrType === "futures") {
    brokerage = 20 * 2;                       // ₹20 × 2 orders
    stt       = sellVal * 0.0000125;          // 0.00125% sell
    exchange  = totalVal * 0.000019;          // NSE futures
    sebi      = totalVal * 0.000001;
    stamp     = buyVal   * 0.00002;           // 0.002% buy
    gst       = (brokerage + exchange + sebi) * 0.18;
  } else {
    // Options (buying)
    brokerage = 20 * 2;                       // ₹20 × 2 orders
    stt       = sellVal * 0.000625;           // 0.0625% on sell (premium)
    exchange  = totalVal * 0.00053;           // NSE options
    sebi      = totalVal * 0.000001;
    stamp     = buyVal   * 0.00003;           // 0.003% buy
    gst       = (brokerage + exchange + sebi) * 0.18;
  }

  const total = brokerage + stt + exchange + sebi + stamp + gst;
  return { brokerage, stt, exchange, sebi, stamp, gst, total };
}

/* ── Daily limit checker ── */
function checkDailyLimits() {
  const today = new Date().toISOString().slice(0, 10);
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
  const fees   = calcZerodhaFees(entry, tp2, units, lotSize, isLong);

  let label1 = "Brokerage (₹20×2)";
  if (instrType === "equity" && orderType === "NRML") label1 = "Brokerage (₹0 delivery)";

  fb.innerHTML = `
    <div class="fee-row"><span class="fee-lbl">${label1}</span><span class="fee-val">${fmtINR(fees.brokerage)}</span></div>
    <div class="fee-row"><span class="fee-lbl">STT</span><span class="fee-val">${fmtINR(fees.stt)}</span></div>
    <div class="fee-row"><span class="fee-lbl">Exchange charges</span><span class="fee-val">${fmtINR(fees.exchange)}</span></div>
    <div class="fee-row"><span class="fee-lbl">SEBI fee</span><span class="fee-val">${fmtINR(fees.sebi)}</span></div>
    <div class="fee-row"><span class="fee-lbl">Stamp duty</span><span class="fee-val">${fmtINR(fees.stamp)}</span></div>
    <div class="fee-row"><span class="fee-lbl">GST (18%)</span><span class="fee-val">${fmtINR(fees.gst)}</span></div>
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
  $("rsk_label").textContent = on ? "Flat Risk (₹)" : "Risk %";
  calc();
});

/* ── Main calc ── */
function calc() {
  const { entry, sl, cap, rsk, rr: defRR, riskINR, flatOn } = getInputs();
  if (!entry || !sl || entry === sl || entry <= 0 || sl <= 0) { showEmpty(); return; }
  const isLong  = sl < entry;
  const slDist  = Math.abs(entry - sl);
  const sym     = getSelectedSymbol();
  const lotSize = getLotSize(sym);

  const slDistBadge = $("sl_dist_badge");
  if (slDistBadge) {
    slDistBadge.textContent = `· SL: ₹${slDist.toFixed(2)} (${((slDist/entry)*100).toFixed(1)}%)`;
  }

  // Sizing: for equity = shares; for futures/options = lots
  const slPerUnit = slDist * lotSize;
  if (slPerUnit <= 0) { showEmpty(); return; }
  const units = Math.max(1, Math.floor(riskINR / slPerUnit));

  // Margin & Trade Value
  const marginPerUnit = getMarginPerUnit(sym, entry);
  const tradeVal      = instrType === "options"
    ? entry * lotSize * units
    : units * lotSize * entry;

  const totalMgn      = instrType === "options"
    ? tradeVal
    : instrType === "equity"
      ? tradeVal / (leverageMultiplier || 1)
      : marginPerUnit * units;

  const mgnPct        = (totalMgn / cap) * 100;
  const actualRisk    = units * slPerUnit;
  const actualRiskPct = (actualRisk / cap) * 100;

  const RRS = [1, 1.5, 2, 3];
  const targets = RRS.map(rr => {
    const tp    = isLong ? entry + slDist * rr : entry - slDist * rr;
    const gross = slDist * rr * lotSize * units;
    const showFees = typeof getAppSettings === "function" ? getAppSettings().showFees !== false : true;
    const fees = showFees ? calcZerodhaFees(entry, tp, units, lotSize, isLong).total : 0;
    return { rr, tp, gross, net: gross - fees };
  });

  const profitTP    = isLong ? entry + slDist * defRR : entry - slDist * defRR;
  const profitGross = slDist * defRR * lotSize * units;

  const symName   = sym ? sym.name : (($("sym_input") ? $("sym_input").value.trim().toUpperCase() : "") || "Equity");
  const marketStr = sym ? sym.name : (instrType === "equity" ? "NSE Equity" : instrType === "options" ? `Options (${optType})` : "Futures");

  lastCalc = {
    entry, sl, isLong, units, lotSize, actualRisk, targets, sym,
    symbolName: symName,
    market: marketStr,
    isLots: instrType !== "equity" && lotSize > 1,
    dec: 2,
    margin: totalMgn,
    tradeValue: tradeVal,
    leverage: instrType === "equity" ? leverageMultiplier : orderType,
    targetPrice: profitTP
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

  // Tile 0: Position
  $("t0lbl").textContent = instrType === "equity" ? "Position (Shares)" : "Position (Lots)";
  $("t0val").textContent = comma(units) + " " + unitWord;
  $("t0sub").textContent = `Trade Value: ${fmtINR(tradeVal)}${lotSize > 1 ? ` · ${comma(units * lotSize)} units` : ""}`;

  // Tile 1: Margin Required
  $("t1val").textContent = fmtINR(totalMgn);
  $("t1sub").textContent = `${mgnPct.toFixed(1)}% of capital · ${instrType === "equity" ? leverageMultiplier + "× leverage" : orderType}`;

  // Tile 2: Max Risk
  $("t2val").textContent = fmtINR(actualRisk);
  $("t2sub").textContent = `${actualRiskPct.toFixed(2)}% of capital${flatOn ? " · flat risk" : ""}`;

  // Tile 3: Profit
  $("t_profit_lbl").textContent = "Profit (1:" + defRR + ")";
  $("t_profit_val").textContent = "+₹" + fmtP(profitGross, 0);
  $("t_profit_sub").textContent = "@ ₹" + fmtP(profitTP, 2) + " Target";

  const showFees = typeof getAppSettings === "function" ? getAppSettings().showFees !== false : true;
  $("tgt_body").innerHTML = targets.map(t => `
    <div class="tgt-row">
      <div class="rr-pill">1:${t.rr}</div>
      <div class="tp-px">₹${fmtP(t.tp, 2)}</div>
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
["i_entry","i_sl","i_cap","i_rsk","i_flat","i_rr"]
  .forEach(id => { const el = $(id); if (el) el.addEventListener("input", calc); });

/* ── Instrument type tabs ── */
["options","futures","equity"].forEach(t => {
  const btn = $("instr_" + t);
  if (btn) btn.addEventListener("click", () => setInstrType(t));
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

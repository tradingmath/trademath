"use strict";
/* ══════════════ CALCULATOR ══════════════ */

const MKT = {
  equity: {cur:"₹",mult:1,    lev:5,  fix:null, fee:0.05,dec:2,lots:false,usd:false},
  nifty:  {cur:"₹",mult:25,   lev:null,fix:75000,fee:0.02,dec:2,lots:true, usd:false},
  bnf:    {cur:"₹",mult:15,   lev:null,fix:55000,fee:0.02,dec:2,lots:true, usd:false},
  gold:   {cur:"₹",mult:10,   lev:null,fix:16000,fee:0.02,dec:0,lots:true, usd:false},
  crude:  {cur:"₹",mult:100,  lev:null,fix:25000,fee:0.02,dec:0,lots:true, usd:false},
  btc:    {cur:"$",mult:0.001,lev:150, fix:null, fee:0.04,dec:0,lots:true, usd:true },
  custom: {cur:"₹",mult:1,    lev:5,   fix:null, fee:0.05,dec:2,lots:false,usd:false},
};

let activeMkt = "equity";
let lastCalc  = null;
// optionsMode: 'futures' | 'CE' | 'PE' — only for nifty/bnf
let optionsMode = "futures";

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

/* ── Indian fee calculator ── */
function calcIndianFees(market, entry, exit, qty, isLong, m) {
  const buyPx  = isLong ? entry : exit;
  const sellPx = isLong ? exit  : entry;
  const buyT   = buyPx  * qty * (m.mult || 1);
  const sellT  = sellPx * qty * (m.mult || 1);
  const totalT = buyT + sellT;
  let brokerage, stt, exchange, sebi, stamp, gst;

  if (market === 'equity') {
    brokerage = Math.min(20, totalT * 0.0003 / 2) * 2;
    stt       = sellT * 0.00025;
    exchange  = totalT * 0.0000325;
    sebi      = totalT * 0.000001;
    stamp     = buyT   * 0.00015;
  } else if (market === 'nifty' || market === 'bnf') {
    if (optionsMode !== 'futures') {
      // Options
      brokerage = 40;
      stt       = sellT * 0.0005;
      exchange  = totalT * 0.0005;
      sebi      = totalT * 0.000001;
      stamp     = buyT   * 0.00003;
    } else {
      // Futures
      brokerage = 40;
      stt       = sellT * 0.0002;
      exchange  = totalT * 0.00002;
      sebi      = totalT * 0.000001;
      stamp     = buyT   * 0.00002;
    }
  } else if (market === 'gold' || market === 'crude') {
    brokerage = 40;
    stt       = 0;
    exchange  = totalT * 0.00021;
    sebi      = totalT * 0.000001;
    stamp     = buyT   * 0.00002;
  } else {
    return null; // BTC / custom: use simple fee%
  }

  gst = (brokerage + exchange + sebi) * 0.18;
  const total = brokerage + stt + exchange + sebi + stamp + gst;
  return { brokerage, stt, exchange, sebi, stamp, gst, total };
}

/* ── Daily limit checker ── */
function checkDailyLimits() {
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = (window.trades || []).filter(t => t.date === today);
  const todayClosed = todayTrades.filter(t => t.exit || (t.exits && t.exits.length));
  const todayLoss   = todayClosed.reduce((s, t) => s + (pnlForTrade(t) || 0), 0);

  const settings = getAppSettings();
  const maxLoss   = parseFloat(settings.maxDailyLoss)  || 0;
  const maxTrades = parseInt(settings.maxDailyTrades)  || 0;

  const lossExceeded   = maxLoss   > 0 && todayLoss   < -maxLoss;
  const tradesExceeded = maxTrades > 0 && todayTrades.length >= maxTrades;

  return { lossExceeded, tradesExceeded, todayLoss, todayCount: todayTrades.length, maxLoss, maxTrades };
}

function renderDailyBanner() {
  const el = $("daily_banner");
  if (!el) return;
  const lim = checkDailyLimits();
  const msgs = [];
  if (lim.tradesExceeded) msgs.push(`⛔ Max trades reached (${lim.todayCount}/${lim.maxTrades})`);
  if (lim.lossExceeded)   msgs.push(`⛔ Daily loss limit hit (${fmtINR(lim.todayLoss)} / −${fmtINR(lim.maxLoss)})`);

  if (msgs.length) {
    el.className = "risk-banner danger";
    el.innerHTML = msgs.join(" &nbsp;·&nbsp; ");
    el.hidden = false;
  } else if (lim.maxTrades > 0 || lim.maxLoss > 0) {
    const warns = [];
    if (lim.maxTrades > 0) warns.push(`${lim.todayCount}/${lim.maxTrades} trades`);
    if (lim.maxLoss   > 0) warns.push(`${fmtINR(Math.abs(lim.todayLoss))} / ${fmtINR(lim.maxLoss)} loss`);
    el.className = "risk-banner warn";
    el.innerHTML = "📊 Today: " + warns.join(" &nbsp;·&nbsp; ");
    el.hidden = false;
  } else {
    el.hidden = true;
  }
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
    usd:     parseFloat($("i_usd").value)   || 84,
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
["i_flat", "i_rr"].forEach(id => $(id).addEventListener("input", calc));

function getMC() {
  if (activeMkt !== "custom") return { ...MKT[activeMkt] };
  return { ...MKT.custom,
    mult: parseFloat($("c_mult").value) || 1,
    lev:  parseFloat($("c_lev").value)  || 5,
    fee:  parseFloat($("c_fee").value)  || 0.05,
    lots: parseInt($("c_lots").value)   === 1,
  };
}

/* ── Options panel (Nifty / BankNifty) ── */
function updateOptionsPanel() {
  const panel = $("options_panel");
  if (!panel) return;
  const show = (activeMkt === "nifty" || activeMkt === "bnf");
  panel.hidden = !show;
  if (!show) { optionsMode = "futures"; return; }

  panel.querySelectorAll(".opt-mode-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === optionsMode);
  });

  const isOptions = optionsMode !== "futures";
  $("options_label_entry").textContent = isOptions ? "Premium Entry" : "Entry";
  $("options_label_sl").textContent    = isOptions ? "Premium SL"    : "Stop Loss";

  if (isOptions) {
    const { entry, sl } = getInputs();
    const m    = getMC();
    const lotSz = m.mult;
    const { riskINR } = getInputs();
    const premRisk = Math.abs(entry - sl) * lotSz;
    const qty = premRisk > 0 ? Math.max(1, Math.floor(riskINR / premRisk)) : 0;
    const maxLoss  = entry * lotSz * qty;
    const strikeEl = $("i_strike");
    const strike   = strikeEl ? (parseFloat(strikeEl.value) || 0) : 0;
    const breakeven = strike
      ? (optionsMode === "CE" ? strike + entry : strike - entry)
      : 0;

    let html = `
      <div class="opt-stat"><span class="opt-stat-lbl">Lots (based on risk)</span><span class="opt-stat-val">${qty}</span></div>
      <div class="opt-stat"><span class="opt-stat-lbl">Max Loss (premium gone)</span><span class="opt-stat-val" style="color:var(--red)">${fmtINR(maxLoss)}</span></div>`;
    if (breakeven) {
      html += `<div class="opt-stat"><span class="opt-stat-lbl">Breakeven</span><span class="opt-stat-val">${fmtP(breakeven, 0)}</span></div>`;
    }
    $("options_stats").innerHTML = html;
    $("options_stats").hidden = false;
    $("strike_row").hidden = false;
  } else {
    $("options_stats").hidden = true;
    $("strike_row").hidden    = true;
  }
}

/* ── Fee breakdown section ── */
function renderFeeBreakdown() {
  const fb = $("fee_breakdown_body");
  if (!fb) return;
  if (!lastCalc) { fb.innerHTML = ""; return; }
  const { entry, sl, isLong, units, m, market } = lastCalc;
  const RRS = [1, 1.5, 2, 3];
  // Show fee breakdown for 1:2 target
  const slDist = Math.abs(entry - sl);
  const rate   = m.usd ? (parseFloat($("i_usd").value) || 84) : 1;
  const tp2    = isLong ? entry + slDist * 2 : entry - slDist * 2;

  const fees = calcIndianFees(market, entry, tp2, units, isLong, m);
  if (!fees) {
    fb.innerHTML = `<div class="fee-row"><span class="fee-lbl">Fee breakdown not available for this market</span></div>`;
    return;
  }
  fb.innerHTML = `
    <div class="fee-row"><span class="fee-lbl">Brokerage (₹20×2)</span><span class="fee-val">${fmtINR(fees.brokerage)}</span></div>
    <div class="fee-row"><span class="fee-lbl">STT</span><span class="fee-val">${fmtINR(fees.stt)}</span></div>
    <div class="fee-row"><span class="fee-lbl">Exchange charges</span><span class="fee-val">${fmtINR(fees.exchange)}</span></div>
    <div class="fee-row"><span class="fee-lbl">SEBI fee</span><span class="fee-val">${fmtINR(fees.sebi)}</span></div>
    <div class="fee-row"><span class="fee-lbl">Stamp duty</span><span class="fee-val">${fmtINR(fees.stamp)}</span></div>
    <div class="fee-row"><span class="fee-lbl">GST (18%)</span><span class="fee-val">${fmtINR(fees.gst)}</span></div>
    <div class="fee-row total"><span class="fee-lbl">Total fees (1:2 trade)</span><span class="fee-val">${fmtINR(fees.total)}</span></div>`;
}

/* ── Main calc ── */
function calc() {
  const { entry, sl, cap, rsk, usd, rr: defRR, riskINR, flatOn } = getInputs();
  const m = getMC();
  if (!entry || !sl || entry === sl || entry <= 0 || sl <= 0) { showEmpty(); return; }
  const isLong  = sl < entry;
  const slDist  = Math.abs(entry - sl);
  const rate    = m.usd ? usd : 1;
  const slUnitINR = slDist * m.mult * rate;
  if (slUnitINR <= 0) { showEmpty(); return; }
  const units     = Math.max(1, Math.floor(riskINR / slUnitINR));
  const posValINR = entry * m.mult * rate;
  const marginPU  = m.fix !== null ? m.fix : posValINR / m.lev;
  const totalMgn  = units * marginPU;
  const mgnPct    = (totalMgn / cap) * 100;
  const actualRisk    = units * slUnitINR;
  const actualRiskPct = (actualRisk / cap) * 100;
  const RRS = [1, 1.5, 2, 3];
  const targets = RRS.map(rr => {
    const tp    = isLong ? entry + slDist * rr : entry - slDist * rr;
    const tpINR = tp * m.mult * rate;
    const gross = (slDist * rr * m.mult * rate) * units;
    // Use Indian fees if available, else simple fee%
    const indianFees = calcIndianFees(activeMkt, entry, tp, units, isLong, m);
    const fees = indianFees ? indianFees.total : (posValINR + tpINR) * (m.fee / 100) * units;
    return { rr, tp, gross, net: gross - fees };
  });
  const profitTP    = isLong ? entry + slDist * defRR : entry - slDist * defRR;
  const profitGross = (slDist * defRR * m.mult * rate) * units;

  lastCalc = { entry, sl, cap, rsk, isLong, units, actualRisk, targets, m, market: activeMkt };

  $("r_empty").hidden  = true;
  $("r_content").hidden = false;
  $("tgt_empty").hidden = true;
  $("tgt_wrap").hidden  = false;

  const db = $("dir_badge");
  db.className  = "dir-badge " + (isLong ? "long" : "short");
  db.textContent = isLong ? "▲ LONG" : "▼ SHORT";

  const warns = [];
  if (totalMgn > cap)      warns.push("⚠ Margin (" + fmtINR(totalMgn) + ") exceeds capital.");
  if (actualRiskPct > 5)   warns.push("⚠ Risk is " + actualRiskPct.toFixed(1) + "% of capital.");
  const wb = $("r_warn");
  if (warns.length) { wb.innerHTML = warns.join("<br>"); wb.hidden = false; } else { wb.hidden = true; }

  const uw  = m.lots ? (units === 1 ? "lot" : "lots") : (units === 1 ? "share" : "shares");
  const sym = m.usd ? "$" : "₹";
  $("t0lbl").textContent = m.lots ? "Position (Lots)" : "Position (Qty)";
  $("t0val").textContent = comma(units);
  $("t0sub").textContent = units + " " + uw + " · risk " + fmtINR(actualRisk);
  $("t2val").textContent = fmtINR(actualRisk);
  $("t2sub").textContent = actualRiskPct.toFixed(2) + "% of capital" + (flatOn ? " · flat risk" : "");
  $("t_profit_lbl").textContent = "Profit (1:" + defRR + ")";
  $("t_profit_val").textContent = sym + fmtP(profitGross, 0);
  $("t_profit_sub").textContent = "@ " + m.cur + fmtP(profitTP, m.dec);
  $("t1val").textContent = fmtINR(totalMgn);
  $("t1sub").textContent = mgnPct.toFixed(1) + "% of capital";

  $("tgt_body").innerHTML = targets.map(t => `
    <div class="tgt-row">
      <div class="rr-pill">1:${t.rr}</div>
      <div class="tp-px">${m.cur}${fmtP(t.tp, m.dec)}</div>
      <div class="v-pos">${sym}${fmtP(t.gross, 0)}</div>
      <div class="v-dim ${t.net >= 0 ? "pos" : "neg"}">${t.net < 0 ? "−" : ""}${sym}${fmtP(Math.abs(t.net), 0)}</div>
    </div>`).join("");

  updateOptionsPanel();
  renderFeeBreakdown();
  renderDailyBanner();
}

function showEmpty() {
  $("r_empty").hidden  = false;
  $("r_content").hidden = true;
  $("tgt_wrap").hidden  = true;
  $("tgt_empty").hidden = false;
  lastCalc = null;
}

/* ── Chip & input listeners ── */
document.querySelectorAll(".chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeMkt = btn.dataset.mkt;
    const m = MKT[activeMkt] || MKT.custom;
    $("usdrow").style.display   = m.usd          ? "" : "none";
    $("custombox").style.display = activeMkt === "custom" ? "" : "none";
    $("curr1").textContent = "(" + m.cur + ")";
    $("curr2").textContent = "(" + m.cur + ")";
    optionsMode = "futures";
    updateOptionsPanel();
    calc();
  });
});

["i_entry","i_sl","i_cap","i_rsk","i_usd","c_mult","c_lev","c_fee","c_lots","i_strike"]
  .forEach(id => { const el = $(id); if (el) el.addEventListener("input", () => { updateOptionsPanel(); calc(); }); });

/* Options mode buttons */
document.querySelectorAll(".opt-mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    optionsMode = btn.dataset.mode;
    updateOptionsPanel();
    calc();
  });
});

/* Fee toggle */
const feeToggleBtn = $("fee_toggle_btn");
const feeBody      = $("fee_breakdown_body");
if (feeToggleBtn && feeBody) {
  feeToggleBtn.addEventListener("click", () => {
    feeBody.classList.toggle("open");
    feeToggleBtn.querySelector(".fee-arrow").textContent = feeBody.classList.contains("open") ? "▲" : "▼";
  });
}

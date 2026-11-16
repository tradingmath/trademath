"use strict";
/* ══════════════ EARNINGS PROJECTION ══════════════
   Seeded, trade-by-trade simulation. A win streak longer than the chosen limit is never allowed,
   and each month's win rate wobbles around the target so some months turn red, like real trading.
   This is an illustration built from user inputs, not a forecast. */
(function () {
  const LS_KEY = "tm_proj";
  const DEFAULTS = { capital: 100000, win: 40, rr: 2, risk: 1000, riskmode: "abs", tpd: 3, days: 22, months: 6, cost: 0, vary: "5", maxw: "3", seed: 0 };
  const FIELDS = { capital: "p_capital", win: "p_win", rr: "p_rr", risk: "p_risk", riskmode: "p_riskmode", tpd: "p_tpd", days: "p_days", months: "p_months", cost: "p_cost", vary: "p_var", maxw: "p_maxw", seed: "p_seed" };
  // Calibrated from a real 2-year NIFTY SL-strangle backtest: 474 trading days, 291 winning days (61%),
  // average win ₹1,452, average loss ₹1,694 (payoff 0.857), ~19 trading days a month, longest win streak 12.
  const REAL = { capital: 100000, win: 61, rr: 0.86, risk: 1694, riskmode: "abs", tpd: 1, days: 20, months: 12, cost: 0, vary: "5", maxw: "inf" };

  const REAL_NOTE = "Loaded numbers from a real 2-year NIFTY SL-strangle backtest: 474 trading days, 61% winning days, average win ₹1,452, average loss ₹1,694. The streak limit is off because that backtest had a 12-win streak. A backtest is not a promise either.";
  let selMonth = 1, clampNotice = false, noteText = "", lastRes = null;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) { return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng()); }

  // K = most wins allowed in a row (Infinity = no limit). With a limit of K the win rate can never exceed K/(K+1).
  function maxWinRate(K) { return isFinite(K) ? Math.floor(K / (K + 1) * 100) : 95; }

  // Long-run win rate of the capped chain when each free trade wins with probability p.
  // States = current win streak 0..K; P(state j) ∝ p^j; a win is only possible from states 0..K-1.
  function effectiveRate(p, K) {
    if (!isFinite(K)) return p;
    let num = 0, den = 0, pw = 1;
    for (let j = 0; j <= K; j++) { den += pw; if (j < K) num += pw; pw *= p; }
    return p * num / den;
  }
  // Forcing a loss after K wins lowers the win rate, so solve for the per-trade probability
  // that makes the capped sequence land on the target rate.
  const adjCache = new Map();
  function adjustedP(target, K) {
    if (!isFinite(K)) return target;
    if (target >= K / (K + 1)) return 1;
    const key = K + "|" + Math.round(target * 10000);
    if (adjCache.has(key)) return adjCache.get(key);
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (effectiveRate(mid, K) < target) lo = mid; else hi = mid;
    }
    const p = (lo + hi) / 2;
    adjCache.set(key, p);
    return p;
  }

  function run(cfg, seed, keep) {
    const rng = mulberry32(seed), K = cfg.maxWins, wmax = maxWinRate(K);
    let p = adjustedP(cfg.win / 100, K);
    let cap = cfg.capital, ws = 0, ls = 0, maxW = 0, maxL = 0, peak = cap, maxDD = 0, maxDDp = 0;
    let wins = 0, losses = 0, blown = null, stop = false;
    const months = [], curve = keep ? [cap] : null;

    for (let m = 0; m < cfg.months && !stop; m++) {
      let tw = cfg.win;
      if (cfg.vary > 0) {                         // this month's "luck": win rate drifts around the target
        tw = Math.min(wmax - 1, Math.max(2, cfg.win + cfg.vary * gauss(rng)));
        p = adjustedP(tw / 100, K);
      }
      const mo = { n: m + 1, tw, startCap: cap, endCap: cap, pnl: 0, trades: 0, wins: 0, losses: 0, days: keep ? [] : null };
      for (let d = 0; d < cfg.days && !stop; d++) {
        const day = keep ? { n: d + 1, pnl: 0, t: [] } : null;
        for (let t = 0; t < cfg.tpd; t++) {
          if (cap <= 0) { blown = { month: m + 1, day: d + 1 }; stop = true; break; }
          const risk = cfg.riskmode === "pct" ? cap * cfg.risk / 100 : Math.min(cfg.risk, cap);
          const win = ws >= K ? false : rng() < p;
          ws = win ? ws + 1 : 0;
          ls = win ? 0 : ls + 1;
          if (ws > maxW) maxW = ws;
          if (ls > maxL) maxL = ls;
          const pnl = (win ? risk * cfg.rr : -risk) - cfg.cost;
          cap += pnl; mo.pnl += pnl; mo.trades++;
          if (win) { wins++; mo.wins++; } else { losses++; mo.losses++; }
          if (cap > peak) peak = cap;
          const dd = peak - cap, ddp = peak > 0 ? dd / peak * 100 : 0;
          if (ddp > maxDDp) { maxDDp = ddp; maxDD = dd; }
          if (keep) { day.t.push({ w: win, pnl, s: win ? ws : 0 }); day.pnl += pnl; curve.push(cap); }
        }
        if (keep && day.t.length) mo.days.push(day);
      }
      mo.endCap = cap;
      if (mo.trades) months.push(mo);
    }
    return { months, curve, wins, losses, trades: wins + losses, endCap: cap, pnl: cap - cfg.capital, maxW, maxL, maxDD, maxDDp, blown, K };
  }

  /* ── inputs ── */
  function num(id, def, lo, hi) {
    const el = $(id); let v = el ? parseFloat(el.value) : NaN;
    if (isNaN(v)) v = def;
    return Math.min(hi, Math.max(lo, v));
  }
  function readCfg() {
    const maxw = $("p_maxw").value;
    const K = maxw === "inf" ? Infinity : (parseInt(maxw, 10) || 3);
    const wmax = maxWinRate(K);
    const rawWin = parseFloat($("p_win").value);
    const cfg = {
      capital: num("p_capital", DEFAULTS.capital, 1, 1e10),
      win:     num("p_win", DEFAULTS.win, 1, wmax),
      rr:      num("p_rr", DEFAULTS.rr, 0.1, 20),
      risk:    num("p_risk", DEFAULTS.risk, 0.01, 1e9),
      riskmode: $("p_riskmode").value === "pct" ? "pct" : "abs",
      tpd:     Math.round(num("p_tpd", DEFAULTS.tpd, 1, 50)),
      days:    Math.round(num("p_days", DEFAULTS.days, 1, 31)),
      months:  Math.round(num("p_months", DEFAULTS.months, 1, 36)),
      cost:    num("p_cost", DEFAULTS.cost, 0, 1e9),
      seed:    Math.round(num("p_seed", 1, 1, 2147483646)),
      vary:    Math.max(0, parseFloat($("p_var").value) || 0),
      maxWins: K, wmax,
    };
    if (cfg.riskmode === "pct") cfg.risk = Math.min(cfg.risk, 100);
    cfg.winClamped = !isNaN(rawWin) && rawWin > wmax;
    return cfg;
  }
  function loadInputs() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) {}
    const v = Object.assign({}, DEFAULTS, s);
    if (!v.seed) v.seed = Math.floor(Math.random() * 900000) + 100000;
    Object.keys(FIELDS).forEach(k => { const el = $(FIELDS[k]); if (el) el.value = v[k]; });
  }
  function saveInputs() {
    const o = {};
    Object.keys(FIELDS).forEach(k => { const el = $(FIELDS[k]); if (el) o[k] = el.value; });
    tmSet(LS_KEY, o);
  }

  /* ── formatting ── */
  const money = n => fmtINR(n);
  const signed = n => (n >= 0 ? "+" : "−") + fmtINR(Math.abs(n)).replace("−", "");
  const cls = n => (n > 0 ? "pos" : n < 0 ? "neg" : "");
  const pct1 = n => n.toFixed(1) + "%";

  function tile(label, val, sub, c, hi) {
    return `<div class="tile${hi ? " hi" : ""}"><div class="tile-lbl">${label}</div><div class="tile-val ${c || ""}">${val}</div><div class="tile-sub">${sub || ""}</div></div>`;
  }

  /* ── render ── */
  function render() {
    const cfg = readCfg(), K = cfg.maxWins;
    const res = run(cfg, cfg.seed, true);
    lastRes = res;
    const risk0 = cfg.riskmode === "pct" ? cfg.capital * cfg.risk / 100 : Math.min(cfg.risk, cfg.capital);
    const p = cfg.win / 100;
    const expTrade = (p * cfg.rr - (1 - p)) * risk0 - cfg.cost;
    const tradesPerMonth = cfg.tpd * cfg.days;
    const breakEven = (risk0 + cfg.cost) / (risk0 * (cfg.rr + 1)) * 100;

    $("p_win").max = cfg.wmax;
    $("p_win_hint").textContent = "max " + cfg.wmax;
    $("proj_rule").innerHTML = (isFinite(K) ? `Never more than <strong>${K} wins in a row</strong>. ` : "No limit on win streaks. ") +
      (cfg.vary > 0 ? `Each month's luck varies around your win rate (±${cfg.vary} pts), so some months turn red. ` : "Every month uses the same win rate. ") +
      "Losing streaks are not capped, because real ones are not.";

    const msgs = [];
    if (noteText) msgs.push(["info", noteText]);
    if (cfg.winClamped || clampNotice) msgs.push(["warn", isFinite(K) ? `With a maximum of ${K} wins in a row, the highest possible win rate is ${cfg.wmax}%. Using ${cfg.wmax}%.` : `The win rate is limited to ${cfg.wmax}%.`]);
    if (expTrade <= 0) msgs.push(["bad", `At ${cfg.win}% wins and 1 : ${cfg.rr} reward, each trade loses ${money(Math.abs(expTrade))} on average. You need a win rate above ${pct1(breakEven)} just to break even, so this strategy loses money over time.`]);
    if (res.blown) msgs.push(["bad", `Account wiped out in month ${res.blown.month}, day ${res.blown.day}. The simulation stops there.`]);
    if (cfg.riskmode === "pct" && cfg.risk > 5 || cfg.riskmode === "abs" && cfg.risk > cfg.capital * 0.05) msgs.push(["warn", "Risking more than 5% of your balance per trade makes deep drawdowns and wipe-outs very likely."]);
    $("proj_msgs").innerHTML = msgs.map(m => `<div class="proj-msg ${m[0]}" role="${m[0] === "info" ? "note" : "alert"}">${m[1]}</div>`).join("");

    const mp = res.months.map(m => m.pnl);
    const avg = mp.length ? mp.reduce((a, b) => a + b, 0) / mp.length : 0;
    const best = mp.length ? Math.max.apply(null, mp) : 0, worst = mp.length ? Math.min.apply(null, mp) : 0;
    const bestM = mp.indexOf(best) + 1, worstM = mp.indexOf(worst) + 1;
    const redMonths = mp.filter(x => x < 0).length;
    const retPct = res.pnl / cfg.capital * 100;
    const eff = res.trades ? res.wins / res.trades * 100 : 0;
    $("proj_tiles").innerHTML =
      tile("Expected / month", signed(expTrade * tradesPerMonth), `${tradesPerMonth} trades × ${signed(expTrade)} avg${cfg.riskmode === "pct" ? " (month 1)" : ""}`, cls(expTrade), true) +
      tile("This run: avg / month", signed(avg), `${res.months.length - redMonths} green · ${redMonths} red month${redMonths === 1 ? "" : "s"}`, cls(avg)) +
      tile("Best month", signed(best), `Month ${bestM}`, cls(best)) +
      tile("Worst month", signed(worst), `Month ${worstM}`, cls(worst)) +
      tile("Ending balance", money(res.endCap), `${signed(res.pnl)} · ${retPct >= 0 ? "+" : "−"}${Math.abs(retPct).toFixed(1)}%`, cls(res.pnl)) +
      tile("Max drawdown", "−" + money(res.maxDD), `${pct1(res.maxDDp)} from peak`, "neg") +
      tile("Win rate (this run)", pct1(eff), `${res.wins} W · ${res.losses} L`) +
      tile("Longest streaks", `${res.maxW}W · ${res.maxL}L`, isFinite(K) ? `win streak limited to ${K}` : "no win-streak limit");

    const runs = res.trades > 20000 ? 60 : 200;
    const ends = [], redShare = [];
    for (let i = 1; i <= runs; i++) {
      const r = run(cfg, cfg.seed + i * 7919, false);
      ends.push(r.endCap);
      if (r.months.length) redShare.push(r.months.filter(m => m.pnl < 0).length / r.months.length);
    }
    ends.sort((a, b) => a - b);
    const q = f => ends[Math.min(ends.length - 1, Math.floor(f * ends.length))];
    const profitable = ends.filter(e => e > cfg.capital).length / ends.length * 100;
    const avgRed = redShare.length ? redShare.reduce((a, b) => a + b, 0) / redShare.length * 100 : 0;
    $("proj_range").innerHTML = `<strong>Same strategy, ${runs} different lucky/unlucky paths</strong>
      <span>Bad luck (10th pct) <b class="${cls(q(0.1) - cfg.capital)}">${money(q(0.1))}</b></span>
      <span>Middle <b class="${cls(q(0.5) - cfg.capital)}">${money(q(0.5))}</b></span>
      <span>Good luck (90th pct) <b class="${cls(q(0.9) - cfg.capital)}">${money(q(0.9))}</b></span>
      <span><b>${Math.round(profitable)}%</b> of paths ended in profit</span>
      <span>About <b>${Math.round(avgRed)}%</b> of months were red</span>`;

    $("proj_curve").innerHTML = curveSvg(res, cfg);
    if (selMonth > res.months.length) selMonth = res.months.length || 1;
    $("proj_cal").innerHTML = calendarHtml(res);
    $("proj_months").innerHTML = monthsTable(res);
    renderLog(res);
  }

  function curveSvg(res, cfg) {
    const pts = res.curve, n = pts.length;
    const W = 600, H = 150, PL = 8, PR = 8, PT = 12, PB = 16;
    const step = Math.max(1, Math.ceil(n / 400));
    const idx = []; for (let i = 0; i < n; i += step) idx.push(i); if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    let lo = cfg.capital, hi = cfg.capital;
    for (let i = 0; i < n; i++) { if (pts[i] < lo) lo = pts[i]; if (pts[i] > hi) hi = pts[i]; }
    const rg = (hi - lo) || 1;
    const x = i => PL + i / Math.max(1, n - 1) * (W - PL - PR);
    const y = v => PT + (H - PT - PB) * (1 - (v - lo) / rg);
    const line = idx.map((i, k) => (k ? "L" : "M") + x(i).toFixed(1) + "," + y(pts[i]).toFixed(1)).join(" ");
    const fill = line + ` L${x(n - 1).toFixed(1)},${(H - PB)} L${x(0).toFixed(1)},${(H - PB)} Z`;
    let ticks = "", cum = 0;
    res.months.forEach((m, k) => { if (k) ticks += `<line class="pl-tick" x1="${x(cum).toFixed(1)}" x2="${x(cum).toFixed(1)}" y1="${PT}" y2="${H - PB}"/>`; cum += m.trades; });
    const base = y(cfg.capital).toFixed(1);
    return `<svg class="pl-curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Projected account balance over ${res.months.length} months, from ${money(cfg.capital)} to ${money(res.endCap)}">
      ${ticks}<line class="pl-base" x1="${PL}" x2="${W - PR}" y1="${base}" y2="${base}"/>
      <path class="pl-fill" d="${fill}"/><path class="pl-line" d="${line}"/></svg>
      <div class="pl-axis"><span>Start ${money(cfg.capital)}</span><span>Low ${money(lo)} · High ${money(hi)}</span><span>End ${money(res.endCap)}</span></div>`;
  }

  /* One card per month: Sun–Sat grid, trading days fill Mon–Fri in order, coloured by that day's net result. */
  function calendarHtml(res) {
    const head = "SMTWTFS".split("").map(c => `<div class="pl-cal-h">${c}</div>`).join("");
    const cards = res.months.map(m => {
      const rows = Math.ceil(m.days.length / 5);
      let cells = "";
      for (let r = 0; r < rows; r++) for (let c = 0; c < 7; c++) {
        const i = r * 5 + (c - 1);
        if (c >= 1 && c <= 5 && i < m.days.length) {
          const d = m.days[i], w = d.t.filter(t => t.w).length;
          const k = d.pnl > 0 ? "up" : d.pnl < 0 ? "down" : "flat";
          cells += `<div class="pl-cal-d ${k}" title="Day ${d.n}: ${signed(d.pnl)} (${w}W ${d.t.length - w}L)"></div>`;
        } else cells += `<div class="pl-cal-d e"></div>`;
      }
      return `<div class="pl-cal-card${m.n === selMonth ? " sel" : ""}" data-m="${m.n}" role="button" tabindex="0" aria-pressed="${m.n === selMonth}" aria-label="Month ${m.n}, net ${signed(m.pnl)}">
        <div class="pl-cal-grid">${head}${cells}</div>
        <div class="pl-cal-name">Month ${m.n}</div><div class="pl-cal-net ${cls(m.pnl)}">${signed(m.pnl)}</div></div>`;
    }).join("");
    return `<div class="pl-cal-scroll">${cards}</div>
      <div class="pl-cal-legend"><span><i class="pl-cal-d up"></i> profit day</span><span><i class="pl-cal-d down"></i> loss day</span><span><i class="pl-cal-d flat"></i> flat day</span><span>tap a month to see its trades</span></div>`;
  }

  function monthsTable(res) {
    const maxAbs = Math.max.apply(null, res.months.map(m => Math.abs(m.pnl)).concat(1));
    const rows = res.months.map(m => {
      const w = Math.max(2, Math.abs(m.pnl) / maxAbs * 100), wr = m.trades ? m.wins / m.trades * 100 : 0;
      return `<tr data-m="${m.n}" class="${m.n === selMonth ? "sel" : ""}">
        <td><button type="button" class="pl-mbtn" data-m="${m.n}" aria-pressed="${m.n === selMonth}">M${m.n}</button></td>
        <td>${m.trades}</td><td><span class="pos">${m.wins}W</span> <span class="neg">${m.losses}L</span></td><td>${wr.toFixed(0)}%</td>
        <td class="pl-pnlcell"><span class="pl-bar ${m.pnl >= 0 ? "up" : "down"}" style="width:${w}%"></span><span class="pl-pnl ${cls(m.pnl)}">${signed(m.pnl)}</span></td>
        <td>${money(m.endCap)}</td></tr>`;
    }).join("");
    return `<table class="pl-table"><thead><tr><th>Month</th><th>Trades</th><th>Wins / Losses</th><th>Win %</th><th>Net P&amp;L</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderLog(res) {
    const m = res.months[selMonth - 1];
    if (!m) { $("proj_log").innerHTML = ""; $("proj_log_title").textContent = "Trade log"; return; }
    $("proj_log_title").innerHTML = `Trade log · Month ${m.n} <span class="proj-hint">${m.trades} trades · ${signed(m.pnl)} · every chip is one trade (hover for amount)</span>`;
    $("proj_log").innerHTML = m.days.map(d => {
      const chips = d.t.map((t, i) => `<span class="pl-chip ${t.w ? "w" : "l"}${isFinite(res.K) && t.s === res.K ? " cap" : ""}" title="Trade ${i + 1}: ${t.w ? "win" : "loss"} ${signed(t.pnl)}">${t.w ? "W" : "L"}</span>`).join("");
      const label = d.t.map(t => t.w ? "win" : "loss").join(", ");
      return `<div class="pl-day"><div class="pl-day-n">Day ${d.n}</div><div class="pl-chips" role="img" aria-label="Day ${d.n}: ${label}">${chips}</div><div class="pl-day-pnl ${cls(d.pnl)}">${signed(d.pnl)}</div></div>`;
    }).join("");
  }

  function selectMonth(n) {
    if (!lastRes) return;
    selMonth = n;
    document.querySelectorAll("#proj_months tr[data-m], #proj_cal .pl-cal-card").forEach(el => {
      const on = parseInt(el.dataset.m, 10) === selMonth;
      el.classList.toggle("sel", on);
      const b = el.matches("tr") ? el.querySelector(".pl-mbtn") : el;
      if (b) b.setAttribute("aria-pressed", on);
    });
    renderLog(lastRes);
  }

  /* ── events ── */
  let timer = null;
  function schedule() { noteText = ""; clearTimeout(timer); timer = setTimeout(() => { saveInputs(); render(); }, 150); }
  Object.keys(FIELDS).forEach(k => {
    const el = $(FIELDS[k]); if (!el) return;
    el.addEventListener("input", schedule);
    el.addEventListener("change", () => {
      if (k === "win") { const c = readCfg(); clampNotice = parseFloat(el.value) > c.wmax; el.value = c.win; }
      if (k === "maxw") { const c = readCfg(); $("p_win").value = Math.min(parseFloat($("p_win").value) || c.win, c.wmax); }
      schedule();
    });
  });
  $("p_reroll").addEventListener("click", () => {
    $("p_seed").value = Math.floor(Math.random() * 900000) + 100000;
    saveInputs(); render();
  });
  $("p_preset").addEventListener("click", () => {
    Object.keys(REAL).forEach(k => { const el = $(FIELDS[k]); if (el) el.value = REAL[k]; });
    selMonth = 1; noteText = REAL_NOTE; clampNotice = false;
    saveInputs(); render();
  });

  /* Fill the form from the user's own closed journal trades, then open the tab. */
  function fromJournal() {
    const closed = (window.trades || []).filter(t => t.date && isClosed(t) && pnlForTrade(t) != null)
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    if (closed.length < 10) { showToast("Close at least 10 trades first. You have " + closed.length + "."); return; }
    const pn = closed.map(pnlForTrade);
    const W = pn.filter(x => x > 0), L = pn.filter(x => x < 0);
    if (!W.length || !L.length) { showToast("Your trades need both wins and losses to project."); return; }
    const sum = a => a.reduce((s, x) => s + x, 0);
    const avgW = sum(W) / W.length, avgL = Math.abs(sum(L) / L.length);
    const dates = [...new Set(closed.map(t => t.date))];
    const spanDays = (new Date(dates[dates.length - 1]) - new Date(dates[0])) / 864e5 + 1;
    const perMonth = Math.min(31, Math.max(1, Math.round(dates.length / Math.max(spanDays / 30.4375, 1))));
    let run = 0, longest = 0;
    pn.forEach(x => { run = x > 0 ? run + 1 : 0; if (run > longest) longest = run; });
    const limit = [3, 4, 5, 6, 8, 12].find(k => k >= longest);
    const winRate = W.length / pn.length * 100;
    const cap = parseFloat($("i_cap").value);
    const v = {
      capital: cap > 0 ? cap : $("p_capital").value, win: Math.round(winRate * 10) / 10,
      rr: Math.round(avgW / avgL * 100) / 100, risk: Math.round(avgL), riskmode: "abs",
      tpd: Math.min(50, Math.max(1, Math.round(closed.length / dates.length))), days: perMonth,
      cost: 0, maxw: limit ? String(limit) : "inf",
    };
    Object.keys(v).forEach(k => { const el = $(FIELDS[k]); if (el) el.value = v[k]; });
    selMonth = 1; clampNotice = false;
    noteText = `Loaded from your journal: ${closed.length} closed trades over ${dates.length} trading days. ${pct1(winRate)} wins, average win ${money(avgW)}, average loss ${money(avgL)}, longest win streak ${longest}.` +
      (closed.length < 30 ? " That is a small sample, so treat it as a rough guide only." : " Past results do not guarantee future ones.");
    saveInputs();
    render();
  }
  $("p_from_journal").addEventListener("click", fromJournal);

  /* Projection is a view inside the Journal tab: the 🎯 button opens it, "Back" returns to the trade list. */
  function showJournalView(view) {
    const proj = view === "projection";
    $("jnl_main").hidden = proj;
    $("jnl_projection").hidden = !proj;
    if (proj) render();
    window.scrollTo(0, 0);
  }
  $("projBtn").addEventListener("click", () => switchTab("journal", "projection"));
  $("projBack").addEventListener("click", () => switchTab("journal"));
  window.showJournalView = showJournalView;
  const pick = e => { const t = e.target.closest("[data-m]"); if (t) selectMonth(parseInt(t.dataset.m, 10)); };
  $("proj_months").addEventListener("click", pick);
  $("proj_cal").addEventListener("click", pick);
  $("proj_cal").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(e); } });

  loadInputs();
  window.renderProjection = render;
  window.tmProjection = { run, adjustedP, effectiveRate, maxWinRate, readCfg, REAL };   // exposed for testing
})();

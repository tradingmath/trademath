"use strict";
/* ══════════════ EARNINGS PROJECTION ══════════════
   Seeded, trade-by-trade simulation. A 4th win in a row is never allowed.
   This is an illustration built from user inputs, not a forecast. */
(function () {
  const MAX_WIN_STREAK = 3;
  const MAX_WIN_RATE   = 75;            // with ≤3 wins in a row, 3 of every 4 trades is the ceiling
  const LS_KEY = "tm_proj";
  const DEFAULTS = { capital: 100000, win: 40, rr: 2, risk: 1000, riskmode: "abs", tpd: 3, days: 22, months: 6, cost: 0, seed: 0 };
  const FIELDS = { capital: "p_capital", win: "p_win", rr: "p_rr", risk: "p_risk", riskmode: "p_riskmode", tpd: "p_tpd", days: "p_days", months: "p_months", cost: "p_cost", seed: "p_seed" };

  let selMonth = 1;
  let clampNotice = false;               // user typed a win rate above the ceiling and it was snapped back

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Long-run win rate of the capped chain when each free trade wins with probability p.
  // States = current win streak 0..3; P(state k) ∝ p^k; wins are only possible from states 0..2.
  function effectiveRate(p) {
    const s = 1 + p + p * p;
    return p * s / (s + p * p * p);
  }
  // Per-trade probability that makes the capped chain hit the target win rate.
  function adjustedP(target) {
    if (target >= MAX_WIN_RATE / 100) return 1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (effectiveRate(mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function run(cfg, seed, keep) {
    const rng = mulberry32(seed), p = adjustedP(cfg.win / 100);
    let cap = cfg.capital, ws = 0, ls = 0, maxW = 0, maxL = 0, peak = cap, maxDD = 0, maxDDp = 0;
    let wins = 0, losses = 0, blown = null, stop = false;
    const months = [], curve = keep ? [cap] : null;

    for (let m = 0; m < cfg.months && !stop; m++) {
      const mo = { n: m + 1, startCap: cap, endCap: cap, pnl: 0, trades: 0, wins: 0, losses: 0, days: keep ? [] : null };
      for (let d = 0; d < cfg.days && !stop; d++) {
        const day = keep ? { n: d + 1, pnl: 0, t: [] } : null;
        for (let t = 0; t < cfg.tpd; t++) {
          if (cap <= 0) { blown = { month: m + 1, day: d + 1 }; stop = true; break; }
          const risk = cfg.riskmode === "pct" ? cap * cfg.risk / 100 : Math.min(cfg.risk, cap);
          const win = ws >= MAX_WIN_STREAK ? false : rng() < p;
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
    return { months, curve, wins, losses, trades: wins + losses, endCap: cap, pnl: cap - cfg.capital, maxW, maxL, maxDD, maxDDp, blown };
  }

  /* ── inputs ── */
  function num(id, def, lo, hi) {
    const el = $(id); let v = el ? parseFloat(el.value) : NaN;
    if (isNaN(v)) v = def;
    return Math.min(hi, Math.max(lo, v));
  }
  function readCfg() {
    const rawWin = parseFloat($("p_win").value);
    const cfg = {
      capital: num("p_capital", DEFAULTS.capital, 1, 1e10),
      win:     num("p_win", DEFAULTS.win, 1, MAX_WIN_RATE),
      rr:      num("p_rr", DEFAULTS.rr, 0.1, 20),
      risk:    num("p_risk", DEFAULTS.risk, 0.01, 1e9),
      riskmode: $("p_riskmode").value === "pct" ? "pct" : "abs",
      tpd:     Math.round(num("p_tpd", DEFAULTS.tpd, 1, 50)),
      days:    Math.round(num("p_days", DEFAULTS.days, 1, 31)),
      months:  Math.round(num("p_months", DEFAULTS.months, 1, 36)),
      cost:    num("p_cost", DEFAULTS.cost, 0, 1e9),
      seed:    Math.round(num("p_seed", 1, 1, 2147483646)),
    };
    if (cfg.riskmode === "pct") cfg.risk = Math.min(cfg.risk, 100);
    cfg.winClamped = !isNaN(rawWin) && rawWin > MAX_WIN_RATE;
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
    try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {}
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
    const cfg = readCfg();
    const res = run(cfg, cfg.seed, true);
    const risk0 = cfg.riskmode === "pct" ? cfg.capital * cfg.risk / 100 : Math.min(cfg.risk, cfg.capital);
    const p = cfg.win / 100;
    const expTrade = (p * cfg.rr - (1 - p)) * risk0 - cfg.cost;
    const tradesPerMonth = cfg.tpd * cfg.days;
    const breakEven = (risk0 + cfg.cost) / (risk0 * (cfg.rr + 1)) * 100;

    // messages
    const msgs = [];
    if (cfg.winClamped || clampNotice) msgs.push(["warn", `With a maximum of ${MAX_WIN_STREAK} wins in a row, the highest possible win rate is ${MAX_WIN_RATE}%. Using ${MAX_WIN_RATE}%.`]);
    if (expTrade <= 0) msgs.push(["bad", `At ${cfg.win}% wins and 1 : ${cfg.rr} reward, each trade loses ${money(Math.abs(expTrade))} on average. You need a win rate above ${pct1(breakEven)} just to break even, so this strategy loses money over time.`]);
    if (res.blown) msgs.push(["bad", `Account wiped out in month ${res.blown.month}, day ${res.blown.day}. The simulation stops there.`]);
    if (cfg.riskmode === "pct" && cfg.risk > 5 || cfg.riskmode === "abs" && cfg.risk > cfg.capital * 0.05) msgs.push(["warn", "Risking more than 5% of your balance per trade makes deep drawdowns and wipe-outs very likely."]);
    $("proj_msgs").innerHTML = msgs.map(m => `<div class="proj-msg ${m[0]}" role="alert">${m[1]}</div>`).join("");

    // tiles
    const mp = res.months.map(m => m.pnl);
    const avg = mp.length ? mp.reduce((a, b) => a + b, 0) / mp.length : 0;
    const best = mp.length ? Math.max.apply(null, mp) : 0, worst = mp.length ? Math.min.apply(null, mp) : 0;
    const bestM = mp.indexOf(best) + 1, worstM = mp.indexOf(worst) + 1;
    const retPct = res.pnl / cfg.capital * 100;
    const eff = res.trades ? res.wins / res.trades * 100 : 0;
    $("proj_tiles").innerHTML =
      tile("Expected / month", signed(expTrade * tradesPerMonth), `${tradesPerMonth} trades × ${signed(expTrade)} avg${cfg.riskmode === "pct" ? " (month 1)" : ""}`, cls(expTrade), true) +
      tile("This run: avg / month", signed(avg), `over ${res.months.length} month${res.months.length === 1 ? "" : "s"}`, cls(avg)) +
      tile("Best month", signed(best), `Month ${bestM}`, cls(best)) +
      tile("Worst month", signed(worst), `Month ${worstM}`, cls(worst)) +
      tile("Ending balance", money(res.endCap), `${signed(res.pnl)} · ${retPct >= 0 ? "+" : "−"}${Math.abs(retPct).toFixed(1)}%`, cls(res.pnl)) +
      tile("Max drawdown", "−" + money(res.maxDD), `${pct1(res.maxDDp)} from peak`, "neg") +
      tile("Win rate (this run)", pct1(eff), `${res.wins} W · ${res.losses} L`) +
      tile("Longest streaks", `${res.maxW}W · ${res.maxL}L`, `win streak capped at ${MAX_WIN_STREAK}`);

    // range of outcomes across other seeds
    const runs = res.trades > 20000 ? 60 : 200;
    const ends = [];
    for (let i = 1; i <= runs; i++) ends.push(run(cfg, cfg.seed + i * 7919, false).endCap);
    ends.sort((a, b) => a - b);
    const q = f => ends[Math.min(ends.length - 1, Math.floor(f * ends.length))];
    const profitable = ends.filter(e => e > cfg.capital).length / ends.length * 100;
    $("proj_range").innerHTML = `<strong>Same strategy, ${runs} different lucky/unlucky paths</strong>
      <span>Bad luck (10th pct) <b class="${cls(q(0.1) - cfg.capital)}">${money(q(0.1))}</b></span>
      <span>Middle <b class="${cls(q(0.5) - cfg.capital)}">${money(q(0.5))}</b></span>
      <span>Good luck (90th pct) <b class="${cls(q(0.9) - cfg.capital)}">${money(q(0.9))}</b></span>
      <span><b>${Math.round(profitable)}%</b> of paths ended in profit</span>`;

    $("proj_curve").innerHTML = curveSvg(res, cfg);
    $("proj_months").innerHTML = monthsTable(res);
    if (selMonth > res.months.length) selMonth = res.months.length || 1;
    renderLog(res);
    $("proj_months").__res = res;
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
      const chips = d.t.map((t, i) => `<span class="pl-chip ${t.w ? "w" : "l"}${t.s === MAX_WIN_STREAK ? " cap" : ""}" title="Trade ${i + 1}: ${t.w ? "win" : "loss"} ${signed(t.pnl)}${t.s === MAX_WIN_STREAK ? " (3rd win in a row, next trade must lose)" : ""}">${t.w ? "W" : "L"}</span>`).join("");
      const label = d.t.map(t => t.w ? "win" : "loss").join(", ");
      return `<div class="pl-day"><div class="pl-day-n">Day ${d.n}</div><div class="pl-chips" role="img" aria-label="Day ${d.n}: ${label}">${chips}</div><div class="pl-day-pnl ${cls(d.pnl)}">${signed(d.pnl)}</div></div>`;
    }).join("");
  }

  /* ── events ── */
  let timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(() => { saveInputs(); render(); }, 150); }
  Object.keys(FIELDS).forEach(k => {
    const el = $(FIELDS[k]); if (!el) return;
    el.addEventListener("input", schedule);
    el.addEventListener("change", () => {
      const c = readCfg();
      if (k === "win") { clampNotice = parseFloat(el.value) > MAX_WIN_RATE; el.value = c.win; }
      schedule();
    });
  });
  $("p_reroll").addEventListener("click", () => {
    $("p_seed").value = Math.floor(Math.random() * 900000) + 100000;
    saveInputs(); render();
  });
  $("proj_months").addEventListener("click", e => {
    const row = e.target.closest("[data-m]"); if (!row) return;
    selMonth = parseInt(row.dataset.m, 10);
    const res = $("proj_months").__res; if (!res) return;
    $("proj_months").querySelectorAll("tr[data-m]").forEach(r => {
      const on = parseInt(r.dataset.m, 10) === selMonth;
      r.classList.toggle("sel", on);
      r.querySelector(".pl-mbtn").setAttribute("aria-pressed", on);
    });
    renderLog(res);
  });

  loadInputs();
  window.renderProjection = render;
  window.tmProjection = { run, adjustedP, effectiveRate, readCfg };   // exposed for testing
})();

"use strict";
/* ══════════════ INTERVAL BEEP ══════════════
   Beeps on candle boundaries (e.g. 5m from 9:15 → 9:20, 9:25 …) so you check the chart as each candle closes.
   Beeps are pre-scheduled on the audio clock a couple of minutes ahead, so a throttled background tab still beeps on time. */
(function () {
  const LS_KEY = "tm_alert";
  const SESSION_START = 555, SESSION_END = 930;   // 9:15 and 15:30, in minutes of the day
  const LOOKAHEAD_MS = 125000;

  const cfg = { min: 5, anchor: 555, hours: false, vol: 60 };
  let running = false, ctx = null, nextAt = null, timer = null;
  const sched = new Map();                        // beep time (ms) → gain node, so it can be cancelled

  /* Next beep strictly after nowMs. anchor = minute of day the candles start from. */
  function nextBeepAfter(nowMs, N, anchor, hoursOnly) {
    const d0 = new Date(nowMs);
    const lo = hoursOnly ? SESSION_START : 0, hi = hoursOnly ? SESSION_END : 1439;
    const kLo = Math.ceil((lo - anchor) / N);
    for (let off = 0; off < 6; off++) {
      const day = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + off);
      if (hoursOnly && (day.getDay() === 0 || day.getDay() === 6)) continue;
      const nowMin = (nowMs - day.getTime()) / 60000;
      for (let k = Math.max(kLo, Math.floor((nowMin - anchor) / N)); ; k++) {
        const c = anchor + k * N;
        if (c > hi) break;
        const ts = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, c).getTime();
        if (ts > nowMs) return ts;
      }
    }
    return null;
  }

  function hhmmss(ms) {
    const d = new Date(ms), p = n => String(n).padStart(2, "0");
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }
  function countdown(ms) {
    const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  }
  const intervalName = n => n % 60 === 0 ? (n / 60) + "h" : n + "m";

  /* ── audio ── */
  function ensureCtx() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function beepGroup(when) {
    const g = ctx.createGain();
    g.gain.value = cfg.vol / 100 * 0.6;
    g.connect(ctx.destination);
    [[880, 0], [1175, 0.24]].forEach(([f, off]) => {
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      e.gain.setValueAtTime(0.0001, when + off);
      e.gain.exponentialRampToValueAtTime(1, when + off + 0.02);
      e.gain.exponentialRampToValueAtTime(0.0001, when + off + 0.2);
      o.connect(e); e.connect(g);
      o.start(when + off); o.stop(when + off + 0.22);
    });
    return g;
  }
  function scheduleAhead() {
    const now = Date.now();
    let t = nextAt;
    while (t && t - now < LOOKAHEAD_MS) {
      if (!sched.has(t)) sched.set(t, beepGroup(ctx.currentTime + Math.max(0, (t - now) / 1000)));
      t = nextBeepAfter(t, cfg.min, cfg.anchor, cfg.hours);
    }
  }
  function cancelAll() {
    sched.forEach(g => { try { g.disconnect(); } catch (e) {} });
    sched.clear();
  }

  /* ── state ── */
  function resync() {
    cancelAll();
    nextAt = nextBeepAfter(Date.now(), cfg.min, cfg.anchor, cfg.hours);
    if (running) scheduleAhead();
    paint();
  }
  function start() {
    if (!ensureCtx()) { $("alert_note").textContent = "This browser can't play sound."; return; }
    running = true;
    resync();
    clearInterval(timer);
    timer = setInterval(onTick, 1000);
  }
  function stop() {
    running = false;
    clearInterval(timer);
    cancelAll();
    nextAt = null;
    paint();
  }
  function flash() {
    const b = $("alert_btn"), base = document.title.replace(/^🔔 /, "");
    b.classList.add("flash");
    document.title = "🔔 " + base;
    setTimeout(() => { b.classList.remove("flash"); document.title = base; }, 3000);
  }
  function onTick() {
    if (!running) return;
    const now = Date.now();
    if (nextAt && now >= nextAt) {
      sched.delete(nextAt);                       // its sound was already queued on the audio clock
      flash();
      nextAt = nextBeepAfter(now, cfg.min, cfg.anchor, cfg.hours);
    }
    sched.forEach((g, t) => { if (t < now - 5000) sched.delete(t); });
    scheduleAhead();
    paint();
  }

  /* ── UI ── */
  function paint() {
    const btn = $("alert_btn"), label = $("alert_label"), note = $("alert_note"), go = $("alert_start");
    btn.classList.toggle("on", running);
    go.textContent = running ? "Stop" : "Start";
    go.classList.toggle("btn-primary", !running);
    go.classList.toggle("btn-danger", running);
    if (running && nextAt) {
      label.textContent = intervalName(cfg.min) + " · " + countdown(nextAt - Date.now());
      note.textContent = `Next beep ${hhmmss(nextAt)}. Keep this tab open; if the computer sleeps, beeps pause.`;
    } else if (running) {
      label.textContent = intervalName(cfg.min) + " · idle";
      note.textContent = "No more beeps in the selected window.";
    } else {
      label.textContent = "Beep";
      note.textContent = "Press Start (the browser needs one click to allow sound).";
    }
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function changed() { save(); if (running) resync(); else paint(); }

  function setMinutes(n, fromCustom) {
    cfg.min = n;
    document.querySelectorAll(".alert-chip").forEach(c => c.classList.toggle("active", !fromCustom && +c.dataset.min === n));
    if (!fromCustom) $("alert_custom").value = "";
    changed();
  }

  function init() {
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch (e) {}
    cfg.min = Math.min(720, Math.max(1, Math.round(+cfg.min) || 5));
    const chip = document.querySelector('.alert-chip[data-min="' + cfg.min + '"]');
    document.querySelectorAll(".alert-chip").forEach(c => c.classList.toggle("active", c === chip));
    if (!chip) $("alert_custom").value = cfg.min;
    $("alert_anchor").value = String(cfg.anchor);
    $("alert_hours").checked = !!cfg.hours;
    $("alert_vol").value = cfg.vol;

    document.querySelectorAll(".alert-chip").forEach(c => c.addEventListener("click", () => setMinutes(+c.dataset.min, false)));
    $("alert_custom").addEventListener("input", e => {
      const v = Math.round(parseFloat(e.target.value));
      if (v >= 1 && v <= 720) setMinutes(v, true);
    });
    $("alert_anchor").addEventListener("change", e => { cfg.anchor = +e.target.value; changed(); });
    $("alert_hours").addEventListener("change", e => { cfg.hours = e.target.checked; changed(); });
    $("alert_vol").addEventListener("input", e => { cfg.vol = +e.target.value; changed(); });
    $("alert_start").addEventListener("click", () => running ? stop() : start());
    $("alert_test").addEventListener("click", () => { if (ensureCtx()) beepGroup(ctx.currentTime + 0.02); });

    const btn = $("alert_btn"), pop = $("alert_pop");
    const setOpen = open => { pop.hidden = !open; btn.setAttribute("aria-expanded", open); };
    btn.addEventListener("click", e => { e.stopPropagation(); setOpen(pop.hidden); });
    document.addEventListener("click", e => { if (!pop.hidden && !$("alert_wrap").contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { setOpen(false); btn.focus(); } });
    paint();
  }

  init();
  window.tmNextBeep = nextBeepAfter;               // exposed for testing
})();

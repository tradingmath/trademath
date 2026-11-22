"use strict";
/* ══════════════ INTERVAL BEEP ══════════════
   Beeps on candle boundaries (e.g. 5m from 9:15 → 9:20, 9:25 …), optionally a few seconds BEFORE the close
   so you can look at the chart in time. Beeps are pre-scheduled on the audio clock a couple of minutes ahead,
   so a throttled background tab still beeps on time. Sounds are synthesised, so there are no audio files to load. */
(function () {
  const LS_KEY = "tm_alert";
  const SESSION_START = 555, SESSION_END = 930;   // 9:15 and 15:30, in minutes of the day
  const LOOKAHEAD_MS = 125000;

  const cfg = { min: 5, anchor: 555, hours: false, vol: 60, sound: "radar", lead: 0 };
  let running = false, ctx = null, nextAt = null, timer = null, played = 0;
  let keep = null, warned = false;               // keep = silent tone that stops the browser idling the audio device
  let noteMsg = "", noteUntil = 0;                // short-lived message shown in place of the normal note
  const sched = new Map();                        // beep time (ms) → gain node, so it can be cancelled

  /* ── sounds: each schedules its oscillators on `out` starting at audio time `t` ── */
  function tone(c, out, t, freq, dur, type, gain, attack) {
    const o = c.createOscillator(), e = c.createGain();
    o.type = type; o.frequency.value = freq;
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(gain || 1, t + (attack || 0.015));
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(out);
    o.onended = () => { played++; };              // counts tones the audio thread really rendered
    o.start(t); o.stop(t + dur + 0.02);
  }
  const SOUNDS = {
    radar:   { label: "Radar ping",  play: (c, o, t) => { tone(c, o, t, 1200, 1.0, "sine", 1, 0.004); tone(c, o, t, 2400, 0.4, "sine", 0.25, 0.004); } },
    bell:    { label: "Bell",        play: (c, o, t) => { [[784, 1, 1.4], [1568, 0.5, 0.9], [2164, 0.3, 0.6], [4234, 0.12, 0.3]].forEach(([f, g, d]) => tone(c, o, t, f, d, "sine", g, 0.005)); } },
    double:  { label: "Double beep", play: (c, o, t) => { tone(c, o, t, 1000, 0.13, "triangle"); tone(c, o, t + 0.2, 1000, 0.13, "triangle"); } },
    marimba: { label: "Marimba",     play: (c, o, t) => { tone(c, o, t, 523, 0.35, "triangle", 1, 0.004); tone(c, o, t + 0.18, 784, 0.45, "triangle", 1, 0.004); } },
    coin:    { label: "Coin",        play: (c, o, t) => { tone(c, o, t, 988, 0.07, "square", 0.35, 0.003); tone(c, o, t + 0.07, 1319, 0.35, "square", 0.35, 0.003); } },
    door:    { label: "Doorbell",    play: (c, o, t) => { tone(c, o, t, 784, 0.55, "sine", 1, 0.006); tone(c, o, t + 0.42, 622, 0.8, "sine", 1, 0.006); } },
    gong:    { label: "Soft gong",   play: (c, o, t) => { [[196, 1, 1.8], [392, 0.4, 1.2], [588, 0.2, 0.8]].forEach(([f, g, d]) => tone(c, o, t, f, d, "sine", g, 0.01)); } },
  };

  /* Next candle close strictly after nowMs. anchor = minute of day the candles start from.
     anchor -1 = crypto: candles start at UTC midnight, like Delta, Binance and TradingView. In India (UTC+5:30) a 1-hour crypto candle
     therefore closes at :30, not :00, and 4-hour candles close at 1:30, 5:30, 9:30 ... */
  function nextBeepAfter(nowMs, N, anchor, hoursOnly) {
    const utc = anchor === -1; if (utc) anchor = 0;
    const d0 = new Date(nowMs);
    const lo = hoursOnly ? SESSION_START : 0, hi = hoursOnly ? SESSION_END : 1439;
    const kLo = Math.ceil((lo - anchor) / N);
    for (let off = 0; off < 6; off++) {
      const day = utc ? new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() + off)) : new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + off);
      const dow = utc ? day.getUTCDay() : day.getDay();
      if (hoursOnly && (dow === 0 || dow === 6)) continue;
      const nowMin = (nowMs - day.getTime()) / 60000;
      for (let k = Math.max(kLo, Math.floor((nowMin - anchor) / N)); ; k++) {
        const c = anchor + k * N;
        if (c > hi) break;
        const ts = utc ? day.getTime() + c * 60000 : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, c).getTime();
        if (ts > nowMs) return ts;
      }
    }
    return null;
  }

  /* Next beep strictly after `afterMs`, leadSec seconds before a candle close.
     A beep whose close is still ahead but whose lead window has already passed is skipped. */
  function nextBeepLead(afterMs, N, anchor, hoursOnly, leadSec) {
    const L = Math.min(Math.max(0, leadSec), N * 60 - 1) * 1000;
    const close = nextBeepAfter(afterMs + L, N, anchor, hoursOnly);
    return close == null ? null : close - L;
  }
  const leadMs = () => Math.min(cfg.lead, cfg.min * 60 - 1) * 1000;
  const nextBeep = after => nextBeepLead(after, cfg.min, cfg.anchor, cfg.hours, cfg.lead);

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
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      ctx.addEventListener("statechange", () => {
        // The audio clock freezes while suspended, so anything queued meanwhile is wrong: queue it again once running.
        if (ctx.state === "running" && running) resync(); else paint();
      });
    }
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    return ctx;
  }
  // Resolves with the context once it is really running (or null / a non-running context if the browser refuses).
  function resumeCtx() {
    const c = ensureCtx();                        // runs synchronously, inside the user's click
    if (!c) return Promise.resolve(null);
    return (c.state === "running" ? Promise.resolve() : c.resume().catch(() => {})).then(() => c);
  }
  /* Browsers only allow sound after the page has been clicked or typed on. Do that unlock on the very first
     interaction anywhere, so later timer-driven beeps work until the page is reloaded. */
  function unlockOnFirstInteraction() {
    const evs = ["mousedown", "pointerup", "keydown", "touchend"];
    const unlock = () => {
      evs.forEach(ev => document.removeEventListener(ev, unlock, true));
      const c = ensureCtx();
      if (!c) return;
      try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch (e) {}
    };
    evs.forEach(ev => document.addEventListener(ev, unlock, true));
  }
  function flashNote(text, ms) { noteMsg = text; noteUntil = Date.now() + ms; paint(); }
  function soundBlocked() {
    const text = "🔇 The browser is blocking sound. Click Test sound once, then press Start again.";
    flashNote(text, 9000);
    if (typeof showToast === "function") showToast(text);
  }
  function beepGroup(when, over) {
    const c = over ? Object.assign({}, cfg, over) : cfg;     // `over` lets Settings preview a sound before it is saved
    const g = ctx.createGain();
    g.gain.value = c.vol / 100 * 0.6;
    g.connect(ctx.destination);
    (SOUNDS[c.sound] || SOUNDS.radar).play(ctx, g, when);
    return g;
  }
  function scheduleAhead() {
    if (!ctx || ctx.state !== "running") { if (ctx) ctx.resume().catch(() => {}); return; }
    const now = Date.now();
    let t = nextAt;
    while (t && t - now < LOOKAHEAD_MS) {
      if (!sched.has(t)) sched.set(t, beepGroup(ctx.currentTime + Math.max(0, (t - now) / 1000)));
      t = nextBeep(t);
    }
  }
  /* A browser can suspend audio on its own (computer slept, headphones switched, tab idle). Test works because a click
     resumes it; timer beeps cannot. So: keep a silent tone playing while running, resume on any click/key/tab focus, and
     say so loudly if sound is stuck, instead of failing silently. */
  function startKeepAlive() {
    if (keep || !ctx) return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 30; g.gain.value = 0.0002;
      o.connect(g); g.connect(ctx.destination); o.start();
      keep = o;
    } catch (e) {}
  }
  function stopKeepAlive() { try { if (keep) keep.stop(); } catch (e) {} keep = null; }
  function wake() { if (running && ctx && ctx.state !== "running") ctx.resume().catch(() => {}); }
  function warnStuck() {
    if (warned) return;
    warned = true;
    flashNote("🔇 Sound was paused by the browser, so beeps are silent. Click anywhere on the page to turn it back on.", 20000);
    if (typeof showToast === "function") showToast("🔇 Beep paused by the browser. Click anywhere to resume.");
  }
  function cancelAll() {
    sched.forEach(g => { try { g.disconnect(); } catch (e) {} });
    sched.clear();
  }

  /* ── state ── */
  function resync() {
    cancelAll();
    nextAt = nextBeep(Date.now());
    if (running) scheduleAhead();
    paint();
  }
  async function start() {
    const c = await resumeCtx();
    if (!c) { flashNote("This browser can't play sound.", 9000); return; }
    if (c.state !== "running") { soundBlocked(); return; }
    running = true;
    warned = false;
    startKeepAlive();
    resync();
    clearInterval(timer);
    timer = setInterval(onTick, 1000);
    beepGroup(c.currentTime + 1);                  // proof the speakers work, in the user's chosen sound and volume
    flashNote("🔊 Test beep in 1 second. If you don't hear it, check your speaker volume and that this tab isn't muted.", 7000);
  }
  function stop() {
    running = false;
    stopKeepAlive();
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
    if (ctx && ctx.state !== "running") { wake(); warnStuck(); } else warned = false;
    if (nextAt && now >= nextAt) {
      sched.delete(nextAt);                       // its sound was already queued on the audio clock
      flash();
      nextAt = nextBeep(now);
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
    const L = leadMs() / 1000;
    const leadNote = L ? ` (${L}s before the ${hhmmss(nextAt + L * 1000)} close)` : "";
    const clamped = cfg.lead > L ? ` Lead limited to ${L}s for a ${intervalName(cfg.min)} interval.` : "";
    if (running && nextAt) {
      label.textContent = intervalName(cfg.min) + " · " + countdown(nextAt - Date.now());
      note.textContent = `Next beep ${hhmmss(nextAt)}${leadNote}. Keep this tab open; if the computer sleeps, beeps pause.${clamped}`;
    } else if (running) {
      label.textContent = intervalName(cfg.min) + " · idle";
      note.textContent = "No more beeps in the selected window.";
    } else {
      label.textContent = "";
      note.textContent = "Press Start. You'll hear a test beep a second later to confirm your speakers work." + clamped;
    }
    if (Date.now() < noteUntil) note.textContent = noteMsg;
    else if (running && ctx && ctx.state !== "running") note.textContent = "🔇 Sound is paused by the browser. Click Test sound once to turn it back on.";
  }
  function save() { tmSet(LS_KEY, cfg); }
  function changed() { save(); if (running) resync(); else paint(); }
  async function preview(over) {
    const c = await resumeCtx();
    if (c && c.state === "running") beepGroup(c.currentTime + 0.02, over); else soundBlocked();
  }
  function sanitize(c) {
    return {
      min:    Math.min(720, Math.max(1, Math.round(+c.min) || 5)),
      anchor: +c.anchor === 0 ? 0 : +c.anchor === -1 ? -1 : 555,
      hours:  !!c.hours,
      vol:    Math.min(100, Math.max(5, Math.round(+c.vol) || 60)),
      sound:  SOUNDS[c.sound] ? c.sound : "radar",
      lead:   Math.max(0, Math.round(+c.lead) || 0),
    };
  }
  function paintChips() {                                   // the interval is chosen in the header menu only
    let preset = false;
    document.querySelectorAll("#alert_pop .alert-chip").forEach(c => { const on = +c.dataset.min === cfg.min; c.classList.toggle("active", on); if (on) preset = true; });
    const cu = $("alert_custom");
    if (cu && document.activeElement !== cu) cu.value = preset ? "" : cfg.min;
  }
  function setMinutes(n) { cfg.min = n; paintChips(); changed(); }

  function init() {
    unlockOnFirstInteraction();
    ["pointerdown", "keydown", "touchend"].forEach(ev => document.addEventListener(ev, wake, true));
    document.addEventListener("visibilitychange", () => { if (!document.hidden && running) { wake(); resync(); } });
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch (e) {}
    Object.assign(cfg, sanitize(cfg));
    paintChips();
    document.querySelectorAll("#alert_pop .alert-chip").forEach(c => c.addEventListener("click", () => setMinutes(+c.dataset.min)));
    const cu = $("alert_custom");
    cu.addEventListener("input", () => { const v = Math.round(parseFloat(cu.value)); if (v >= 1 && v <= 720) setMinutes(v); });
    cu.addEventListener("blur", paintChips);
    $("alert_start").addEventListener("click", () => running ? stop() : start());
    document.querySelectorAll("#alert_pop .alert-test").forEach(b => b.addEventListener("click", () => preview()));

    const btn = $("alert_btn"), pop = $("alert_pop");
    const setOpen = open => { pop.hidden = !open; btn.setAttribute("aria-expanded", open); };
    btn.addEventListener("click", () => setOpen(pop.hidden));
    document.addEventListener("click", e => { if (!pop.hidden && !$("alert_wrap").contains(e.target)) setOpen(false); });
    $("alert_more").addEventListener("click", () => {
      setOpen(false);
      switchTab("settings");
      $("beep_settings").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { setOpen(false); btn.focus(); } });
    paint();
  }

  init();
  window.tmNextBeep = nextBeepAfter;               // exposed for testing
  window.tmAlert = {
    nextBeepLead, SOUNDS, stop, isRunning: () => running, preview,
    stats: () => ({ state: ctx ? ctx.state : "none", played, running }),
    getConfig: () => Object.assign({}, cfg),
    setConfig: o => { Object.assign(cfg, sanitize(Object.assign({}, cfg, o))); paintChips(); changed(); },
  };
})();

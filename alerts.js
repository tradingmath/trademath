"use strict";
/* ══════════════ INTERVAL BEEP ══════════════
   Beeps on candle boundaries (e.g. 5m from 9:15 → 9:20, 9:25 …), optionally a few seconds BEFORE the close
   so you can look at the chart in time. Beeps are pre-scheduled on the audio clock a couple of minutes ahead,
   so a throttled background tab still beeps on time. Sounds are synthesised, so there are no audio files to load. */
(function () {
  const LS_KEY = "tm_alert";
  const SESSION_START = 555, SESSION_END = 930;   // 9:15 and 15:30, in minutes of the day
  const LOOKAHEAD_MS = 125000;

  const cfg = { min: 5, anchor: 555, hours: false, vol: 60, sound: "chime", lead: 0 };
  let running = false, ctx = null, nextAt = null, timer = null, played = 0;
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
    chime:  { label: "Chime",         play: (c, o, t) => { tone(c, o, t, 880, 0.2, "sine"); tone(c, o, t + 0.24, 1175, 0.2, "sine"); } },
    bell:   { label: "Bell",          play: (c, o, t) => { [[784, 1, 1.4], [1568, 0.5, 0.9], [2164, 0.3, 0.6], [4234, 0.12, 0.3]].forEach(([f, g, d]) => tone(c, o, t, f, d, "sine", g, 0.005)); } },
    double: { label: "Double beep",   play: (c, o, t) => { tone(c, o, t, 1000, 0.13, "triangle"); tone(c, o, t + 0.2, 1000, 0.13, "triangle"); } },
    ticks:  { label: "Triple tick",   play: (c, o, t) => { for (let i = 0; i < 3; i++) tone(c, o, t + i * 0.13, 1500, 0.06, "sine", 1, 0.003); } },
    alarm:  { label: "Digital alarm", play: (c, o, t) => { for (let i = 0; i < 4; i++) tone(c, o, t + i * 0.17, 1760, 0.1, "square", 0.5, 0.004); } },
    soft:   { label: "Soft pulse",    play: (c, o, t) => { tone(c, o, t, 440, 0.8, "sine", 1, 0.18); } },
  };

  /* Next candle close strictly after nowMs. anchor = minute of day the candles start from. */
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
  function beepGroup(when) {
    const g = ctx.createGain();
    g.gain.value = cfg.vol / 100 * 0.6;
    g.connect(ctx.destination);
    (SOUNDS[cfg.sound] || SOUNDS.chime).play(ctx, g, when);
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
    resync();
    clearInterval(timer);
    timer = setInterval(onTick, 1000);
    beepGroup(c.currentTime + 1);                  // proof the speakers work, in the user's chosen sound and volume
    flashNote("🔊 Test beep in 1 second. If you don't hear it, check your speaker volume and that this tab isn't muted.", 7000);
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
      label.textContent = "Beep";
      note.textContent = "Press Start. You'll hear a test beep a second later to confirm your speakers work." + clamped;
    }
    if (Date.now() < noteUntil) note.textContent = noteMsg;
    else if (running && ctx && ctx.state !== "running") note.textContent = "🔇 Sound is paused by the browser. Click Test sound once to turn it back on.";
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function changed() { save(); if (running) resync(); else paint(); }
  async function preview() {
    const c = await resumeCtx();
    if (c && c.state === "running") beepGroup(c.currentTime + 0.02); else soundBlocked();
  }

  function setMinutes(n, fromCustom) {
    cfg.min = n;
    document.querySelectorAll(".alert-chip").forEach(c => c.classList.toggle("active", !fromCustom && +c.dataset.min === n));
    if (!fromCustom) $("alert_custom").value = "";
    changed();
  }

  function init() {
    unlockOnFirstInteraction();
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch (e) {}
    cfg.min = Math.min(720, Math.max(1, Math.round(+cfg.min) || 5));
    if (!SOUNDS[cfg.sound]) cfg.sound = "chime";
    cfg.lead = Math.max(0, Math.round(+cfg.lead) || 0);
    const preset = !!document.querySelector('.alert-chip[data-min="' + cfg.min + '"]');
    document.querySelectorAll(".alert-chip").forEach(c => c.classList.toggle("active", +c.dataset.min === cfg.min));
    if (!preset) $("alert_custom").value = cfg.min;
    $("alert_anchor").value = String(cfg.anchor);
    $("alert_hours").checked = !!cfg.hours;
    $("alert_vol").value = cfg.vol;
    $("alert_sound").value = cfg.sound;
    $("alert_lead").value = String(cfg.lead);

    document.querySelectorAll(".alert-chip").forEach(c => c.addEventListener("click", () => setMinutes(+c.dataset.min, false)));
    $("alert_custom").addEventListener("input", e => {
      const v = Math.round(parseFloat(e.target.value));
      if (v >= 1 && v <= 720) setMinutes(v, true);
    });
    $("alert_anchor").addEventListener("change", e => { cfg.anchor = +e.target.value; changed(); });
    $("alert_hours").addEventListener("change", e => { cfg.hours = e.target.checked; changed(); });
    $("alert_vol").addEventListener("input", e => { cfg.vol = +e.target.value; changed(); });
    $("alert_sound").addEventListener("change", e => { cfg.sound = e.target.value; changed(); preview(); });
    $("alert_lead").addEventListener("change", e => { cfg.lead = +e.target.value; changed(); });
    $("alert_start").addEventListener("click", () => running ? stop() : start());
    document.querySelectorAll(".alert-test").forEach(b => b.addEventListener("click", preview));

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
  window.tmAlert = { nextBeepLead, SOUNDS, stats: () => ({ state: ctx ? ctx.state : "none", played, running }), stop, isRunning: () => running };
})();

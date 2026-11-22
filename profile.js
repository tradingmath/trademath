"use strict";
/* ══════════════ PROFILE, WELCOME SETUP, TOUR AND DEMO ══════════════
   - The round account button and its menu.
   - The Profile page: trading capital, risk, reward, daily limits, level. Every change saves by itself.
   - The welcome setup shown once after a first sign-in. Every question is optional: Skip keeps the defaults.
   - A guided tour (Skip at any step) and sample "demo" trades that are clearly marked and never saved to the cloud. */
(function () {
  const $ = id => document.getElementById(id);
  const S = () => getAppSettings();
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  /* Defaults the owner chose; they are what Skip leaves in place. */
  const DEF = { cap: 100000, risk: 1, rr: 2, lev: "5", market: "NSE Equity" };
  const cur = () => { const s = S(); return {
    cap: s.defaultCap || DEF.cap, risk: s.defaultRisk || DEF.risk, rr: s.defaultRR || DEF.rr, lev: s.defaultLev || DEF.lev,
    market: s.defaultMarket || DEF.market, maxLoss: s.maxDailyLoss || "", maxTrades: s.maxDailyTrades || "", name: s.displayName || "" }; };

  /* ───────── account menu ───────── */
  function setMenu(open) { $("acctMenu").hidden = !open; $("avatarBtn").setAttribute("aria-expanded", String(open)); }
  $("avatarBtn").addEventListener("click", e => { e.stopPropagation(); setMenu($("acctMenu").hidden); });
  document.addEventListener("click", e => { if (!$("acctMenu").hidden && !$("acct_wrap").contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("acctMenu").hidden) { setMenu(false); $("avatarBtn").focus(); } });
  document.addEventListener("click", e => {
    const go = e.target.closest("[data-go]");
    if (go) { setMenu(false); switchTab(go.dataset.go); window.scrollTo(0, 0); }
  });
  $("am_tour").addEventListener("click", () => { setMenu(false); startTour(); });
  $("am_signout").addEventListener("click", () => { setMenu(false); $("ac_signout").click(); });

  /* ───────── profile page ───────── */
  const ID = { cap: "s_default_cap", risk: "s_default_risk", lev: "s_default_lev", rr: "s_default_rr", mkt: "s_default_market", ml: "s_max_loss", mt: "s_max_trades" };
  let savedTimer = null;
  const saved = msg => { const el = $("pf_saved"); el.textContent = msg || "✓ Saved"; el.classList.add("show"); clearTimeout(savedTimer); savedTimer = setTimeout(() => el.classList.remove("show"), 1800); };

  function fillProfile() {
    const c = cur();
    $(ID.cap).value = c.cap; $(ID.risk).value = c.risk; $(ID.rr).value = c.rr; $(ID.lev).value = c.lev;
    $(ID.mkt).value = c.market; $(ID.ml).value = c.maxLoss; $(ID.mt).value = c.maxTrades;
    $("pf_name").value = c.name; $("pf_level").value = getLevel();
    paintHeader();
  }
  function paintHeader() {
    const acc = window.tmAccount, signedIn = acc && acc.isSignedIn(), name = (S().displayName || "").trim();
    $("pf_avatar").textContent = (name || (signedIn ? acc.email() : "") || "?").charAt(0).toUpperCase();
    $("pf_title").textContent = name || (signedIn ? acc.email().split("@")[0] : "Your profile");
    $("pf_sub").textContent = signedIn ? acc.email() + " · cloud sync available" : "Not signed in. Your settings are saved on this device.";
    $("pf_signin").hidden = !!signedIn || !acc;
  }
  window.tmProfileShow = fillProfile;

  /* validate, save, apply to the calculator straight away */
  function bindProfile() {
    const field = (id, parse, key, apply) => $(id).addEventListener("change", () => {
      const v = parse($(id).value);
      if (v === null) { fillProfile(); saved("That value is not valid, so it was not changed."); return; }
      saveSetting(key, v); if (apply) apply(v); saved(); calc(); renderDailyBanner();
    });
    const pos = (min, max) => s => { const n = parseFloat(s); return n >= min && n <= max ? n : null; };
    const optInt = s => { s = String(s).trim(); if (s === "") return ""; const n = parseFloat(s); return n >= 0 ? n : null; };
    field(ID.cap,  pos(1, 1e10),  "defaultCap",  v => { $("i_cap").value = v; if (window.cmSave) cmSave(); });
    field(ID.risk, pos(0.01, 100), "defaultRisk", v => { $("i_rsk").value = v; if (window.cmSave) cmSave(); });
    field(ID.rr,   pos(0.1, 50),   "defaultRR",   v => { $("i_rr").value = v; if (window.cmSave) cmSave(); });
    field(ID.lev,  v => v,         "defaultLev",  v => setLeverage(v));
    field(ID.mkt,  v => v,         "defaultMarket");
    field(ID.ml,   optInt,         "maxDailyLoss");
    field(ID.mt,   optInt,         "maxDailyTrades");
    $("pf_name").addEventListener("change", () => { saveSetting("displayName", $("pf_name").value.trim().slice(0, 40)); saved(); paintHeader(); if (window.tmAccount) tmAccount.refresh(); });
    $("pf_level").addEventListener("change", () => { setLevel($("pf_level").value); saved(); });
  }
  bindProfile();
  document.addEventListener("tm:account", paintHeader);
  $("pf_tour").addEventListener("click", () => startTour());
  $("pf_demo").addEventListener("click", () => loadDemo());
  $("pf_welcome").addEventListener("click", () => openWelcome(true));

  /* ───────── welcome setup (every question optional) ───────── */
  let onb = null, onbOpen = false;
  const STEPS = 5;
  function openWelcome(force) {
    if (onbOpen) return;
    if (!force && S().onboarded) return;
    const nudge = $("tourNudge"); if (nudge) nudge.remove();
    const c = cur();
    onb = { step: 0, stocks: true, fno: false, crypto: false, cap: c.cap, risk: c.risk, rr: c.rr, level: getLevel(), style: c.lev === "1" ? "swing" : "intraday", maxLoss: c.maxLoss, maxTrades: c.maxTrades, look: curLook(), look0: curLook() };
    const m = document.createElement("div");
    m.className = "modal-overlay"; m.id = "onbModal";
    m.innerHTML = '<div class="modal onb-modal" role="dialog" aria-modal="true" aria-labelledby="onb_title"><button type="button" class="onb-skip" id="onb_skip">Skip for now</button><div class="onb-dots" id="onb_dots" aria-hidden="true"></div><div id="onb_body"></div><div class="onb-actions"><button type="button" class="btn btn-ghost" id="onb_back">Back</button><button type="button" class="btn btn-primary" id="onb_next">Next</button></div><p class="onb-fine">Everything here is optional and can be changed any time in Profile. Skipping keeps the standard defaults.</p></div>';
    document.body.appendChild(m); onbOpen = true;
    $("onb_skip").onclick = () => { restoreLook(); closeWelcome(true); };
    $("onb_back").onclick = () => { collect(); onb.step = Math.max(0, onb.step - 1); paintStep(); };
    $("onb_next").onclick = () => { if (!collect(true)) return; if (onb.step < STEPS - 1) { onb.step++; paintStep(); } else finishWelcome(); };
    m.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT") $("onb_next").click(); if (e.key === "Escape") { restoreLook(); closeWelcome(true); } });
    paintStep();
  }
  function closeWelcome(markDone) {
    if (markDone) saveSetting("onboarded", true);
    const m = $("onbModal"); if (m) m.remove(); onbOpen = false;
    if (markDone) maybeOfferTour();
  }
  const LOOKS = { gold: "Gold", vermilion: "Vermilion", emerald: "Emerald", tangerine: "Tangerine" };   // four to pick from at sign-up; Settings has the full list
  function curLook() { const s = S(); return { dark: s.darkMode !== false, accent: ACCENT_NAMES.includes(s.accentColor) ? s.accentColor : "gold", base: BASE_THEMES.includes(s.baseTheme) ? s.baseTheme : "midnight" }; }
  function applyLook(l) { saveSetting("darkMode", l.dark); saveSetting("accentColor", l.accent); saveSetting("baseTheme", l.base); applyDarkToggle(l.dark); if (window.populateForm) populateForm(); }
  function restoreLook() { if (onb && onb.look0 && JSON.stringify(onb.look) !== JSON.stringify(onb.look0)) { onb.look = onb.look0; applyLook(onb.look0); } }
  const chip = (k, label, on) => `<button type="button" class="chip${on ? " on" : ""}" data-k="${k}" aria-pressed="${on}">${label}</button>`;
  function paintStep() {
    const o = onb, b = $("onb_body");
    $("onb_dots").innerHTML = Array.from({ length: STEPS }, (_, i) => `<i class="${i === o.step ? "on" : i < o.step ? "done" : ""}"></i>`).join("");
    $("onb_back").hidden = o.step === 0;
    $("onb_next").textContent = o.step === STEPS - 1 ? "Finish" : "Next";
    if (o.step === 0) b.innerHTML = `<h2 id="onb_title" class="onb-title">Welcome to TradeMath</h2><p class="onb-sub">Let's set it up for you in a few quick questions. What do you trade? Pick all that apply.</p><div class="chips">${chip("stocks", "📈 Stocks", o.stocks)}${chip("fno", "⚡ F&amp;O (options and futures)", o.fno)}${chip("crypto", "₿ Crypto", o.crypto)}</div>`;
    if (o.step === 1) b.innerHTML = `<h2 id="onb_title" class="onb-title">Your numbers</h2><p class="onb-sub">These fill the calculator for you each time.</p>
      <div class="field"><label for="o_cap">Trading capital (₹)</label><input type="number" id="o_cap" min="1" step="1000" value="${o.cap}"></div>
      <div class="field-row"><div class="field"><label for="o_risk">Risk per trade (%)</label><input type="number" id="o_risk" min="0.01" max="100" step="0.1" value="${o.risk}"></div>
      <div class="field"><label for="o_rr">Target reward for 1 of risk</label><input type="number" id="o_rr" min="0.1" max="50" step="0.5" value="${o.rr}"></div></div>
      <p class="onb-hint">Many traders risk 0.5 to 2% of capital per trade and aim for at least 1 : 2.</p>`;
    if (o.step === 2) b.innerHTML = `<h2 id="onb_title" class="onb-title">Your experience</h2><p class="onb-sub">This decides how much you see. You can switch any time from the top bar.</p>
      <div class="cards">${[["quick", "🌱", "Beginner", "Only the essentials: entry, stop-loss, risk and target."], ["trader", "📈", "Intermediate", "Adds targets, charges, symbols, filters and journal tags."], ["pro", "🛠", "Advanced", "Everything: F&amp;O lots, planner and checklist."]].map(([k, i, t, d]) => `<button type="button" class="lvl-card${o.level === k ? " on" : ""}" data-lvl="${k}"><span>${i}</span><b>${t}</b><small>${d}</small></button>`).join("")}</div>
      <p class="onb-sub" style="margin-top:14px">How do you usually trade?</p><div class="chips">${chip("intraday", "Intraday (5× leverage)", o.style === "intraday")}${chip("swing", "Swing / positional (delivery)", o.style === "swing")}</div>`;
    if (o.step === 3) {
      const l = o.look;
      b.innerHTML = `<h2 id="onb_title" class="onb-title">Choose your look</h2><p class="onb-sub">Pick the colours you like. You see the change straight away.</p>
        <div class="chips">${chip("dark", "🌙 Dark", l.dark)}${chip("light", "☀ Light", !l.dark)}</div>
        <p class="onb-sub" style="margin-top:14px">Accent colour</p>
        <div class="swatches">${Object.keys(LOOKS).map(k => `<button type="button" class="sw${l.accent === k ? " on" : ""}" data-acc="${k}" aria-pressed="${l.accent === k}"><i style="background:${ACCENT_COLORS[k].dark}"></i>${LOOKS[k]}</button>`).join("")}</div>
        ${l.dark && !(ACCENT_COLORS[l.accent] && ACCENT_COLORS[l.accent].skin) ? `<p class="onb-sub" style="margin-top:14px">Dark background</p><div class="chips">${chip("midnight", "Midnight navy", l.base === "midnight")}${chip("oled", "OLED black", l.base === "oled")}</div>` : ""}`;
      b.querySelectorAll(".chip").forEach(c => c.onclick = () => { const k = c.dataset.k; if (k === "dark" || k === "light") l.dark = k === "dark"; else l.base = k; applyLook(l); paintStep(); });
      b.querySelectorAll(".sw").forEach(c => c.onclick = () => { l.accent = c.dataset.acc; applyLook(l); paintStep(); });
      return;
    }
    if (o.step === 4) b.innerHTML = `<h2 id="onb_title" class="onb-title">Daily guardrails</h2><p class="onb-sub">TradeMath warns you when today's trades near these limits. Leave blank to turn a limit off.</p>
      <div class="field-row"><div class="field"><label for="o_ml">Max loss per day (₹)</label><input type="number" id="o_ml" min="0" step="100" value="${o.maxLoss}" placeholder="e.g. 3000"></div>
      <div class="field"><label for="o_mt">Max trades per day</label><input type="number" id="o_mt" min="0" step="1" value="${o.maxTrades}" placeholder="e.g. 5"></div></div>`;
    b.querySelectorAll(".chip").forEach(c => c.onclick = () => {
      const k = c.dataset.k;
      if (k === "intraday" || k === "swing") { o.style = k; b.querySelectorAll(".chip").forEach(x => { const on = x.dataset.k === k; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); }); }
      else { o[k] = !o[k]; c.classList.toggle("on", o[k]); c.setAttribute("aria-pressed", String(o[k])); }
    });
    b.querySelectorAll(".lvl-card").forEach(c => c.onclick = () => { o.level = c.dataset.lvl; b.querySelectorAll(".lvl-card").forEach(x => x.classList.toggle("on", x === c)); });
    const first = b.querySelector("input"); if (first) setTimeout(() => first.focus(), 30);
  }
  function collect(validate) {
    const o = onb, v = id => { const e = $(id); return e ? e.value : null; };
    if (o.step === 1) {
      const cap = num(v("o_cap"), NaN), risk = num(v("o_risk"), NaN), rr = num(v("o_rr"), NaN);
      if (validate && !(cap >= 1 && risk >= 0.01 && risk <= 100 && rr >= 0.1 && rr <= 50)) { showToast("Please enter valid numbers, or press Skip for now."); return false; }
      if (cap >= 1) o.cap = cap; if (risk >= 0.01 && risk <= 100) o.risk = risk; if (rr >= 0.1 && rr <= 50) o.rr = rr;
    }
    if (o.step === 4) { o.maxLoss = v("o_ml") === "" ? "" : Math.max(0, num(v("o_ml"), "")); o.maxTrades = v("o_mt") === "" ? "" : Math.max(0, Math.round(num(v("o_mt"), ""))); }
    return true;
  }
  function finishWelcome() {
    const o = onb;
    const anyMkt = o.stocks || o.fno || o.crypto;                          // what they trade also decides which markets are shown
    saveSetting("tradeStocks", anyMkt ? o.stocks : true); saveSetting("tradeFno", anyMkt ? o.fno : true); saveSetting("tradeCrypto", anyMkt ? o.crypto : true);
    saveSetting("defaultCap", o.cap); saveSetting("defaultRisk", o.risk); saveSetting("defaultRR", o.rr);
    saveSetting("defaultLev", o.style === "swing" ? "1" : "5");
    saveSetting("maxDailyLoss", o.maxLoss); saveSetting("maxDailyTrades", o.maxTrades);
    const only = (a, b2) => o[a] && !o[b2];
    saveSetting("defaultMarket", o.crypto && !o.stocks && !o.fno ? "Crypto" : o.fno && !o.stocks && !o.crypto ? "Nifty F&O" : "NSE Equity");
    $("i_cap").value = o.cap; $("i_rsk").value = o.risk; $("i_rr").value = o.rr; setLeverage(o.style === "swing" ? "1" : "5"); if (window.cmSave) cmSave();
    if (o.crypto && !o.stocks && !o.fno) { setInstrType("crypto"); rememberInstr(); }
    else if (o.fno && !o.stocks && !o.crypto) { setInstrType("options"); rememberInstr(); }
    applyMarkets();
    setLevel(o.level);
    calc(); renderDailyBanner(); fillProfile();
    closeWelcome(true);
    showToast("✓ All set. You can change this any time in Profile.");
  }
  document.addEventListener("tm:signedin", () => { if (!S().onboarded) setTimeout(() => openWelcome(false), 500); });
  document.addEventListener("tm:account", e => { if (e.detail.signedIn && !S().onboarded && !window.__onbChecked) { window.__onbChecked = true; setTimeout(() => openWelcome(false), 900); } });

  /* ───────── guided tour ───────── */
  let tour = null;
  const vis = el => el && el.getClientRects().length > 0;
  const STEPS_T = () => [
    { tab: "calc", sel: () => $("i_entry") && $("i_entry").closest(".field"), title: "1. Type your entry and stop-loss", text: "Everything else (capital, risk % and target) is pre-filled from your profile. We typed example numbers for you.", prep: () => { if (!$("i_entry").value && !$("i_sl").value) { $("i_entry").value = 500; $("i_sl").value = 495; tour.filled = true; calc(); } } },
    { tab: "calc", sel: () => $("r_content") && !$("r_content").hidden ? document.querySelector(".tiles") : null, title: "2. See your answer instantly", text: "How many shares or lots to buy, the margin needed, your maximum loss, and the profit at your target." },
    { tab: "calc", sel: () => $("logTradeBtn"), title: "3. Log the trade in one click", text: "It goes straight into your journal. Shortcut for computers: Ctrl+Enter." },
    { tab: "calc", sel: () => document.querySelector('.tab-btn[data-tab="journal"]'), title: "4. Your journal", text: "Every trade, your win rate, profit and loss, and reports by month, setup and mistake." },
    { tab: "calc", sel: () => $("lvl_btn"), title: "5. Choose how much you see", text: "Quick shows only the essentials. Trader and Pro add charges, F&O lots, planner and more. Switch any time." },
    { tab: "calc", sel: () => (vis($("avatarBtn")) ? $("avatarBtn") : vis($("acctBtn")) ? $("acctBtn") : null), title: "6. Your account", text: "Sign in with Google or email to keep a copy of your trades in the cloud and set your profile: capital, risk, daily limits. It is optional." },
    { tab: null, sel: null, title: "You're ready", text: "Want to see it with sample trades? Demo data is clearly marked and removed with one click.", final: true },
  ];
  function startTour() {
    if (tour) return;
    setMenu(false); if (onbOpen) return;
    switchTab("calc"); window.scrollTo(0, 0);
    tour = { i: -1, steps: STEPS_T(), filled: false, prevHash: location.hash };
    const L = document.createElement("div"); L.id = "tourLayer"; L.className = "tour-layer";
    L.innerHTML = '<div class="tour-spot" id="tourSpot"></div><div class="tour-card" id="tourCard" role="dialog" aria-live="polite"><div class="tour-t" id="tour_t"></div><div class="tour-x" id="tour_x"></div><div class="tour-row"><span class="tour-count" id="tour_c"></span><span class="tour-btns"><button type="button" class="btn btn-ghost btn-sm" id="tour_skip">Skip tour</button><button type="button" class="btn btn-ghost btn-sm" id="tour_back">Back</button><button type="button" class="btn btn-primary btn-sm" id="tour_next">Next</button></span></div></div>';
    document.body.appendChild(L);
    $("tour_skip").onclick = () => endTour(true); $("tour_back").onclick = () => go(-1); $("tour_next").onclick = () => go(1);
    document.addEventListener("keydown", tourKeys, true); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    go(1);
  }
  function tourKeys(e) { if (!tour) return; if (e.key === "Escape") { e.preventDefault(); endTour(true); } if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }
  function go(d) {
    let i = tour.i + d;
    while (i >= 0 && i < tour.steps.length) {                    // skip steps whose target is not on screen at this level
      const st = tour.steps[i]; if (st.final) break;
      if (st.prep) st.prep();
      const t = st.sel && st.sel(); if (t && vis(t)) break; i += d;
    }
    if (i < 0) i = 0; if (i >= tour.steps.length) { endTour(true); return; }
    tour.i = i; const st = tour.steps[i];
    $("tour_t").textContent = st.title; $("tour_x").textContent = st.text;
    const n = tour.steps.length;
    $("tour_c").textContent = st.final ? "" : (i + 1) + " of " + (n - 1);
    $("tour_back").hidden = i === 0;
    const nx = $("tour_next"); nx.textContent = st.final ? "Finish" : "Next";
    const demoBtn = $("tour_demo");
    if (demoBtn) demoBtn.remove();
    if (st.final) { const b = document.createElement("button"); b.type = "button"; b.id = "tour_demo"; b.className = "btn btn-primary btn-sm"; b.textContent = "Try demo data"; b.onclick = () => { endTour(true); loadDemo(); }; nx.parentNode.insertBefore(b, nx); nx.onclick = () => endTour(true); }
    else nx.onclick = () => go(1);
    const t = st.sel && st.sel();
    if (t) { t.scrollIntoView({ block: "center", behavior: "auto" }); }
    setTimeout(place, 60);
  }
  function place() {
    if (!tour) return;
    const st = tour.steps[tour.i], spot = $("tourSpot"), card = $("tourCard"), t = st.sel && st.sel();
    const vw = innerWidth, vh = innerHeight, cw = Math.min(340, vw - 24);
    card.style.width = cw + "px";
    if (!t || !vis(t)) { spot.style.cssText = "opacity:0"; card.style.left = Math.max(12, (vw - cw) / 2) + "px"; card.style.top = Math.max(12, vh / 2 - card.offsetHeight / 2) + "px"; return; }
    const r = t.getBoundingClientRect(), pad = 6;
    spot.style.cssText = `opacity:1;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    const ch = card.offsetHeight; let top = r.bottom + 14;
    if (top + ch > vh - 12) top = Math.max(12, r.top - ch - 14);
    if (top < 12 || top + ch > vh - 12) top = Math.max(12, vh - ch - 16);            // no room above or below: dock at the bottom
    card.style.top = top + "px"; card.style.left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12) + "px";
  }
  function endTour(done) {
    if (!tour) return;
    if (tour.filled && $("i_entry").value === "500" && $("i_sl").value === "495") { $("i_entry").value = ""; $("i_sl").value = ""; calc(); }   // remove the example numbers
    document.removeEventListener("keydown", tourKeys, true); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
    const L = $("tourLayer"); if (L) L.remove(); tour = null;
    if (done) ls.set("tm_tour_done", "1");
  }
  function maybeOfferTour() {
    if (ls.get("tm_tour_done") || ls.get("tm_tour_dismissed") || tour || onbOpen || $("tourNudge") || !$("authModal").hidden) return;
    const n = document.createElement("div"); n.id = "tourNudge"; n.className = "tour-nudge";
    n.innerHTML = '<b>New to TradeMath?</b><span>Take a one-minute tour of how it works.</span><div><button type="button" class="btn btn-primary btn-sm" id="tn_go">Start tour</button><button type="button" class="btn btn-ghost btn-sm" id="tn_no">No thanks</button></div>';
    document.body.appendChild(n);
    $("tn_go").onclick = () => { n.remove(); startTour(); };
    $("tn_no").onclick = () => { n.remove(); ls.set("tm_tour_dismissed", "1"); };
  }
  window.tmTour = { start: startTour };

  /* ───────── demo data ───────── */
  function dstr(back) { const d = new Date(); d.setDate(d.getDate() - back); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function demoTrades() {
    /* About three months of sample trades, generated the same way every time (fixed seed). Mostly intraday, a few multi-day
       positional trades that overlap within a week so peak margin has something to show. */
    let seed = 20260101; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const STK = [["SAMPLE A", 1420], ["SAMPLE B", 3560], ["SAMPLE C", 1580], ["SAMPLE D", 1655], ["SAMPLE E", 1290], ["SAMPLE F", 812], ["SAMPLE G", 468], ["SAMPLE H", 1190], ["SAMPLE J", 3720], ["SAMPLE K", 168], ["SAMPLE L", 2010], ["SAMPLE M", 7100]];   // invented names and prices on purpose: no real company is shown
    const SETUPS = ["Breakout", "Pullback", "Reversal", "Trend", "Gap play", "Range"];
    const WIN_NOTES = ["Held to target.", "Clean entry, followed the plan.", "Trailed the stop and took profit.", "Waited for confirmation. It paid off."];
    const LOSS_NOTES = ["Stopped out. Entered a little early.", "Setup failed. Respected the stop.", "Choppy market, took the small loss.", "Stopped out and moved on."];
    const RISK = 500, out = []; let n = 0;
    const dstrOf = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const round2 = v => Math.round(v * 100) / 100;
    for (let back = 92; back >= 1; back--) {
      const d = new Date(); d.setDate(d.getDate() - back); const dow = d.getDay(); if (dow === 0 || dow === 6) continue;
      const count = rnd() < 0.22 ? 0 : rnd() < 0.62 ? 1 : 2;
      for (let k = 0; k < count; k++) {
        n++; const win = rnd() < 0.52, long = rnd() < 0.7, opt = rnd() < 0.18, positional = !opt && rnd() < 0.2;
        const hold = positional ? 2 + Math.floor(rnd() * 4) : 0, xd = new Date(d); xd.setDate(xd.getDate() + hold);
        if (xd > new Date()) continue;                                        // never end in the future
        const R = win ? 1.1 + rnd() * 0.9 : 1, setup = pick(SETUPS), id = "demo-" + n;
        if (opt) {
          const lots = 1 + Math.floor(rnd() * 2), entry = round2(80 + rnd() * 90), sl = round2(entry * 0.82), tgt = round2(entry * (1 + 0.18 * R)), exit = win ? tgt : sl, ot = rnd() < 0.5 ? "CE" : "PE";
          out.push({ id, demo: true, date: dstrOf(d), market: "Other Index F&O", symbol: "SAMPLE INDEX", instrument: "options", optType: ot, dir: "LONG", entry, sl, target: tgt, exit, lots, lotSize: 65, qty: lots * 65, fees: 90 + lots * 12, setup, notes: win ? pick(WIN_NOTES) : pick(LOSS_NOTES), margin: Math.round(entry * lots * 65), mistakes: [], exits: [], confidence: 3, checklistSkipped: false });
          continue;
        }
        const [sym, base] = pick(STK), entry = round2(base * (0.97 + rnd() * 0.06)), dist = entry * (0.008 + rnd() * 0.006), dir = long ? "LONG" : "SHORT", sg = long ? 1 : -1;
        const qty = Math.max(1, Math.floor(RISK / dist)), sl = round2(entry - sg * dist), target = round2(entry + sg * dist * 2);
        const exit = round2(win ? entry + sg * dist * R : entry - sg * dist * (rnd() < 0.15 ? 1.1 : 1));
        const value = entry * qty, t = { id, demo: true, date: dstrOf(d), market: "NSE Equity", symbol: sym, instrument: "equity", dir, entry, sl, target, exit, qty, fees: Math.round(45 + value * 0.0003), setup, notes: win ? pick(WIN_NOTES) : pick(LOSS_NOTES), margin: Math.round(positional ? value : value / 5), mistakes: [], exits: [], confidence: 3, checklistSkipped: false };
        if (positional) t.exits = [{ price: exit, qty, fees: t.fees, date: dstrOf(xd) }];
        out.push(t);
      }
    }
    return out;
  }
  function loadDemo() {
    trades = trades.filter(t => !t.demo).concat(demoTrades());
    saveTrades(); refreshJournal(); switchTab("journal"); window.scrollTo(0, 0);
    showToast("Demo data loaded. It is marked and never saved to your account.");
  }
  function clearDemo() { trades = trades.filter(t => !t.demo); saveTrades(); refreshJournal(); renderDemoBar(); showToast("Demo data cleared."); }
  function renderDemoBar() {
    const has = trades.some(t => t.demo); let b = $("demoBar");
    if (!has) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("div"); b.id = "demoBar"; b.className = "demo-bar";
      b.innerHTML = '<span><b>Demo data</b> The sample trades here are not yours and are never saved to your account.</span><button type="button" id="demo_clear">Clear demo data</button>';
      const tabs = document.querySelector(".tabs"); tabs.parentNode.insertBefore(b, tabs);
      $("demo_clear").onclick = clearDemo;
    }
  }
  window.tmDemoBar = renderDemoBar;
  renderDemoBar();

  /* ───────── empty-state buttons ───────── */
  $("es_calc").addEventListener("click", () => { switchTab("calc"); window.scrollTo(0, 0); const i = $("i_entry"); if (i) i.focus({ preventScroll: true }); });
  $("es_add").addEventListener("click", () => $("showAddBtn").click());
  $("es_demo").addEventListener("click", () => loadDemo());

  /* ───────── first visit nudge ───────── */
  setTimeout(() => { if (!trades.length && !onbOpen && new URLSearchParams(location.search).get("popout") !== "1") maybeOfferTour(); }, 2500);
})();

/* ══════════════ RISK DISCLOSURE ══════════════
   Shown once, after two minutes of use. After they press "I understand" it is never shown again on this device (the
   date is kept on this device only). */
(function () {
  const KEY = "tm_risk_ack", DELAY = 2 * 6e4;   // shown after two minutes of use, not the moment the page opens
  const last = () => { const v = Number(tmGet(KEY, 0)); return v > 0 ? v : 0; };
  let open = false;
  function show() {
    if (open) return;
    if (document.querySelector(".modal-overlay:not([hidden])")) return setTimeout(show, 30000);   // never on top of another dialog
    open = true;
    const ov = document.createElement("div"); ov.className = "modal-overlay"; ov.style.zIndex = 400;
    const IND = !window.TM_REGION || TM_REGION.india;
    const body = IND ? '<ul class="risk-list">' +
      '<li>9 out of 10 individual traders in equity Futures and Options (F&amp;O) incurred net losses.</li>' +
      '<li>On average, those who made losses lost close to ₹50,000.</li>' +
      '<li>On top of their net trading losses, loss makers spent a further 28% of those losses on transaction costs.</li>' +
      '<li>Even those who made net profits paid between 15% and 50% of those profits as transaction costs.</li>' +
      '</ul>' +
      '<p class="risk-src">Source: <a href="https://www.sebi.gov.in/reports-and-statistics/research/jan-2023/study-analysis-of-profit-and-loss-of-individual-traders-dealing-in-equity-fando-segment_67525.html" target="_blank" rel="noopener noreferrer">SEBI study dated 25 January 2023</a>, "Analysis of Profit and Loss of Individual Traders dealing in equity Futures and Options (F&amp;O) Segment". The findings cover individual traders in equity F&amp;O during FY 2021-22.</p>' :
      '<ul class="risk-list">' +
      '<li>Trading stocks, options, futures and crypto involves a high risk of loss, and many individual traders lose money.</li>' +
      '<li>Leverage magnifies losses as well as gains. With some products you can lose more than you put in.</li>' +
      '<li>Commissions, spreads, fees and funding costs reduce your results.</li>' +
      '<li>Results shown in TradeMath, including the Planner, are illustrations built from numbers you type in. Past results do not predict future ones.</li>' +
      '</ul>';
    ov.innerHTML = '<div class="modal risk-modal" role="alertdialog" aria-modal="true" aria-labelledby="risk_t">' +
      '<div class="modal-title" id="risk_t"><span aria-hidden="true">⚠️</span> ' + (IND ? 'Risk disclosure on derivatives' : 'Risk disclosure') + '</div>' + body +
      '<p class="risk-src">TradeMath is a calculation and journal tool. It does not give investment advice, and its figures are estimates. By continuing you agree to the <a href="terms.html" target="_blank" rel="noopener noreferrer">Terms of use</a>.</p>' +
      '<div class="tm-dialog-actions"><button type="button" class="btn btn-primary" id="risk_ok" style="width:100%">I understand</button></div></div>';
    document.body.appendChild(ov);
    const ok = ov.querySelector("#risk_ok"); ok.focus();
    ov.addEventListener("keydown", e => { if (e.key === "Tab") { e.preventDefault(); ok.focus(); } });   // keep focus on the button until it is pressed
    ok.onclick = () => { tmSet(KEY, Date.now()); ov.remove(); open = false; };
  }
  const due = () => !last();                                  // once "I understand" is pressed it is never shown again on this device
  setTimeout(() => { if (due()) show(); }, DELAY);
  document.addEventListener("tm:signedin", () => { if (due()) setTimeout(() => { if (due()) show(); }, DELAY); });
})();

/* ══════════════ SUPPORT REQUEST ══════════════
   A gentle ask, only for people who really use TradeMath: it appears once they have been using it for a week (on at least three
   different days), and then at most once every 15 days. Kept on this device only. Never shown in the pop-out window,
   and never on top of another dialog. */
(function () {
  const KEY = "tm_support", DAY = 864e5, URL = (window.TM_REGION && !TM_REGION.india) ? "https://buymeacoffee.com/trademath" : "https://razorpay.me/@trademath";   // Razorpay in India, Buy Me a Coffee elsewhere
  if (new URLSearchParams(location.search).get("popout") === "1") return;
  const st = (() => { const v = tmGet(KEY, null); return v && typeof v === "object" ? v : {}; })();
  const today = new Date().toISOString().slice(0, 10), now = Date.now();
  if (!st.first) st.first = now;
  st.days = Array.isArray(st.days) ? st.days : [];
  if (!st.days.includes(today)) st.days.push(today);
  st.days = st.days.slice(-60);
  tmSet(KEY, st);
  const due = () => now - st.first >= 7 * DAY && st.days.length >= 3 && (!st.last || now - st.last >= 15 * DAY);
  function show() {
    if (document.querySelector(".modal-overlay:not([hidden])")) return setTimeout(show, 30000);   // wait while another dialog is open
    const ov = document.createElement("div"); ov.className = "modal-overlay"; ov.style.zIndex = 390;
    ov.innerHTML = '<div class="modal support-modal" role="dialog" aria-modal="true" aria-labelledby="sup_t">' +
      '<div class="modal-title" id="sup_t"><span aria-hidden="true">❤️</span> Enjoying TradeMath?</div>' +
      '<p class="sup-text">TradeMath is free for everyone. If it has helped you size trades better or kept your journal in order, a small donation goes a long way in keeping it running.</p>' +
      '<div class="tm-dialog-actions"><button type="button" class="btn btn-ghost" id="sup_later">Maybe later</button>' +
      '<a class="btn btn-primary" id="sup_go" href="' + URL + '" target="_blank" rel="noopener">Support TradeMath</a></div></div>';
    document.body.appendChild(ov);
    const done = () => { st.last = Date.now(); tmSet(KEY, st); ov.remove(); };
    ov.querySelector("#sup_later").onclick = done;
    ov.querySelector("#sup_go").addEventListener("click", () => setTimeout(done, 50));
    ov.addEventListener("click", e => { if (e.target === ov) done(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape" && ov.isConnected) { done(); document.removeEventListener("keydown", esc); } });
  }
  if (due()) setTimeout(show, 20000);                       // after twenty seconds of use, not the moment the page opens
})();

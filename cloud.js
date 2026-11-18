"use strict";
/* ══════════════ ACCOUNT & CLOUD SYNC (optional) ══════════════
   TradeMath works fully without this. If the server API is not there (a static host, or not set up yet), the sign-in
   button and the Settings section simply stay hidden. When it is there you can sign in with Google or with an emailed
   6-digit code, and a copy of your backup (trades, settings, checklist) is kept in the cloud. The copy is replaced as a
   whole and versioned, so two devices can never silently overwrite each other: a stale upload is refused and you
   choose what to keep. */
(function () {
  const META = "tm_cloud";                                   // { version, auto }  (local only, never synced)
  const SYNC_KEYS = ["tm_trades", "tm_settings", "tm_checklist", "tm_alert", "tm_proj"];
  const st = { signedIn: false, email: "", version: 0, updatedAt: 0, timer: null, busy: false, googleId: "", googleReady: false, apiReady: false };
  const meta = () => tmGet(META, {}) || {};
  const setMeta = o => tmSet(META, Object.assign(meta(), o));
  const el = id => document.getElementById(id);
  const when = s => s ? new Date(s * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";
  const say = (t, bad) => ["ac_msg", "au_msg"].forEach(id => { const m = el(id); if (m) { m.textContent = t || ""; m.className = "bk-msg" + (bad ? " bad" : ""); } });

  async function api(path, body) {
    try {
      const r = await fetch("api/" + path, {
        method: body === undefined ? "GET" : "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-TM": "1" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let j = null; try { j = await r.json(); } catch (e) {}
      return Object.assign({ status: r.status }, j || { ok: false, error: "Unexpected reply from the server." });
    } catch (e) { return { ok: false, status: 0, error: "Could not reach the server. Check your connection." }; }
  }

  function render() {
    el("ac_out").hidden = st.signedIn;
    el("ac_in").hidden = !st.signedIn;
    el("acctBtn").hidden = !st.apiReady || st.signedIn;
    el("avatarBtn").hidden = !st.signedIn;
    const nm = ((tmGet("tm_settings", {}) || {}).displayName || "").trim();
    el("avatarLetter").textContent = (nm || st.email || "?").charAt(0).toUpperCase();
    el("am_name").textContent = nm || (st.email.split("@")[0] || "Your account");
    el("am_email").textContent = st.email;
    document.dispatchEvent(new CustomEvent("tm:account", { detail: { signedIn: st.signedIn, email: st.email, name: nm } }));
    if (st.signedIn) {
      el("ac_who").textContent = "Signed in as " + st.email + ". Cloud copy: " + (st.version ? "version " + st.version + ", saved " + when(st.updatedAt) : "none yet") + ".";
      el("ac_auto").checked = meta().auto !== false;
    }
  }

  /* ── the sign-in window ── */
  function openAuth() {
    say("");
    el("au_codewrap").hidden = true; el("au_verify").hidden = true; el("au_send").hidden = false; el("au_send").textContent = "Continue with email";
    el("authModal").hidden = false;
    initGoogle();                                             // Google's script is only loaded once someone opens this window
    setTimeout(() => el("au_email").focus(), 50);
  }
  function closeAuth() { el("authModal").hidden = true; }
  async function finishSignIn(email) {
    st.signedIn = true; st.email = email; closeAuth(); el("au_code").value = "";
    render(); await reconcile();
    document.dispatchEvent(new CustomEvent("tm:signedin", { detail: { email } }));
  }

  /* ── Google ── */
  function initGoogle() {
    if (!st.googleId || st.googleReady) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
    s.onload = () => {
      if (!window.google || !google.accounts || !google.accounts.id) return;
      google.accounts.id.initialize({
        client_id: st.googleId, ux_mode: "popup", auto_select: false, cancel_on_tap_outside: true,
        callback: async resp => {
          say("Signing you in…");
          const r = await api("google_login.php", { credential: resp.credential });
          if (!r.ok) { say(r.error || "Google sign-in failed.", true); return; }
          await finishSignIn(r.email);
        },
      });
      const dark = document.documentElement.dataset.theme !== "light";
      google.accounts.id.renderButton(el("au_google"), { type: "standard", theme: dark ? "filled_black" : "outline", size: "large", text: "continue_with", shape: "rectangular", logo_alignment: "left", width: 300 });
      el("au_google").hidden = false; el("au_or").hidden = false; st.googleReady = true;
    };
    s.onerror = () => {};                                    // blocked or offline: email sign-in still works
    document.head.appendChild(s);
  }

  /* ── upload ── */
  async function push(force) {
    if (!st.signedIn || st.busy) return;
    st.busy = true;
    const r = await api("sync.php", { baseVersion: meta().version || 0, data: buildBackup(), force: force === true });
    st.busy = false;
    if (r.ok) {
      st.version = r.version; st.updatedAt = r.updatedAt; setMeta({ version: r.version });
      tmBannerOff("tm_cloud_banner"); render(); say("Saved to the cloud at " + when(r.updatedAt) + ".");
    } else if (r.status === 409) {
      tmBanner("tm_cloud_banner", "<span><b>Your cloud copy changed on another device.</b> Choose which version to keep.</span><button type=\"button\" id=\"cb_load\">Use the cloud copy</button><button type=\"button\" id=\"cb_over\">Keep this device and overwrite the cloud</button>", b => {
        b.querySelector("#cb_load").onclick = () => pull();
        b.querySelector("#cb_over").onclick = async () => { setMeta({ version: r.version }); await push(true); };
      });
    } else if (r.status === 401) { st.signedIn = false; render(); say("You were signed out. Sign in again to keep syncing.", true); }
    else say(r.error || "Could not save to the cloud.", true);
  }

  /* ── download: reuses the backup-restore path (it keeps a copy of what is here first, then reloads) ── */
  async function pull() {
    const r = await api("sync.php");
    if (!r.ok || !r.data) { say(r.error || "There is no cloud copy yet.", true); return; }
    const good = (r.data.trades || []).filter(t => t && typeof t === "object" && (t.dir === "LONG" || t.dir === "SHORT"));
    setMeta({ version: r.version });
    pendingRestore = { data: r.data, good };
    applyRestore();
  }

  /* ── right after signing in: decide what to do with the data on this device and in the cloud ── */
  async function reconcile() {
    const r = await api("sync.php");
    if (!r.ok) { say(r.error || "Signed in, but the cloud copy could not be read.", true); return; }
    st.version = r.version; setMeta({ version: r.version });
    const local = trades.length, cloud = r.data ? (r.data.trades || []).length : 0;
    if (!r.data) { await push(true); say("Signed in. " + (local ? "Your data on this device was saved to the cloud." : "Nothing to save yet; it will sync as you log trades.")); return; }
    if (!local) { await pull(); return; }
    switchTab("settings");                                    // the choice is shown next to the account controls
    const box = el("ac_choose");
    el("ac_choose_txt").textContent = "Your cloud copy has " + cloud + " trade" + (cloud === 1 ? "" : "s") + " (saved " + when(r.updatedAt) + "). This device has " + local + ". Which one do you want to keep?";
    box.hidden = false;
    el("ac_use_cloud").onclick = () => { box.hidden = true; pull(); };
    el("ac_use_local").onclick = async () => { box.hidden = true; await push(true); say("This device's data replaced the cloud copy."); };
  }

  /* ── called by tmSet() whenever synced data changes: upload after a pause, not on every keystroke ── */
  window.tmCloudDirty = function (key) {
    if (!st.signedIn || meta().auto === false || SYNC_KEYS.indexOf(key) < 0) return;
    clearTimeout(st.timer);
    st.timer = setTimeout(() => push(false), 20000);
  };

  async function start() {
    const r = await api("me.php");
    if (!r.ok || typeof r.signedIn !== "boolean") return;      // no server here: everything stays hidden
    el("account_sec").hidden = false; st.apiReady = true;
    st.signedIn = r.signedIn; st.email = r.email || ""; st.version = r.version || 0; st.updatedAt = r.updatedAt || 0;
    st.googleId = r.googleClientId || "";
    render();
    if (st.signedIn && (meta().version || 0) !== st.version && trades.length) {   // cloud moved on while this device was away
      tmBanner("tm_cloud_banner", "<span><b>There is a newer copy of your data in the cloud.</b></span><button type=\"button\" id=\"cb_load\">Use the cloud copy</button><button type=\"button\" id=\"cb_keep\">Keep this device's data</button>", b => {
        b.querySelector("#cb_load").onclick = () => pull();
        b.querySelector("#cb_keep").onclick = async () => { setMeta({ version: st.version }); await push(true); };
      });
    }
  }

  /* ── wiring ── */
  el("acctBtn").addEventListener("click", openAuth);
  window.tmAccount = { isSignedIn: () => st.signedIn, email: () => st.email, openAuth, refresh: render };
  el("ac_open").addEventListener("click", openAuth);
  el("pf_signin").addEventListener("click", openAuth);
  el("au_close").addEventListener("click", closeAuth);
  el("authModal").addEventListener("click", e => { if (e.target === el("authModal")) closeAuth(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !el("authModal").hidden) closeAuth(); });

  el("au_send").addEventListener("click", async () => {
    const email = el("au_email").value.trim();
    if (!email) { say("Enter your email address.", true); return; }
    el("au_send").disabled = true; say("Sending…");
    const r = await api("request_otp.php", { email });
    el("au_send").disabled = false;
    if (!r.ok) { say(r.error + (r.retryAfter ? " (try again in " + r.retryAfter + " seconds)" : ""), true); return; }
    el("au_codewrap").hidden = false; el("au_verify").hidden = false; el("au_send").textContent = "Send a new code";
    say("We emailed a 6-digit code to " + email + ". It works for 10 minutes. Check spam if you do not see it.");
    el("au_code").focus();
  });
  el("au_email").addEventListener("keydown", e => { if (e.key === "Enter") el("au_send").click(); });
  el("au_verify").addEventListener("click", async () => {
    const r = await api("verify_otp.php", { email: el("au_email").value.trim(), code: el("au_code").value });
    if (!r.ok) { say(r.error, true); return; }
    await finishSignIn(r.email);
  });
  el("au_code").addEventListener("keydown", e => { if (e.key === "Enter") el("au_verify").click(); });

  el("ac_push").addEventListener("click", () => push(false));
  el("ac_pull").addEventListener("click", async () => { if (await tmAsk({ title: "Replace data on this device?", body: "This replaces the data on this device with your cloud copy. A copy of what is here is kept first.", ok: "Replace" })) pull(); });
  el("ac_auto").addEventListener("change", e => setMeta({ auto: e.target.checked }));
  el("ac_signout").addEventListener("click", async () => {
    await api("logout.php", {}); st.signedIn = false; tmBannerOff("tm_cloud_banner"); render();
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    say("Signed out. Your data stays on this device.");
  });
  el("ac_delete").addEventListener("click", async () => {
    const r = await api("delete_account.php", { confirmEmail: el("ac_del_email").value });
    if (!r.ok) { say(r.error, true); return; }
    st.signedIn = false; setMeta({ version: 0 }); tmBannerOff("tm_cloud_banner"); render();
    say("Your account and cloud data were deleted. Your data on this device is untouched.");
  });
  start();
})();

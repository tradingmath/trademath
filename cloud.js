"use strict";
/* ══════════════ ACCOUNT & CLOUD SYNC (optional) ══════════════
   TradeMath works fully without this. If the server API is not there (a static host, or not set up yet), the
   Settings section simply stays hidden. When it is there: sign in with an emailed 6-digit code, and a copy of your
   backup (trades, settings, checklist) is kept in the cloud. The copy is replaced as a whole and versioned, so two
   devices can never silently overwrite each other: a stale upload is refused and you choose what to keep. */
(function () {
  const META = "tm_cloud";                                   // { version, auto }  (local only, never synced)
  const SYNC_KEYS = ["tm_trades", "tm_settings", "tm_checklist", "tm_alert", "tm_proj"];
  const st = { signedIn: false, email: "", version: 0, updatedAt: 0, timer: null, busy: false };
  const meta = () => tmGet(META, {}) || {};
  const setMeta = o => tmSet(META, Object.assign(meta(), o));
  const el = id => document.getElementById(id);
  const when = s => s ? new Date(s * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";
  const say = (t, bad) => { const m = el("ac_msg"); m.textContent = t || ""; m.className = "bk-msg" + (bad ? " bad" : ""); };

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
    if (st.signedIn) {
      el("ac_who").textContent = "Signed in as " + st.email + ". Cloud copy: " + (st.version ? "version " + st.version + ", saved " + when(st.updatedAt) : "none yet") + ".";
      el("ac_auto").checked = meta().auto !== false;
    }
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
    if (!r.ok || typeof r.signedIn !== "boolean") return;      // no server here: stay hidden
    el("account_sec").hidden = false;
    st.signedIn = r.signedIn; st.email = r.email || ""; st.version = r.version || 0; st.updatedAt = r.updatedAt || 0;
    render();
    if (st.signedIn && (meta().version || 0) !== st.version && trades.length) {   // cloud moved on while this device was away
      tmBanner("tm_cloud_banner", "<span><b>There is a newer copy of your data in the cloud.</b></span><button type=\"button\" id=\"cb_load\">Use the cloud copy</button><button type=\"button\" id=\"cb_keep\">Keep this device's data</button>", b => {
        b.querySelector("#cb_load").onclick = () => pull();
        b.querySelector("#cb_keep").onclick = async () => { setMeta({ version: st.version }); await push(true); };
      });
    }
  }

  el("ac_send").addEventListener("click", async () => {
    const email = el("ac_email").value.trim();
    if (!email) { say("Enter your email address.", true); return; }
    el("ac_send").disabled = true; say("Sending…");
    const r = await api("request_otp.php", { email });
    el("ac_send").disabled = false;
    if (!r.ok) { say(r.error + (r.retryAfter ? " (try again in " + r.retryAfter + " seconds)" : ""), true); return; }
    el("ac_codewrap").hidden = false; el("ac_verify").hidden = false; el("ac_send").textContent = "Send a new code";
    say("We emailed a 6-digit code to " + email + ". It works for 10 minutes. Check spam if you do not see it.");
    el("ac_code").focus();
  });
  el("ac_verify").addEventListener("click", async () => {
    const r = await api("verify_otp.php", { email: el("ac_email").value.trim(), code: el("ac_code").value });
    if (!r.ok) { say(r.error, true); return; }
    st.signedIn = true; st.email = r.email; el("ac_code").value = ""; el("ac_codewrap").hidden = true; el("ac_verify").hidden = true; el("ac_send").textContent = "Send code";
    render(); await reconcile();
  });
  el("ac_code").addEventListener("keydown", e => { if (e.key === "Enter") el("ac_verify").click(); });
  el("ac_push").addEventListener("click", () => push(false));
  el("ac_pull").addEventListener("click", () => { if (confirm("Replace the data on this device with your cloud copy? A copy of what is here is kept first.")) pull(); });
  el("ac_auto").addEventListener("change", e => setMeta({ auto: e.target.checked }));
  el("ac_signout").addEventListener("click", async () => {
    await api("logout.php", {}); st.signedIn = false; tmBannerOff("tm_cloud_banner"); render(); say("Signed out. Your data stays on this device.");
  });
  el("ac_delete").addEventListener("click", async () => {
    const r = await api("delete_account.php", { confirmEmail: el("ac_del_email").value });
    if (!r.ok) { say(r.error, true); return; }
    st.signedIn = false; setMeta({ version: 0 }); tmBannerOff("tm_cloud_banner"); render();
    say("Your account and cloud data were deleted. Your data on this device is untouched.");
  });
  start();
})();

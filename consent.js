"use strict";
/* ══════════════ OPTIONAL ANALYTICS: ask first, load only after "Accept" ══════════════
   Nothing from Google is loaded until the visitor presses Accept. Decline (or a browser Do Not Track / Global Privacy
   Control signal) means no analytics script is ever added. The choice is kept on the visitor's own device and can be
   changed at any time from a "Cookie choices" link. No trades, notes or account details are ever sent. */
(function () {
  var GTM_ID = "GTM-MX7K55ZK", KEY = "tm_consent";
  var get = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  var put = function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} };
  var del = function () { try { localStorage.removeItem(KEY); } catch (e) {} };
  var signalOff = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1";

  function loadAnalytics() {
    if (window.__tmAnalytics) return;
    window.__tmAnalytics = true;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    var s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtm.js?id=" + GTM_ID;
    document.head.appendChild(s);
  }

  function css() {
    if (document.getElementById("tm_consent_css")) return;
    var st = document.createElement("style"); st.id = "tm_consent_css";
    st.textContent =
      "#tm_consent{position:fixed;left:50%;transform:translateX(-50%);bottom:max(12px,env(safe-area-inset-bottom,0px));width:calc(100% - 24px);max-width:680px;z-index:90;" +
      "background:var(--surface,#0f1838);color:var(--fg,#e8ecf8);border:1px solid var(--border,#223060);border-radius:12px;padding:12px 14px;box-shadow:0 10px 40px rgba(0,0,0,.45);" +
      "font:13px/1.55 var(--sans,system-ui,sans-serif);display:flex;gap:12px;align-items:center;flex-wrap:wrap}" +
      "#tm_consent p{margin:0;flex:1 1 280px;color:var(--fg2,#9fb0e0)}#tm_consent a{color:var(--accent,#ffb400)}" +
      "#tm_consent .tc-btns{display:flex;gap:8px;flex:0 0 auto;margin-left:auto}" +
      "#tm_consent button{font:600 13px var(--sans,system-ui,sans-serif);border-radius:9px;padding:8px 16px;cursor:pointer;border:1px solid var(--border,#223060);background:transparent;color:var(--fg,#e8ecf8)}" +
      "#tm_consent button.tc-yes{background:var(--accent-solid,#ffb400);border-color:var(--accent-solid,#ffb400);color:var(--on-accent,#060b26)}";
    document.head.appendChild(st);
  }

  function clearGaCookies() {                                   // a "No" also removes any analytics cookies set earlier
    var host = location.hostname, parts = host.split("."), root = parts.length > 2 ? parts.slice(-2).join(".") : host;
    document.cookie.split(";").forEach(function (kv) {
      var n = kv.split("=")[0].trim();
      if (n === "_ga" || n.indexOf("_ga_") === 0 || n === "_gid" || n.indexOf("_gat") === 0) {
        [host, "." + host, "." + root].forEach(function (d) { document.cookie = n + "=; Max-Age=0; path=/; domain=" + d; });
        document.cookie = n + "=; Max-Age=0; path=/";
      }
    });
  }
  function hide() { var b = document.getElementById("tm_consent"); if (b) b.remove(); }
  function show() {
    if (document.getElementById("tm_consent")) return;
    css();
    var b = document.createElement("div"); b.id = "tm_consent"; b.setAttribute("role", "dialog"); b.setAttribute("aria-label", "Analytics choice");
    b.innerHTML = '<p>May we count visits with Google Analytics? It sets cookies and sends page visits to Google. We never send your trades, notes or account details, and nothing loads unless you accept. <a href="privacy.html#analytics">Details</a></p>' +
      '<div class="tc-btns"><button type="button" class="tc-no">No thanks</button><button type="button" class="tc-yes">Accept</button></div>';
    b.querySelector(".tc-yes").onclick = function () { put("yes"); hide(); loadAnalytics(); };
    b.querySelector(".tc-no").onclick = function () { put("no"); clearGaCookies(); hide(); };
    document.body.appendChild(b);
  }

  /* On the app page, wait until the risk notice, welcome steps and tour prompt are out of the way. */
  function clear() {
    return !document.querySelector(".modal-overlay:not([hidden])") && !document.getElementById("tourNudge") && !document.getElementById("onbModal");
  }
  function ask() {
    var tries = 0;
    (function wait() {
      if (get() !== null) return;
      if (clear() || ++tries > 40) { show(); return; }
      setTimeout(wait, 1500);
    })();
  }

  window.tmConsentReset = function () { del(); window.__tmAnalyticsOffNote = true; show(); };
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-consent-reset]");
    if (t) { e.preventDefault(); window.tmConsentReset(); }
  });

  function start() {
    var c = get();
    if (c === "yes" && !signalOff) { loadAnalytics(); return; }
    if (c === "no" || signalOff) return;
    setTimeout(ask, 1200);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

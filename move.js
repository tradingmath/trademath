/* Runs on trademath.in only. Packs this browser's saved TradingMath data into the address of the redirect to
   castlingtrader.com/tradingmath/migrate.html, which stores it there. Browsers keep each site's saved data apart,
   so passing it in the address (it sits after the #, which is never sent to any server) is the way to carry it across.
   Nothing is deleted from this browser. */
(function () {
  "use strict";
  var ORIGIN = "https://castlingtrader.com", BASE = ORIGIN + "/tradingmath/";
  var MAX = 100000;                            // longest address payload that every browser handles
  var secure = location.protocol === "https:" ? "; Secure" : "";
  var recover = /(^|[?&])recover=1/.test(location.search);

  function setCookie(name, maxAge) { document.cookie = name + "=1; Path=/; Max-Age=" + maxAge + "; SameSite=Lax" + secure; }
  function show(id) { document.getElementById("ok").hidden = id !== "ok"; document.getElementById("bad").hidden = id !== "bad"; }
  function route() {                           // old #journal style links become the new clean addresses
    var h = location.hash.replace(/^#\/?/, "").split("/"), t = h[0], s = h[1];
    if (t === "journal") return (s === "planner" || s === "projection") ? "planner" : "journal";
    return (t === "settings" || t === "profile") ? t : "";
  }
  function b64u(u8) {
    var s = "";
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function pack(json) {
    if (window.CompressionStream) {
      var buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
      return "g." + b64u(new Uint8Array(buf));
    }
    return "r." + b64u(new TextEncoder().encode(json));
  }

  var data = {}, n = 0;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf("tm_") === 0) { data[k] = localStorage.getItem(k); n++; }
    }
  } catch (e) { n = 0; }

  function leave(payload) {
    setCookie("tm_moved", 31536000);
    var q = /^\?[\w=&%.\-]*$/.test(location.search) && !recover ? location.search : "";
    location.replace(BASE + "migrate.html?to=" + encodeURIComponent(route()) + (q ? "&q=" + encodeURIComponent(q) : "") + (payload ? "#d=" + payload : ""));
  }
  function backupFile() {                      // same format as the app's own backup, so it can be restored with Restore backup
    var trades = []; try { trades = JSON.parse(data.tm_trades || "[]"); } catch (e) {}
    var blob = new Blob([JSON.stringify({ app: "TradeMath", version: 1, exported: new Date().toISOString(), trades: trades })], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "tradingmath-backup.json"; document.body.appendChild(a); a.click(); a.remove();
  }
  document.getElementById("stay").addEventListener("click", function () { setCookie("tm_stay", 86400); location.replace("/" + location.hash); });
  document.getElementById("backup").addEventListener("click", backupFile);
  document.getElementById("go").addEventListener("click", function (e) { e.preventDefault(); leave(""); });

  if (recover) { show("bad"); return; }
  if (!n) { leave(""); return; }               // nothing saved in this browser: simply redirect
  pack(JSON.stringify(data)).then(function (p) {
    if (p.length > MAX) show("bad"); else leave(p);   // very large journals use the backup file instead
  }, function () { show("bad"); });
})();

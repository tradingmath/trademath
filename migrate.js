/* Runs on castlingtrader.com/tradingmath/migrate.html. Receives the saved TradingMath data from trademath.in (in the address after the #),
   stores it in this browser, removes it from the address, and opens the page the visitor asked for.
   It only accepts data from a visitor who arrives straight from trademath.in, and it never overwrites data that is already here. */
(function () {
  "use strict";
  var FROM = "https://trademath.in/", BASE = "/tradingmath/";
  var hash = location.hash;
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}   // the data must not stay in the address bar or history

  function finish() {
    var p = new URLSearchParams(location.search), to = p.get("to") || "", q = p.get("q") || "";
    if (["", "journal", "planner", "settings", "profile"].indexOf(to) < 0) to = "";
    if (!/^\?[\w=&%.\-]*$/.test(q)) q = "";
    location.replace(BASE + to + q);
  }
  function unb64(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
    var bin = atob(s), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  async function unpack(s) {
    var kind = s.slice(0, 2), u8 = unb64(s.slice(2));
    if (kind === "g.") return await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    if (kind === "r.") return new TextDecoder().decode(u8);
    throw new Error("format");
  }
  async function run() {
    try {
      if (document.referrer.indexOf(FROM) !== 0 || hash.indexOf("#d=") !== 0) return finish();   // not from trademath.in: ignore any data
      if (localStorage.getItem("tm_migrated_from") !== null) return finish();                    // already done once
      var data = JSON.parse(await unpack(hash.slice(3)));
      if (!data || typeof data !== "object" || Array.isArray(data)) return finish();
      var fresh = localStorage.getItem("tm_trades") === null, total = 0;
      Object.keys(data).forEach(function (k) {
        var v = data[k];
        if (!/^tm_[a-z0-9_]{1,50}$/.test(k) || typeof v !== "string") return;
        total += v.length; if (total > 4000000) return;
        if (fresh || localStorage.getItem(k) === null) localStorage.setItem(k, v);              // never overwrite what is already here
      });
      localStorage.setItem("tm_migrated_from", "trademath.in");
    } catch (e) { /* the old site still has the data; carry on to the app */ }
    finish();
  }
  run();
})();

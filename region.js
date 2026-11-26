"use strict";
/* ══════════════ REGION (country and currency) ══════════════
   India is the default and is left exactly as it was. For anyone else the app switches to their currency and number style,
   and hides the India-only parts (F&O lots, MIS, NSE symbols).
   The country comes from Settings. A brand-new visitor gets a first guess from the browser's own timezone: nothing is sent anywhere
   and no location service is used. People who already use TradingMath are never switched: they stay on India until they choose otherwise.
   Loaded first, before calc.js, so every formatter can ask TM_REGION. */
(function () {
  const REGIONS = {
    IN: { name: "India",                code: "INR", sym: "₹",   pre: "₹",    fx: 88,     india: true },
    US: { name: "United States",        code: "USD", sym: "$",   pre: "$",    fx: 1 },
    CA: { name: "Canada",               code: "CAD", sym: "C$",  pre: "C$",   fx: 1.38 },
    GB: { name: "United Kingdom",       code: "GBP", sym: "£",   pre: "£",    fx: 0.78 },
    EU: { name: "Europe (euro)",        code: "EUR", sym: "€",   pre: "€",    fx: 0.92 },
    AE: { name: "United Arab Emirates", code: "AED", sym: "AED", pre: "AED ", fx: 3.6725 },
    SG: { name: "Singapore",            code: "SGD", sym: "S$",  pre: "S$",   fx: 1.34 },
    AU: { name: "Australia",            code: "AUD", sym: "A$",  pre: "A$",   fx: 1.52 },
  };
  /* Account sizes in the Planner and the first-run defaults are scaled down from the India numbers (₹1,00,000 capital, ₹1,000 risk). */
  const SCALE = { IN: 1, default: 0.1 };

  function detect() {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    if (/^Asia\/(Kolkata|Calcutta)$/.test(tz)) return "IN";
    if (tz === "Asia/Dubai") return "AE";
    if (tz === "Asia/Singapore") return "SG";
    if (/^Australia\//.test(tz)) return "AU";
    if (tz === "Europe/London") return "GB";
    if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Montreal|St_Johns|Regina)$/.test(tz)) return "CA";
    if (/^America\//.test(tz) || /^US\//.test(tz)) return "US";
    if (/^Europe\//.test(tz)) return "EU";
    return "IN";                                            // unknown: keep the way the site has always worked
  }

  let s = {}, hasSettings = false;
  try { const raw = localStorage.getItem("tm_settings"); hasSettings = raw !== null; s = JSON.parse(raw || "{}") || {}; } catch (e) { s = {}; }
  if (typeof s !== "object" || Array.isArray(s)) s = {};
  const existing = hasSettings || localStorage.getItem("tm_trades") !== null;
  let code = REGIONS[s.country] ? s.country : null;
  if (!code) {
    code = existing ? "IN" : detect();
    if (!existing && code !== "IN") {                      // a new visitor outside India: remember the guess so it stays put
      try { s.country = code; s.usdInr = REGIONS[code].fx; s.defaultCap = 10000; s.defaultLev = "1"; localStorage.setItem("tm_settings", JSON.stringify(s)); } catch (e) {}
    }
  }
  /* Currency is its own choice: it follows the country until you pick another. */
  const CURS = {}; Object.keys(REGIONS).forEach(k => { const g = REGIONS[k]; CURS[g.code] = { code: g.code, sym: g.sym, pre: g.pre, fx: g.fx, name: g.name.replace(/^United States$/, "US dollar") }; });
  const CURNAME = { INR: "Indian rupee", USD: "US dollar", CAD: "Canadian dollar", GBP: "British pound", EUR: "Euro", AED: "UAE dirham", SGD: "Singapore dollar", AUD: "Australian dollar" };
  const curCode = CURS[s.currency] ? s.currency : REGIONS[code].code;
  const r = Object.assign({ key: code }, REGIONS[code], { code: curCode, sym: CURS[curCode].sym, pre: CURS[curCode].pre, fx: CURS[curCode].fx });
  r.cur = curCode; r.inr = curCode === "INR"; r.india = code === "IN";   // india = the country (markets, wording); inr = the currency (symbol, digit grouping)
  r.scale = r.inr ? SCALE.IN : SCALE.default;
  r.list = REGIONS; r.currencies = CURS; r.curName = CURNAME;
  r.intl = n => {                                          // non-India number style: 12,345 and 1.2M
    const a = Math.abs(n), sg = n < 0 ? "−" : "";
    if (a >= 1e9) return sg + r.pre + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return sg + r.pre + (a / 1e6).toFixed(2) + "M";
    if (a >= 1000) return sg + r.pre + Math.round(a).toLocaleString("en-US");
    return sg + r.pre + a.toFixed(2);
  };
  window.TM_REGION = r;
  document.documentElement.setAttribute("data-country", code);
  document.documentElement.setAttribute("data-currency", curCode);
  if (r.india && r.inr) return;
  if (!r.india) document.title = document.title.replace(" for Indian Traders", "");   // the tab title should not say Indian for everyone else                                    // India: nothing below runs, so nothing changes

  /* ── everyone else: swap ₹ for their currency, wherever it is written, now and later ── */
  const swap = str => {
    if (!r.inr) str = str.replace(/₹(?=[\d.])/g, r.pre).replace(/₹/g, r.sym);
    if (!r.india) str = str.replace("e.g. RELIANCE, TCS, NIFTY", "e.g. AAPL, TSLA, SPY").replace("e.g. NIFTY, RELIANCE, BTCUSDT", "e.g. AAPL, TSLA, BTCUSDT");
    return str;
  };
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/;
  const ATTRS = ["placeholder", "title", "aria-label", "alt"];
  /* Market names are shown in plain words. The saved value never changes, only what is displayed. */
  const MARKET_LABEL = r.india ? {} : { "NSE Equity": "Stocks" };
  const HIDE_MARKET = ["Nifty F&O", "BankNifty F&O", "Stock F&O", "Other Index F&O", "MCX Gold", "MCX Crude"];
  /* Indian wording replaced with neutral wording */
  const WORDS = [
    ["1× Cash (CNC / Delivery)", "1× Cash (no leverage)"], ["Advanced: Pro (F&O lots, planner, checklist)", "Advanced: Pro (planner, checklist, more)"],
    ["Intraday: 5× leverage (MIS)", "Intraday: leveraged trading"],
    ["Everything: F&O lots, planner,", "Everything: planner,"], ["Clock (:00, for MCX)", "Clock (:00)"], ["Mon–Fri, 9:15–15:30. Turn off for MCX or crypto.", "Turn off for crypto and other markets that trade around the clock."], ["1× Cash Delivery (100% margin)", "1× Cash (100% margin)"],
    ["TradingMath is a free position size calculator and trade journal for Indian traders. Enter your entry, stop-loss, capital and risk to get quantity, margin, targets and charges for NSE stocks, F&O lots, MCX and crypto futures. Then log the trade and review your results.",
     "TradingMath is a free position size calculator and trade journal. Enter your entry, stop-loss, capital and risk to get quantity, margin and targets for stocks and crypto futures. Then log the trade and review your results."],
  ];
  function fixText(n) {
    let v = n.nodeValue;
    if (v && !r.india) { for (const [a, b] of WORDS) if (v.indexOf(a) >= 0) { v = v.replace(a, b); n.nodeValue = v; } }
    if (v && (v.indexOf("₹") >= 0 || (!r.india && v.indexOf("RELIANCE") >= 0))) n.nodeValue = swap(v);
    const t = v ? v.trim() : "";
    if (MARKET_LABEL[t] && n.parentNode && n.parentNode.nodeName !== "OPTION") n.nodeValue = v.replace(t, MARKET_LABEL[t]);
  }
  function fixEl(el) {
    if (el.nodeType !== 1 || SKIP.test(el.nodeName)) return;
    if (el.nodeName === "A" && !r.india && (el.getAttribute("href") || "").indexOf("https://razorpay.me/") === 0) el.setAttribute("href", "https://buymeacoffee.com/trademath");   // outside India, Support goes to Buy Me a Coffee
    ATTRS.forEach(a => { const v = el.getAttribute(a); if (v) { const nv = swap(v); if (nv !== v) el.setAttribute(a, nv); } });
    if (el.nodeName === "OPTION") {
      const t = el.textContent.trim();
      if (MARKET_LABEL[t]) el.label = MARKET_LABEL[t];
      if (!r.india && (HIDE_MARKET.indexOf(t) >= 0 || /^NSE candles/.test(t))) el.hidden = true;
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { fixText(root); return; }
    if (root.nodeType !== 1 || SKIP.test(root.nodeName)) return;
    fixEl(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    let n; while ((n = tw.nextNode())) { if (n.nodeType === 3) { if (!n.parentNode || !SKIP.test(n.parentNode.nodeName)) fixText(n); } else fixEl(n); }
  }
  function start() {
    walk(document.body);
    if (!r.india) {                                              // the F&O lot-size guide is India only: drop its footer link and the dot before it
      document.querySelectorAll('a[href="nse-fno-lot-sizes.html"]').forEach(a => { const p = a.previousSibling; if (p && p.nodeType === 3) p.nodeValue = p.nodeValue.replace(/·\s*$/, " "); a.remove(); });
    }
    new MutationObserver(list => {
      list.forEach(m => {
        if (m.type === "characterData") fixText(m.target);
        else if (m.type === "attributes") fixEl(m.target);
        else m.addedNodes.forEach(walk);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();

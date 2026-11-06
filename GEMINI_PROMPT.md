# TradeMath — Project Briefing for AI Assistant

## What is this project?
TradeMath is a **trade position sizing calculator + trade journal** for Indian retail traders (NSE/BSE/MCX).
Live site: https://tradingmath.netlify.app
GitHub: https://github.com/tradingmath/trademath.git

---

## IMPORTANT RULE — READ FIRST
**Never push to GitHub or deploy to Netlify unless I explicitly say "deploy".**
I test with the local .html file first before deploying.

---

## Tech Stack
- Pure HTML + CSS + JavaScript — **no framework, no build step**
- 5 files total. All JS loaded as plain `<script src>` tags (not ES modules, shared global scope)
- Data stored in browser `localStorage`

## Files
| File | What it does |
|------|-------------|
| `index.html` | All HTML structure. No inline CSS or JS. |
| `styles.css` | All CSS. Dark-first theme with CSS variables for colors. |
| `calc.js` | Calculator logic — instrument tabs, symbol autocomplete, margin, Zerodha fees |
| `journal.js` | Trade journal — log trades, close, partial exits, tags, report card |
| `app.js` | App shell — settings, tab switching, theme, checklist, init |

---

## Calculator Features (calc.js)

### Instrument Type Tabs
3 tabs replace old market chips:
- **Options** — buys CE or PE, pays full premium, Zerodha ₹20 brokerage + 0.0625% STT on sell
- **Futures** — lot-based, SPAN margin, Zerodha ₹20 brokerage + 0.00125% STT on sell
- **Equity** — shares, delivery (NRML) = ₹0 brokerage + 0.1% STT both sides; intraday (MIS) = ₹20 brokerage + 0.025% STT sell

### MIS / NRML Toggle
- **NRML**: full margin / full price
- **MIS** (intraday): futures = 50% of NRML margin; equity = entry price / 5 (5× leverage)

### Symbol Autocomplete
- 150+ NSE symbols in `SYMBOLS` array in calc.js
- Each has: `{name, lot, sector, marginNRML, indexOnly?}`
- Index symbols (NIFTY, BANKNIFTY etc.) auto-switch to Futures tab if Equity was selected
- Key lot sizes: NIFTY=75, BANKNIFTY=35, FINNIFTY=25, MIDCPNIFTY=75

### Zerodha Fee Calculation (`calcZerodhaFees` function)
Accurate per segment:
```
Equity Delivery:  brokerage=₹0,  STT=0.1% both,  exchange=0.00345%, stamp=0.015% buy
Equity Intraday:  brokerage=₹20, STT=0.025% sell, exchange=0.00345%, stamp=0.003% buy
Futures:          brokerage=₹20, STT=0.00125% sell,exchange=0.0019%, stamp=0.002% buy
Options (buy):    brokerage=₹20, STT=0.0625% sell, exchange=0.053%,  stamp=0.003% buy
GST 18% on (brokerage + exchange + SEBI fee)
SEBI fee: 0.0001% all segments
```

### Daily Risk Banner
Reads `maxDailyLoss` and `maxDailyTrades` from `tm_settings` in localStorage.
Shows warning/danger banner in `#daily_banner` element.

---

## Journal Features (journal.js)

### Trade Data Model
```js
{
  id: string,
  date: "YYYY-MM-DD",
  market: string,           // "NSE Equity", "Nifty F&O", etc.
  dir: "LONG" | "SHORT",
  entry: number,
  sl: number,
  target: number,
  qty: number,
  exit: number,             // legacy single exit (full close)
  exits: [                  // partial exits array
    { qty, price, fees, notes, date }
  ],
  fees: number,
  notes: string,
  setup: string,            // strategy tag e.g. "EMA Crossover"
  mistakes: string[],       // e.g. ["Chased entry", "No SL"]
  confidence: number,       // 1–5 stars
  checklistSkipped: boolean
}
```

### Key Functions
- `isClosed(t)` — true if `t.exit` exists OR sum of `t.exits[].qty >= t.qty`
- `pnlForTrade(t)` — uses exits array if present, else legacy `t.exit`
- `renderAnalytics()` — was removed (no analytics tab now)
- `renderTodayTrades()` — renders today's trades in calc tab right panel
- `renderCalendar()` — monthly calendar view in journal tab
- `renderReports()` — monthly stats table with Share Card button
- `openReportCard(monthStr)` — SVG-based monthly report card modal

### Pre-log Modal
When user clicks "Log This Trade to Journal" from calculator:
1. Opens `#preLogModal`
2. User picks setup tag, mistake tags, confidence (stars), fills checklist
3. On confirm → saves trade to localStorage

### Partial Exits
Close modal has Full Exit / Partial Exit toggle.
Partial pushes to `t.exits[]`. Full exit sets `t.exit`.

---

## Settings (app.js)

### Appearance
- Dark/light theme toggle (saves to `tm_settings.darkMode`)
- 6 accent color swatches: Amber (default), Blue, Green, Purple, Red, Cyan
- Colors applied via CSS custom properties: `--accent` and `--accent-dim`

### Fee Settings
- `tog_show_fees` toggle: show/hide fees everywhere (net P&L column, fee breakdown)
- `s_brokerage`: brokerage per order in ₹ (default 20)
- `s_gst_pct`: GST percentage (default 18)

### Daily Risk Rules
- `s_max_loss`: max daily loss in ₹
- `s_max_trades`: max trades per day

### Pre-trade Checklist
- Stored in `tm_checklist` localStorage key as JSON array of strings
- Rendered in `#settings_checklist`
- Shown in pre-log modal before each trade

---

## localStorage Keys
| Key | Content |
|-----|---------|
| `tm_trades` | JSON array of all trade objects |
| `tm_settings` | JSON object: darkMode, accentColor, maxDailyLoss, maxDailyTrades, showFees, brokerage, gstPct |
| `tm_checklist` | JSON array of checklist item strings |

---

## CSS Variables (styles.css)
```css
--bg        background
--surface   panels/cards background
--card      input fields background
--border    borders
--accent    primary color (changes with swatch)
--accent-dim accent at ~12% opacity
--green / --green-dim
--red / --red-dim
--fg        primary text
--fg2       secondary text (labels, descriptions)
--fg3       muted text (placeholder, timestamps)
--mono      JetBrains Mono
--sans      Inter
```

---

## Tabs
3 tabs: **Calc** / **Journal** / **Settings**
(Analytics tab was removed)
Tab switching handled by `switchTab(name)` in app.js.

---

## Deploy Command
```bash
cd C:\Users\Anirudh\Desktop\trademath
git add -A
git commit -m "your message here"
git push origin main
```
Netlify auto-deploys on push to main branch.

---

## How to make changes
1. Edit the specific file (index.html / styles.css / calc.js / journal.js / app.js)
2. Test locally by opening index.html in browser
3. When I say "deploy" → run the git commands above

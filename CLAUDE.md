# TradeMath — Project Context for Claude

## Project
Trade calculator + journal for Indian retail traders. Live at: https://tradingmath.netlify.app
GitHub: https://github.com/tradingmath/trademath.git (branch: main)
Netlify auto-deploys on push to main.

## CRITICAL RULE
**Never push to GitHub or deploy to Netlify unless the user explicitly says "deploy".**
User tests with the local .html file first.

## File Structure
| File | Purpose |
|------|---------|
| `index.html` | All HTML structure — no inline CSS or JS |
| `styles.css` | All styling |
| `calc.js` | Calculator: Options/Futures/Equity tabs, symbol autocomplete (150+ NSE stocks), MIS/NRML, Zerodha fees |
| `journal.js` | Trade journal: log, edit, close, partial exits, setup tags, mistake tags, report card |
| `app.js` | Settings, tabs, theme (dark/light + 6 accent colors), checklist, init |

## Key Architecture
- No build step — plain HTML + CSS + JS loaded via `<script src>`
- Global scope shared across all 3 JS files (not ES modules)
- `localStorage` keys: `tm_trades`, `tm_settings`, `tm_checklist`
- `window.trades` is set by `loadTrades()` in journal.js, used by calc.js

## Calculator (calc.js)
- **Instrument tabs**: Options / Futures / Equity (replaces old market chips)
- **Symbol autocomplete**: 150+ NSE symbols with lot sizes (NIFTY=75, BANKNIFTY=35, etc.)
- **MIS/NRML toggle**: MIS = 50% margin for futures, 5× leverage for equity
- **Zerodha fees**:
  - Equity delivery (NRML): ₹0 brokerage, STT 0.1% both sides
  - Equity intraday (MIS): ₹20/order, STT 0.025% sell
  - Futures: ₹20/order, STT 0.00125% sell, exchange 0.0019%
  - Options buy: ₹20/order, STT 0.0625% sell (premium), exchange 0.053%
- **Daily risk banner**: warns when daily loss limit or trade count exceeded
- **Fee breakdown**: collapsible Zerodha charges section

## Journal (journal.js)
- `isClosed(t)` — checks `t.exit` OR sum of `t.exits[].qty >= t.qty` (partial exits)
- `pnlForTrade(t)` — uses `t.exits[]` array if present, else legacy `t.exit`
- Setup tags: `SETUP_PRESETS` array, stored in `t.setup`
- Mistake tags: `MISTAKE_PRESETS` array, stored in `t.mistakes[]`
- Confidence: 1–5 stars, stored in `t.confidence`
- Partial exits: `t.exits[]` array of `{qty, price, fees, notes, date}`
- Pre-log modal (`#preLogModal`): shows before saving from calculator
- Report card modal (`#reportCardModal`): SVG export per month
- Zerodha CSV import supported

## Settings (app.js)
- **Appearance**: Dark/light toggle + 6 accent colors (Amber/Blue/Green/Purple/Red/Cyan)
- **Fees**: Show/hide fees toggle, configurable brokerage (default ₹20), GST% (default 18%)
- **Daily risk rules**: max daily loss (₹), max trades/day
- **Pre-trade checklist**: user-defined items shown in pre-log modal

## Trade Data Model
```js
{
  id, date, market, dir,          // basics
  entry, sl, target, qty,         // prices
  exit,                           // legacy single exit price
  exits: [{qty, price, fees, notes, date}], // partial exits
  fees, notes,
  setup,                          // string — strategy tag
  mistakes: [],                   // array of mistake tag strings
  confidence,                     // 1-5
  checklistSkipped: bool
}
```

## Git
```bash
# Deploy
cd C:\Users\Anirudh\Desktop\trademath
git add -A
git commit -m "your message"
git push origin main
```

## Permissions Already Granted
- Read/write all files in `C:\Users\Anirudh\Desktop\trademath\`
- Git operations (commit, push) — user runs manually or approves

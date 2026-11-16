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
| `projection.js` | Projection tab: seeded earnings simulation (max 3 wins in a row), monthly table, trade log |
| `alerts.js` | Header interval beep (candle-aligned, pre-scheduled on the audio clock) |
| `app.js` | Settings, tabs, theme (dark/light + palettes), checklist, init |

Script load order matters: `calc.js` → `journal.js` → `projection.js` → `alerts.js` → `app.js`.
`calc.js` runs `calc()` at load, before `journal.js` exists, so anything it calls must live in `calc.js` or be guarded (e.g. `todayStr()` lives in calc.js).

## Key Architecture
- No build step — plain HTML + CSS + JS loaded via `<script src>`
- Global scope shared across all 3 JS files (not ES modules)
- `localStorage` keys: `tm_trades`, `tm_settings`, `tm_checklist`
- `window.trades` is set by `loadTrades()` in journal.js, used by calc.js

## Calculator (calc.js)
- **Instrument tabs**: Options / Futures / Equity (replaces old market chips)
- **Symbol autocomplete**: 150+ NSE symbols with lot sizes (NIFTY=75, BANKNIFTY=35, etc.)
- **MIS/NRML toggle**: MIS = 50% margin for futures, 5× leverage for equity
- **Zerodha fees** (single `FEE_RATES` table in calc.js, verified against zerodha.com/charges, Nov 2026; F&O STT per Budget 2026, effective 1 Apr 2026). Re-check when SEBI/NSE revise.
  - Equity delivery: ₹0 brokerage, STT 0.1% buy+sell, NSE 0.00307%, stamp 0.015% buy
  - Equity intraday: min(₹20, 0.03%)/order, STT 0.025% sell, NSE 0.00307%, stamp 0.003% buy
  - Futures: min(₹20, 0.03%)/order, STT 0.05% sell, NSE 0.00183%, stamp 0.002% buy
  - Options: flat ₹20/order, STT 0.15% sell (premium), NSE 0.03553% (premium), stamp 0.003% buy
  - SEBI ₹10/crore; GST 18% on (brokerage + exchange + SEBI)
  - Settings `brokerage` (₹/order cap) and `gstPct` override the defaults; 0 is a valid value
- `orderType` is derived by `applyOrderType()`: equity → from leverage (>1× = MIS), F&O → `foOrderType` (MIS/NRML buttons)
- **Daily risk banner**: warns when daily loss limit or trade count exceeded
- **Fee breakdown**: collapsible Zerodha charges section

## Projection (projection.js)
- Inputs: capital, win rate (max 75%), reward per 1 risked, risk (₹ flat or % of balance = compounds), trades/day, days/month, months, cost/trade, seed. Saved in `tm_proj`.
- Never more than 3 wins in a row (across days and months); losing streaks are deliberately uncapped.
- A forced loss after 3 wins lowers the win rate, so `adjustedP()` solves for a corrected per-trade probability to make the achieved rate match the input. 75% is the mathematical ceiling.
- Seeded PRNG (mulberry32): same seed → same result. Also shows P10/median/P90 over 200 other seeds.
- Always shows a "projection, not a promise" warning. Keep it.

## Interval beep (alerts.js)
- Header widget. Beeps align to candle closes: NSE anchor 9:15 (10m → 9:25, 9:35…, 1h → 10:15…) or clock :00 for MCX/crypto. Optional Mon–Fri 9:15–15:30 window.
- Next ~2 min of beeps are scheduled on the Web Audio clock so a throttled background tab still beeps on time.
- Config in `tm_alert`. Needs one click (Start) to unlock audio; does not auto-resume after reload.
- Audio unlock: browsers block sound until the page is clicked. alerts.js creates/resumes the AudioContext on the first click/key anywhere (`unlockOnFirstInteraction`), Start plays a confirmation beep 1 s later, and scheduling waits while the context isn't `running` (its clock freezes when suspended). If the browser still refuses, the UI says so and Start does not begin.

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



## Interface levels (Quick / Trader / Pro)
- Header drop-down (`#lvl_btn`) picks how much of the app is visible. Levels are nested: Quick ⊂ Trader ⊂ Pro. Saved as `uiLevel` in `tm_settings`; default Trader. A tiny inline script in `<head>` sets `<html data-ui>` before first paint.
- Visibility is CSS only: tag an element `data-level="trader"` (shown at Trader and Pro) or `data-level="pro"` (Pro only). `data-level="below-pro"` is the inverse (hint text). Untagged = shown at every level. Rules are at the end of styles.css.
- **When you add a feature, decide its level and tag it.** Rule of thumb: Quick = what you need for each single trade; Trader = daily toolkit (targets, fees, symbols, filters, tags, import); Pro = F&O, projection, checklist, partial exits, theme presets, custom fees.
- Quick keeps: entry / stop / risk (₹) / target (R:R) + the options toggle, result tiles, one-click Log (even if the quick-log setting is off), today's list, journal list + calendar + Add Trade + Export, Beep (and its settings), theme and colours, trading defaults.
- Safety is never hidden: the daily-loss banner and any saved risk rules apply at every level.
- `setLevel()` (app.js) resets state owned by features that just became hidden (F&O mode, index symbol, flat-₹ risk, leverage, target R:R, symbol, journal filters) so a hidden control can't silently change results. Projection links redirect to `#journal` below Pro.

## Options toggle and lot size (all levels)
- Trade Setup has an **Options** toggle (`#optToggle`). On: sizing is in lots, a `1 lot = [65]` field (`#i_lot`) appears, and Entry/SL are option premiums. Default lot is 65 (`DEFAULT_LOT`, Nifty). The field is editable and the last value you type is remembered (`lotSize` in `tm_settings`); the toggle state is remembered too (`optionsOn`).
- Picking a symbol (or switching to options/futures) auto-fills that symbol's lot from `SYMBOLS` (`autoLot`). `getLotSize()` reads `#i_lot`. Below Pro, picking an index like NIFTY switches to options; at Pro it switches to futures.
- Index lot sizes verified against NSE circulars effective 30 Dec 2025: NIFTY 65, BANKNIFTY 30, FINNIFTY 60, MIDCPNIFTY 120. Stock lots and SENSEX/BANKEX are NOT verified and may be stale; the editable field covers that. Per-lot margins in `SYMBOLS` are rough estimates.
- **Journal quantity:** one-click log stores `qty` = lots × lot size (real units) plus `lots` and `lotSize` for display, because P&L is `(exit - entry) × qty`. Trades logged before this change stored lots in `qty` and understate P&L.
- Quick shows only: Entry, SL, Risk (flat ₹, `#i_flat`), Target (R:R, `#i_rr`) and the Options toggle. Capital (default from Settings) is hidden, and Quick forces flat-₹ risk.

## Pages & routing
- 3 top tabs: Calc, Journal, Settings. Projection is a view inside Journal (`#jnl_projection`, opened by the 🎯 button, `#jnl_main` is the trade list).
- Hash routes: `#calc` (home), `#journal`, `#journal/projection`, `#settings`. Use `switchTab(tab, sub)` (app.js). It updates the URL and renders synchronously; `hashchange` handles back/forward and typed links.
- Beep configuration lives in Settings → Interval Beep (sound, lead time, volume, alignment, hours). The header 🔔 popover only has interval chips, Start/Stop and Test.

## Performance notes (measured)
- calc() ≈ 0.03 ms, projection ≈ 2 ms (88 ms at 55,800 trades). No need to optimise these.
- Journal reports build trade rows lazily (`repTradeRow`, `repDays`) when a day is first expanded: 1,920 trades = ~5k DOM nodes instead of ~43k. Keep it that way; don't pre-render hidden rows.
- Event handling for report buttons is delegated on `#rep_body` (bind once, not per render).

## Colours
- Default accent is **Calm Blue** (neutral, and it doesn't compete with the green/red used for profit and loss). Warm accents feel more urgent.
- Tokens: `--accent` (text, borders), `--accent-solid` + `--on-accent` (fills that carry text; `bestOn()` in app.js picks black/white for contrast), `--warn` (warnings stay amber whatever the accent is).
- Never hard-code `color:#000` on an accent background; use `--on-accent`. Keep green/red for P&L only.

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

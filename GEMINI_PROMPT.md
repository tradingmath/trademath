# TradeMath — Project Briefing for AI Assistant

## What is this project?
TradeMath is a **trade position sizing calculator + trade journal** for Indian retail traders (NSE/BSE/MCX).
Live site: https://trademath.in (hosted on Hostinger; Netlify is no longer used)
GitHub: https://github.com/tradingmath/trademath.git

---

## IMPORTANT RULE — READ FIRST
**Never push to GitHub or deploy unless I explicitly say "deploy".**
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
| `projection.js` | Projection tab — seeded earnings simulation, never more than 3 wins in a row, monthly table, trade log |
| `alerts.js` | Header interval beep — candle-aligned (NSE 9:15 or clock), pre-scheduled on the audio clock |
| `app.js` | App shell — settings, tab switching, theme, checklist, init |

Script load order matters: calc.js, journal.js, projection.js, alerts.js, app.js, cloud.js, profile.js. calc.js runs `calc()` at load
before journal.js exists, so anything it calls must live in calc.js or be guarded.

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

### Zerodha Fee Calculation (`calcFees` function)
Accurate per segment:
Rates live in one `FEE_RATES` table in calc.js. Verified against zerodha.com/charges (Nov 2026).
F&O STT was raised by Budget 2026, effective 1 Apr 2026. Re-check these if SEBI/NSE revise.
```
Equity Delivery:  brokerage=₹0,              STT=0.1% buy+sell, NSE=0.00307%, stamp=0.015% buy
Equity Intraday:  brokerage=min(₹20,0.03%),  STT=0.025% sell,   NSE=0.00307%, stamp=0.003% buy
Futures:          brokerage=min(₹20,0.03%),  STT=0.05% sell,    NSE=0.00183%, stamp=0.002% buy
Options (buy):    brokerage=₹20 flat,        STT=0.15% sell,    NSE=0.03553% (on premium), stamp=0.003% buy
GST 18% on (brokerage + exchange + SEBI fee)
SEBI fee: ₹10 per crore (0.0001%) all segments
```
Settings `brokerage` (₹ per order) and `gstPct` override the defaults; 0 is a valid value.

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
| `tm_alert` | beep settings; `tm_proj` projection inputs |
| `tm_trades_corrupt` / `tm_prerestore` / `tm_last_backup` | rescue copy of unreadable data / copy kept before a restore / last backup time |

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
3 tabs: **Calc** / **Journal** / **Settings**. Projection is a view INSIDE the Journal tab (the 🎯 Projection button in the Journal header), not a top-level tab.
(Analytics tab was removed — do not re-add `renderAnalytics`.)

### Routing (every page has its own link)
`#calc` (home), `#journal`, `#journal/projection`, `#settings`, `#profile`. Hash routes, so they work on the live host, localhost and file://. Navigate with `switchTab(tab, sub)` in app.js (never toggle `hidden` on tabs directly); back/forward buttons work via `hashchange`.

### Projection rules (do not break)
- Max 3 wins in a row across the whole simulation; losing streaks are deliberately NOT capped.
- A forced loss after 3 wins lowers the win rate, so `adjustedP()` corrects the per-trade probability. Win rate is capped at 75% (the mathematical ceiling).
- Seeded PRNG: same seed gives the same result. Always keep the "projection, not a promise" warning visible.
Tab switching handled by `switchTab(name)` in app.js.

---

## Deploy Command
```bash
cd C:\Users\Anirudh\Desktop\trademath
git add -A
git commit -m "your message here"
git push origin main
```
Hostinger deploys the main branch from GitHub on push (hPanel, Deploy from Git). api/config.php is untracked and lives only on the server.

---

## How to make changes
1. Edit the specific file (index.html / styles.css / calc.js / journal.js / app.js)
2. Test locally by opening index.html in browser
3. When I say "deploy" → run the git commands above

## Interface levels (Quick / Trader / Pro)
- Header drop-down (`#lvl_btn`) picks how much of the app is visible. Levels are nested: Quick ⊂ Trader ⊂ Pro. Saved as `uiLevel` in `tm_settings`; default Trader. A tiny inline script in `<head>` sets `<html data-ui>` before first paint.
- Visibility is CSS only: tag an element `data-level="trader"` (shown at Trader and Pro) or `data-level="pro"` (Pro only). `data-level="below-pro"` is the inverse (hint text). Untagged = shown at every level. Rules are at the end of styles.css.
- **When you add a feature, decide its level and tag it.** Rule of thumb: Quick = what you need for each single trade; Trader = daily toolkit (targets, fees, symbols, filters, tags, import); Pro = F&O, projection, checklist, partial exits, theme presets, custom fees.
- Quick keeps: entry / stop / risk (₹) / target (R:R) + the options toggle, result tiles, one-click Log (even if the quick-log setting is off), today's list, journal list + calendar + Add Trade + Export, Beep (and its settings), theme and colours, trading defaults.
- Safety is never hidden: the daily-loss banner and any saved risk rules apply at every level.
- `setLevel()` (app.js) resets state owned by features that just became hidden (futures, index symbol, flat-₹ risk, leverage, target R:R, symbol, journal filters) so a hidden control can't silently change results. Projection links redirect to `#journal` below Pro.

## Options toggle and lot size (all levels)
- Trade Setup has an **Options** toggle (`#optToggle`). On: sizing is in lots, a `1 lot = [65]` field (`#i_lot`) appears, and Entry/SL are option premiums. Default lot is 65 (`DEFAULT_LOT`, Nifty). The field is editable and the last value you type is remembered (`lotSize` in `tm_settings`); the toggle state is remembered too (`optionsOn`).
- Picking a symbol (or switching to options/futures) auto-fills that symbol's lot from `SYMBOLS` (`autoLot`). `getLotSize()` reads `#i_lot`. Below Pro, picking an index like NIFTY switches to options; at Pro it switches to futures.
- Index lot sizes verified against NSE circulars effective 30 Dec 2025: NIFTY 65, BANKNIFTY 30, FINNIFTY 60, MIDCPNIFTY 120. Stock lots and SENSEX/BANKEX are NOT verified and may be stale; the editable field covers that. Per-lot margins in `SYMBOLS` are rough estimates.
- **Journal quantity:** one-click log stores `qty` = lots × lot size (real units) plus `lots` and `lotSize` for display, because P&L is `(exit - entry) × qty`. Trades logged before this change stored lots in `qty` and understate P&L.
- Quick shows only: Entry, SL, Risk (flat ₹, `#i_flat`), Target (R:R, `#i_rr`) and the Options toggle. Capital (default from Settings) is hidden, and Quick forces flat-₹ risk.

## Settings are staged (Save + confirm)
- Controls on the Settings page only edit a draft. Nothing is written or applied until the user presses **Save changes** and confirms in the dialog (it lists old → new). Discard reverts. A sticky bar shows "N unsaved changes" and the Settings tab gets a dot. `beforeunload` warns if there are unsaved changes.
- All of this is the `SETTINGS_FIELDS` table in app.js (one row per setting: scope, key, label, default `fb`, `get()` reads the draft, `set()` fills the control, `fmt()` for the confirmation). **To add a setting: add the control in index.html and one row to `SETTINGS_FIELDS`.** Do not call `saveSetting()` from a Settings control; `saveSetting()` is only for state that is not on the page (lot size, level, options toggle).
- Beep settings are staged too; they are stored by alerts.js (`tmAlert.getConfig()` / `tmAlert.setConfig()`). The header 🔔 menu's interval chips are a live control and save immediately. Sound/volume previews in Settings play without saving (`tmAlert.preview(override)`).
- Theme (dark mode, base theme, accent) is NOT previewed on the Settings page; it applies on confirm. The header ☀/☾ button is a separate live toggle.

## Trade data model (the same for Quick, Trader and Pro)
- Every trade has: `market` (one of `MARKETS` in calc.js: NSE Equity, Nifty F&O, BankNifty F&O, Stock F&O, Other Index F&O, MCX Gold, MCX Crude, Crypto, Other), `symbol` (optional), `instrument` ("equity" | "options" | "futures"), `optType` ("CE" | "PE" | null), plus `qty` (real units), `lots`, `lotSize`.
- `deriveMarket(sym, instr)` (calc.js) decides the market: a known symbol wins; otherwise the **"I mainly trade"** setting (`defaultMarket`, Settings → Trading Defaults) adjusted for the Options toggle. This is how a Quick log (no symbol box) still lands in the right market.
- Never store a symbol or "Options (CE)" in `market`. `normalizeTrade()` (journal.js) repairs older trades on load. All market dropdowns are filled from `MARKETS` by `fillMarketSelects()`; do not hard-code option lists in HTML.
- Any trade can be tidied later with the ✎ button (Today's list and journal rows): market, symbol, setup, notes. A known symbol auto-picks its market.
- Zerodha import uses `contractInfo(symbol, exch)`. Option symbols end in digit + CE/PE and futures in digit + MON + FUT (a bare "CE"/"PE" ending is not enough: RELIANCE ends in CE).

## Crypto perpetuals (all levels)
- A **Crypto** toggle sits next to Options (mutually exclusive; remembered as `cryptoOn`). On: Entry/SL are typed in **USDT**, Risk stays in **₹**, and two fields appear: Leverage × (`#i_lev`, default 10, remembered as `cryptoLev`) and `1 USD = ₹` (`#i_fx`, default 88, remembered as `usdInr`). `instrType === "crypto"`; `deriveMarket` always returns "Crypto".
- Sizing (`sizeCrypto` in calc.js): coins = (risk ₹ / fx) / SL distance, rounded DOWN to 4 decimals. Notional = coins × entry × fx. Margin = notional / leverage (isolated estimate). Liquidation estimate: long `entry × (1 - 1/lev + mmr)`, short `entry × (1 + 1/lev - mmr)`; a warning shows if liquidation comes before the stop.
- Fees: taker % on entry and exit notional + GST on fees, all editable in Settings → Crypto Fees (`cryptoTaker` 0.05, `cryptoGst` 18, `cryptoFunding` 0.01 per 8h, `cryptoMmr` 0.5). These are typical defaults, NOT verified for any exchange. Funding is shown as an estimate per 8h and is not included in the target net. Tax is deliberately ignored.
- Journal: a crypto trade stores `instrument:"crypto"`, `ccy:"USDT"`, `fx` (rate at logging), `leverage`, `liq`, `qty` in coins, prices in USDT. `pnlForTrade` converts with `fxOf(t)`; `fees` and `funding` are in ₹. Closing a crypto trade auto-fills fees (round-trip taker + GST at the trade's fx) unless you type your own, and has a Funding (₹) field. The ✎ editor can change leverage and USD/INR.
- Older trades with market "Crypto" but no `instrument` are treated as plain ₹, on purpose (no surprise conversion).
- `fmtP` now puts commas on the whole part only; `fmtUsd` formats prices (2 decimals ≥ 1000, up to 4 below, up to 6 below 1, trailing zeros trimmed).

## Data safety (calc.js `tmSet`, journal.js)
- **Every write goes through `tmSet(key, value)`** (calc.js, loaded first). It returns false and shows a persistent red banner if the browser refuses to store (full, blocked, private window). Never call `localStorage.setItem` directly.
- **Escape on render, sanitise on load.** `normalizeTrade` forces ids (`[\w-]`), dates (`YYYY-MM-DD`), symbols, option type, currency and numeric fields into safe shapes; every user-supplied string drawn into `innerHTML` goes through `esc()` (app.js). `leverage` is NOT numeric (futures store "MIS"/"NRML").
- **Unreadable journal:** if `tm_trades` is not a valid array (or has entries without LONG/SHORT), the raw text is kept in `tm_trades_corrupt` and a banner offers a download. It is never silently overwritten.
- **Delete has Undo:** `deleteTrade(id)` removes then shows a toast with an Undo button (`showToast(msg, {label, fn})`). Today list and Journal report share it.
- **Backup / restore** (Settings → Your data): `buildBackup()` = `{app:"TradeMath", version:1, trades, settings, checklist, alert, projection}`. Restore validates the file, asks to confirm, stores the current data in `tm_prerestore` first, then reloads. `tm_last_backup` holds the last download time.

## Futures, lot sizes and margins
- The Pro F&O tab bar is gone. Options (Trader+) and Futures (Pro) are separate toggles beside Crypto; `instrType` is one of equity / options / futures / crypto and only one is on. `rememberInstr()` saves `optionsOn` / `futuresOn` / `cryptoOn`. Below Pro, `setLevel()` switches futures back to equity. MIS/NRML only appears for futures.
- `SYMBOLS[].verified:true` marks lot sizes checked against the exchange list (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY). All other lot sizes show as "~N" / "approx." with a warning, and futures margin is always labelled approximate. Do not add `verified` without checking the exchange circular.

## Themes and beep
- Accent colours: Blue (default), Violet, Amber, Slate. Dark themes: Midnight, OLED. Old saved values fall back in `getAppSettings()`.
- The beep **interval** (chips + custom minutes) is chosen only in the header 🔔 menu. Settings holds align / lead / sound / volume / hours and a Test button that previews unsaved choices.

## Optional account + cloud sync (api/*.php, cloud.js)
- Needs the Hostinger PHP + MySQL host. On a static host without PHP `api/me.php` is missing, so the Settings section stays hidden and the app is unchanged.
- Setup on the server (not in git): create a MySQL DB in hPanel, import `api/schema_mysql.sql`, copy `api/config.sample.php` to `api/config.php` and fill it in. **`api/config.php` is in .gitignore; never commit it.** `dev_return_code` must stay `false` on the real site.
- Sign-in = emailed 6-digit OTP (HMAC-hashed, 10 min, 5 tries, single use, rate limited per IP and per email). Session = random 256-bit token in an HttpOnly SameSite=Lax cookie; only its SHA-256 is stored.
- POST endpoints require header `X-TM: 1` and a matching Origin (no CORS). Cloud copy = one versioned backup JSON per user (<= 2 MB); stale uploads get HTTP 409 and the user picks which side wins. `tmSet()` calls `tmCloudDirty(key)`, which uploads ~20 s after a change.
- **Google sign-in** (`api/google_login.php`): the page loads Google's script only when the sign-in window opens, and posts the ID token to the server. The server checks the RS256 signature against Google's certificates (`google_certs()`, cached 1 h, re-fetched once if the key id is new), `aud` = `google_client_id`, `iss`, expiry and `email_verified`, then calls `sign_in_user()` (shared with the email-code route, so both reach the same account). Needs `google_client_id` in `api/config.php` (public value, from Google Cloud Console → OAuth Web client, authorised origin `https://trademath.in`); leave it empty to hide the button. Sign-in UI is the `#authModal` window in index.html, driven by cloud.js.
- Local testing: PHP 8.3 + SQLite (`pdo_sqlite`), `php -S 127.0.0.1:8766`, config with `dev_return_code: true`.

## Profile, welcome setup, tour, demo (profile.js)
- Avatar button + account menu in the header (`#avatarBtn`, `#acctMenu`); signed out it is the **Sign in** button. **Profile** is its own page (`#profile`, `#tab-profile`): trading capital, risk %, target R:R, trading style, "I mainly trade", name, experience level (=interface level), daily loss / max trades, cloud sync (`#account_sec`). Those fields keep their old ids (`s_default_*`, `s_max_*`) and **save by themselves** (not staged); they are no longer in `SETTINGS_FIELDS`.
- **Welcome setup** (5 optional steps, Skip everywhere, Skip keeps defaults and live-previewed look is reverted) opens after a first sign-in when `settings.onboarded` is not set; `settings.onboarded` syncs with the account.
- **Tour**: spotlight steps with Skip (`tm_tour_done` / `tm_tour_dismissed` in localStorage). **Demo data**: trades with `demo:true`, shown with a bar, removed with one click, never included in `buildBackup()` or the cloud copy.

## Journal log and Add to position (journal.js)
- The journal log is a six-column table (Trade, Entry to Exit, Quantity, Profit/loss, Result, actions) built by `repTradeRow`; the table scrolls sideways inside `.rep-scroll` on phones. Month and day rows use `colspan` for those six columns.
- **Add to position** (`openAddModal`, `#addModal`): for an OPEN trade, a later buy keeps ONE position. `entry` becomes the weighted average, `qty` the total (`lots` too for options), the original is kept in `entry0`/`qty0`, every extra buy in `t.adds[]` (`{date, price, qty, fees}`), and charges on extra buys in `t.entryFees`, which `pnlForTrade` subtracts. A shown preview gives the new average, total invested, risk to stop-loss and warns when the buy is against the position. Undo restores the exact previous trade.
- The Symbol field in the Add Trade form shows at every level.
- **Do not edit these files with PowerShell `Get-Content`/`Set-Content`** (PowerShell 5.1 re-encodes UTF-8 and corrupts the rupee sign and other symbols). Use Python with `encoding="utf-8"`.

## Security and speed (read before deploying)
- **Before every deploy run `python tools/stamp_assets.py`.** It adds `?v=<hash>` to every local .js/.css link, because `.htaccess` lets scripts, styles and fonts be cached for a year. Re-run it after regenerating guide pages (the generator lives outside the repo) or editing any asset.
- `.htaccess` sends: HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, COOP `same-origin-allow-popups` (needed for the Google popup), and a **Content-Security-Policy** (only our own files plus Google's sign-in; `'unsafe-inline'` is still needed for inline handlers). If a new third-party script, font or image host is added, the CSP must be updated or it will be blocked.
- Fonts are **self-hosted** (`fonts.css`, `fonts/`); no Google Fonts request. ₹ in Inter text falls back to the system font on purpose (the Inter latin-ext file is 85 KB).
- **Cloud copies are compressed (gzip) and encrypted (AES-256-GCM)** before they reach MySQL (`pack_data` / `unpack_data` in api/_lib.php). Key = `data_key` in api/config.php (falls back to `secret`). **Never change or lose `data_key` once users have saved data: their copies could no longer be opened.** Old plain or `gz:` rows still read fine.

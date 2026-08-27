# StockSense AI — External Dependencies (set these up to fully activate Level-1)

_Last updated: 2026-08-27_

All Level-1 PRD (v3.0) features are now **built in code**. Several run on a graceful
fallback until an external credential is supplied. This file lists every such
credential: what it unlocks, how to get it, where to put it, and what happens
without it.

Nothing here blocks the app — it boots and works with **zero** of these set. Each
one switches a fallback into its real implementation.

---

## Where credentials go

| Environment | File / place | Notes |
|-------------|--------------|-------|
| Local dev   | `server/.env` | copy from `server/.env.example`; never commit |
| Production  | Render dashboard → `stocksense-ghq8` service → **Environment** | redeploy after changing |

After adding keys locally, restart `npm run dev`. On Render, a redeploy picks them up.

---

## 1. Anthropic (Claude) API key — **highest impact**

- **Env var:** `ANTHROPIC_API_KEY`
- **Cost:** ~₹9–12 / month (PRD §10 budget — Claude Haiku 4.5, with prompt caching)
- **Get it:** https://console.anthropic.com → Settings → API Keys → *Create key*. Add a small credit balance.

**Unlocks (4 features, all currently on fallback):**

| Feature | PRD ref | Without the key (now) | With the key |
|---|---|---|---|
| "Why buy now" explanation text | §3.4 | Rule-based template, grounded in the real evidence numbers | Claude-written 3–5 sentence explanation |
| News-intelligence score (20% scoring layer) | §5.3 #2 | Neutral 50, `pending:true` | Real 0–100 sentiment from recent news |
| Fallen-angel gate 3 ("drop is external, not business") | §2.3 | Gate stays `pending`, doesn't block | AI classifies the drop; blocks a signal if the drop is business deterioration |
| Catalyst-countdown dated-event extraction | §2.2 | **No catalyst signals generated at all** | Claude pulls "FDA decision in 9 days" style dated events out of news text |

> The news-intelligence layer and catalyst detector **also** need NewsAPI (#2) —
> Claude classifies/scores the articles that NewsAPI supplies.

**Code touch points:** `server/src/services/ai/*` (`client.js`, `explainSignal.js`,
`newsSentiment.js`, `classifyDrop.js`, `extractCatalystEvent.js`).

---

## 2. NewsAPI.org key

- **Env var:** `NEWS_API_KEY`
- **Cost:** Free tier — 100 requests/day (enough for ~30 tracked stocks once/day)
- **Get it:** https://newsapi.org/register → confirm email → copy the API key from the dashboard.

**Unlocks** (needs Anthropic key #1 too, to interpret the articles):

| Feature | PRD ref | Without it | With it |
|---|---|---|---|
| Catalyst-countdown detector (5th signal type) | §2.2 | Not generated | Runs: dated event 7–14 days out + RSI < 65 + FII/DII accumulation |
| Catalyst 7-day / 1-day held-position alerts | §8 | Never fire (no catalyst signals exist) | Fire from `catalystDate` on the position |
| News-sentiment scoring layer | §5.3 #2 | Neutral 50 | Real sentiment |
| Fallen-angel "external drop" gate | §2.3 | Pending | Evaluated |
| Morning re-score news re-scan | §5.2 | Skipped | Re-scores sentiment pre-open, adjusts confidence |

**Free-tier caveat:** NewsAPI's free plan only returns articles up to ~1 month old
and blocks some params on `/v2/everything`. Fine for this use. If you hit the
100/day limit, reduce the tracked-symbol list or cache.

**Code touch points:** `server/src/services/marketData/newsApi.js`,
`server/src/services/detectors/catalystCountdown.js`.

---

## 3. WhatsApp API (alert delivery)

Notifications go out over **WhatsApp**. Two providers are supported — set
`WHATSAPP_PROVIDER` and fill the matching block. `WHATSAPP_TO` (recipient number,
digits-only E.164 e.g. `919812345678`) is required for both.

### Option A — WhatsApp Cloud API (Meta) — `WHATSAPP_PROVIDER=cloud` (default)

- **Env vars:** `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TO`,
  optional `WHATSAPP_TEMPLATE_NAME` + `WHATSAPP_TEMPLATE_LANG`
- **Cost:** free within Meta's monthly service-conversation allowance
- **Get it:**
  1. https://developers.facebook.com → create an app → add the **WhatsApp** product.
  2. **API Setup** page → copy the **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`) and a
     token (`WHATSAPP_ACCESS_TOKEN`). The auto-generated token is 24h — for production,
     create a **System User** with a permanent token (Business Settings → Users → System users).
  3. `WHATSAPP_TO` = your WhatsApp number in digits-only E.164 (`91XXXXXXXXXX`).
  4. **Message templates:** business-initiated messages sent *outside* the 24-hour
     customer-service window must use a pre-approved template. Create one under
     **WhatsApp Manager → Message templates** with a single body variable `{{1}}`,
     then set `WHATSAPP_TEMPLATE_NAME` to its name. Leave `WHATSAPP_TEMPLATE_NAME`
     blank to send free-form text (only works within 24h of you messaging the number — fine for testing).

### Option B — Twilio WhatsApp — `WHATSAPP_PROVIDER=twilio`

- **Env vars:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `WHATSAPP_TO`
- **Cost:** free Twilio trial + the WhatsApp **sandbox** (no template approval needed for the sandbox)
- **Get it:**
  1. https://console.twilio.com → copy **Account SID** + **Auth Token**.
  2. Messaging → **Try WhatsApp** → join the sandbox (send the given code to the Twilio number
     from your phone). `TWILIO_WHATSAPP_FROM` = the sandbox number, e.g. `whatsapp:+14155238886`.
  3. `WHATSAPP_TO` = your number, digits-only E.164.

**Unlocks:** every alert type (§8) is delivered to your WhatsApp. Without it, alerts
are still written to the in-app **Alerts** screen and the DB — only the push send is
skipped (logged instead).

**Code touch points:** `server/src/services/whatsapp/client.js`,
`server/src/services/alerts/createAlert.js`.

---

## 4. Angel One SmartAPI account

- **Env vars:** `ANGEL_ONE_API_KEY`, `ANGEL_ONE_CLIENT_CODE`, `ANGEL_ONE_PASSWORD`, `ANGEL_ONE_TOTP_SECRET`
- **Cost:** Free (needs an Angel One demat/trading account — doesn't have to be your main broker)
- **Get it:**
  1. Open an Angel One account (if you don't have one).
  2. Go to https://smartapi.angelone.in → *Create an App* (type: Market Feeds / Trading) → copy the **API key**.
  3. `ANGEL_ONE_CLIENT_CODE` = your Angel One login ID.
  4. `ANGEL_ONE_PASSWORD` = your account **PIN**.
  5. `ANGEL_ONE_TOTP_SECRET` = the base32 secret shown when you enable TOTP 2FA
     (the string behind the QR code), **not** a 6-digit code.

**Unlocks:**

| Feature | Without it (now) | With it |
|---|---|---|
| Live **intraday** price for the position poll | Poll uses the last stored **daily close** | True intraday last-traded price every 5 min |
| India VIX | Already works — pulled from Yahoo Finance (`^INDIAVIX`) | Same value, live intraday tick instead of EOD |
| Pre-market levels for the 9:20 AM entry-window refresh | Uses latest close as the proxy | Real pre-market ticks |

> Lower priority than #1–#3: daily prices, VIX, and macro all already work without it.
> This mainly sharpens intraday alerting.

**Code touch points:** `server/src/services/marketData/angelOne.js` (client is
written and tested-shaped; not yet wired as the preferred price source — see
"Follow-up wiring" below).

---

## 5. SMTP credentials (password-reset emails)

- **Env vars:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- **Cost:** Free with a Gmail app password, or any SMTP provider
- **Get it (Gmail):** Google Account → Security → 2-Step Verification → **App passwords**
  → generate one → use your address as `SMTP_USER`, the 16-char app password as `SMTP_PASS`,
  `smtp.gmail.com` / `587` / `SMTP_SECURE=false`.

**Unlocks:** the forgot-password email is actually sent. Without it, the reset link
is written to the server log (the flow still works end-to-end for a solo user).

**Code touch points:** `server/src/services/email/mailer.js`,
`server/src/routes/auth.js`.

---

## 6. `TRACKED_SYMBOLS` (optional tuning, no account needed)

- **Env var:** `TRACKED_SYMBOLS` — comma-separated NSE tickers, e.g. `BHEL,SUNPHARMA,HAL,SBIN`
- Overrides the built-in default universe (`server/src/services/marketData/trackedSymbols.js`).
  User watchlist + active-signal symbols are always unioned on top.
- Keep the count near ~20–30 to stay inside the NewsAPI free-tier 100/day limit
  (each symbol = ~1 news call per scan).

---

## Priority order

1. **Anthropic key** (#1) + **NewsAPI key** (#2) — together these light up the entire
   news/AI half: catalyst signal type, catalyst alerts, news scoring layer,
   fallen-angel gate 3, live "why buy now" text, morning news re-scan.
2. **WhatsApp** (#3) — makes alerts reach your phone.
3. **Angel One** (#4) — sharpens intraday price/alert accuracy.
4. **SMTP** (#5) — only matters if others will use the app and self-serve resets.

---

## Follow-up wiring (code TODOs, no credential needed — do when the keys arrive)

- **Angel One as preferred price source:** `angelOne.getLtp()` is built but the
  position poll (`services/positions/syncPrices.js`) still reads `PriceHistory`.
  When Angel One creds exist, prefer `getLtp()` and fall back to the stored close.
  Needs the per-symbol Angel One instrument token map (a static CSV from Angel One).
- **Per-stock FII/DII:** PRD §5.3 #5 wants per-stock institutional flow; no free
  source exists, so the code uses the market-wide net figure as a proxy and vetoes
  on a heavy market-wide outflow. Revisit only if a paid feed is added.
- **Earnings "beat estimates":** PRD §2.4 wants analyst-consensus beats; no free
  NSE source. Code uses a YoY sales+profit growth proxy. Same — revisit with a
  paid data feed.
- **NSE bhavcopy:** blocked by NSE bot-detection from cloud IPs. Yahoo Finance is
  the daily-price source instead. May work from a residential IP.

---

## Quick verification after adding keys

```bash
cd server

# 1. news + AI pipeline (should print real sentiment / catalyst lines, not "unavailable")
npm run scan:detectors

# 2. full signal generation with AI explanations
npm run generate:signals

# 3. WhatsApp — generate a signal for a watched stock, confirm a message lands on your phone

# 4. accuracy backtest (no keys needed, needs ~2y price history from `npm run ingest:prices`)
npm run backtest

# 5. paper-trading scorecard
npm run cron:paper      # then GET /api/paper
```

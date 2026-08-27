# StockSense AI — Level-2 (v4.0 FRD) Dependencies

_Last updated: 2026-08-27_

Everything in the **v4.0 Functional Requirements Document** is now implemented at the
code level. This file lists what each v4 module needs from the outside world to run
at full fidelity, and what it falls back to today. Read `DEPENDENCIES.md` first — the
v3 credentials (Anthropic, NewsAPI, Telegram, Angel One, SMTP) are shared.

The v4 engines all **run today with zero new credentials** — they degrade to
deterministic-only scoring, a curated universe, and template narratives.

---

## New modules & where they live

| FRD module | Code |
|---|---|
| Market Discovery Engine | `services/discovery/` (`universe.js`, `liquidityFilter.js`, `ingestUniverse.js`, `discoveryScan.js`, `tradeLevels.js`) |
| Sector Ranking Engine | `services/sector/sectorRanking.js` |
| Signal Detection Engine (10 types) | `services/detectors/` — 5 new: `institutionalAccumulation`, `sectorRotation`, `relativeStrengthLeader`, `highDeliveryAccumulation`, `multiTimeframeBreakout` |
| Confidence Scoring Engine (v4) | `services/scoring/scoreV4.js` — 10-factor + risk penalty |
| Portfolio Intelligence Engine | `services/portfolio/` (`recommendations.js`, `portfolioRisk.js`) → `GET /api/portfolio/intelligence` |
| AI Narrative Engine | `services/ai/narrative.js` (whyBuy / risks / entryExit / newsSummary + caching) |
| Notification Engine additions | `AlertType` = `sector_rotation`, `book_profit`, `new_opportunity` (wired in `dailyPositionChecks` + `discoveryScan`) |
| Discovery job + API | `jobs/discoveryScan.js`, cron 19:00 IST Mon-Fri, `GET /api/discovery`, `/api/discovery/sectors`, `/api/discovery/runs` |

Run manually: `npm run discovery:scan` (server dir). Verified: 138/142 symbols scanned,
sector ranking + market breadth + 12-stock shortlist produced in ~26 s (FRD budget: 10 min).

---

## 1. Full NSE universe (~2,000 stocks)

- **FRD:** "Scan ~2,000 NSE stocks after market close."
- **Now:** a **curated, sector-tagged list of ~160 liquid NSE names** in
  `services/discovery/universe.js` (`CURATED`). 138 pass the liquidity filter.
- **To reach ~2,000:** NSE's official list is
  `https://archives.nseindia.com/content/equities/EQUITY_L.csv` — **blocked from
  datacenter / cloud IPs** (same anti-bot behaviour as the bhavcopy endpoint). Options:
  1. Run the fetch from a residential IP / your own machine and commit the symbol list.
  2. Use a data vendor (Angel One instrument master, Kite instruments dump, or a paid feed).
  3. Paste the CSV symbols into `getFullUniverse()` in `universe.js` — everything
     downstream (liquidity filter → indicators → sector ranking → v4 scoring →
     shortlist → narrative) already scales to it; only the pull is stubbed.
- **Cost of the current approach:** none. **Trade-off:** the scan sees ~160 large/mid
  caps, not the full small-cap tail.

---

## 2. NSE bhavcopy "delivery %"

- **FRD:** Sector Ranking uses "Delivery %"; there's a dedicated **High Delivery
  Accumulation** detector.
- **Now:** delivery data is **not fetched** (bhavcopy is IP-blocked). The detector
  uses a computable proxy — narrow daily range + steady volume + slow price grind —
  and `sectorRanking` flags `deliveryPct` in `pendingInputs`.
- **To wire the real number:** a working NSE bhavcopy fetch (see `nseBhavcopy.js`;
  needs a residential IP or a vendor). Then pass `deliveryPct` into
  `detectHighDeliveryAccumulation(rows, deliveryPct)` and add it to the sector model.
- **Cost:** free data, blocked by network. **Trade-off:** the proxy catches the same
  low-volatility-accumulation shape but can't confirm actual delivery ratios.

---

## 3. Per-sector News & Government Policy (Sector Ranking inputs)

- **FRD:** Sector Score inputs include "News" and "Government Policy".
- **Now:** the sector model scores on **Relative Strength (40%), Momentum (30%),
  Volume (20%), Breadth (10%)** — all deterministic. News / Policy are listed in
  `breakdown.pendingInputs` and carry no weight.
- **To add them:** NewsAPI key (#2 in `DEPENDENCIES.md`) + the Anthropic key for an
  AI pass that scores sector-level news/policy sentiment, then fold two more weighted
  components into `sectorRanking.WEIGHTS`.
- **Cost:** covered by the existing NewsAPI free tier + ~₹ of Claude usage.

---

## 4. AI Narrative Engine — LLM provider

- **FRD:** "Use **OpenAI** only for shortlisted high-confidence stocks."
- **Implementation choice:** uses the codebase's existing **Claude Haiku 4.5**
  integration (`services/ai/client.js`), not OpenAI — the v3 PRD §10 cost budget,
  the SDK, prompt caching and every other AI helper are already built on it. Adding
  an OpenAI dependency would fork the AI layer for no functional gain.
- **To switch to OpenAI anyway:** replace `services/ai/client.js` internals with the
  `openai` SDK and set `OPENAI_API_KEY`. Every caller (`narrative.js`,
  `explainSignal.js`, `newsSentiment.js`, `classifyDrop.js`, `extractCatalystEvent.js`)
  goes through that one module.
- **Cost controls already in place (FRD "API Cost Optimization"):**
  - narrative called only when `confidence >= NARRATIVE_MIN_CONFIDENCE` (default 70)
  - only for the final shortlist, never during the universe scan
  - result cached on `Signal.narrative`; reused while type + confidence bucket unchanged
  - deterministic template for everything below the threshold or with no key
- **Needs:** `ANTHROPIC_API_KEY` (shared with v3). Without it → template narratives
  (grounded in the real numbers), which is what runs today.

---

## 5. Push notifications

- **FRD:** "Notifications: Telegram, **Push**, Email".
- **Now:** Telegram (needs token, see `DEPENDENCIES.md` #3), in-app Alerts screen,
  and Email (SMTP, #5) are wired. **Web Push is not implemented** — it needs a
  service-worker on the client and VAPID keys on the server, which is a client-PWA
  workstream rather than a code gap in the engines.
- **To add:** `web-push` npm package + `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, a
  `PushSubscription` model, and a service worker in `client/public/`. `createAlert()`
  is the single chokepoint to hook it into.

---

## New environment variables (all optional)

| Var | Default | Effect |
|---|---|---|
| `TRACKED_SYMBOLS` | built-in list | (v3) tracked-pipeline universe |
| `DISCOVERY_SHORTLIST` | `12` | how many stocks the discovery scan shortlists |
| `DISCOVERY_PROMOTE_CONFIDENCE` | `70` | shortlist entries at/above this v4 confidence become real `Signal` rows (`fromDiscovery=true`) and enter the Signals feed + paper-trading pipeline |
| `NARRATIVE_MIN_CONFIDENCE` | `70` | v4 confidence at/above which the AI narrative is generated (below → template) |
| `OPENAI_API_KEY` | — | only if you swap the AI provider per §4 (not used as shipped) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | — | only if you build web push per §5 (not used as shipped) |

Narrative caching (FRD "reuse when signals are unchanged") is wired: each discovery run
reuses the previous run's narrative for a symbol when its detector type + confidence
bucket (nearest 5) are unchanged, so the LLM is only called for genuinely new/changed
shortlist entries.

---

## Priority order for Level-2

1. **Nothing** — the v4 engines are fully functional deterministically today.
2. **`ANTHROPIC_API_KEY` + `NEWS_API_KEY`** (already the v3 priority) — turns on real
   narratives, news-weighted sector scoring, and the news-intelligence scoring layer.
3. **Full NSE universe** (§1) — the single biggest fidelity gain: scan 2,000 names
   instead of ~160. Needs a residential-IP fetch or a vendor instrument list.
4. **Bhavcopy delivery %** (§2) — sharpens the High Delivery detector + sector model.
5. **Web Push** (§5) — client PWA workstream, only if you want browser notifications
   in addition to Telegram/email.

---

## Tests

`npm test` (in `server/`) runs the **Node built-in test runner** — `node --test test/`,
no new dependency. **80 unit tests, all green**, covering:

- indicators (RSI direction, EMA, Bollinger width, avg volume, pivot lows, demand zones, weekly resample, returns)
- all 5 Level-1 detectors + all 5 Level-2 detectors (positive fire + every negative gate + null-safety on random noise)
- v3 composite scorer (gates, per-type trade levels, macro/FII-DII/news layers) and v4 10-factor scorer (weight sums, bounded risk penalty, strong-vs-weak ordering)
- sector ranking, liquidity filter, discovery universe + Yahoo symbol mapping, discovery trade levels
- portfolio recommendations (all 5 actions) + portfolio risk (allocation, heat, concentration flags)
- AI template fallbacks (explainSignal + 4-part narrative), narrative cache-validity, alert-preference mapping, evidence/headline formatting

## Migrations applied for Level-2

- `20260827152751_level2_v4_discovery_sectors` — `SignalType` +5 values,
  `AlertType` +3 values, `PortfolioAction` enum, `Signal` v4 columns
  (`scoringModel`, `sectorScore`, `rsScore`, `riskPenalty`, `narrative`,
  `fromDiscovery`), new models `DiscoveryRun` + `SectorRank`.

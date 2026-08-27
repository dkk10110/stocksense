const { latestRsi } = require('../indicators');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * PRD 2.2 — Catalyst countdown.
 * A dated, upcoming event (regulatory decision, govt order, data release) is 7-14 days away.
 * Current price not already elevated (RSI < 65). FII/DII showing pre-event accumulation.
 *
 * The dated event itself is extracted from news by the AI layer upstream (services/ai/extractCatalystEvent)
 * and passed in as `catalystEvent` — this function does not parse news. If no event was found, it returns null.
 *
 * @param {Array} rows        chronological PriceHistory rows
 * @param {object|null} catalystEvent  { eventDate: Date, label, expectedImpactPct, confidence }
 * @param {object|null} fiiDii  { fiiNetCr, diiNetCr } market-wide flow (per-stock FII isn't in any free source)
 */
function detectCatalystCountdown(rows, catalystEvent, fiiDii, { minDays = 7, maxDays = 14, rsiCeiling = 65 } = {}) {
  if (!catalystEvent || !catalystEvent.eventDate) return null;
  if (rows.length < 30) return null;

  const daysToEvent = Math.ceil((catalystEvent.eventDate - new Date()) / DAY_MS);
  if (daysToEvent < minDays || daysToEvent > maxDays) return null;

  const rsi = latestRsi(rows);
  if (rsi == null || rsi >= rsiCeiling) return null; // price already elevated — pre-event drift priced in

  // "FII or DII showing pre-event accumulation." Per-stock FII/DII flow has no free source, so this
  // uses the market-wide net figure as a proxy: net buying (> +₹200Cr combined) counts as accumulation.
  const netCr = fiiDii && fiiDii.fiiNetCr != null && fiiDii.diiNetCr != null
    ? fiiDii.fiiNetCr + fiiDii.diiNetCr
    : null;
  const fiiDiiAccumulating = netCr != null && netCr > 200;
  if (netCr != null && netCr < -500) return null; // heavy institutional selling vetoes the setup

  const last = rows[rows.length - 1];
  return {
    type: 'catalyst',
    symbol: last.symbol,
    price: Number(last.close),
    catalystDate: catalystEvent.eventDate,
    catalystLabel: catalystEvent.label,
    evidence: {
      catalystLabel: catalystEvent.label,
      catalystDate: catalystEvent.eventDate.toISOString().split('T')[0],
      daysToEvent,
      expectedImpactPct: catalystEvent.expectedImpactPct,
      eventConfidence: catalystEvent.confidence,
      rsi: Math.round(rsi),
      fiiDiiNetCr: netCr != null ? Math.round(netCr) : null,
      fiiDiiAccumulating,
    },
  };
}

module.exports = { detectCatalystCountdown };

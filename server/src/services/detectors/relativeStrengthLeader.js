const { returnPct, closes, highs, latestRsi } = require('../indicators');

/**
 * v4.0 FRD — Relative Strength Leader.
 * Stock's 3-month return beats the NIFTY's by a wide margin (top-decile RS), it's within a
 * few % of its own 52-week high, and it's still making higher highs (uptrend intact, not a
 * blow-off). `rsPercentile` (0-100 vs the scanned universe) is supplied by the discovery scan.
 */
function detectRelativeStrengthLeader(rows, benchRows, rsPercentile, { minPercentile = 85, maxOffHighPct = 6 } = {}) {
  if (rows.length < 130 || !benchRows || benchRows.length < 65) return null;
  if (rsPercentile == null || rsPercentile < minPercentile) return null;

  const stockR63 = returnPct(rows, 63);
  const benchR63 = returnPct(benchRows, 63);
  if (stockR63 <= benchR63 || stockR63 <= 0) return null;

  const c = closes(rows);
  const price = c[c.length - 1];
  const high52w = Math.max(...highs(rows).slice(-252));
  const offHighPct = ((high52w - price) / high52w) * 100;
  if (offHighPct > maxOffHighPct) return null;

  // higher highs: last 10-day high above the prior 20-day high
  const last10High = Math.max(...highs(rows).slice(-10));
  const prior20High = Math.max(...highs(rows).slice(-30, -10));
  if (last10High <= prior20High) return null;

  const rsi = latestRsi(rows);
  if (rsi == null || rsi > 78) return null; // leave room; not a parabolic top

  const last = rows[rows.length - 1];
  return {
    type: 'rs_leader',
    symbol: last.symbol,
    price: Number(price.toFixed(2)),
    evidence: {
      rsPercentile: Math.round(rsPercentile),
      return3mPct: Number(stockR63.toFixed(1)),
      benchReturn3mPct: Number(benchR63.toFixed(1)),
      outperformancePct: Number((stockR63 - benchR63).toFixed(1)),
      offHighPct: Number(offHighPct.toFixed(1)),
      rsi: Math.round(rsi),
    },
  };
}

module.exports = { detectRelativeStrengthLeader };

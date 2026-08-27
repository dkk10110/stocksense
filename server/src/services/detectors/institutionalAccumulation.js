const { closes, volumes, avgVolume, latestRsi, priorLow } = require('../indicators');

/**
 * v4.0 FRD — Institutional Accumulation.
 * Smart-money footprint: repeated above-average volume on UP days over the last ~15 sessions,
 * price holding a rising floor (higher swing low), and a positive on-balance-volume drift —
 * accumulation without a vertical price move yet.
 */
function detectInstitutionalAccumulation(rows, { window = 15, minUpVolDays = 4 } = {}) {
  if (rows.length < 60) return null;

  const c = closes(rows);
  const v = volumes(rows);
  const avg20 = avgVolume(rows, 20);
  if (!avg20) return null;

  const recent = rows.slice(-window);
  let upVolDays = 0;
  let obv = 0;
  for (let i = rows.length - window; i < rows.length; i++) {
    const change = c[i] - c[i - 1];
    if (change > 0) { obv += v[i]; if (v[i] > avg20 * 1.2) upVolDays += 1; }
    else if (change < 0) obv -= v[i];
  }
  if (upVolDays < minUpVolDays) return null;
  if (obv <= 0) return null; // net distribution, not accumulation

  // rising floor: recent 10-day low above the prior 20-day low
  const recentLow = Math.min(...recent.slice(-10).map((r) => Number(r.low)));
  const olderLow = priorLow(rows.slice(0, -10), 20);
  if (olderLow == null || recentLow <= olderLow) return null;

  // not already extended
  const rsi = latestRsi(rows);
  if (rsi == null || rsi > 68) return null;

  const last = rows[rows.length - 1];
  const price = Number(last.close);
  const ret15 = ((price - c[c.length - 1 - window]) / c[c.length - 1 - window]) * 100;

  return {
    type: 'institutional',
    symbol: last.symbol,
    price,
    evidence: {
      upVolumeDays: upVolDays,
      windowDays: window,
      obvDrift: obv > 0 ? 'positive' : 'negative',
      risingFloor: `${olderLow.toFixed(2)} → ${recentLow.toFixed(2)}`,
      priceMove15dPct: Number(ret15.toFixed(1)),
      rsi: Math.round(rsi),
    },
  };
}

module.exports = { detectInstitutionalAccumulation };

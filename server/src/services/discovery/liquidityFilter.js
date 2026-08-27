const { avgVolume, closes } = require('../indicators');

/**
 * v4.0 FRD — Market Discovery: "Filter illiquid, suspended, and weak-quality stocks."
 * Pure function over stored OHLCV rows (chronological). Returns { pass, reason, metrics }.
 */
function assessLiquidity(rows, {
  minPrice = 20,
  minAvgTurnoverCr = 1, // ₹1 Cr/day average traded value
  minBars = 60,
  maxZeroVolDays = 5,
} = {}) {
  if (!rows || rows.length < minBars) {
    return { pass: false, reason: `only ${rows?.length || 0} bars (<${minBars})`, metrics: {} };
  }

  const last = rows[rows.length - 1];
  const price = Number(last.close);
  const recent = rows.slice(-20);
  const avgVol = avgVolume(rows, 20) || 0;
  const avgTurnoverCr = (avgVol * price) / 1e7;
  const zeroVolDays = recent.filter((r) => Number(r.volume) === 0).length;

  // "suspended / flatlined" proxy: no price movement across the last 10 sessions
  const c = closes(recent);
  const flat = c.length >= 10 && new Set(c.slice(-10).map((x) => x.toFixed(2))).size <= 1;

  const metrics = {
    price: Number(price.toFixed(2)),
    avgVol20: Math.round(avgVol),
    avgTurnoverCr: Number(avgTurnoverCr.toFixed(2)),
    zeroVolDays,
  };

  if (price < minPrice) return { pass: false, reason: `price ₹${price} < ₹${minPrice}`, metrics };
  if (avgTurnoverCr < minAvgTurnoverCr) return { pass: false, reason: `turnover ₹${avgTurnoverCr.toFixed(2)}Cr < ₹${minAvgTurnoverCr}Cr`, metrics };
  if (zeroVolDays > maxZeroVolDays) return { pass: false, reason: `${zeroVolDays} zero-volume days in last 20`, metrics };
  if (flat) return { pass: false, reason: 'price flatlined (possible suspension)', metrics };

  return { pass: true, reason: 'ok', metrics };
}

module.exports = { assessLiquidity };

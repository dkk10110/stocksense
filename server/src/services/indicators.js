const { RSI, BollingerBands, EMA } = require('technicalindicators');

/** rows must be chronological (oldest → newest), as returned by Prisma ordered by date asc. */
function closes(rows) { return rows.map((r) => Number(r.close)); }
function volumes(rows) { return rows.map((r) => Number(r.volume)); }

/** RSI series aligned to the END of `rows` (last value = current RSI). Needs period+1 rows minimum. */
function rsiSeries(rows, period = 14) {
  return RSI.calculate({ period, values: closes(rows) });
}
function latestRsi(rows, period = 14) {
  const series = rsiSeries(rows, period);
  return series.length ? series[series.length - 1] : null;
}

/** Bollinger Band width (as % of the middle band) for every bar once enough history exists. */
function bollingerWidthPctSeries(rows, period = 20, stdDev = 2) {
  const series = BollingerBands.calculate({ period, values: closes(rows), stdDev });
  return series.map((b) => ((b.upper - b.lower) / b.middle) * 100);
}
function latestBollingerWidthPct(rows, period = 20, stdDev = 2) {
  const series = bollingerWidthPctSeries(rows, period, stdDev);
  return series.length ? series[series.length - 1] : null;
}

function latestEma(rows, period) {
  const series = EMA.calculate({ period, values: closes(rows) });
  return series.length ? series[series.length - 1] : null;
}

/** Average volume over the last N bars (excluding the most recent, which is compared against it). */
function avgVolume(rows, period = 20) {
  const vols = volumes(rows).slice(0, -1).slice(-period);
  if (!vols.length) return null;
  return vols.reduce((s, v) => s + v, 0) / vols.length;
}

/** lows(rows) / highs(rows) — parallel to closes()/volumes(). */
function lows(rows) { return rows.map((r) => Number(r.low)); }
function highs(rows) { return rows.map((r) => Number(r.high)); }

/**
 * Pivot lows: a bar whose low is the lowest within +/- `k` bars around it.
 * Used to locate "previous demand zones" (swing-low support) for the volume-reversal detector.
 * Returns [{ index, price }], oldest → newest, excluding the most recent `k` bars (not yet confirmed).
 */
function pivotLows(rows, k = 5) {
  const lo = lows(rows);
  const out = [];
  for (let i = k; i < lo.length - k; i++) {
    let isPivot = true;
    for (let j = i - k; j <= i + k; j++) {
      if (lo[j] < lo[i]) { isPivot = false; break; }
    }
    if (isPivot) out.push({ index: i, price: lo[i] });
  }
  return out;
}

/**
 * Clusters pivot lows within `tolerancePct` of each other into demand zones, each with a
 * touch count. A zone that has been tested 2+ times is a real support shelf.
 * Returns [{ price, touches }] sorted by touches desc.
 */
function demandZones(rows, { k = 5, tolerancePct = 0.02 } = {}) {
  const pivots = pivotLows(rows, k);
  const zones = [];
  for (const p of pivots) {
    const hit = zones.find((z) => Math.abs(p.price - z.price) / z.price <= tolerancePct);
    if (hit) {
      hit.price = (hit.price * hit.touches + p.price) / (hit.touches + 1);
      hit.touches += 1;
    } else {
      zones.push({ price: p.price, touches: 1 });
    }
  }
  return zones.sort((a, b) => b.touches - a.touches);
}

/** % change of close over the last `lookback` bars (0 if not enough history). */
function returnPct(rows, lookback) {
  const c = closes(rows);
  if (c.length <= lookback) return 0;
  const then = c[c.length - 1 - lookback];
  const now = c[c.length - 1];
  return then ? ((now - then) / then) * 100 : 0;
}

/** Simple moving average of close over the last `period` bars, or null. */
function sma(rows, period) {
  const c = closes(rows);
  if (c.length < period) return null;
  const w = c.slice(-period);
  return w.reduce((s, x) => s + x, 0) / period;
}

/** Highest high / lowest low over the last `period` bars (excluding the current bar). */
function priorHigh(rows, period) {
  const h = highs(rows).slice(-period - 1, -1);
  return h.length ? Math.max(...h) : null;
}
function priorLow(rows, period) {
  const l = lows(rows).slice(-period - 1, -1);
  return l.length ? Math.min(...l) : null;
}

/**
 * Resamples daily rows into weekly OHLCV bars (Mon–Fri buckets by ISO week).
 * Used by the multi-timeframe-breakout detector.
 */
function toWeekly(rows) {
  const weeks = new Map();
  for (const r of rows) {
    const d = new Date(r.date);
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = monday.toISOString().split('T')[0];
    const w = weeks.get(key) || { date: monday, open: Number(r.open), high: -Infinity, low: Infinity, close: 0, volume: 0, symbol: r.symbol };
    w.high = Math.max(w.high, Number(r.high));
    w.low = Math.min(w.low, Number(r.low));
    w.close = Number(r.close);
    w.volume += Number(r.volume);
    weeks.set(key, w);
  }
  return [...weeks.values()].sort((a, b) => a.date - b.date);
}

module.exports = {
  closes, volumes, lows, highs, rsiSeries, latestRsi,
  bollingerWidthPctSeries, latestBollingerWidthPct, latestEma, avgVolume,
  pivotLows, demandZones, returnPct, sma, priorHigh, priorLow, toWeekly,
};

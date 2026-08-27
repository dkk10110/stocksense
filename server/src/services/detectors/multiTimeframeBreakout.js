const { closes, highs, volumes, avgVolume, toWeekly, latestRsi } = require('../indicators');

/**
 * v4.0 FRD — Multi-timeframe Breakout.
 * The daily close clears the prior 20-day high AND the weekly close clears the prior 10-week
 * high, on above-average volume — a breakout confirmed on two timeframes at once, which
 * historically holds far better than a daily-only pop.
 */
function detectMultiTimeframeBreakout(rows, { dailyLookback = 20, weeklyLookback = 10, volMult = 1.3 } = {}) {
  if (rows.length < 120) return null;

  const c = closes(rows);
  const price = c[c.length - 1];

  const priorDailyHigh = Math.max(...highs(rows).slice(-dailyLookback - 1, -1));
  if (price <= priorDailyHigh) return null;

  const weekly = toWeekly(rows);
  if (weekly.length < weeklyLookback + 2) return null;
  const wClose = weekly[weekly.length - 1].close;
  const priorWeeklyHigh = Math.max(...weekly.slice(-weeklyLookback - 1, -1).map((w) => w.high));
  if (wClose <= priorWeeklyHigh) return null;

  const v = volumes(rows);
  const avg20 = avgVolume(rows, 20);
  if (!avg20 || v[v.length - 1] < avg20 * volMult) return null;

  const rsi = latestRsi(rows);
  if (rsi == null || rsi > 80) return null;

  const last = rows[rows.length - 1];
  return {
    type: 'mtf_breakout',
    symbol: last.symbol,
    price: Number(price.toFixed(2)),
    evidence: {
      priorDailyHigh: Number(priorDailyHigh.toFixed(2)),
      priorWeeklyHigh: Number(priorWeeklyHigh.toFixed(2)),
      breakoutVolumeVs20dAvg: Number((v[v.length - 1] / avg20).toFixed(2)),
      dailyLookback,
      weeklyLookback,
      rsi: Math.round(rsi),
    },
  };
}

module.exports = { detectMultiTimeframeBreakout };

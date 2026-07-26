const { latestRsi, closes } = require('../indicators');

/**
 * PRD 2.4 — Earnings play.
 *
 * Deviation from the PRD: it calls for "beaten analyst estimates for 2+ consecutive quarters",
 * which needs a paid consensus-estimates feed (Refinitiv/Trendlyne-class data) that isn't free
 * anywhere for Indian markets. This substitutes a measurable proxy — YoY sales AND net profit
 * growth for 2+ consecutive quarters from Screener.in's reported figures — and is clearly labeled
 * as such in the result rather than silently presented as "beat %".
 */
function hadConsecutiveYoyGrowth(quarters, minStreak = 2) {
  if (!quarters || quarters.length < 4 + minStreak) return { streak: 0, ok: false };
  let streak = 0;
  for (let i = quarters.length - 1; i >= 4; i--) {
    const cur = quarters[i];
    const yearAgo = quarters[i - 4];
    const grew = cur.sales != null && yearAgo?.sales != null && cur.sales > yearAgo.sales
      && cur.netProfit != null && yearAgo?.netProfit != null && cur.netProfit > yearAgo.netProfit;
    if (!grew) break;
    streak += 1;
    if (streak >= minStreak) break;
  }
  return { streak, ok: streak >= minStreak };
}

function detectEarningsPlay(rows, fundamentals, nextResultsDate, { minDays = 4, maxDays = 8 } = {}) {
  if (!nextResultsDate) return null;
  const daysAway = Math.ceil((nextResultsDate - new Date()) / (24 * 60 * 60 * 1000));
  if (daysAway < minDays || daysAway > maxDays) return null;

  const growth = hadConsecutiveYoyGrowth(fundamentals?.quarters);
  if (!growth.ok) return null;

  const rsi = latestRsi(rows);
  if (rsi == null || rsi >= 60) return null;

  const priceSeries = closes(rows);
  const priceNow = priceSeries[priceSeries.length - 1];
  const price10dAgo = priceSeries[priceSeries.length - 11];
  if (price10dAgo == null) return null;
  const runUpPct = ((priceNow - price10dAgo) / price10dAgo) * 100;
  if (runUpPct > 5) return null; // pre-results drift already priced in

  const last = rows[rows.length - 1];
  return {
    type: 'earnings',
    symbol: last.symbol,
    price: priceNow,
    evidence: {
      resultsInDays: daysAway,
      resultsDate: nextResultsDate.toISOString().split('T')[0],
      yoyGrowthStreakQuarters: growth.streak,
      growthMetricNote: 'proxy for "beat estimates" — YoY sales & profit growth, not analyst consensus (no free source exists)',
      rsi: Math.round(rsi),
      runUp10dPct: Number(runUpPct.toFixed(1)),
    },
  };
}

module.exports = { detectEarningsPlay };

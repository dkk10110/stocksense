const { latestEma, latestRsi, avgVolume, closes } = require('../indicators');

/**
 * PRD 2.5 — Volume reversal at support.
 * Price within 1.5% of the 50-day or 200-day EMA, volume dried up below 0.5x 20-day average,
 * RSI 35–45 (oversold-but-not-extreme), and that support level has bounced before.
 *
 * Simplification vs. the PRD: "previous demand zone" (a discretionary swing-low support) is not
 * detected — only the two EMA-based supports, which are precisely computable from OHLCV alone.
 */
function countPriorBounces(rows, emaPeriod, tolerancePct = 0.015) {
  const closePrices = closes(rows);
  let bounces = 0;
  for (let i = emaPeriod; i < rows.length - 5; i++) {
    const window = rows.slice(0, i + 1);
    const ema = latestEma(window, emaPeriod);
    if (ema == null) continue;
    const price = closePrices[i];
    const nearSupport = Math.abs(price - ema) / ema <= tolerancePct;
    if (nearSupport && closePrices[i + 5] > price) bounces += 1;
  }
  return bounces;
}

function detectVolumeReversal(rows, { tolerancePct = 0.015, volumeRatioMax = 0.5 } = {}) {
  if (rows.length < 210) return null; // need ~200-day EMA history plus lookback for bounce counting

  const last = rows[rows.length - 1];
  const price = Number(last.close);
  const volume = Number(last.volume);
  const avgVol20 = avgVolume(rows, 20);
  const rsi = latestRsi(rows);
  if (avgVol20 == null || rsi == null) return null;

  const ema50 = latestEma(rows, 50);
  const ema200 = latestEma(rows, 200);

  const supports = [
    ema50 != null && { label: '50-day EMA', level: ema50, period: 50 },
    ema200 != null && { label: '200-day EMA', level: ema200, period: 200 },
  ].filter(Boolean);

  const nearSupport = supports.find((s) => Math.abs(price - s.level) / s.level <= tolerancePct);
  if (!nearSupport) return null;

  const volumeDriedUp = volume < avgVol20 * volumeRatioMax;
  if (!volumeDriedUp) return null;

  const rsiInRange = rsi >= 35 && rsi <= 45;
  if (!rsiInRange) return null;

  const priorBounces = countPriorBounces(rows, nearSupport.period, tolerancePct);
  if (priorBounces < 2) return null;

  return {
    type: 'volume',
    symbol: last.symbol,
    price,
    evidence: {
      supportLevel: nearSupport.label,
      supportPrice: Number(nearSupport.level.toFixed(2)),
      volumeVsAvg20: Number((volume / avgVol20).toFixed(2)),
      rsi: Math.round(rsi),
      priorBounces,
    },
  };
}

module.exports = { detectVolumeReversal };

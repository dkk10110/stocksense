const { bollingerWidthPctSeries } = require('../indicators');

/**
 * PRD 2.1 — Pre-breakout compression.
 * (High-Low)/Close < 3% for 5+ consecutive days AND volume declining each day,
 * with Bollinger Band width at its narrowest point in the last 60 days.
 * `rows` must be chronological (oldest → newest) PriceHistory records.
 */
function detectCompression(rows, { bandDays = 5, lookbackDays = 60, bandThreshold = 0.03 } = {}) {
  if (rows.length < lookbackDays + 20) return null; // need enough history for a meaningful 60-day comparison

  const recent = rows.slice(-bandDays);
  const tightBand = recent.every((r) => (Number(r.high) - Number(r.low)) / Number(r.close) < bandThreshold);
  if (!tightBand) return null;

  const vols = recent.map((r) => Number(r.volume));
  const volumeDeclining = vols.every((v, i) => i === 0 || v <= vols[i - 1]);
  if (!volumeDeclining) return null;

  const widths = bollingerWidthPctSeries(rows);
  if (widths.length < lookbackDays) return null;
  const window = widths.slice(-lookbackDays);
  const currentWidth = window[window.length - 1];
  const minWidth = Math.min(...window);
  const isNarrowest = currentWidth <= minWidth * 1.02; // small tolerance for float noise

  if (!isNarrowest) return null;

  const last = rows[rows.length - 1];
  const bandLow = Math.min(...recent.map((r) => Number(r.low)));
  const bandHigh = Math.max(...recent.map((r) => Number(r.high)));
  return {
    type: 'compression',
    symbol: last.symbol,
    price: Number(last.close),
    evidence: {
      bandDays,
      bandLow: Number(bandLow.toFixed(2)),
      bandHigh: Number(bandHigh.toFixed(2)),
      bandWidthPct: Number((((Number(last.high) - Number(last.low)) / Number(last.close)) * 100).toFixed(2)),
      volumeTrend: 'declining',
      bollingerWidthPct: Number(currentWidth.toFixed(2)),
      bollingerNarrowestIn: lookbackDays,
    },
  };
}

module.exports = { detectCompression };

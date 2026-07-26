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

module.exports = { closes, volumes, rsiSeries, latestRsi, bollingerWidthPctSeries, latestBollingerWidthPct, latestEma, avgVolume };

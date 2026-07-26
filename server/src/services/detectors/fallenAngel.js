const { latestRsi, rsiSeries, avgVolume, volumes } = require('../indicators');

/** Rough 0–100 fundamental-health proxy from Screener.in data, since the PRD never fully defines its formula. */
function fundamentalScore(fundamentals) {
  if (!fundamentals) return null;
  let score = 0;
  if (fundamentals.roe != null && fundamentals.roe >= 15) score += 30;
  if (fundamentals.roce != null && fundamentals.roce >= 15) score += 30;

  const q = fundamentals.quarters || [];
  const latest = q[q.length - 1];
  const yearAgo = q[q.length - 5]; // same quarter, prior year (quarterly data)
  if (latest?.sales != null && yearAgo?.sales != null && latest.sales > yearAgo.sales) score += 20;
  if (latest?.netProfit != null && latest.netProfit > 0) score += 20;

  return score;
}

/**
 * PRD 2.3 — Fallen angel reversal. 5 gate conditions; gate 3 ("drop was external, not business
 * deterioration") requires AI news classification, which isn't built until Phase 5 — that gate
 * is reported as "pending" rather than faked, and does not block detection on its own.
 */
function detectFallenAngel(rows, fundamentals) {
  if (rows.length < 260) return null; // need ~52 weeks for the ATH comparison

  const last = rows[rows.length - 1];
  const price = Number(last.close);
  const high52w = Math.max(...rows.slice(-252).map((r) => Number(r.high)));
  const dropPct = ((high52w - price) / high52w) * 100;

  const gates = {};
  gates.dropRange = dropPct >= 30 && dropPct <= 55;
  if (!gates.dropRange) return null; // this is the primary filter — no point computing the rest if it fails

  const fScore = fundamentalScore(fundamentals);
  gates.fundamentals = fScore != null ? fScore >= 70 : null;

  gates.newsClassification = null; // pending — Phase 5 (AI news classification)

  const rsiHist = rsiSeries(rows);
  if (rsiHist.length < 10) return null;
  const recentRsi = rsiHist.slice(-10);
  const minRsi = Math.min(...recentRsi);
  const currentRsi = recentRsi[recentRsi.length - 1];
  gates.rsiReversal = minRsi < 30 && currentRsi > minRsi + 2 && currentRsi < 40;
  if (!gates.rsiReversal) return null;

  const vols = volumes(rows);
  const recentVols = vols.slice(-10);
  const avgVol20 = avgVolume(rows, 20);
  const hadPanicSpike = avgVol20 != null && Math.max(...recentVols.slice(0, 7)) > avgVol20 * 1.5;
  const nowQuiet = avgVol20 != null && recentVols.slice(-3).reduce((s, v) => s + v, 0) / 3 < avgVol20;
  gates.accumulationPattern = hadPanicSpike && nowQuiet;
  if (!gates.accumulationPattern) return null;

  const knownGates = ['dropRange', 'rsiReversal', 'accumulationPattern', 'fundamentals'];
  const knownPassed = knownGates.filter((g) => gates[g] === true).length;
  const pendingGates = Object.entries(gates).filter(([, v]) => v === null).map(([k]) => k);

  return {
    type: 'fallen',
    symbol: last.symbol,
    price,
    evidence: {
      dropFromHighPct: Number(dropPct.toFixed(1)),
      high52w: Number(high52w.toFixed(2)),
      rsiMin: Math.round(minRsi),
      rsiNow: Math.round(currentRsi),
      fundamentalScore: fScore,
    },
    gates,
    gatesPassed: `${knownPassed}/4 known gates`,
    pendingGates,
  };
}

module.exports = { detectFallenAngel, fundamentalScore };

const { latestRsi, rsiSeries, avgVolume, volumes } = require('../indicators');

/**
 * Rough 0–100 fundamental-health proxy from Screener.in data (PRD 2.3 wants "earnings, debt, ROE intact"
 * but never defines the formula). ROE 25 / ROCE 25 / low debt 15 / YoY sales growth 20 / profitable 15.
 */
function fundamentalScore(fundamentals) {
  if (!fundamentals) return null;
  let score = 0;
  if (fundamentals.roe != null && fundamentals.roe >= 15) score += 25;
  if (fundamentals.roce != null && fundamentals.roce >= 15) score += 25;
  if (fundamentals.debtToEquity != null && fundamentals.debtToEquity < 1) score += 15;

  const q = fundamentals.quarters || [];
  const latest = q[q.length - 1];
  const yearAgo = q[q.length - 5]; // same quarter, prior year (quarterly data)
  if (latest?.sales != null && yearAgo?.sales != null && latest.sales > yearAgo.sales) score += 20;
  if (latest?.netProfit != null && latest.netProfit > 0) score += 15;

  return score;
}

/**
 * PRD 2.3 — Fallen angel reversal. 5 gate conditions.
 * Gate 3 ("drop was external, not business deterioration") is supplied by the AI news
 * classifier (services/ai/classifyDrop) via `dropClassification`. When that's null (AI layer
 * not configured) the gate stays `pending` and doesn't block; when it says the drop is
 * business deterioration, the setup is vetoed outright.
 *
 * @param {object|null} dropClassification  { external: boolean, classification, reason } or null
 */
function detectFallenAngel(rows, fundamentals, dropClassification = null) {
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

  if (dropClassification == null) {
    gates.newsClassification = null; // AI layer not configured — stays pending, doesn't block
  } else if (dropClassification.external) {
    gates.newsClassification = true;
  } else {
    // business deterioration (or "unknown") — PRD says this must NOT pass. Veto the setup.
    return null;
  }

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

  const allGates = ['dropRange', 'fundamentals', 'newsClassification', 'rsiReversal', 'accumulationPattern'];
  const passed = allGates.filter((g) => gates[g] === true).length;
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
      dropClassification: dropClassification ? dropClassification.classification : null,
      dropReason: dropClassification ? dropClassification.reason : null,
    },
    gates,
    gatesPassed: `${passed}/5 gates`,
    pendingGates,
  };
}

module.exports = { detectFallenAngel, fundamentalScore };

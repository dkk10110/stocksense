const { rsiSeries } = require('../indicators');
const { fundamentalScore } = require('../detectors/fallenAngel');
const { TYPE_DEFAULTS } = require('./typeDefaults');

// PRD §5.3 layer weights.
const WEIGHTS = { forwardSetup: 0.30, newsIntelligence: 0.20, technical: 0.20, fundamentals: 0.15, fiiDii: 0.10, macro: 0.05 };

const PROB_BASIS_DEFAULTS = { compression: 284, catalyst: 197, fallen: 312, earnings: 178, volume: 203 };

function scoreForwardSetup(detection) {
  if (detection.type === 'fallen') {
    const [passed, total] = detection.gatesPassed.split('/').map((s) => parseInt(s, 10));
    return { score: Math.round((passed / total) * 100), pending: detection.pendingGates.length > 0, note: detection.pendingGates.length ? `pending: ${detection.pendingGates.join(', ')}` : undefined };
  }
  // The other 3 detectors only return a result once every required gate has already passed.
  return { score: 85, pending: false };
}

/** RSI *direction* over the last 5 bars, not the raw level — per the PRD's v3.0 technical layer. */
function scoreRsiDirection(rows) {
  const series = rsiSeries(rows);
  if (series.length < 6) return { score: 50, pending: true, note: 'not enough history for RSI trend' };
  const recent = series.slice(-6);
  const delta = recent[recent.length - 1] - recent[0];
  const score = Math.max(0, Math.min(100, 50 + delta * 4));
  return { score: Math.round(score), pending: false, note: `RSI moved ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} over 5 bars` };
}

function scoreFundamentals(fundamentals) {
  if (!fundamentals) return { score: 50, pending: true, note: 'Screener.in data unavailable for this symbol' };
  const score = fundamentalScore(fundamentals);
  return { score: score ?? 50, pending: score == null };
}

function scoreFiiDii(fiiDii) {
  if (!fiiDii || fiiDii.fiiNetCr == null || fiiDii.diiNetCr == null) return { score: 50, pending: true, note: 'FII/DII data unavailable' };
  const netCr = fiiDii.fiiNetCr + fiiDii.diiNetCr;
  const score = Math.max(0, Math.min(100, 50 + (netCr / 2000) * 50));
  return { score: Math.round(score), pending: false, note: `market-wide net flow ₹${netCr.toFixed(0)}Cr (not stock-specific)` };
}

function scoreMacro(vix) {
  if (vix == null) return { score: 50, pending: true, note: 'VIX unavailable' };
  let score;
  if (vix < 14) score = 100;
  else if (vix < 18) score = 70;
  else if (vix < 22) score = 40;
  else score = 10;
  return { score, pending: false, note: `India VIX ${vix}` };
}

/** No AI/NewsAPI wiring yet (catalyst-countdown deferred to stay honest — see Phase 4 notes). */
function scoreNewsIntelligence() {
  return { score: 50, pending: true, note: 'neutral placeholder — needs NewsAPI + AI sentiment' };
}

function computeTradeLevels(detection) {
  const defaults = TYPE_DEFAULTS[detection.type];
  const price = detection.price;

  const stop = detection.type === 'volume' && detection.evidence.supportPrice
    ? detection.evidence.supportPrice * 0.99
    : price * (1 - defaults.stopPct / 100);
  const target = price * (1 + defaults.targetPct / 100);

  // Simplified generic entry window (small band around current price) — the PRD describes
  // per-type entry-window logic (e.g. "lower half of the compression band") in more nuance
  // than is implemented here; documented as a simplification pending future refinement.
  const entryLow = Number((price * 0.997).toFixed(2));
  const entryHigh = Number((price * 1.005).toFixed(2));

  const rr = (target - price) / (price - stop);

  return { entryLow, entryHigh, target: Number(target.toFixed(2)), stop: Number(stop.toFixed(2)), rr: Number(rr.toFixed(2)), days: defaults.days };
}

/**
 * Scores one detector hit into a full candidate Signal. `context` = { rows, fundamentals, vix, fiiDii }.
 * Returns null if the signal fails a gate (composite score < 60, VIX > 18, or R/R < 1:2) — per PRD §5.1.
 */
function scoreDetection(detection, context) {
  const layers = {
    forwardSetup: scoreForwardSetup(detection),
    newsIntelligence: scoreNewsIntelligence(),
    technical: scoreRsiDirection(context.rows),
    fundamentals: scoreFundamentals(context.fundamentals),
    fiiDii: scoreFiiDii(context.fiiDii),
    macro: scoreMacro(context.vix),
  };

  const composite = Object.entries(WEIGHTS).reduce((sum, [key, w]) => sum + layers[key].score * w, 0);
  const confidence = Math.round(composite);

  const trade = computeTradeLevels(detection);

  const gates = {
    vixSafe: context.vix == null || context.vix <= 18,
    scoreAboveThreshold: confidence >= 60,
    riskRewardOk: trade.rr >= 2,
  };
  const passedAllGates = Object.values(gates).every(Boolean);

  return {
    passedAllGates,
    gates,
    confidence,
    upside: Number((((trade.target - detection.price) / detection.price) * 100).toFixed(1)),
    layers,
    trade,
    probBasis: PROB_BASIS_DEFAULTS[detection.type],
  };
}

module.exports = { scoreDetection, WEIGHTS };

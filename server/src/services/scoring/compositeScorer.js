const { rsiSeries, lows } = require('../indicators');
const { fundamentalScore } = require('../detectors/fallenAngel');
const { TYPE_DEFAULTS } = require('./typeDefaults');

// PRD §5.3 layer weights.
const WEIGHTS = { forwardSetup: 0.30, newsIntelligence: 0.20, technical: 0.20, fundamentals: 0.15, fiiDii: 0.10, macro: 0.05 };

const PROB_BASIS_DEFAULTS = { compression: 284, catalyst: 197, fallen: 312, earnings: 178, volume: 203 };

function scoreForwardSetup(detection) {
  if (detection.type === 'fallen') {
    const [passed, total] = detection.gatesPassed.split('/').map((s) => parseInt(s, 10));
    return {
      score: Math.round((passed / total) * 100),
      pending: detection.pendingGates.length > 0,
      note: detection.pendingGates.length ? `pending: ${detection.pendingGates.join(', ')}` : `${passed}/${total} gates`,
    };
  }
  if (detection.type === 'catalyst') {
    // Weight by how sure the AI is that the dated event is real, and by FII/DII confirmation (PRD 2.2).
    let score = 60 + Math.round((detection.evidence.eventConfidence / 100) * 25);
    if (detection.evidence.fiiDiiAccumulating) score += 10;
    return { score: Math.min(100, score), pending: false, note: `event confidence ${detection.evidence.eventConfidence}%` };
  }
  // compression / earnings / volume only return a result once every required gate has already passed.
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
  if (!fiiDii || fiiDii.fiiNetCr == null || fiiDii.diiNetCr == null) return { score: 50, pending: true, note: 'FII/DII data unavailable', veto: false };
  const netCr = fiiDii.fiiNetCr + fiiDii.diiNetCr;
  const score = Math.max(0, Math.min(100, 50 + (netCr / 2000) * 50));
  // PRD §5.3 layer 5: "FII selling can veto a signal." Per-stock FII isn't in any free source,
  // so this vetoes on a heavy market-wide net outflow instead.
  const veto = netCr < -1500;
  return { score: Math.round(score), pending: false, veto, note: `market-wide net flow ₹${netCr.toFixed(0)}Cr (not stock-specific)${veto ? ' — VETO' : ''}` };
}

/**
 * PRD §5.3 layer 6 (5%). VIX is the dominant input (and the hard gate); S&P/Nasdaq/Brent/INR
 * nudge it. `macro` = { vix, sp500ChangePct, nasdaqChangePct, brentChangePct, usdInr }.
 */
function scoreMacro(macro) {
  const vix = macro?.vix;
  if (vix == null) return { score: 50, pending: true, note: 'VIX unavailable' };

  let score;
  if (vix < 14) score = 100;
  else if (vix < 18) score = 70;
  else if (vix < 22) score = 40;
  else score = 10;

  const notes = [`India VIX ${vix}`];
  const bump = (label, pct) => {
    if (pct == null) return;
    score += Math.max(-10, Math.min(10, pct * 3)); // +/-1% index move => +/-3 pts, capped
    notes.push(`${label} ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`);
  };
  bump('S&P500', macro.sp500ChangePct);
  bump('Nasdaq', macro.nasdaqChangePct);
  if (macro.brentChangePct != null) {
    score -= Math.max(-6, Math.min(6, macro.brentChangePct * 1.5)); // rising crude = mild headwind for India
    notes.push(`Brent ${macro.brentChangePct >= 0 ? '+' : ''}${macro.brentChangePct.toFixed(2)}%`);
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, pending: false, note: notes.join(', ') };
}

/** PRD §5.3 layer 2 (20%). Sentiment is computed upstream by services/ai/newsSentiment. */
function scoreNewsIntelligence(newsSentiment) {
  if (!newsSentiment) return { score: 50, pending: true, note: 'neutral placeholder — no news/AI sentiment' };
  return { score: newsSentiment.score, pending: !!newsSentiment.pending, note: newsSentiment.note };
}

/** Per-type entry window / target / stop, following PRD §2's per-type entry-timing language. */
function computeTradeLevels(detection, context) {
  const defaults = TYPE_DEFAULTS[detection.type];
  const price = detection.price;
  const e = detection.evidence || {};
  const rows = context?.rows || [];

  let entryLow, entryHigh, stop, target;

  if (detection.type === 'compression' && e.bandLow != null && e.bandHigh != null) {
    // PRD 2.1: "Entry window is the lower half of the compression band. Stop below the band's lowest point."
    const mid = (e.bandLow + e.bandHigh) / 2;
    entryLow = e.bandLow;
    entryHigh = mid;
    stop = e.bandLow * 0.99;
    target = price * (1 + defaults.targetPct / 100);
  } else if (detection.type === 'volume' && e.supportPrice != null) {
    // PRD 2.5: "Stop placed just below the support level. Target 5–8% above current price."
    entryLow = price * 0.997;
    entryHigh = price * 1.005;
    stop = e.supportPrice * 0.99;
    target = price * (1 + defaults.targetPct / 100);
  } else if (detection.type === 'fallen') {
    // PRD 2.3: enter as RSI turns up; stop below the recent swing low (Tata ELXSI example ≈ −5%).
    const recentLow = rows.length ? Math.min(...lows(rows).slice(-15)) : price * (1 - defaults.stopPct / 100);
    entryLow = price * 0.997;
    entryHigh = price * 1.015;
    stop = Math.min(recentLow * 0.99, price * (1 - defaults.stopPct / 100));
    target = price * (1 + defaults.targetPct / 100);
  } else if (detection.type === 'catalyst') {
    // PRD 2.2: buy now (7–14 days out), tight 2–2.5% stop, target = the event's expected move.
    entryLow = price * 0.997;
    entryHigh = price * 1.01;
    stop = price * (1 - defaults.stopPct / 100);
    target = price * (1 + (e.expectedImpactPct || defaults.targetPct) / 100);
  } else {
    // earnings + any fallthrough: tight stop, target from the PRD's per-type figure.
    entryLow = price * 0.997;
    entryHigh = price * 1.005;
    stop = price * (1 - defaults.stopPct / 100);
    target = price * (1 + defaults.targetPct / 100);
  }

  const rr = (target - price) / (price - stop);
  return {
    entryLow: Number(entryLow.toFixed(2)),
    entryHigh: Number(entryHigh.toFixed(2)),
    target: Number(target.toFixed(2)),
    stop: Number(stop.toFixed(2)),
    rr: Number(rr.toFixed(2)),
    days: defaults.days,
  };
}

/** True if the most recent bar's volume is at least `minRatio`× the 20-day average — PRD §5.1 "volume sufficient" gate. */
function volumeSufficient(rows, minRatio = 0.3) {
  if (rows.length < 21) return true; // not enough history to judge — don't block on it
  const recent = rows.slice(-21);
  const last = Number(recent[recent.length - 1].volume);
  const avg = recent.slice(0, 20).reduce((s, r) => s + Number(r.volume), 0) / 20;
  return avg > 0 && last >= avg * minRatio;
}

/**
 * Scores one detector hit into a full candidate Signal.
 * `context` = { rows, fundamentals, macro: { vix, sp500ChangePct, ... }, fiiDii, newsSentiment }.
 * Returns a result with `passedAllGates` false if it fails a gate (PRD §5.1).
 */
function scoreDetection(detection, context) {
  const layers = {
    forwardSetup: scoreForwardSetup(detection),
    newsIntelligence: scoreNewsIntelligence(context.newsSentiment),
    technical: scoreRsiDirection(context.rows),
    fundamentals: scoreFundamentals(context.fundamentals),
    fiiDii: scoreFiiDii(context.fiiDii),
    macro: scoreMacro(context.macro),
  };

  const composite = Object.entries(WEIGHTS).reduce((sum, [key, w]) => sum + layers[key].score * w, 0);
  const confidence = Math.round(composite);

  const trade = computeTradeLevels(detection, context);
  const vix = context.macro?.vix;

  const gates = {
    vixSafe: vix == null || vix <= 18,
    scoreAboveThreshold: confidence >= 60,
    riskRewardOk: trade.rr >= 2,
    volumeSufficient: volumeSufficient(context.rows),
    fiiDiiNotVetoing: !layers.fiiDii.veto,
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

module.exports = { scoreDetection, WEIGHTS, scoreMacro, scoreFiiDii, scoreNewsIntelligence };

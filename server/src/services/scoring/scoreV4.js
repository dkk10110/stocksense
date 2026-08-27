const { rsiSeries, returnPct, avgVolume } = require('../indicators');

/**
 * v4.0 FRD — Confidence Scoring Engine.
 * Weights (sum of positives = 100): Sector Strength 20, Institutional Buying 15, Technical Setup 15,
 * Relative Strength 10, Fundamentals 10, Catalyst 10, Volume & Liquidity 8, News Intelligence 7,
 * Market Breadth 5. Risk Penalty subtracts up to 10.
 *
 * Each component is scored 0-100 and contributes `component/100 * weight`. `pending` components
 * (no free data) fall back to a neutral 50 and are flagged in the breakdown.
 */
const WEIGHTS = {
  sectorStrength: 20,
  institutionalBuying: 15,
  technicalSetup: 15,
  relativeStrength: 10,
  fundamentals: 10,
  catalyst: 10,
  volumeLiquidity: 8,
  newsIntelligence: 7,
  marketBreadth: 5,
};
const RISK_PENALTY_MAX = 10;

const clamp = (n) => Math.max(0, Math.min(100, n));
const lvl = (score, pending, note) => ({ score: Math.round(clamp(score)), pending: !!pending, note });

function technicalScore(rows, detection) {
  const s = rsiSeries(rows);
  if (s.length < 6) return lvl(50, true, 'not enough history');
  const delta = s[s.length - 1] - s[s.length - 6];
  let base = 55 + delta * 3;
  // reward breakout-family setups that fire with confirmation
  if (['mtf_breakout', 'compression', 'rs_leader'].includes(detection.type)) base += 12;
  return lvl(base, false, `RSI Δ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}/5 bars`);
}

function institutionalScore(detection, fiiDii) {
  let base = detection.type === 'institutional' || detection.type === 'high_delivery' ? 78 : 55;
  if (fiiDii && fiiDii.fiiNetCr != null && fiiDii.diiNetCr != null) {
    const net = fiiDii.fiiNetCr + fiiDii.diiNetCr;
    base += clamp(net / 200) - 5; // market-wide proxy nudge (per-stock FII has no free source)
  }
  return lvl(base, false, 'accumulation footprint + market-wide flow proxy');
}

function volumeLiquidityScore(rows) {
  const avg20 = avgVolume(rows, 20);
  if (!avg20) return lvl(50, true, 'no volume history');
  const last = rows[rows.length - 1];
  const price = Number(last.close);
  const turnoverCr = (avg20 * price) / 1e7;
  const ratio = Number(last.volume) / avg20;
  let base = 40 + clamp(turnoverCr) * 0.3 + (ratio - 1) * 20;
  return lvl(base, false, `₹${turnoverCr.toFixed(1)}Cr/day avg, today ${ratio.toFixed(1)}x`);
}

function relativeStrengthScore(rows, benchRows, rsPercentile) {
  if (rsPercentile != null) return lvl(rsPercentile, false, `RS percentile ${Math.round(rsPercentile)}`);
  if (!benchRows || benchRows.length < 65) return lvl(50, true, 'no benchmark');
  const rel = returnPct(rows, 63) - returnPct(benchRows, 63);
  return lvl(50 + rel * 2.5, false, `3m outperformance ${rel.toFixed(1)}%`);
}

function riskPenalty(rows, detection, ctx) {
  let p = 0;
  const notes = [];
  if (ctx.vix != null && ctx.vix > 16) { p += Math.min(4, (ctx.vix - 16) * 1.5); notes.push(`VIX ${ctx.vix}`); }
  const rsi = rsiSeries(rows).slice(-1)[0];
  if (rsi != null && rsi > 75) { p += 3; notes.push(`RSI ${Math.round(rsi)} extended`); }
  if (ctx.liquidity && ctx.liquidity.avgTurnoverCr != null && ctx.liquidity.avgTurnoverCr < 3) { p += 2; notes.push('thin liquidity'); }
  if (ctx.earningsInDays != null && ctx.earningsInDays <= 2 && detection.type !== 'earnings' && detection.type !== 'catalyst') {
    p += 3; notes.push('earnings <2d (event risk)');
  }
  if (ctx.fiiDii && (ctx.fiiDii.fiiNetCr + ctx.fiiDii.diiNetCr) < -1500) { p += 3; notes.push('heavy FII/DII outflow'); }
  return { penalty: Math.round(Math.min(RISK_PENALTY_MAX, p)), note: notes.join(', ') || 'none' };
}

/**
 * @param {object} detection  a detector hit ({ type, symbol, price, evidence })
 * @param {object} ctx {
 *   rows, benchRows, sectorScore (0-100), rsPercentile (0-100), fundamentals (screener obj|null),
 *   newsSentiment ({score,pending}|null), catalyst ({score}|null), breadth ({advanceDeclineRatio,pctAbove50EMA}|null),
 *   vix, fiiDii, liquidity ({avgTurnoverCr}), earningsInDays
 * }
 */
function scoreV4(detection, ctx) {
  const { rows } = ctx;

  const layers = {
    sectorStrength: lvl(ctx.sectorScore ?? 50, ctx.sectorScore == null, ctx.sectorScore == null ? 'sector not ranked' : `sector score ${ctx.sectorScore}`),
    institutionalBuying: institutionalScore(detection, ctx.fiiDii),
    technicalSetup: technicalScore(rows, detection),
    relativeStrength: relativeStrengthScore(rows, ctx.benchRows, ctx.rsPercentile),
    fundamentals: ctx.fundamentals
      ? lvl(require('../detectors/fallenAngel').fundamentalScore(ctx.fundamentals) ?? 50, false, 'Screener.in')
      : lvl(50, true, 'fundamentals unavailable in a market-wide scan'),
    catalyst: ctx.catalyst && ctx.catalyst.score != null
      ? lvl(ctx.catalyst.score, false, ctx.catalyst.note || 'dated catalyst')
      : lvl(detection.type === 'catalyst' || detection.type === 'earnings' ? 75 : 40, detection.type !== 'catalyst' && detection.type !== 'earnings', 'no dated catalyst'),
    volumeLiquidity: volumeLiquidityScore(rows),
    newsIntelligence: ctx.newsSentiment && !ctx.newsSentiment.pending
      ? lvl(ctx.newsSentiment.score, false, ctx.newsSentiment.note)
      : lvl(50, true, 'no news/AI sentiment'),
    marketBreadth: ctx.breadth
      ? lvl(35 + (ctx.breadth.advanceDeclineRatio ?? 1) * 20 + (ctx.breadth.pctAbove50EMA ?? 50) * 0.3, false, `A/D ${(ctx.breadth.advanceDeclineRatio ?? 1).toFixed(2)}, ${ctx.breadth.pctAbove50EMA ?? '?'}% >50EMA`)
      : lvl(50, true, 'breadth not computed'),
  };

  const positive = Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + (layers[k].score / 100) * w, 0);
  const risk = riskPenalty(rows, detection, ctx);
  const confidence = Math.round(clamp(positive - risk.penalty));

  return { confidence, layers, riskPenalty: risk.penalty, riskNote: risk.note, model: 'v4' };
}

module.exports = { scoreV4, WEIGHTS, RISK_PENALTY_MAX };

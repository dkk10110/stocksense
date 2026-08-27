const test = require('node:test');
const assert = require('node:assert/strict');
const { uptrend, flat, makeRows } = require('./helpers');

const { scoreDetection, WEIGHTS, scoreMacro, scoreFiiDii, scoreNewsIntelligence } = require('../src/services/scoring/compositeScorer');
const { scoreV4, WEIGHTS: V4_WEIGHTS, RISK_PENALTY_MAX } = require('../src/services/scoring/scoreV4');
const { computeTradeLevelsForDiscovery } = require('../src/services/discovery/tradeLevels');

const baseDetection = (over = {}) => ({
  type: 'compression', symbol: 'TEST', price: 100,
  evidence: { bandLow: 98, bandHigh: 102, rsi: 50, bandDays: 5 },
  ...over,
});

// ---------- v3 composite scorer ----------
test('v3 WEIGHTS sum to 1.0', () => {
  const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('scoreMacro: low VIX → high macro score, high VIX → low', () => {
  assert.ok(scoreMacro({ vix: 11 }).score >= 90);
  assert.ok(scoreMacro({ vix: 25 }).score <= 20);
  assert.equal(scoreMacro({}).pending, true);
});

test('scoreFiiDii: net buying lifts score, heavy outflow sets veto', () => {
  assert.ok(scoreFiiDii({ fiiNetCr: 1000, diiNetCr: 500 }).score > 50);
  assert.equal(scoreFiiDii({ fiiNetCr: -1200, diiNetCr: -800 }).veto, true);
  assert.equal(scoreFiiDii(null).pending, true);
});

test('scoreNewsIntelligence: passes through a real sentiment, neutral+pending otherwise', () => {
  assert.deepEqual(
    { s: scoreNewsIntelligence({ score: 80, pending: false, note: 'x' }).score },
    { s: 80 },
  );
  assert.equal(scoreNewsIntelligence(null).pending, true);
  assert.equal(scoreNewsIntelligence(null).score, 50);
});

test('scoreDetection: returns a confidence, gates, per-type trade levels', () => {
  const rows = uptrend(120, 100, 0.2);
  const out = scoreDetection(baseDetection(), { rows, macro: { vix: 12 }, fiiDii: { fiiNetCr: 200, diiNetCr: 200 } });
  assert.equal(typeof out.confidence, 'number');
  assert.ok('vixSafe' in out.gates && 'riskRewardOk' in out.gates && 'volumeSufficient' in out.gates);
  assert.ok(out.trade.entryLow <= out.trade.entryHigh);
  assert.ok(out.trade.target > 100 && out.trade.stop < 100);
});

test('scoreDetection: high VIX fails the vixSafe gate', () => {
  const rows = uptrend(120, 100, 0.2);
  const out = scoreDetection(baseDetection(), { rows, macro: { vix: 30 } });
  assert.equal(out.gates.vixSafe, false);
  assert.equal(out.passedAllGates, false);
});

test('compression trade levels: entry window is the lower half of the band, stop below band low', () => {
  const rows = uptrend(120, 100, 0.2);
  const out = scoreDetection(baseDetection(), { rows, macro: { vix: 12 } });
  assert.equal(out.trade.entryLow, 98);            // band low
  assert.equal(out.trade.entryHigh, 100);          // band midpoint
  assert.ok(out.trade.stop < 98);                  // below the band's lowest point
});

// ---------- v4 scorer ----------
test('v4 positive WEIGHTS sum to 100', () => {
  const sum = Object.values(V4_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100);
});

test('scoreV4: returns 0-100 confidence, layer breakdown, and a bounded risk penalty', () => {
  const rows = uptrend(120, 100, 0.3);
  const bench = uptrend(120, 100, 0.2);
  const out = scoreV4({ type: 'mtf_breakout', symbol: 'T', price: 130, evidence: { rsi: 62 } }, {
    rows, benchRows: bench, sectorScore: 70, rsPercentile: 88,
    fundamentals: null, newsSentiment: null, catalyst: null,
    breadth: { advanceDeclineRatio: 1.4, pctAbove50EMA: 62 },
    vix: 12, fiiDii: { fiiNetCr: 300, diiNetCr: 200 }, liquidity: { avgTurnoverCr: 40 }, earningsInDays: null,
  });
  assert.ok(out.confidence >= 0 && out.confidence <= 100);
  assert.equal(out.model, 'v4');
  assert.ok(out.riskPenalty >= 0 && out.riskPenalty <= RISK_PENALTY_MAX);
  assert.ok(Object.keys(out.layers).length === 9);
});

test('scoreV4: a strong context scores clearly higher than a weak one', () => {
  const rows = uptrend(120, 100, 0.3);
  const bench = uptrend(120, 100, 0.2);
  const strong = scoreV4({ type: 'rs_leader', symbol: 'T', price: 130, evidence: { rsi: 60 } }, {
    rows, benchRows: bench, sectorScore: 85, rsPercentile: 95, fundamentals: null, newsSentiment: { score: 80, pending: false },
    catalyst: null, breadth: { advanceDeclineRatio: 2, pctAbove50EMA: 75 }, vix: 11, fiiDii: { fiiNetCr: 800, diiNetCr: 400 }, liquidity: { avgTurnoverCr: 80 },
  }).confidence;
  const weak = scoreV4({ type: 'volume', symbol: 'T', price: 130, evidence: { rsi: 40 } }, {
    rows, benchRows: bench, sectorScore: 30, rsPercentile: 20, fundamentals: null, newsSentiment: null,
    catalyst: null, breadth: { advanceDeclineRatio: 0.4, pctAbove50EMA: 25 }, vix: 24, fiiDii: { fiiNetCr: -200, diiNetCr: -100 }, liquidity: { avgTurnoverCr: 1 },
  }).confidence;
  assert.ok(strong > weak + 10, `strong ${strong} vs weak ${weak}`);
});

// ---------- discovery trade levels ----------
test('computeTradeLevelsForDiscovery: sensible levels + positive R/R for each type', () => {
  const rows = uptrend(120, 100, 0.3);
  for (const type of ['institutional', 'rotation', 'rs_leader', 'high_delivery', 'mtf_breakout']) {
    const t = computeTradeLevelsForDiscovery({ type, price: 130, evidence: { priorDailyHigh: 128 } }, rows);
    assert.ok(t.target > 130 && t.stop < 130, `${type} levels`);
    assert.ok(t.rr > 0, `${type} rr`);
    assert.ok(t.days > 0 && t.upside > 0);
  }
});

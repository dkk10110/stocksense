const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRows, uptrend, flat, choppyUptrend } = require('./helpers');

const { detectInstitutionalAccumulation } = require('../src/services/detectors/institutionalAccumulation');
const { detectRelativeStrengthLeader } = require('../src/services/detectors/relativeStrengthLeader');
const { detectSectorRotation } = require('../src/services/detectors/sectorRotation');
const { detectHighDeliveryAccumulation } = require('../src/services/detectors/highDeliveryAccumulation');
const { detectMultiTimeframeBreakout } = require('../src/services/detectors/multiTimeframeBreakout');

// ---------- institutional accumulation ----------
test('institutional: null on a flat market with no volume signature', () => {
  assert.equal(detectInstitutionalAccumulation(flat(80, 100)), null);
});

test('institutional: fires on repeated up-day volume + rising floor', () => {
  // choppy grind higher (RSI stays moderate), heavy volume on up-days in the last 15 bars
  const rows = choppyUptrend(80, 100, 0.13, 2.6,
    (i) => (i >= 64 && i % 2 === 1 ? 2_600_000 : 850_000), { rangePct: 0.006 });
  const hit = detectInstitutionalAccumulation(rows);
  assert.ok(hit, 'expected institutional hit');
  assert.equal(hit.type, 'institutional');
  assert.ok(hit.evidence.upVolumeDays >= 4);
});

// ---------- relative strength leader ----------
test('rs_leader: null when RS percentile is below the threshold', () => {
  const stock = uptrend(150, 100, 0.5);
  const bench = uptrend(150, 100, 0.4);
  assert.equal(detectRelativeStrengthLeader(stock, bench, 50), null);
});

test('rs_leader: fires when near 52w high, outperforming, still making higher highs', () => {
  const bench = choppyUptrend(160, 100, 0.05, 0.8);   // mild uptrend
  const stock = choppyUptrend(160, 100, 0.22, 1.0);   // far stronger, choppy so RSI stays < 78, ends near its high
  const hit = detectRelativeStrengthLeader(stock, bench, 92);
  assert.ok(hit, 'expected rs_leader hit');
  assert.equal(hit.type, 'rs_leader');
  assert.ok(hit.evidence.outperformancePct > 0);
});

// ---------- sector rotation ----------
test('rotation: null when the sector is not top-ranked', () => {
  const rows = uptrend(80, 100, 0.4);
  assert.equal(detectSectorRotation(rows, { sector: 'IT', rank: 9, score: 40, prevScore: 38, avgMember21dReturnPct: 1 }), null);
});

test('rotation: fires when sector is top-3, improving, and the stock leads its peers', () => {
  const rows = choppyUptrend(80, 100, 0.18, 2.8); // strong choppy 21d return, RSI < 72
  const ctx = { sector: 'Auto', rank: 2, score: 68, prevScore: 60, avgMember21dReturnPct: 2 };
  const hit = detectSectorRotation(rows, ctx);
  assert.ok(hit, 'expected rotation hit');
  assert.equal(hit.type, 'rotation');
  assert.equal(hit.evidence.sectorRank, 2);
});

// ---------- high delivery accumulation ----------
test('high_delivery: null when daily range is wide', () => {
  const rows = makeRows(80, (i) => 100 + i * 0.1, () => 1_000_000, { rangePct: 0.03 });
  assert.equal(detectHighDeliveryAccumulation(rows, null), null);
});

test('high_delivery: fires on a narrow-range steady-volume grind; real delivery% confirms', () => {
  const rows = choppyUptrend(80, 100, 0.08, 0.9, () => 1_000_000, { rangePct: 0.004 });
  const hit = detectHighDeliveryAccumulation(rows, 72);
  assert.ok(hit, 'expected high_delivery hit');
  assert.equal(hit.type, 'high_delivery');
  assert.equal(hit.evidence.deliveryPct, 72);
});

test('high_delivery: real delivery% below 60 blocks it', () => {
  const rows = choppyUptrend(80, 100, 0.08, 0.9, () => 1_000_000, { rangePct: 0.004 });
  assert.equal(detectHighDeliveryAccumulation(rows, 40), null);
});

// ---------- multi-timeframe breakout ----------
test('mtf_breakout: null when price is mid-range', () => {
  assert.equal(detectMultiTimeframeBreakout(flat(150, 100)), null);
});

test('mtf_breakout: fires when daily + weekly both break prior highs on volume', () => {
  const RAMP = 143;
  const rows = makeRows(150, (i) => {
    if (i < RAMP) return 100 + 2.5 * Math.sin(i / 4);              // months range-bound ~97.5-102.5
    return 100 + 2.5 * Math.sin(RAMP / 4) + (i - RAMP) * 1.6;      // steep breakout, last ~7 bars
  }, (i) => (i === 149 ? 2_400_000 : 900_000), { rangePct: 0.005 });
  const hit = detectMultiTimeframeBreakout(rows);
  assert.ok(hit, 'expected mtf_breakout hit');
  assert.equal(hit.type, 'mtf_breakout');
  assert.ok(hit.evidence.breakoutVolumeVs20dAvg > 1.3);
});

test('every L2 detector returns null (not throw) on 300 bars of random noise', () => {
  const rows = makeRows(300, () => 100 + (Math.random() - 0.5) * 4, () => 500_000 + Math.random() * 1e6);
  const bench = makeRows(300, () => 100 + (Math.random() - 0.5) * 2);
  assert.doesNotThrow(() => {
    detectInstitutionalAccumulation(rows);
    detectRelativeStrengthLeader(rows, bench, 50);
    detectSectorRotation(rows, { sector: 'X', rank: 4, score: 55, prevScore: 55, avgMember21dReturnPct: 0 });
    detectHighDeliveryAccumulation(rows, null);
    detectMultiTimeframeBreakout(rows);
  });
});

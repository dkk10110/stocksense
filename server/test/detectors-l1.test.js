const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRows, uptrend, flat, crashThenBounce } = require('./helpers');

const { detectCompression } = require('../src/services/detectors/compression');
const { detectVolumeReversal } = require('../src/services/detectors/volumeReversal');
const { detectFallenAngel, fundamentalScore } = require('../src/services/detectors/fallenAngel');
const { detectEarningsPlay } = require('../src/services/detectors/earningsPlay');
const { detectCatalystCountdown } = require('../src/services/detectors/catalystCountdown');

// ---------- compression ----------
test('compression: null when the recent band is wide (>3%)', () => {
  // last bars swing ±4% → (high-low)/close well above the 3% threshold
  const rows = makeRows(100, (i) => 100 + 4 * Math.sin(i), () => 1_000_000, { rangePct: 0.02 });
  assert.equal(detectCompression(rows), null);
});

test('compression: fires on a tight low-volume band after a wider prior range', () => {
  // 80 bars of moderate volatility, then 6 very tight bars with declining volume
  const rows = makeRows(90, (i) => {
    if (i < 84) return 100 + 8 * Math.sin(i / 3);      // wider swings earlier
    return 100 + 0.2 * ((i % 2) - 0.5);                // ~0.2% band at the end
  }, (i) => (i < 84 ? 1_000_000 : 1_000_000 - (i - 83) * 50_000), { rangePct: 0.004 });
  const hit = detectCompression(rows);
  assert.ok(hit, 'expected a compression hit');
  assert.equal(hit.type, 'compression');
  assert.ok(hit.evidence.bandLow < hit.evidence.bandHigh);
  assert.equal(hit.evidence.volumeTrend, 'declining');
});

test('compression: null when volume is rising in the band', () => {
  const rows = makeRows(90, (i) => (i < 84 ? 100 + 8 * Math.sin(i / 3) : 100.1), (i) => 1_000_000 + i * 10_000, { rangePct: 0.004 });
  assert.equal(detectCompression(rows), null);
});

// ---------- volume reversal ----------
test('volume reversal: null without ~210 bars', () => {
  assert.equal(detectVolumeReversal(uptrend(150)), null);
});

test('volume reversal: null on a strong uptrend far from support', () => {
  assert.equal(detectVolumeReversal(uptrend(240, 100, 0.6)), null);
});

// ---------- fallen angel ----------
test('fallen angel: null without ~260 bars', () => {
  assert.equal(detectFallenAngel(crashThenBounce(200), null, null), null);
});

test('fallen angel: null when drop is outside the 30-55% band', () => {
  assert.equal(detectFallenAngel(crashThenBounce(300, 200, 10), null, null), null); // only 10% off high
});

test('fallen angel: business-deterioration classification vetoes the setup', () => {
  const rows = crashThenBounce(300, 200, 45, 4);
  const out = detectFallenAngel(rows, null, { external: false, classification: 'business', reason: 'profit warning' });
  assert.equal(out, null);
});

test('fundamentalScore: strong fundamentals score high, missing data → null', () => {
  assert.equal(fundamentalScore(null), null);
  const strong = fundamentalScore({
    roe: 22, roce: 20, debtToEquity: 0.3,
    quarters: Array.from({ length: 8 }, (_, i) => ({ sales: 100 + i * 5, netProfit: 10 + i })),
  });
  assert.ok(strong >= 70, `got ${strong}`);
});

// ---------- earnings play ----------
const inDays = (n) => new Date(Date.now() + n * 86400000);

test('earnings play: null when no results date', () => {
  assert.equal(detectEarningsPlay(uptrend(60), null, null), null);
});

test('earnings play: null when results are outside the 4-8 day window', () => {
  const f = { quarters: Array.from({ length: 8 }, (_, i) => ({ sales: 100 + i, netProfit: 10 + i })) };
  assert.equal(detectEarningsPlay(flat(60, 100), f, inDays(20)), null);
});

test('earnings play: fires with a growth streak, results in 6 days, calm RSI, no run-up', () => {
  const rows = flat(60, 100, 0.05); // flat → RSI ~50, run-up ~0
  const f = { quarters: Array.from({ length: 9 }, (_, i) => ({ sales: 100 + i * 8, netProfit: 10 + i * 2 })) };
  const hit = detectEarningsPlay(rows, f, inDays(6));
  assert.ok(hit, 'expected earnings hit');
  assert.equal(hit.type, 'earnings');
  assert.equal(hit.evidence.resultsInDays >= 4 && hit.evidence.resultsInDays <= 8, true);
  assert.ok(hit.evidence.yoyGrowthStreakQuarters >= 2);
});

test('earnings play: null when the stock already ran up >5% in 10 days', () => {
  const rows = makeRows(60, (i) => (i < 50 ? 100 : 100 * Math.pow(1.02, i - 49))); // +~20% last 10 bars
  const f = { quarters: Array.from({ length: 9 }, (_, i) => ({ sales: 100 + i * 8, netProfit: 10 + i * 2 })) };
  assert.equal(detectEarningsPlay(rows, f, inDays(6)), null);
});

// ---------- catalyst countdown ----------
test('catalyst countdown: null without an extracted event', () => {
  assert.equal(detectCatalystCountdown(uptrend(60), null, null), null);
});

test('catalyst countdown: null when the event is outside 7-14 days', () => {
  const evt = { eventDate: inDays(30), label: 'FDA decision', expectedImpactPct: 10, confidence: 80 };
  assert.equal(detectCatalystCountdown(flat(60, 100), evt, null), null);
});

test('catalyst countdown: fires for a dated event 9 days out with calm RSI', () => {
  const evt = { eventDate: inDays(9), label: 'US FDA advisory panel', expectedImpactPct: 12, confidence: 82 };
  const hit = detectCatalystCountdown(flat(60, 100, 0.05), evt, { fiiNetCr: 500, diiNetCr: 300 });
  assert.ok(hit, 'expected catalyst hit');
  assert.equal(hit.type, 'catalyst');
  assert.equal(hit.evidence.daysToEvent, 9);
  assert.equal(hit.evidence.fiiDiiAccumulating, true);
  assert.ok(hit.catalystDate instanceof Date);
});

test('catalyst countdown: heavy institutional selling vetoes it', () => {
  const evt = { eventDate: inDays(9), label: 'x', expectedImpactPct: 10, confidence: 80 };
  assert.equal(detectCatalystCountdown(flat(60, 100), evt, { fiiNetCr: -900, diiNetCr: -200 }), null);
});

test('every L1 detector returns null (not throw) on 300 bars of random noise', () => {
  const rows = makeRows(300, () => 100 + (Math.random() - 0.5) * 4, () => 500_000 + Math.random() * 1e6);
  assert.doesNotThrow(() => {
    detectCompression(rows);
    detectVolumeReversal(rows);
    detectFallenAngel(rows, null, null);
    detectEarningsPlay(rows, null, inDays(6));
    detectCatalystCountdown(rows, null, null);
  });
});

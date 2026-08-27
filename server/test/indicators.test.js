const test = require('node:test');
const assert = require('node:assert/strict');
const ind = require('../src/services/indicators');
const { uptrend, flat, makeRows } = require('./helpers');

test('closes / volumes / lows / highs map numeric arrays', () => {
  const rows = uptrend(5, 100, 1);
  assert.equal(ind.closes(rows).length, 5);
  assert.ok(ind.closes(rows).every((n) => typeof n === 'number'));
  assert.ok(ind.lows(rows)[0] < ind.highs(rows)[0]);
});

test('rsiSeries: strong uptrend → RSI high (>70)', () => {
  const rows = uptrend(60, 100, 0.8);
  const rsi = ind.latestRsi(rows);
  assert.ok(rsi > 70, `expected RSI>70, got ${rsi}`);
});

test('rsiSeries: steady downtrend → RSI low (<30)', () => {
  const rows = uptrend(60, 100, -0.8);
  assert.ok(ind.latestRsi(rows) < 30);
});

test('latestRsi returns null without enough history', () => {
  assert.equal(ind.latestRsi(uptrend(5)), null);
});

test('latestEma is between min and max close', () => {
  const rows = uptrend(120, 100, 0.5);
  const ema = ind.latestEma(rows, 50);
  const cs = ind.closes(rows);
  assert.ok(ema > Math.min(...cs) && ema < Math.max(...cs));
});

test('avgVolume averages the prior N bars, excluding the last', () => {
  const rows = makeRows(25, () => 100, (i) => (i === 24 ? 999 : 100));
  assert.equal(ind.avgVolume(rows, 20), 100);
});

test('bollingerWidthPctSeries: tight range → small width, wide range → larger', () => {
  const tight = ind.latestBollingerWidthPct(flat(60, 100, 0.1));
  const wide = ind.latestBollingerWidthPct(uptrend(60, 100, 1.5));
  assert.ok(tight < wide);
});

test('returnPct computes lookback % change', () => {
  const rows = makeRows(30, (i) => 100 * Math.pow(1.01, i)); // +1%/bar compounding
  const r = ind.returnPct(rows, 10);
  assert.ok(r > 9.5 && r < 11, `got ${r}`); // 1.01^10 - 1 ≈ 10.46%
});

test('returnPct is 0 when lookback exceeds history', () => {
  assert.equal(ind.returnPct(uptrend(5), 10), 0);
});

test('sma returns null below period, else the mean', () => {
  assert.equal(ind.sma(uptrend(5), 10), null);
  assert.equal(ind.sma(makeRows(10, () => 50), 10), 50);
});

test('priorHigh / priorLow exclude the current bar', () => {
  const rows = makeRows(30, (i) => (i === 29 ? 500 : 100), () => 1, { rangePct: 0 });
  assert.equal(ind.priorHigh(rows, 10), 100);
  assert.equal(ind.priorLow(rows, 10), 100);
});

test('pivotLows finds a clear V bottom', () => {
  // low at index 15, higher on both sides
  const rows = makeRows(31, (i) => 100 + Math.abs(i - 15), () => 1, { rangePct: 0 });
  const pivots = ind.pivotLows(rows, 5);
  assert.ok(pivots.some((p) => p.index === 15));
});

test('demandZones clusters repeated lows into a touched shelf', () => {
  // two separate dips to ~90 with recoveries between
  const rows = makeRows(80, (i) => {
    const d1 = Math.max(0, 10 - Math.abs(i - 20));
    const d2 = Math.max(0, 10 - Math.abs(i - 55));
    return 100 - d1 - d2;
  }, () => 1, { rangePct: 0 });
  const zones = ind.demandZones(rows, { k: 5, tolerancePct: 0.05 });
  assert.ok(zones.length >= 1);
  assert.ok(zones[0].touches >= 2, `expected a 2-touch zone, got ${JSON.stringify(zones)}`);
});

test('toWeekly buckets ~5 daily bars into 1 weekly bar', () => {
  const rows = uptrend(20, 100, 0.5); // 20 trading days ≈ 4 weeks
  const weekly = ind.toWeekly(rows);
  assert.ok(weekly.length >= 3 && weekly.length <= 6, `got ${weekly.length}`);
  // weekly high >= any daily high in that span
  assert.ok(weekly[weekly.length - 1].close > weekly[0].close);
});

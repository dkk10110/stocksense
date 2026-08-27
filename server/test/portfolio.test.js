const test = require('node:test');
const assert = require('node:assert/strict');
const { uptrend } = require('./helpers');
const { recommendForPosition, recommendForWatchlist } = require('../src/services/portfolio/recommendations');
const { assessPortfolio } = require('../src/services/portfolio/portfolioRisk');

const pos = (over) => ({ buyPrice: 100, currentPrice: 100, stop: 97, qty: 100, daysHeld: 3, signalType: 'compression', sector: 'IT', status: 'open', name: 'X', ...over });

test('recommendForPosition: EXIT when price is at/below the stop', () => {
  const r = recommendForPosition(pos({ currentPrice: 96 }), { swingWindow: 15 });
  assert.equal(r.action, 'exit');
});

test('recommendForPosition: BOOK PROFIT at +10% (full target)', () => {
  const r = recommendForPosition(pos({ currentPrice: 111 }), { swingWindow: 15 });
  assert.equal(r.action, 'book_profit');
});

test('recommendForPosition: BOOK PROFIT at +7% late in the window', () => {
  const r = recommendForPosition(pos({ currentPrice: 107.5, daysHeld: 13 }), { swingWindow: 15 });
  assert.equal(r.action, 'book_profit');
});

test('recommendForPosition: EXIT when the window elapsed and the move never came', () => {
  const r = recommendForPosition(pos({ currentPrice: 100.5, daysHeld: 16 }), { swingWindow: 15 });
  assert.equal(r.action, 'exit');
});

test('recommendForPosition: AVERAGE when down modestly, early, thesis intact', () => {
  const { choppyUptrend } = require('./helpers');
  const rows = choppyUptrend(120, 100, 0.05, 1.5); // RSI mid-range (~45-55)
  // -3.5% from buy, but comfortably above the stop, only 4 days in, signal still active
  const r = recommendForPosition(pos({ currentPrice: 96.5, stop: 92, daysHeld: 4 }), { swingWindow: 15, signalActive: true, rows });
  assert.equal(r.action, 'average');
});

test('recommendForPosition: HOLD when in profit, within window, target not hit', () => {
  const r = recommendForPosition(pos({ currentPrice: 104, daysHeld: 5 }), { swingWindow: 15, signalActive: true, rows: [] });
  assert.equal(r.action, 'hold');
});

test('recommendForWatchlist: BUY on a strong active signal, HOLD otherwise', () => {
  assert.equal(recommendForWatchlist({ signal: { active: true, confidence: 72, type: 'earnings', entryLow: 10, entryHigh: 11 } }).action, 'buy');
  assert.equal(recommendForWatchlist({ signal: { active: true, confidence: 40 } }).action, 'hold');
  assert.equal(recommendForWatchlist({ signal: null }).action, 'hold');
});

test('assessPortfolio: empty portfolio → zeros, no flags', () => {
  const a = assessPortfolio([]);
  assert.equal(a.positions, 0);
  assert.deepEqual(a.flags, []);
});

test('assessPortfolio: computes deployed, stop-risk, heat and sector allocation', () => {
  const a = assessPortfolio([
    { status: 'open', name: 'A', sector: 'IT', buyPrice: 100, currentPrice: 105, stop: 96, qty: 100 },
    { status: 'open', name: 'B', sector: 'Auto', buyPrice: 50, currentPrice: 52, stop: 48, qty: 200 },
  ]);
  assert.equal(a.positions, 2);
  assert.ok(a.deployedAmt > 0);
  assert.ok(a.totalRiskAmt > 0);
  assert.equal(a.sectorAllocation.reduce((s, x) => s + x.weightPct, 0) > 99, true);
});

test('assessPortfolio: flags single-name and sector concentration', () => {
  const a = assessPortfolio([
    { status: 'open', name: 'Big', sector: 'IT', buyPrice: 100, currentPrice: 100, stop: 90, qty: 1000 },
    { status: 'open', name: 'Small', sector: 'IT', buyPrice: 100, currentPrice: 100, stop: 90, qty: 10 },
  ]);
  assert.ok(a.flags.some((f) => /Big/.test(f)));
  assert.ok(a.flags.some((f) => /IT/.test(f)));
});

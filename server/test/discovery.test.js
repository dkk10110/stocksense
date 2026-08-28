const test = require('node:test');
const assert = require('node:assert/strict');
const { uptrend, flat, makeRows } = require('./helpers');

const { assessLiquidity } = require('../src/services/discovery/liquidityFilter');
const { rankSectors } = require('../src/services/sector/sectorRanking');
const uni = require('../src/services/discovery/universe');
const { searchSymbols } = require('../src/services/marketData/yahooFinance');
const news = require('../src/services/marketData/newsApi');

// ---------- universe ----------
test('universe: getUniverse returns {symbol,sector} entries; sectorOf + toYahoo work', () => {
  const u = uni.getUniverse();
  assert.ok(u.length > 100);
  assert.ok(u.every((e) => e.symbol && e.sector));
  assert.equal(uni.sectorOf('TCS'), 'IT');
  assert.equal(uni.toYahoo('TCS'), 'TCS.NS');
  assert.equal(uni.toYahoo('M_M'), 'M&M.NS');       // override
  assert.equal(uni.toYahoo('BAJAJ_AUTO'), 'BAJAJ-AUTO.NS');
  assert.ok(uni.ALL_SECTORS.includes('Pharma'));
});

// ---------- symbol typeahead search ----------
test('searchSymbols: <2 chars → empty; a common prefix → several {symbol,name} matches', async () => {
  assert.deepEqual(await searchSymbols('t'), []);
  const r = await searchSymbols('TATA'); // curated backfill covers this even with no network
  assert.ok(r.length >= 3, `expected >=3 Tata matches, got ${r.length}`);
  assert.ok(r.every((x) => x.symbol === x.symbol.toUpperCase() && typeof x.name === 'string'));
  assert.ok(r.some((x) => x.symbol === 'TATASTEEL'));
  assert.ok(!r.some((x) => x.symbol.includes('_'))); // internal keys not exposed
});

// ---------- news provider switch ----------
test('news: defaults to the google provider and needs no key', () => {
  assert.equal(news.PROVIDER, 'google');       // NEWS_PROVIDER unset in tests
  assert.equal(news.isConfigured(), true);      // google/yahoo need no key
  assert.equal(typeof news.fetchRecentArticles, 'function');
});

// ---------- liquidity filter ----------
test('liquidity: passes a normal liquid stock', () => {
  const rows = uptrend(80, 500, 0.1); // ₹500, 1M shares/day → ₹5Cr turnover
  assert.equal(assessLiquidity(rows).pass, true);
});

test('liquidity: rejects too little history', () => {
  assert.equal(assessLiquidity(uptrend(30)).pass, false);
});

test('liquidity: rejects a penny stock below the min price', () => {
  const rows = uptrend(80, 5, 0.1);
  const r = assessLiquidity(rows);
  assert.equal(r.pass, false);
  assert.match(r.reason, /price/);
});

test('liquidity: rejects thin turnover', () => {
  const rows = makeRows(80, () => 100, () => 100); // ₹100 * 100 shares = ₹0.001Cr/day
  const r = assessLiquidity(rows);
  assert.equal(r.pass, false);
  assert.match(r.reason, /turnover/);
});

test('liquidity: rejects a flatlined (suspended) series', () => {
  const rows = makeRows(80, () => 100, () => 1_000_000, { rangePct: 0 });
  const r = assessLiquidity(rows);
  assert.equal(r.pass, false);
  assert.match(r.reason, /flatlined/);
});

// ---------- sector ranking ----------
test('sectorRanking: ranks a strong sector above a weak one, scores 0-100, assigns ranks', () => {
  const bench = makeRows(120, (i) => 100 * Math.pow(1.001, i));
  const bySymbol = new Map([
    ['AAA', { rows: makeRows(120, (i) => 100 * Math.pow(1.004, i)), sector: 'Strong' }],
    ['BBB', { rows: makeRows(120, (i) => 100 * Math.pow(1.0038, i)), sector: 'Strong' }],
    ['CCC', { rows: makeRows(120, (i) => 100 * Math.pow(0.999, i)), sector: 'Weak' }],
    ['DDD', { rows: makeRows(120, (i) => 100 * Math.pow(0.9985, i)), sector: 'Weak' }],
  ]);
  const { all, top } = rankSectors(bySymbol, bench, { topN: 7 });
  assert.equal(all.length, 2);
  const strong = all.find((s) => s.sector === 'Strong');
  const weak = all.find((s) => s.sector === 'Weak');
  assert.ok(strong.score > weak.score, `${strong.score} vs ${weak.score}`);
  assert.equal(strong.rank, 1);
  assert.ok(all.every((s) => s.score >= 0 && s.score <= 100));
  assert.ok(strong.breakdown.pendingInputs.includes('deliveryPct'));
  assert.ok(top.length <= 7);
});

const YahooFinance = require('yahoo-finance2').default;
const { saveRows } = require('../marketData/priceHistoryStore');
const { getUniverse, toYahoo } = require('./universe');

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/** Small promise pool so a ~160-symbol pull stays inside the FRD's 10-minute scan budget without hammering Yahoo. */
async function pool(items, size, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await worker(items[idx], idx); }
      catch (err) { results[idx] = { error: err.message }; }
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Pulls ~1 year of daily OHLCV for every universe symbol into PriceHistory.
 * `since` defaults to ~400 days (enough for 200-EMA + 52-week + 63-day RS windows).
 */
async function ingestUniverse({ since = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), concurrency = 6 } = {}) {
  const universe = getUniverse();
  let saved = 0;
  const failures = [];

  await pool(universe, concurrency, async ({ symbol }) => {
    try {
      const result = await yf.chart(toYahoo(symbol), { period1: since, interval: '1d' });
      const rows = result.quotes
        .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
        .map((q) => ({
          symbol,
          date: new Date(q.date.toISOString().split('T')[0]),
          open: Number(q.open.toFixed(2)),
          high: Number(q.high.toFixed(2)),
          low: Number(q.low.toFixed(2)),
          close: Number(q.close.toFixed(2)),
          volume: BigInt(q.volume || 0),
          source: 'yahoo',
        }));
      saved += await saveRows(rows);
    } catch (err) {
      failures.push({ symbol, error: err.message });
    }
  });

  return { universe: universe.length, saved, failures };
}

module.exports = { ingestUniverse };

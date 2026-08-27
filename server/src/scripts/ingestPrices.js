require('dotenv').config();
const prisma = require('../lib/prisma');
const { fetchDailyHistory } = require('../services/marketData/yahooFinance');
const { saveRows } = require('../services/marketData/priceHistoryStore');
const { collectTrackedSymbols } = require('../services/marketData/trackedSymbols');

async function ingestPrices() {
  const symbols = await collectTrackedSymbols();
  console.log(`Ingesting daily price history for ${symbols.length} symbols: ${symbols.join(', ')}`);

  let totalSaved = 0;
  const failures = [];

  // ~2 years: covers the 52-week-high / 60-day-lookback detectors AND leaves a usable walk-forward
  // window for `npm run backtest` (PRD §9 wk2 wants 2 years of history).
  const sinceDate = new Date(Date.now() - 760 * 24 * 60 * 60 * 1000);

  for (const symbol of symbols) {
    try {
      const rows = await fetchDailyHistory(symbol, sinceDate);
      const saved = await saveRows(rows);
      totalSaved += saved;
      console.log(`  ${symbol}: ${saved} rows (Yahoo Finance)`);
    } catch (err) {
      failures.push({ symbol, error: err.message });
      console.error(`  ${symbol}: FAILED — ${err.message}`);
    }
  }

  console.log(`\nDone. ${totalSaved} rows upserted across ${symbols.length - failures.length}/${symbols.length} symbols.`);
  if (failures.length) console.log('Failures:', failures);
  return { totalSaved, failures };
}

module.exports = { ingestPrices };

if (require.main === module) {
  ingestPrices()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

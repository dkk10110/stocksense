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

  const sinceDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000); // ~52 weeks of trading days, for 52-week-high and 60-day-lookback detectors

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

require('dotenv').config();
const prisma = require('../lib/prisma');
const { collectTrackedSymbols } = require('../services/marketData/trackedSymbols');
const { getHistory } = require('../services/marketData/priceHistoryStore');
const { fetchFundamentals } = require('../services/marketData/screenerIn');
const { fetchNextResultsDate } = require('../services/marketData/nseCalendar');
const { detectCompression } = require('../services/detectors/compression');
const { detectVolumeReversal } = require('../services/detectors/volumeReversal');
const { detectFallenAngel } = require('../services/detectors/fallenAngel');
const { detectEarningsPlay } = require('../services/detectors/earningsPlay');

async function bestEffort(promise, label, symbol) {
  try {
    return await promise;
  } catch (err) {
    console.log(`    [${symbol}] ${label} unavailable: ${err.message}`);
    return null;
  }
}

async function scanSymbol(symbol) {
  const rows = await getHistory(symbol, 300);
  if (rows.length < 30) {
    console.log(`  ${symbol}: skipped — not enough price history (${rows.length} rows). Run "npm run ingest:prices" first.`);
    return [];
  }

  const fundamentals = await bestEffort(fetchFundamentals(symbol), 'fundamentals (Screener.in)', symbol);
  const nextResultsDate = await bestEffort(fetchNextResultsDate(symbol), 'results date (NSE calendar)', symbol);

  const hits = [
    detectCompression(rows),
    detectVolumeReversal(rows),
    detectFallenAngel(rows, fundamentals),
    detectEarningsPlay(rows, fundamentals, nextResultsDate),
  ].filter(Boolean);

  if (!hits.length) {
    console.log(`  ${symbol}: no setup detected`);
  } else {
    hits.forEach((h) => console.log(`  ${symbol}: ⚡ ${h.type} — ${JSON.stringify(h.evidence)}`));
  }
  return hits;
}

async function main() {
  const symbols = await collectTrackedSymbols();
  console.log(`Scanning ${symbols.length} symbols for forward signals: ${symbols.join(', ')}\n`);
  console.log('(catalyst countdown is not run here — it needs Phase 5\'s AI-based news event extraction)\n');

  let totalHits = 0;
  for (const symbol of symbols) {
    const hits = await scanSymbol(symbol);
    totalHits += hits.length;
  }

  console.log(`\nDone. ${totalHits} setup(s) detected across ${symbols.length} symbols.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

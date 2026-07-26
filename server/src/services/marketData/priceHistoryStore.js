const prisma = require('../../lib/prisma');

/** Upserts a batch of PriceHistory rows, keyed on (symbol, date). */
async function saveRows(rows) {
  let saved = 0;
  for (const row of rows) {
    await prisma.priceHistory.upsert({
      where: { symbol_date: { symbol: row.symbol, date: row.date } },
      update: { open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume, source: row.source },
      create: row,
    });
    saved += 1;
  }
  return saved;
}

/** Latest stored close price for a symbol, or null if we have no data for it yet. */
async function getLatestClose(symbol) {
  const row = await prisma.priceHistory.findFirst({ where: { symbol }, orderBy: { date: 'desc' } });
  return row ? Number(row.close) : null;
}

/** Stored OHLCV rows for a symbol, chronological (oldest → newest), most recent `limit` bars. */
async function getHistory(symbol, limit = 90) {
  const rows = await prisma.priceHistory.findMany({ where: { symbol }, orderBy: { date: 'desc' }, take: limit });
  return rows.reverse();
}

module.exports = { saveRows, getLatestClose, getHistory };

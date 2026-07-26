const YahooFinance = require('yahoo-finance2').default;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function toNseTicker(symbol) {
  return `${symbol}.NS`;
}

/**
 * Fetches daily OHLCV for an NSE symbol since `sinceDate` (defaults to 30 days back).
 * Returns rows shaped for PriceHistory: { symbol, date, open, high, low, close, volume, source }.
 */
async function fetchDailyHistory(symbol, sinceDate) {
  const period1 = sinceDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await yf.chart(toNseTicker(symbol), { period1, interval: '1d' });

  return result.quotes
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
}

/** Latest close price for an NSE symbol (used for quick price sync). */
async function fetchLatestQuote(symbol) {
  const q = await yf.quote(toNseTicker(symbol));
  return { price: q.regularMarketPrice, asOf: new Date(q.regularMarketTime) };
}

module.exports = { fetchDailyHistory, fetchLatestQuote, toNseTicker };

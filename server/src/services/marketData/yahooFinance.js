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

// Yahoo reports US-style GICS sectors; map the ones we can onto this app's sector vocabulary.
// Anything unmapped is passed through as-is so the value isn't silently lost.
const YAHOO_SECTOR_MAP = {
  Technology: 'IT',
  'Financial Services': 'Banking',
  Healthcare: 'Pharma',
  'Consumer Defensive': 'FMCG',
  Energy: 'Energy',
  'Basic Materials': 'Steel',
  Industrials: 'PSU Infra',
  Utilities: 'Renewables',
  'Consumer Cyclical': 'Auto',
};

/**
 * Resolves a user-typed stock name or ticker to a real NSE symbol plus its current
 * name / sector / price / 52-week high, via Yahoo Finance. Throws if nothing matches.
 */
async function lookupSymbol(query) {
  const raw = String(query || '').trim();
  if (!raw) throw new Error('Empty query');

  let nseTicker = null;
  try {
    const search = await yf.search(raw, { newsCount: 0, quotesCount: 8 });
    const match = (search.quotes || []).find(
      (q) => q.isYahooFinance && q.quoteType === 'EQUITY'
        && (q.exchange === 'NSI' || String(q.symbol).endsWith('.NS')),
    );
    if (match) nseTicker = match.symbol;
  } catch {
    // search is best-effort — fall through to treating the input as a bare ticker
  }
  if (!nseTicker) nseTicker = toNseTicker(raw.toUpperCase().replace(/\.NS$/i, ''));

  const [quote, summary] = await Promise.all([
    yf.quote(nseTicker),
    yf.quoteSummary(nseTicker, { modules: ['assetProfile'] }).catch(() => null),
  ]);
  if (!quote || quote.regularMarketPrice == null) throw new Error(`No market data for "${raw}"`);

  const symbol = String(quote.symbol).replace(/\.NS$/i, '');
  const yahooSector = summary?.assetProfile?.sector || null;

  return {
    symbol,
    name: quote.longName || quote.shortName || quote.displayName || symbol,
    sector: yahooSector ? YAHOO_SECTOR_MAP[yahooSector] || yahooSector : null,
    price: Number(quote.regularMarketPrice.toFixed(2)),
    high52w: quote.fiftyTwoWeekHigh != null ? Number(quote.fiftyTwoWeekHigh.toFixed(2)) : null,
  };
}

module.exports = { fetchDailyHistory, fetchLatestQuote, toNseTicker, lookupSymbol };

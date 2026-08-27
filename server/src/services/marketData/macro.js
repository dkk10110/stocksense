const axios = require('axios');
const YahooFinance = require('yahoo-finance2').default;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/** India VIX via Yahoo Finance — free, no Angel One account needed for this gate. */
async function getIndiaVix() {
  const q = await yf.quote('^INDIAVIX');
  return q.regularMarketPrice;
}

/**
 * NIFTY 50 daily history (chronological, shaped like PriceHistory rows) — the benchmark for
 * relative-strength scoring in the v4 discovery engine. `days` ~ calendar days back.
 */
async function getBenchmarkHistory(days = 300) {
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await yf.chart('^NSEI', { period1, interval: '1d' });
  return result.quotes
    .filter((q) => q.close != null)
    .map((q) => ({
      symbol: 'NIFTY',
      date: new Date(q.date.toISOString().split('T')[0]),
      open: Number((q.open ?? q.close).toFixed(2)),
      high: Number((q.high ?? q.close).toFixed(2)),
      low: Number((q.low ?? q.close).toFixed(2)),
      close: Number(q.close.toFixed(2)),
      volume: BigInt(q.volume || 0),
      source: 'yahoo',
    }));
}

/** S&P 500, Nasdaq, USD/INR, Brent crude — the PRD's morning-pass macro inputs (§5.2). */
async function getGlobalMacro() {
  const [sp500, nasdaq, usdinr, brent] = await Promise.all([
    yf.quote('^GSPC'),
    yf.quote('^IXIC'),
    yf.quote('INR=X'),
    yf.quote('BZ=F').catch(() => null), // Brent crude front-month; occasionally unavailable
  ]);
  return {
    sp500ChangePct: sp500.regularMarketChangePercent,
    nasdaqChangePct: nasdaq.regularMarketChangePercent,
    usdInr: usdinr.regularMarketPrice,
    usdInrChangePct: usdinr.regularMarketChangePercent,
    brentPrice: brent?.regularMarketPrice ?? null,
    brentChangePct: brent?.regularMarketChangePercent ?? null,
  };
}

/**
 * One call for everything the composite scorer's macro layer needs: VIX + global macro,
 * flattened. Each piece degrades to null independently.
 */
async function getMacroSnapshot() {
  const [vix, global] = await Promise.all([
    getIndiaVix().catch(() => null),
    getGlobalMacro().catch(() => null),
  ]);
  return {
    vix,
    sp500ChangePct: global?.sp500ChangePct ?? null,
    nasdaqChangePct: global?.nasdaqChangePct ?? null,
    usdInr: global?.usdInr ?? null,
    usdInrChangePct: global?.usdInrChangePct ?? null,
    brentPrice: global?.brentPrice ?? null,
    brentChangePct: global?.brentChangePct ?? null,
  };
}

/** Whole-market FII/DII net flow for the most recent session (NSE's public daily figures, in ₹Cr). */
async function getFiiDiiFlow() {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', Accept: 'application/json' };
  const client = axios.create({ headers, timeout: 15000 });
  const home = await client.get('https://www.nseindia.com/companies-listing/corporate-filings-event-calendar');
  const cookieHeader = (home.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const res = await client.get('https://www.nseindia.com/api/fiidiiTradeReact', {
    headers: { Cookie: cookieHeader, Referer: 'https://www.nseindia.com/reports/fii-dii' },
  });

  const fii = res.data.find((r) => r.category === 'FII/FPI');
  const dii = res.data.find((r) => r.category === 'DII');
  return {
    date: fii?.date,
    fiiNetCr: fii ? Number(fii.netValue) : null,
    diiNetCr: dii ? Number(dii.netValue) : null,
  };
}

module.exports = { getIndiaVix, getBenchmarkHistory, getGlobalMacro, getMacroSnapshot, getFiiDiiFlow };

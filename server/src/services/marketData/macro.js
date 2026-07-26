const axios = require('axios');
const YahooFinance = require('yahoo-finance2').default;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/** India VIX via Yahoo Finance — free, no Angel One account needed for this gate. */
async function getIndiaVix() {
  const q = await yf.quote('^INDIAVIX');
  return q.regularMarketPrice;
}

/** S&P 500, Nasdaq, USD/INR — the PRD's morning-pass macro inputs. */
async function getGlobalMacro() {
  const [sp500, nasdaq, usdinr] = await Promise.all([
    yf.quote('^GSPC'),
    yf.quote('^IXIC'),
    yf.quote('INR=X'),
  ]);
  return {
    sp500ChangePct: sp500.regularMarketChangePercent,
    nasdaqChangePct: nasdaq.regularMarketChangePercent,
    usdInr: usdinr.regularMarketPrice,
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

module.exports = { getIndiaVix, getGlobalMacro, getFiiDiiFlow };

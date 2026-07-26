const axios = require('axios');
const { parse } = require('csv-parse/sync');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function formatDdMonYyyy(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mon = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  return `${dd}${mon}${date.getFullYear()}`;
}

/**
 * Downloads NSE's full security bhavcopy (EOD OHLCV for every listed security) for one date.
 * NSE requires an initial cookie-bearing visit to nseindia.com before their archive endpoint
 * accepts requests, and blocks many datacenter/cloud source IPs outright (returns 403)
 * regardless of headers — this is a known limitation, not a bug in this client.
 */
async function downloadBhavcopy(date) {
  const client = axios.create({ headers: BROWSER_HEADERS, timeout: 15000 });

  const home = await client.get('https://www.nseindia.com');
  const cookieHeader = (home.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

  const dateStr = formatDdMonYyyy(date);
  const url = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${dateStr}.csv`;
  const res = await client.get(url, { headers: { Cookie: cookieHeader, Referer: 'https://www.nseindia.com/all-reports' } });

  const records = parse(res.data, { columns: true, skip_empty_lines: true, trim: true });

  return records
    .filter((r) => r.SERIES === 'EQ')
    .map((r) => ({
      symbol: r.SYMBOL,
      date,
      open: Number(r.OPEN_PRICE),
      high: Number(r.HIGH_PRICE),
      low: Number(r.LOW_PRICE),
      close: Number(r.CLOSE_PRICE),
      volume: BigInt(r.TTL_TRD_QNTY || 0),
      source: 'nse_bhavcopy',
    }));
}

module.exports = { downloadBhavcopy };

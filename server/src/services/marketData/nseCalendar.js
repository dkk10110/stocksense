const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'application/json',
};

function parseDdMonYyyy(s) {
  // NSE dates look like "27-Jul-2026"
  const [dd, mon, yyyy] = s.split('-');
  return new Date(`${dd} ${mon} ${yyyy}`);
}

/**
 * Fetches NSE's forthcoming corporate events calendar (board meetings, results, etc.)
 * and returns entries for one symbol, nearest-first.
 */
async function fetchUpcomingEvents(symbol) {
  const client = axios.create({ headers: HEADERS, timeout: 15000 });
  const home = await client.get('https://www.nseindia.com/companies-listing/corporate-filings-event-calendar');
  const cookieHeader = (home.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

  const res = await client.get('https://www.nseindia.com/api/event-calendar', {
    headers: { Cookie: cookieHeader, Referer: 'https://www.nseindia.com/companies-listing/corporate-filings-event-calendar' },
  });

  const now = new Date();
  return res.data
    .filter((e) => e.symbol === symbol)
    .map((e) => ({ purpose: e.purpose, description: e.bm_desc, date: parseDdMonYyyy(e.date) }))
    .filter((e) => e.date >= now)
    .sort((a, b) => a.date - b.date);
}

/** The nearest upcoming "Financial Results" event for a symbol, or null if none scheduled. */
async function fetchNextResultsDate(symbol) {
  const events = await fetchUpcomingEvents(symbol);
  const resultsEvent = events.find((e) => /financial results/i.test(e.purpose));
  return resultsEvent ? resultsEvent.date : null;
}

module.exports = { fetchUpcomingEvents, fetchNextResultsDate };

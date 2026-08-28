const axios = require('axios');
const cheerio = require('cheerio');
const YahooFinance = require('yahoo-finance2').default;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * News source for the catalyst detector + news-sentiment scoring layer.
 * Provider is chosen by NEWS_PROVIDER (default `google`):
 *   - google   — Google News RSS. Free, no key, works in production, good Indian-market coverage. Default.
 *   - marketaux — marketaux.com. Free key, finance-specific (ticker-tagged + sentiment).
 *   - newsapi  — newsapi.org. Free key is dev-only; blocked on deployed servers (paid = $449/mo).
 *   - yahoo    — Yahoo Finance search news. Free, no key, but weak coverage for NSE/BSE stocks.
 *
 * All providers return the same shape: [{ title, description, source, publishedAt, url }].
 */
const PROVIDER = (process.env.NEWS_PROVIDER || 'google').toLowerCase();

function isConfigured() {
  if (PROVIDER === 'marketaux') return !!process.env.MARKETAUX_API_KEY;
  if (PROVIDER === 'newsapi') return !!process.env.NEWS_API_KEY;
  return true; // google / yahoo — no key needed
}

const norm = (a) => ({
  title: (a.title || '').trim(),
  description: (a.description || '').trim(),
  source: (a.source || '').trim(),
  publishedAt: a.publishedAt || null,
  url: (a.url || '').trim(),
});

const iso = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

async function fetchViaGoogleNews(query, limit) {
  const q = `${query} when:21d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
    timeout: 15000,
  });
  const $ = cheerio.load(res.data, { xmlMode: true });
  const out = [];
  $('item').each((_, el) => {
    if (out.length >= limit) return;
    const $el = $(el);
    const descHtml = $el.find('description').first().text();
    out.push(norm({
      title: $el.find('title').first().text(),
      description: descHtml ? cheerio.load(descHtml).text().replace(/\s+/g, ' ').slice(0, 280) : '',
      source: $el.find('source').first().text(),
      publishedAt: iso($el.find('pubDate').first().text()),
      url: $el.find('link').first().text(),
    }));
  });
  return out;
}

async function fetchViaYahoo(query, symbol, limit) {
  const terms = [symbol && `${symbol}.NS`, symbol, query].filter(Boolean);
  for (const term of terms) {
    try {
      const res = await yf.search(term, { newsCount: Math.min(limit, 20), quotesCount: 3, enableFuzzyQuery: false });
      const news = res.news || [];
      if (news.length) {
        return news.slice(0, limit).map((n) => norm({
          title: n.title,
          source: n.publisher,
          publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : null,
          url: n.link,
        }));
      }
    } catch { /* try the next search term */ }
  }
  return [];
}

async function fetchViaMarketaux(query, symbol, limit) {
  const params = { api_token: process.env.MARKETAUX_API_KEY, language: 'en', limit: Math.min(limit, 50) };
  if (symbol) params.symbols = `${symbol}.NS`;
  else params.search = query;
  const res = await axios.get('https://api.marketaux.com/v1/news/all', { params, timeout: 15000 });
  return (res.data?.data || []).map((a) => norm({
    title: a.title,
    description: a.description || a.snippet || '',
    source: a.source,
    publishedAt: iso(a.published_at),
    url: a.url,
  }));
}

async function fetchViaNewsApi(query, limit) {
  const res = await axios.get('https://newsapi.org/v2/everything', {
    params: { q: query, language: 'en', sortBy: 'publishedAt', pageSize: Math.min(limit, 100), apiKey: process.env.NEWS_API_KEY },
    timeout: 15000,
  });
  return (res.data?.articles || []).map((a) => norm({
    title: a.title, description: a.description, source: a.source?.name, publishedAt: iso(a.publishedAt), url: a.url,
  }));
}

/**
 * Recent English news for a stock.
 * @param {string} query  free-text search, e.g. "Reliance Industries stock"
 * @param {{ symbol?: string, limit?: number }} opts  `symbol` lets finance-aware providers target the ticker
 */
async function fetchRecentArticles(query, { symbol, limit = 15 } = {}) {
  if (!isConfigured()) {
    throw new Error(`News provider "${PROVIDER}" is not configured — set its key (see dependancy/DEPENDENCIES.md #2)`);
  }
  if (PROVIDER === 'marketaux') return fetchViaMarketaux(query, symbol, limit);
  if (PROVIDER === 'newsapi') return fetchViaNewsApi(query, limit);
  if (PROVIDER === 'yahoo') return fetchViaYahoo(query, symbol, limit);
  return fetchViaGoogleNews(query, limit);
}

module.exports = { isConfigured, fetchRecentArticles, PROVIDER };

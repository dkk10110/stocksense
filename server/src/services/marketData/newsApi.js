const axios = require('axios');

function isConfigured() {
  return !!process.env.NEWS_API_KEY;
}

/** Recent English-language news articles mentioning `query`, newest first. */
async function fetchRecentArticles(query, { pageSize = 20 } = {}) {
  if (!isConfigured()) {
    throw new Error('NewsAPI is not configured — set NEWS_API_KEY in server/.env (free tier at newsapi.org)');
  }
  const res = await axios.get('https://newsapi.org/v2/everything', {
    params: { q: query, language: 'en', sortBy: 'publishedAt', pageSize, apiKey: process.env.NEWS_API_KEY },
  });
  return res.data.articles.map((a) => ({ title: a.title, description: a.description, source: a.source?.name, publishedAt: a.publishedAt, url: a.url }));
}

module.exports = { isConfigured, fetchRecentArticles };

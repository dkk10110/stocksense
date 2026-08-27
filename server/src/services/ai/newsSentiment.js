const { isConfigured, completeJson } = require('./client');

const SYSTEM_PROMPT = `You score near-term news sentiment for one NSE/BSE stock, for StockSense AI's scoring engine (PRD §5.3, "news intelligence" layer).

Given the stock and recent articles, output a single 0-100 score for how the news flow biases a 15-day swing trade:
- 50 = neutral / no material news
- >50 = net positive (order wins, upgrades, resolved overhangs, sector tailwinds, insider/institutional buying)
- <50 = net negative (downgrades, litigation, guidance cuts, sector headwinds, selling)
Weight recent and specific items more than old or vague ones. Ignore generic "stock to watch" listicles.

Return ONLY minified JSON: {"score": <0-100>, "summary": "<=140 chars on the dominant driver", "articleCount": <how many were materially relevant>}`;

/**
 * PRD §5.3 layer 2 (20% weight). Returns { score, pending, note }.
 * Falls back to a neutral 50/pending when NewsAPI or the AI layer isn't configured —
 * same shape the composite scorer already expects.
 */
async function scoreNewsSentiment(symbol, articles) {
  if (!isConfigured() || !articles || !articles.length) {
    return { score: 50, pending: true, note: 'neutral — news/AI sentiment not available' };
  }

  const payload = {
    symbol,
    articles: articles.slice(0, 15).map((a) => ({ title: a.title, description: a.description, publishedAt: a.publishedAt, source: a.source })),
  };

  const json = await completeJson({ system: SYSTEM_PROMPT, user: payload, maxTokens: 200 });
  if (!json || json.score == null) {
    return { score: 50, pending: true, note: 'neutral — AI sentiment call returned nothing usable' };
  }

  const score = Math.max(0, Math.min(100, Math.round(Number(json.score))));
  return { score, pending: false, note: json.summary ? String(json.summary).slice(0, 140) : `news sentiment ${score}/100` };
}

module.exports = { scoreNewsSentiment };

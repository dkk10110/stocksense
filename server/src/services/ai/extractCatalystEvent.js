const { isConfigured, completeJson } = require('./client');

const SYSTEM_PROMPT = `You extract dated market catalysts from news for StockSense AI, an NSE/BSE swing-trading app.

Given a stock and a list of recent news articles (title + description + publish date), find the single most important UPCOMING dated event that is likely to move the stock: regulatory decision (FDA/CDSCO/SEBI/CCI), government order or budget allocation, scheduled product/data release, policy announcement, court verdict, major contract decision. Company quarterly results do NOT count here (handled separately).

Rules:
- The event must be in the FUTURE and have a specific or near-specific date. If an article says "next week", "in 10 days", "on August 30", resolve it to an ISO date using the article's publish date as the reference point.
- If no clearly dated future catalyst exists, return {"found": false}.
- Do not invent events. Only use what the articles actually state.

Return ONLY minified JSON, no prose:
{"found": true, "eventDate": "YYYY-MM-DD", "label": "<=60 char description", "expectedImpactPct": <number, midpoint of the historical/estimated move if stated, else 8>, "confidence": <0-100 how sure you are the event and date are real>}
or
{"found": false}`;

/**
 * Uses Claude to pull one dated, upcoming catalyst out of free-text news.
 * Returns null when the AI layer isn't configured or finds nothing — the caller
 * then simply doesn't generate a catalyst signal (no fake keyword matching).
 *
 * @returns {Promise<null | { eventDate: Date, label: string, expectedImpactPct: number, confidence: number }>}
 */
async function extractCatalystEvent(symbol, articles) {
  if (!isConfigured() || !articles || !articles.length) return null;

  const payload = {
    symbol,
    today: new Date().toISOString().split('T')[0],
    articles: articles.slice(0, 15).map((a) => ({ title: a.title, description: a.description, publishedAt: a.publishedAt })),
  };

  const json = await completeJson({ system: SYSTEM_PROMPT, user: payload, maxTokens: 300 });
  if (!json || !json.found || !json.eventDate) return null;

  const eventDate = new Date(json.eventDate);
  if (Number.isNaN(eventDate.getTime()) || eventDate <= new Date()) return null;

  return {
    eventDate,
    label: String(json.label || 'Upcoming catalyst').slice(0, 60),
    expectedImpactPct: Number(json.expectedImpactPct) || 8,
    confidence: Math.max(0, Math.min(100, Number(json.confidence) || 50)),
  };
}

module.exports = { extractCatalystEvent };

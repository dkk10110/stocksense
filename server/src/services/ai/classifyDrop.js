const { isConfigured, completeJson } = require('./client');

const SYSTEM_PROMPT = `You classify why a fundamentally screened NSE/BSE stock has fallen 30-55% from its 52-week high, for StockSense AI's "fallen angel reversal" detector.

Given the stock and recent news articles, decide whether the drop is:
- "external" — caused by factors outside the company's own operations: sector-wide FII/FPI outflows, macro/rate moves, a broad market correction, a temporary regulatory overhang since resolved, commodity-price swings, index rebalancing. The underlying business is intact.
- "business" — caused by deterioration in the company itself: falling revenue/margins, a profit warning, debt/liquidity stress, governance or fraud concerns, loss of a major client, management exit, guidance cut.
- "unknown" — the articles don't give enough signal to tell.

Only "external" should let a fallen-angel signal through (PRD 2.3, gate 3).

Return ONLY minified JSON: {"classification": "external" | "business" | "unknown", "reason": "<=120 chars", "confidence": <0-100>}`;

/**
 * PRD 2.3 gate 3 — "drop was external, not business deterioration".
 * Returns null when the AI layer isn't configured (gate stays `pending`, unchanged behaviour).
 * Otherwise returns { external: boolean, reason, confidence }.
 */
async function classifyDrop(symbol, articles) {
  if (!isConfigured() || !articles || !articles.length) return null;

  const payload = {
    symbol,
    articles: articles.slice(0, 15).map((a) => ({ title: a.title, description: a.description, publishedAt: a.publishedAt })),
  };

  const json = await completeJson({ system: SYSTEM_PROMPT, user: payload, maxTokens: 200 });
  if (!json || !json.classification) return null;

  return {
    external: json.classification === 'external',
    classification: json.classification,
    reason: String(json.reason || '').slice(0, 120),
    confidence: Math.max(0, Math.min(100, Number(json.confidence) || 50)),
  };
}

module.exports = { classifyDrop };

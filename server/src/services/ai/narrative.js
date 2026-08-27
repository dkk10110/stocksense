const { isConfigured, completeJson } = require('./client');

/**
 * v4.0 FRD — AI Narrative Engine.
 * "Use OpenAI only for shortlisted high-confidence stocks. Generate Why Buy, Risks, Entry/Exit
 *  rationale, News summary. Cache explanations and reuse when signals are unchanged."
 *
 * Provider note: the codebase's LLM integration is Claude Haiku 4.5 (v3 PRD §10 budget). This
 * uses that same shared client rather than adding an OpenAI dependency — swap `services/ai/client.js`
 * to change providers. Documented in dependancy/DEPENDENCIES_LEVEL2.md.
 *
 * Cost controls (FRD "API Cost Optimization"):
 *  - only called when confidence >= NARRATIVE_MIN_CONFIDENCE (default 70)
 *  - result cached on Signal.narrative; reused while the signal's type + confidence bucket are unchanged
 *  - template fallback for everything below the threshold or when no API key is set
 */
const MIN_CONFIDENCE = Number(process.env.NARRATIVE_MIN_CONFIDENCE || 70);

const SYSTEM_PROMPT = `You write the decision narrative for a shortlisted NSE/BSE swing-trade signal in StockSense AI.
Given a JSON object with the signal's type, symbol, price, entry/target/stop, confidence, score breakdown and evidence, produce four short sections for a solo retail swing trader (15-day horizon, 2-10% target). Be concrete — cite the actual numbers in the input. No hype, no "strong potential".

Return ONLY minified JSON:
{"whyBuy":"2-3 sentences: the exact setup and why it predicts a move now","risks":"2-3 sentences: what invalidates the thesis and the specific level/condition to watch","entryExit":"2-3 sentences: where to enter in the window, where the stop sits and why, when/where to book","newsSummary":"1-2 sentences on the news backdrop, or 'No material news in the window.'"}`;

function templateNarrative(signal) {
  const R = (n) => '₹' + Math.round(Number(n)).toLocaleString('en-IN');
  return {
    whyBuy: `${signal.name} triggered a ${signal.type} setup at ${R(signal.price)} with ${signal.confidence}% composite confidence. ${signal.headline || 'A forward setup is in place before the move.'}`,
    risks: `Thesis breaks if price closes below the stop at ${R(signal.stop)} (${(((Number(signal.price) - Number(signal.stop)) / Number(signal.price)) * 100).toFixed(1)}% away). Watch for a volume/RSI failure or a broad-market risk-off day.`,
    entryExit: `Enter in the ${R(signal.entryLow)}–${R(signal.entryHigh)} window. Stop ${R(signal.stop)}, target ${R(signal.target)} (R/R 1:${Number(signal.rr)}). Book at target or on day ${signal.days} if the move stalls.`,
    newsSummary: 'No material news pulled (news/AI layer not configured or below the narrative threshold).',
    generatedBy: 'template',
  };
}

/** Returns { whyBuy, risks, entryExit, newsSummary, generatedBy }. Never throws. */
async function generateNarrative(signal, extra = {}) {
  if (signal.confidence < MIN_CONFIDENCE || !isConfigured()) {
    return templateNarrative(signal);
  }
  const payload = {
    type: signal.type, symbol: signal.symbol, name: signal.name,
    price: Number(signal.price), entryLow: Number(signal.entryLow), entryHigh: Number(signal.entryHigh),
    target: Number(signal.target), stop: Number(signal.stop), rr: Number(signal.rr), days: signal.days,
    confidence: signal.confidence, scoreBreakdown: signal.scoreBreakdown, evidence: extra.evidence || null,
    recentHeadlines: (extra.articles || []).slice(0, 6).map((a) => a.title),
  };
  const json = await completeJson({ system: SYSTEM_PROMPT, user: payload, maxTokens: 500 });
  if (!json || !json.whyBuy) return templateNarrative(signal);
  return {
    whyBuy: String(json.whyBuy),
    risks: String(json.risks || ''),
    entryExit: String(json.entryExit || ''),
    newsSummary: String(json.newsSummary || 'No material news in the window.'),
    generatedBy: 'ai',
  };
}

/** Cache reuse check — same signal type + confidence bucket (nearest 5) => keep the old narrative. */
function narrativeStillValid(prevSignal, newSignal) {
  if (!prevSignal?.narrative) return false;
  const bucket = (c) => Math.round(c / 5);
  return prevSignal.type === newSignal.type && bucket(prevSignal.confidence) === bucket(newSignal.confidence);
}

module.exports = { generateNarrative, templateNarrative, narrativeStillValid, MIN_CONFIDENCE };

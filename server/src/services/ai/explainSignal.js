const Anthropic = require('@anthropic-ai/sdk');

// PRD explicitly specifies Claude Haiku 4.5 for this — the whole cost budget
// (~₹9-12/month) is built around Haiku's pricing, not a cost cut made here.
const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You write the "why buy now" explanation for StockSense AI, a personal NSE/BSE swing-trading signal app. Every signal represents a forward-looking setup — the system believes the stock will move 2-10% in the next 15 days based on conditions today, before the move happens. This is the core philosophy: signals fire BEFORE the price move, not after (unlike most advisory apps that fire on lagging indicators after the easy money is already made).

You will be given a JSON object describing one detected setup: its type (compression | catalyst | fallen | earnings | volume), the stock's symbol, current price, and an "evidence" object with the specific numbers the detector used (e.g. RSI values, volume ratios, drop percentages, days until an event).

Write a 3-5 sentence explanation in plain language, following this structure for every signal type:
1. State the specific setup in concrete terms — name the pattern and the key number that defines it.
2. Explain why this predicts a move — the mechanism, not just the pattern name.
3. Reference the entry timing — why now, not after confirmation.
Bold the single most important number or fact using <strong> tags (HTML, matching the app's card rendering) — exactly one or two bolded phrases, not more.

Signal type context:
- compression: tight price band + declining volume = energy coiling before a breakout. Buy during compression, not after it breaks out.
- catalyst: a dated event is approaching (results, regulatory decision, data release) that historically moves this stock. Entry captures the pre-event drift.
- fallen: a fundamentally sound stock oversold on external (not business) factors, with RSI now turning up from an extreme. The RSI reversal — not the bottom — is the entry trigger.
- earnings: results due soon from a company with a track record of growth, entered before the pre-results run is priced in.
- volume: price at a known support level with selling volume drying up — sellers are exhausted, buyers likely stepping in quietly.

Tone: confident, specific, written for a solo retail trader who wants the reasoning, not marketing copy. Never use generic phrases like "strong potential" or "worth watching" — every sentence must reference one of the actual numbers provided. Output plain text (with the <strong> tags) only — no markdown headers, no preamble, no explanation of what you're doing.`;

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Rule-based fallback used when no Anthropic API key is configured, so the pipeline still produces usable signals. */
function templateFallback(detection) {
  const { type, symbol, evidence } = detection;
  switch (type) {
    case 'compression':
      return `${symbol} has compressed into a tight <strong>${evidence.bandWidthPct}% band</strong> over the last ${evidence.bandDays} days with volume declining, and its Bollinger Band width is the narrowest it has been in ${evidence.bollingerNarrowestIn} days. This is classic pre-breakout coiling — declining volume during a tight range signals selling pressure is exhausted. Entry now, during the compression, captures the move before the breakout confirms it.`;
    case 'volume':
      return `${symbol} is trading right at its <strong>${evidence.supportLevel}</strong> (₹${evidence.supportPrice}) with volume down to just ${evidence.volumeVsAvg20}x its 20-day average — sellers are drying up. RSI at ${evidence.rsi} is oversold but not extreme, and this level has held as support ${evidence.priorBounces}+ times in the past year. The volume dry-up at a proven support level is the signal that selling is exhausted before the bounce.`;
    case 'fallen':
      return `${symbol} is <strong>${evidence.dropFromHighPct}% below its 52-week high</strong> of ₹${evidence.high52w}, and RSI has just turned up from ${evidence.rsiMin} to ${evidence.rsiNow} — the reversal trigger, not the bottom itself. Volume shows the earlier panic-selling spike fading into quiet accumulation. This RSI-reversal-from-oversold pattern is the precise entry point for a fundamentally sound stock that got caught in a broader sell-off.`;
    case 'earnings':
      return `${symbol} reports results in <strong>${evidence.resultsInDays} days</strong>, backed by a ${evidence.yoyGrowthStreakQuarters}-quarter streak of YoY growth in both sales and profit. RSI at ${evidence.rsi} shows the stock hasn't already run up ahead of the print (only ${evidence.runUp10dPct}% over the last 10 days), meaning the pre-results drift is still ahead, not already priced in. Entering now captures both the pre-results positioning and the post-results reaction if the growth streak continues.`;
    default:
      return `${symbol} has triggered a ${type} setup based on current technical and price conditions. Entry now is positioned ahead of the anticipated move, per the system's forward-signal detection.`;
  }
}

/** Generates the "why buy now" explanation for a detector hit. Falls back to a template if no API key is configured. */
async function generateWhyBuyNow(detection) {
  if (!isConfigured()) return templateFallback(detection);

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: JSON.stringify({ type: detection.type, symbol: detection.symbol, price: detection.price, evidence: detection.evidence }),
      }],
    });
    const textBlock = res.content.find((b) => b.type === 'text');
    return textBlock?.text?.trim() || templateFallback(detection);
  } catch (err) {
    console.error(`  [AI] explanation generation failed for ${detection.symbol}, using template fallback: ${err.message}`);
    return templateFallback(detection);
  }
}

module.exports = { generateWhyBuyNow, isConfigured, templateFallback };

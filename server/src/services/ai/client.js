const Anthropic = require('@anthropic-ai/sdk');

// The PRD (§10) budgets the whole AI spend around Claude Haiku 4.5. Every AI helper in
// this app uses this one model + one client so the cost model stays predictable.
const MODEL = 'claude-haiku-4-5';

let client = null;

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient() {
  if (!isConfigured()) return null;
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Runs one non-streaming Claude call and returns the first text block, trimmed.
 * `system` is sent with cache_control so repeated calls in a scan reuse the prompt prefix.
 * Returns null on any failure (not configured, network, parse) — every caller has a fallback.
 */
async function complete({ system, user, maxTokens = 400 }) {
  const c = getClient();
  if (!c) return null;
  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) }],
    });
    const block = res.content.find((b) => b.type === 'text');
    return block?.text?.trim() || null;
  } catch (err) {
    console.error(`  [AI] call failed: ${err.message}`);
    return null;
  }
}

/** Same as complete(), but expects the model to return JSON and parses it. Returns null if it can't. */
async function completeJson(args) {
  const text = await complete(args);
  if (!text) return null;
  try {
    // tolerate ```json fences or leading prose
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  } catch {
    console.error('  [AI] response was not valid JSON, ignoring');
    return null;
  }
}

module.exports = { MODEL, isConfigured, complete, completeJson };

const test = require('node:test');
const assert = require('node:assert/strict');

const { templateFallback } = require('../src/services/ai/explainSignal');
const { templateNarrative, narrativeStillValid, MIN_CONFIDENCE } = require('../src/services/ai/narrative');
const { isAlertEnabled, TYPE_TO_KEY, SIGNAL_TYPE_TO_KEY } = require('../src/services/alerts/alertPrefs');
const { formatEvidence, generateHeadline } = require('../src/services/scoring/formatEvidence');
const aiClient = require('../src/services/ai/client');

// ---------- explainSignal template fallback ----------
test('templateFallback: produces grounded text for every signal type incl. catalyst', () => {
  const cases = {
    compression: { bandWidthPct: 1.2, bandDays: 6, bollingerNarrowestIn: 60 },
    volume: { supportLevel: '50-day EMA', supportPrice: 98, volumeVsAvg20: 0.4, rsi: 40, priorBounces: 3 },
    fallen: { dropFromHighPct: 42, high52w: 200, rsiMin: 28, rsiNow: 34 },
    earnings: { resultsInDays: 6, yoyGrowthStreakQuarters: 3, rsi: 52, runUp10dPct: 1.1 },
    catalyst: { catalystLabel: 'FDA panel', daysToEvent: 9, expectedImpactPct: 10, rsi: 54, fiiDiiAccumulating: true },
  };
  for (const [type, evidence] of Object.entries(cases)) {
    const txt = templateFallback({ type, symbol: 'ABC', evidence });
    assert.ok(typeof txt === 'string' && txt.length > 40, `${type} text`);
    assert.ok(txt.includes('<strong>'), `${type} should bold a key number`);
  }
});

// ---------- narrative engine ----------
test('templateNarrative: returns the four FRD sections', () => {
  const n = templateNarrative({
    name: 'ABC', type: 'compression', price: 100, entryLow: 99, entryHigh: 101,
    target: 110, stop: 96, rr: 2.5, days: 12, confidence: 65, headline: 'x',
  });
  assert.ok(n.whyBuy && n.risks && n.entryExit && n.newsSummary);
  assert.equal(n.generatedBy, 'template');
});

test('narrativeStillValid: reuse when type + confidence bucket unchanged, regenerate otherwise', () => {
  const prev = { narrative: { whyBuy: 'x' }, type: 'compression', confidence: 70 };
  assert.equal(narrativeStillValid(prev, { type: 'compression', confidence: 72 }), true);  // same bucket (round(x/5)=14)
  assert.equal(narrativeStillValid(prev, { type: 'compression', confidence: 60 }), false); // different bucket
  assert.equal(narrativeStillValid(prev, { type: 'volume', confidence: 70 }), false);      // different type
  assert.equal(narrativeStillValid(null, { type: 'compression', confidence: 70 }), false); // no prior narrative
});

test('narrative threshold default is 70', () => {
  assert.equal(MIN_CONFIDENCE, 70);
});

// ---------- ai client (no key configured in tests) ----------
test('ai client: isConfigured false without a key; completeJson returns null', async () => {
  assert.equal(aiClient.isConfigured(), false);
  assert.equal(await aiClient.complete({ system: 's', user: 'u' }), null);
  assert.equal(await aiClient.completeJson({ system: 's', user: 'u' }), null);
});

// ---------- alert preferences mapping ----------
test('alertPrefs: every current AlertType maps to a config key (or is intentionally unmapped)', () => {
  assert.equal(TYPE_TO_KEY.gain_10, 'full10');
  assert.equal(TYPE_TO_KEY.stop_loss, 'stopLoss');
  assert.equal(TYPE_TO_KEY.earnings_exit, 'earningsPlay');
  assert.equal(TYPE_TO_KEY.sector_rotation, 'sectorRotation');
  assert.equal(TYPE_TO_KEY.new_opportunity, 'discovery');
  assert.equal(SIGNAL_TYPE_TO_KEY.fallen, 'fallenAngel');
  assert.equal(SIGNAL_TYPE_TO_KEY.volume, 'volumeReversal');
});

// ---------- formatEvidence ----------
test('formatEvidence: indicator + catalyst chips for every type, catalyst headline is dynamic', () => {
  const ev = {
    compression: { bandDays: 6, bandWidthPct: 1.1, bollingerNarrowestIn: 60 },
    volume: { supportLevel: '50-day EMA', supportPrice: 98, volumeVsAvg20: 0.4, rsi: 41, priorBounces: 2 },
    fallen: { dropFromHighPct: 40, rsiMin: 28, rsiNow: 34, fundamentalScore: 80 },
    earnings: { yoyGrowthStreakQuarters: 3, rsi: 52, runUp10dPct: 1.0, resultsInDays: 6, resultsDate: '2026-09-01' },
    catalyst: { rsi: 54, fiiDiiAccumulating: true, expectedImpactPct: 10, catalystLabel: 'FDA panel', catalystDate: '2026-09-05', daysToEvent: 9 },
  };
  for (const [type, evidence] of Object.entries(ev)) {
    const { indicators, catalysts } = formatEvidence({ type, evidence });
    assert.ok(Array.isArray(indicators) && indicators.length > 0, `${type} indicators`);
    assert.ok(Array.isArray(catalysts), `${type} catalysts`);
  }
  const h = generateHeadline({ type: 'catalyst', evidence: { catalystLabel: 'FDA panel', daysToEvent: 9 } });
  assert.match(h, /FDA panel/);
  assert.equal(generateHeadline({ type: 'compression' }).length > 0, true);
});

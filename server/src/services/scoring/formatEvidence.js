/** Turns a detector's raw `evidence` object into the UI's indicator-chip + catalyst-chip format. */
function formatEvidence(detection) {
  const e = detection.evidence;
  switch (detection.type) {
    case 'compression':
      return {
        indicators: [
          { label: `${e.bandDays}-day compression (${e.bandWidthPct}% band)`, color: 'purple' },
          { label: 'Volume declining', color: 'green' },
          { label: `Bollinger width narrowest in ${e.bollingerNarrowestIn}d`, color: 'blue' },
        ],
        catalysts: [],
      };
    case 'volume':
      return {
        indicators: [
          { label: `At ${e.supportLevel} (₹${e.supportPrice})`, color: 'blue' },
          { label: `Volume ${e.volumeVsAvg20}x avg — drying up`, color: 'green' },
          { label: `RSI ${e.rsi} — oversold, not extreme`, color: 'amber' },
          { label: `Support held ${e.priorBounces}+ times`, color: 'green' },
        ],
        catalysts: [],
      };
    case 'fallen':
      return {
        indicators: [
          { label: `${e.dropFromHighPct}% below 52wk high`, color: 'blue' },
          { label: `RSI ${e.rsiMin}→${e.rsiNow} turning from oversold`, color: 'purple' },
          { label: e.fundamentalScore != null ? `Fundamental score ${e.fundamentalScore}/100` : 'Fundamentals pending', color: 'green' },
        ],
        catalysts: [],
      };
    case 'earnings':
      return {
        indicators: [
          { label: `${e.yoyGrowthStreakQuarters}-quarter YoY growth streak`, color: 'green' },
          { label: `RSI ${e.rsi} — room to run`, color: 'blue' },
          { label: `Only ${e.runUp10dPct >= 0 ? '+' : ''}${e.runUp10dPct}% in 10 days — not priced in`, color: 'amber' },
        ],
        catalysts: [`Q results — ${e.resultsInDays} days (${e.resultsDate})`],
      };
    case 'catalyst':
      return {
        indicators: [
          { label: `RSI ${e.rsi} — below 65 ceiling, not priced in`, color: 'blue' },
          { label: e.fiiDiiAccumulating ? 'FII/DII accumulating pre-event' : 'Institutional flow neutral', color: e.fiiDiiAccumulating ? 'green' : 'amber' },
          { label: `Est. event move ~${e.expectedImpactPct}%`, color: 'purple' },
        ],
        catalysts: [`${e.catalystLabel} — ${e.daysToEvent} days (${e.catalystDate})`],
      };
    default:
      return { indicators: [], catalysts: [] };
  }
}

const HEADLINES = {
  compression: 'Pre-breakout compression detected — buy before the move',
  volume: 'Volume drying up at support — selling exhaustion',
  fallen: 'Fallen angel reversal — RSI turning from extreme oversold',
  earnings: 'Earnings play — pre-results entry before the run',
  catalyst: 'Catalyst countdown — dated event approaching',
};

function generateHeadline(detection) {
  if (detection.type === 'catalyst' && detection.evidence?.catalystLabel) {
    return `Catalyst countdown — ${detection.evidence.catalystLabel} in ${detection.evidence.daysToEvent} days`;
  }
  return HEADLINES[detection.type] || 'Forward signal detected';
}

module.exports = { formatEvidence, generateHeadline };

const { lows } = require('../indicators');
const { TYPE_DEFAULTS } = require('../scoring/typeDefaults');

// Per-type target% / stop% / swing days for the v4 detector set (the 5 new types plus fallbacks
// for the v3 five, which also live in scoring/typeDefaults). Derived from each setup's typical
// follow-through, not a fresh backtest — documented per line.
const V4_DEFAULTS = {
  ...TYPE_DEFAULTS,
  institutional: { targetPct: 9.0, stopPct: 4.0, days: 15 }, // accumulation resolves slower, wider stop
  rotation: { targetPct: 8.0, stopPct: 4.0, days: 12 },      // rides the sector move
  rs_leader: { targetPct: 8.5, stopPct: 5.0, days: 15 },     // trend continuation, stop below breakout base
  high_delivery: { targetPct: 7.5, stopPct: 3.5, days: 15 }, // quiet grind, tighter
  mtf_breakout: { targetPct: 9.0, stopPct: 4.5, days: 12 },  // breakout momentum
};

/** Entry window + target/stop/RR for a discovery detector hit. */
function computeTradeLevelsForDiscovery(detection, rows) {
  const d = V4_DEFAULTS[detection.type] || { targetPct: 8, stopPct: 4, days: 13 };
  const price = detection.price;
  const e = detection.evidence || {};

  let entryLow = price * 0.997;
  let entryHigh = price * 1.006;
  let stop = price * (1 - d.stopPct / 100);
  const target = price * (1 + d.targetPct / 100);

  if (detection.type === 'compression' && e.bandLow != null) {
    entryLow = e.bandLow;
    entryHigh = (e.bandLow + e.bandHigh) / 2;
    stop = e.bandLow * 0.99;
  } else if (detection.type === 'volume' && e.supportPrice != null) {
    stop = e.supportPrice * 0.99;
  } else if (detection.type === 'mtf_breakout' && e.priorDailyHigh != null) {
    // stop back below the level that was broken
    stop = Math.min(stop, e.priorDailyHigh * 0.985);
  } else if ((detection.type === 'fallen' || detection.type === 'institutional') && rows && rows.length) {
    const recentLow = Math.min(...lows(rows).slice(-15));
    stop = Math.min(stop, recentLow * 0.99);
  }

  const rr = (target - price) / (price - stop);
  return {
    entryLow: Number(entryLow.toFixed(2)),
    entryHigh: Number(entryHigh.toFixed(2)),
    target: Number(target.toFixed(2)),
    stop: Number(stop.toFixed(2)),
    rr: Number(rr.toFixed(2)),
    days: d.days,
    upside: Number((((target - price) / price) * 100).toFixed(1)),
  };
}

module.exports = { computeTradeLevelsForDiscovery, V4_DEFAULTS };

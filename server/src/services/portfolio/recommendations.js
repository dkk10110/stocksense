const { latestRsi, rsiSeries } = require('../indicators');

/**
 * v4.0 FRD — Portfolio Intelligence: per-holding recommendation.
 * Actions: buy | hold | average | exit | book_profit.
 *
 * @param {object} pos      Position row (buyPrice, currentPrice, stop, daysHeld, qty, signalType)
 * @param {object} ctx      { swingWindow, signalActive (bool|null), rows (price history) }
 */
function recommendForPosition(pos, ctx = {}) {
  const buy = Number(pos.buyPrice);
  const now = Number(pos.currentPrice);
  const stop = Number(pos.stop);
  const gainPct = ((now - buy) / buy) * 100;
  const daysHeld = pos.daysHeld ?? 0;
  const swingWindow = ctx.swingWindow ?? 15;
  const rows = ctx.rows || [];
  const rsi = rows.length ? latestRsi(rows) : null;
  const rsiSeriesArr = rows.length ? rsiSeries(rows) : [];
  const rsiFalling = rsiSeriesArr.length >= 4 && rsiSeriesArr[rsiSeriesArr.length - 1] < rsiSeriesArr[rsiSeriesArr.length - 4] - 3;

  let action = 'hold';
  let reason;

  if (now <= stop) {
    action = 'exit';
    reason = `Price ₹${now} is at/below the stop ₹${stop}. Thesis broken — exit to protect capital.`;
  } else if (gainPct >= 10) {
    action = 'book_profit';
    reason = `+${gainPct.toFixed(1)}% — full swing target reached. Book the gain.`;
  } else if (gainPct >= 7 && (daysHeld >= swingWindow - 3 || rsiFalling)) {
    action = 'book_profit';
    reason = `+${gainPct.toFixed(1)}% with ${daysHeld}/${swingWindow} days elapsed${rsiFalling ? ' and RSI rolling over' : ''}. Bank most of it.`;
  } else if (daysHeld >= swingWindow && gainPct < 2) {
    action = 'exit';
    reason = `${daysHeld}/${swingWindow} days elapsed at only ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%. The move didn't come — free the capital.`;
  } else if (gainPct <= -6) {
    action = 'exit';
    reason = `Down ${gainPct.toFixed(1)}% and above stop. Momentum failed — cut it.`;
  } else if (ctx.signalActive === false && gainPct < 3) {
    action = 'exit';
    reason = `The originating ${pos.signalType || 'signal'} is no longer active and the trade hasn't worked. Exit.`;
  } else if (gainPct <= -2 && gainPct > -6 && ctx.signalActive !== false && daysHeld < swingWindow / 2 && rsi != null && rsi >= 35) {
    action = 'average';
    reason = `Down ${gainPct.toFixed(1)}% early in the window, thesis still intact (signal active, RSI ${Math.round(rsi)}). A measured add lowers the cost basis — size it small.`;
  } else if (gainPct > 0) {
    action = 'hold';
    reason = `+${gainPct.toFixed(1)}%, ${daysHeld}/${swingWindow} days, target not yet hit. Let it work.`;
  } else {
    action = 'hold';
    reason = `${gainPct.toFixed(1)}% and above stop. Give the setup room; re-evaluate at day ${swingWindow - 3}.`;
  }

  return { action, reason, gainPct: Number(gainPct.toFixed(2)), daysHeld, rsi: rsi != null ? Math.round(rsi) : null };
}

/**
 * Recommendation for a watchlisted (not held) stock: buy if a strong active signal exists.
 * @param {object} wl  WatchlistItem with `signal` included
 */
function recommendForWatchlist(wl) {
  const s = wl.signal;
  if (s && s.active && s.confidence >= 65) {
    return { action: 'buy', reason: `Active ${s.type} signal at ${s.confidence}% confidence — entry window ₹${Number(s.entryLow)}–₹${Number(s.entryHigh)}.` };
  }
  return { action: 'hold', reason: s && s.active ? `Signal active but only ${s.confidence}% confidence — wait for a stronger setup.` : 'No active signal — keep watching.' };
}

module.exports = { recommendForPosition, recommendForWatchlist };

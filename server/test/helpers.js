/** Synthetic OHLCV row generators for detector / indicator / scoring unit tests. */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build `n` chronological rows. `priceAt(i)` returns the close for bar i;
 * `volAt(i)` the volume. High/low are derived with a configurable intrabar range.
 */
function makeRows(n, priceAt, volAt = () => 1_000_000, { symbol = 'TEST', rangePct = 0.01, startDate = new Date('2025-01-01') } = {}) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const close = Number(priceAt(i).toFixed(2));
    const prevClose = i === 0 ? close : Number(priceAt(i - 1).toFixed(2));
    const open = prevClose;
    const half = close * rangePct;
    const high = Number((Math.max(open, close) + half).toFixed(2));
    const low = Number((Math.min(open, close) - half).toFixed(2));
    rows.push({
      symbol,
      date: new Date(startDate.getTime() + i * DAY_MS),
      open, high, low, close,
      volume: BigInt(Math.max(1, Math.round(volAt(i)))),
    });
  }
  return rows;
}

/** Steady linear uptrend from `start`, +`stepPct` per bar. */
function uptrend(n, start = 100, stepPct = 0.3, opts = {}) {
  return makeRows(n, (i) => start * (1 + (stepPct / 100) * i), () => 1_000_000, opts);
}

/** Flat price with small noise. */
function flat(n, price = 100, noisePct = 0.2, opts = {}) {
  return makeRows(n, (i) => price * (1 + (noisePct / 100) * Math.sin(i)), () => 1_000_000, opts);
}

/**
 * Rising series WITH regular pullbacks (real up- and down-bars) so RSI lands in a
 * moderate 50-68 band instead of saturating at ~100. `driftPct` per bar, `wigglePct` amplitude.
 */
function choppyUptrend(n, start = 100, driftPct = 0.25, wigglePct = 1.6, volAt = () => 1_000_000, opts = {}) {
  return makeRows(n, (i) => start * (1 + (driftPct / 100) * i) + start * (wigglePct / 100) * Math.sin(i * 0.8), volAt, opts);
}

/** Sharp decline then a small bounce at the end — for fallen-angel / reversal tests. */
function crashThenBounce(n, start = 200, dropPct = 45, bounceBars = 4, opts = {}) {
  const bottom = start * (1 - dropPct / 100);
  return makeRows(n, (i) => {
    if (i < n - bounceBars) return start + (bottom - start) * (i / (n - bounceBars));
    const t = (i - (n - bounceBars)) / bounceBars;
    return bottom * (1 + 0.04 * t);
  }, () => 1_000_000, opts);
}

module.exports = { makeRows, uptrend, flat, choppyUptrend, crashThenBounce, DAY_MS };

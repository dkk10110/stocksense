const prisma = require('../../lib/prisma');

// Baseline universe so the evening scan / ingestion / backtest always have something to work on
// even before any user has built a watchlist. User watchlist + active-signal symbols are unioned on top.
// Override with the TRACKED_SYMBOLS env var (comma-separated NSE tickers).
const DEFAULT_TRACKED = [
  'BHEL', 'SUNPHARMA', 'TATAELXSI', 'HEROMOTOCO', 'HAL',
  'SBIN', 'SAIL', 'IOC', 'ONGC', 'COALINDIA',
];

function baseSymbols() {
  const fromEnv = (process.env.TRACKED_SYMBOLS || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_TRACKED;
}

/** Every distinct NSE symbol to track: the baseline universe ∪ active-signal symbols ∪ watchlist symbols. */
async function collectTrackedSymbols() {
  const [signals, watchlistItems] = await Promise.all([
    prisma.signal.findMany({ where: { active: true }, select: { symbol: true } }),
    prisma.watchlistItem.findMany({ where: { symbol: { not: null } }, select: { symbol: true } }),
  ]);
  const symbols = new Set([
    ...baseSymbols(),
    ...signals.map((s) => s.symbol),
    ...watchlistItems.map((w) => w.symbol),
  ].filter(Boolean));
  return [...symbols];
}

module.exports = { collectTrackedSymbols, DEFAULT_TRACKED };

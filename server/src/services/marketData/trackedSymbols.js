const prisma = require('../../lib/prisma');

/** Every distinct NSE symbol currently tracked, from active signals and watchlist items. */
async function collectTrackedSymbols() {
  const [signals, watchlistItems] = await Promise.all([
    prisma.signal.findMany({ where: { active: true }, select: { symbol: true } }),
    prisma.watchlistItem.findMany({ where: { symbol: { not: null } }, select: { symbol: true } }),
  ]);
  const symbols = new Set([...signals.map((s) => s.symbol), ...watchlistItems.map((w) => w.symbol)].filter(Boolean));
  return [...symbols];
}

module.exports = { collectTrackedSymbols };

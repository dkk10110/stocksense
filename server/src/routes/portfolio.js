const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { getHistory } = require('../services/marketData/priceHistoryStore');
const { recommendForPosition, recommendForWatchlist } = require('../services/portfolio/recommendations');
const { assessPortfolio } = require('../services/portfolio/portfolioRisk');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/portfolio/intelligence — v4.0 FRD Portfolio Intelligence Engine.
 * Per-holding Buy/Hold/Average/Exit/Book-Profit calls + sector allocation + portfolio risk.
 */
router.get('/intelligence', async (req, res) => {
  const [positions, watchlist, settings] = await Promise.all([
    prisma.position.findMany({ where: { userId: req.userId, status: 'open' }, include: { watchlistItem: true } }),
    prisma.watchlistItem.findMany({ where: { userId: req.userId }, include: { signal: true } }),
    prisma.settings.findUnique({ where: { userId: req.userId } }),
  ]);
  const swingWindow = settings?.swingWindow ?? 15;

  const holdings = [];
  for (const p of positions) {
    const symbol = p.watchlistItem?.symbol;
    const rows = symbol ? await getHistory(symbol, 120) : [];
    let signalActive = null;
    if (symbol) {
      const sig = await prisma.signal.findFirst({ where: { symbol, active: true }, select: { id: true } });
      signalActive = !!sig;
    }
    const rec = recommendForPosition(p, { swingWindow, signalActive, rows });
    holdings.push({
      id: p.id, name: p.name, sector: p.sector, symbol: symbol || null,
      buyPrice: Number(p.buyPrice), currentPrice: Number(p.currentPrice), qty: p.qty,
      stop: Number(p.stop), daysHeld: p.daysHeld, signalType: p.signalType,
      ...rec,
    });
  }

  const watchlistRecs = watchlist
    .filter((w) => !positions.some((p) => p.watchlistItemId === w.id))
    .map((w) => ({ id: w.id, name: w.name, sector: w.sector, symbol: w.symbol || null, ...recommendForWatchlist(w) }));

  const risk = assessPortfolio(positions.map((p) => ({ ...p })));

  res.json({ holdings, watchlist: watchlistRecs, risk });
});

module.exports = router;

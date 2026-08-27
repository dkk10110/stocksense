const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { syncPositionsForUser } = require('../services/positions/syncPrices');

const router = express.Router();
router.use(requireAuth);

function alertsHitAt(position, newPrice) {
  const gainPct = ((newPrice - Number(position.buyPrice)) / Number(position.buyPrice)) * 100;
  const alertsHit = new Set(position.alertsHit);
  position.alertLevels.forEach((lvl) => { if (gainPct >= lvl) alertsHit.add(lvl); });
  return [...alertsHit];
}

router.get('/', async (req, res) => {
  const positions = await prisma.position.findMany({
    where: { userId: req.userId, status: 'open' },
    orderBy: { createdAt: 'desc' },
  });
  res.json(positions);
});

// POST /api/positions  { watchlistItemId, broker, buyPrice, qty, buyDate, alertLevels }
router.post('/', async (req, res) => {
  const { watchlistItemId, broker, buyPrice, qty, buyDate, alertLevels } = req.body;
  if (!watchlistItemId || !broker || !buyPrice || !qty) {
    return res.status(400).json({ error: 'watchlistItemId, broker, buyPrice and qty are required.' });
  }

  const wl = await prisma.watchlistItem.findUnique({ where: { id: watchlistItemId }, include: { signal: true } });
  if (!wl || wl.userId !== req.userId) return res.status(404).json({ error: 'Watchlist item not found' });

  const existing = await prisma.position.findFirst({ where: { watchlistItemId, userId: req.userId, status: 'open' } });
  if (existing) return res.status(409).json({ error: 'A position is already open for this stock.' });

  // Snapshot the linked signal's type + catalyst date so type-specific position alerts and the
  // per-type scorecard survive the signal being regenerated/deactivated later.
  const signalType = wl.signal?.type ?? null;
  const catalystDate = wl.signal?.catalystDate ?? null;
  const stop = wl.signal?.stop != null ? Number(wl.signal.stop) : Number((buyPrice * 0.97).toFixed(2));

  const position = await prisma.position.create({
    data: {
      userId: req.userId,
      watchlistItemId,
      name: wl.name,
      sector: wl.sector,
      broker,
      buyPrice,
      qty,
      buyDate: buyDate ? new Date(buyDate) : new Date(),
      alertLevels: alertLevels && alertLevels.length ? alertLevels : [2, 5, 10],
      alertsHit: [],
      stop,
      currentPrice: buyPrice,
      signalType,
      catalystDate,
    },
  });
  res.status(201).json(position);
});

// POST /api/positions/:id/simulate  { deltaPct } — manual testing only
router.post('/:id/simulate', async (req, res) => {
  const { deltaPct } = req.body;
  const position = await prisma.position.findUnique({ where: { id: req.params.id } });
  if (!position || position.userId !== req.userId) return res.status(404).json({ error: 'Position not found' });

  const newPrice = Number((Number(position.currentPrice) * (1 + deltaPct / 100)).toFixed(2));
  const updated = await prisma.position.update({
    where: { id: position.id },
    data: { currentPrice: newPrice, alertsHit: alertsHitAt(position, newPrice) },
  });
  res.json(updated);
});

// POST /api/positions/sync-prices — refresh currentPrice for all open positions from real market data,
// firing real gain/stop-loss alerts for any newly-crossed threshold (same logic the cron job uses).
router.post('/sync-prices', async (req, res) => {
  const result = await syncPositionsForUser(req.userId);
  res.json(result);
});

// POST /api/positions/:id/sell
router.post('/:id/sell', async (req, res) => {
  const position = await prisma.position.findUnique({ where: { id: req.params.id } });
  if (!position || position.userId !== req.userId) return res.status(404).json({ error: 'Position not found' });

  const gainPct = Number((((Number(position.currentPrice) - Number(position.buyPrice)) / Number(position.buyPrice)) * 100).toFixed(2));
  const pl = Math.round((Number(position.currentPrice) - Number(position.buyPrice)) * position.qty);
  const daysHeld = Math.max(0, Math.floor((Date.now() - new Date(position.buyDate)) / (24 * 60 * 60 * 1000)));

  await prisma.$transaction([
    prisma.position.update({ where: { id: position.id }, data: { status: 'sold' } }),
    prisma.tradeHistory.create({
      data: { userId: req.userId, name: position.name, signalType: position.signalType, gainPct, pl, daysHeld },
    }),
  ]);

  res.json({ name: position.name, gainPct, pl });
});

module.exports = router;

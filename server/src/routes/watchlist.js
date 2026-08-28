const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { lookupSymbol, searchSymbols } = require('../services/marketData/yahooFinance');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const items = await prisma.watchlistItem.findMany({
    where: { userId: req.userId },
    include: { signal: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(items);
});

// GET /api/watchlist/search?q=tata — typeahead: NSE equities matching name/ticker, [{ symbol, name }].
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  try {
    res.json(await searchSymbols(q));
  } catch {
    res.json([]);
  }
});

// GET /api/watchlist/lookup?q=INFY — resolve a name/ticker to a real NSE symbol plus its
// current name / sector / price / 52-week high, so the add-stock form can auto-fill.
router.get('/lookup', async (req, res) => {
  const q = req.query.q || req.query.symbol;
  if (!q) return res.status(400).json({ error: 'A stock name or symbol is required.' });
  try {
    res.json(await lookupSymbol(q));
  } catch {
    res.status(404).json({ error: `Couldn't find "${q}" on NSE. Enter the details manually.` });
  }
});

router.post('/', async (req, res) => {
  const { name, sector, price, signalId, symbol, high52w } = req.body;
  if (!name || !sector || price == null) {
    return res.status(400).json({ error: 'name, sector and price are required.' });
  }

  if (signalId) {
    const existing = await prisma.watchlistItem.findFirst({ where: { userId: req.userId, signalId } });
    if (existing) return res.status(200).json(existing);
  }

  const item = await prisma.watchlistItem.create({
    data: {
      userId: req.userId,
      name,
      sector,
      price,
      symbol: symbol ? String(symbol).toUpperCase().replace(/\.NS$/i, '') : null,
      high52w: high52w != null && high52w !== '' ? high52w : null,
      signalId: signalId || null,
    },
  });
  res.status(201).json(item);
});

router.delete('/:id', async (req, res) => {
  const item = await prisma.watchlistItem.findUnique({ where: { id: req.params.id } });
  if (!item || item.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
  await prisma.watchlistItem.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

module.exports = router;

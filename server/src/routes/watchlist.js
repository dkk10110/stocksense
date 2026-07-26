const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

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

router.post('/', async (req, res) => {
  const { name, sector, price, signalId } = req.body;
  if (!name || !sector || price == null) {
    return res.status(400).json({ error: 'name, sector and price are required.' });
  }

  if (signalId) {
    const existing = await prisma.watchlistItem.findFirst({ where: { userId: req.userId, signalId } });
    if (existing) return res.status(200).json(existing);
  }

  const item = await prisma.watchlistItem.create({
    data: { userId: req.userId, name, sector, price, signalId: signalId || null },
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

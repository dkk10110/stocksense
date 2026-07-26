const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/signals?type=compression
router.get('/', async (req, res) => {
  const { type } = req.query;
  const signals = await prisma.signal.findMany({
    where: { active: true, ...(type ? { type } : {}) },
    orderBy: { confidence: 'desc' },
  });
  res.json(signals);
});

router.get('/:id', async (req, res) => {
  const signal = await prisma.signal.findUnique({ where: { id: req.params.id } });
  if (!signal) return res.status(404).json({ error: 'Signal not found' });
  res.json(signal);
});

module.exports = router;

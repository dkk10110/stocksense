const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { paperTradeStats } = require('../services/paperTrading/paperTrades');

const router = express.Router();
router.use(requireAuth);

// GET /api/paper — per-type + overall accuracy scorecard for the 30-day paper run (PRD 9 wk4).
router.get('/', async (req, res) => {
  const stats = await paperTradeStats();
  const recent = await prisma.paperTrade.findMany({ orderBy: { openedAt: 'desc' }, take: 100 });
  res.json({ stats, recent });
});

module.exports = router;

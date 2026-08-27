const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: { settings: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const trades = await prisma.tradeHistory.findMany({ where: { userId: req.userId } });

  const summarize = (list) => {
    const n = list.length;
    if (!n) return { winRate: null, tradesClosed: 0, avgGain: null, avgDaysHeld: null };
    const withDays = list.filter((t) => t.daysHeld != null);
    return {
      winRate: Math.round((list.filter((t) => Number(t.gainPct) >= 0).length / n) * 100),
      tradesClosed: n,
      avgGain: list.reduce((s, t) => s + Number(t.gainPct), 0) / n,
      avgDaysHeld: withDays.length ? Number((withDays.reduce((s, t) => s + t.daysHeld, 0) / withDays.length).toFixed(1)) : null,
    };
  };

  // PRD §6.1 — "Monthly scorecard now shows performance broken down by signal type."
  const byType = {};
  for (const type of ['compression', 'catalyst', 'fallen', 'earnings', 'volume']) {
    byType[type] = summarize(trades.filter((t) => t.signalType === type));
  }

  res.json({
    id: user.id, name: user.name, email: user.email, phone: user.phone,
    broker: user.broker, riskPref: user.riskPref, settings: user.settings,
    createdAt: user.createdAt,
    scorecard: { ...summarize(trades), byType },
  });
});

router.patch('/settings', async (req, res) => {
  const { alertsConfig, swingWindow, profitTarget } = req.body;
  const settings = await prisma.settings.update({
    where: { userId: req.userId },
    data: {
      ...(alertsConfig ? { alertsConfig } : {}),
      ...(swingWindow ? { swingWindow } : {}),
      ...(profitTarget ? { profitTarget } : {}),
    },
  });
  res.json(settings);
});

module.exports = router;

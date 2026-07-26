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
  const n = trades.length;
  const winRate = n ? Math.round((trades.filter((t) => Number(t.gainPct) >= 0).length / n) * 100) : null;
  const avgGain = n ? trades.reduce((s, t) => s + Number(t.gainPct), 0) / n : null;

  res.json({
    id: user.id, name: user.name, email: user.email, phone: user.phone,
    broker: user.broker, riskPref: user.riskPref, settings: user.settings,
    createdAt: user.createdAt,
    scorecard: { winRate, tradesClosed: n, avgGain },
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

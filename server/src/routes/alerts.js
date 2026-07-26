const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const alerts = await prisma.alert.findMany({
    where: { userId: req.userId, dismissed: false },
    orderBy: { createdAt: 'desc' },
  });
  res.json(alerts);
});

router.post('/:id/dismiss', async (req, res) => {
  const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
  if (!alert || alert.userId !== req.userId) return res.status(404).json({ error: 'Alert not found' });
  await prisma.alert.update({ where: { id: req.params.id }, data: { dismissed: true } });
  res.status(204).end();
});

router.post('/dismiss-all', async (req, res) => {
  await prisma.alert.updateMany({ where: { userId: req.userId, dismissed: false }, data: { dismissed: true } });
  res.status(204).end();
});

module.exports = router;

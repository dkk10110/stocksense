const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/jobs — recent cron job runs, for visibility into the evening/morning/poll pipeline.
router.get('/', async (req, res) => {
  const runs = await prisma.jobRun.findMany({ orderBy: { startedAt: 'desc' }, take: 50 });
  res.json(runs);
});

module.exports = router;

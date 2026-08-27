const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/discovery — latest market-wide scan: shortlist + top sectors + breadth
router.get('/', async (req, res) => {
  const run = await prisma.discoveryRun.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { startedAt: 'desc' },
  });
  if (!run) return res.json({ run: null, shortlist: [], sectorRanks: [], breadth: null });
  res.json({
    run: { id: run.id, startedAt: run.startedAt, finishedAt: run.finishedAt, universeSize: run.universeSize, scannedCount: run.scannedCount, note: run.note },
    shortlist: run.shortlist,
    sectorRanks: run.sectorRanks,
    breadth: run.breadth,
  });
});

// GET /api/discovery/sectors — the full ranked sector table (latest)
router.get('/sectors', async (req, res) => {
  const ranks = await prisma.sectorRank.findMany({ orderBy: { rank: 'asc' } });
  res.json(ranks);
});

// GET /api/discovery/runs — recent scan history (ops visibility)
router.get('/runs', async (req, res) => {
  const runs = await prisma.discoveryRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 });
  res.json(runs.map((r) => ({
    id: r.id, startedAt: r.startedAt, finishedAt: r.finishedAt,
    universeSize: r.universeSize, scannedCount: r.scannedCount,
    shortlistCount: Array.isArray(r.shortlist) ? r.shortlist.length : 0, note: r.note,
  })));
});

module.exports = router;

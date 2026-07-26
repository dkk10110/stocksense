require('dotenv').config();
const prisma = require('../lib/prisma');
const { ingestPrices } = require('../scripts/ingestPrices');
const { generateSignals } = require('../scripts/generateSignals');

/** PRD §5.1 — 6:15 PM pass: pull the day's closing prices, then re-run detection + scoring on top of them. */
async function runEveningScan() {
  console.log('=== Evening scan starting ===');
  await ingestPrices();
  await generateSignals();
  console.log('=== Evening scan complete ===');
}

module.exports = { runEveningScan };

if (require.main === module) {
  const { trackJobRun } = require('../services/jobs/trackJobRun');
  trackJobRun('evening_scan', runEveningScan)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

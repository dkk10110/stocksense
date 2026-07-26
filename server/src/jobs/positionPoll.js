require('dotenv').config();
const prisma = require('../lib/prisma');
const { syncAllOpenPositions } = require('../services/positions/syncPrices');

/** Intraday price poll — refreshes every open position's currentPrice from stored PriceHistory and fires gain/stop alerts. */
async function runPositionPoll() {
  const result = await syncAllOpenPositions();
  console.log(`Position poll: ${result.updated}/${result.total} positions synced.`);
  return result;
}

module.exports = { runPositionPoll };

if (require.main === module) {
  const { trackJobRun } = require('../services/jobs/trackJobRun');
  trackJobRun('position_poll', runPositionPoll)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

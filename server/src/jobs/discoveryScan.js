require('dotenv').config();
const prisma = require('../lib/prisma');
const { runDiscoveryScan } = require('../services/discovery/discoveryScan');

/** v4.0 FRD — post-close market-wide discovery scan (universe → shortlist + sector ranks). */
async function runDiscovery() {
  console.log('=== Discovery scan starting ===');
  const result = await runDiscoveryScan();
  console.log('=== Discovery scan complete ===');
  return result;
}

module.exports = { runDiscovery };

if (require.main === module) {
  const { trackJobRun } = require('../services/jobs/trackJobRun');
  trackJobRun('discovery_scan', runDiscovery)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

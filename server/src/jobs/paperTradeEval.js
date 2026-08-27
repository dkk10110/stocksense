require('dotenv').config();
const prisma = require('../lib/prisma');
const { evaluateOpenPaperTrades } = require('../services/paperTrading/paperTrades');

/** PRD 9, Week 4 — daily walk of every open paper trade to a target/stop/expiry outcome. */
async function runPaperTradeEval() {
  const result = await evaluateOpenPaperTrades();
  console.log(`Paper-trade eval: ${result.evaluated} open, ${result.closed} closed this run.`);
  return result;
}

module.exports = { runPaperTradeEval };

if (require.main === module) {
  const { trackJobRun } = require('../services/jobs/trackJobRun');
  trackJobRun('paper_trade_eval', runPaperTradeEval)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

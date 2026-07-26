require('dotenv').config();
const prisma = require('../lib/prisma');
const { fetchNextResultsDate } = require('../services/marketData/nseCalendar');
const { createAlert } = require('../services/alerts/createAlert');

const R = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const DAY_MS = 24 * 60 * 60 * 1000;
const isSameDay = (a, b) => a.toISOString().split('T')[0] === b.toISOString().split('T')[0];

/** Recomputes real daysHeld from buyDate (previously a static field, never advanced), and fires day-12 / earnings-day alerts once each. */
async function runDailyPositionChecks() {
  const positions = await prisma.position.findMany({
    where: { status: 'open' },
    include: { watchlistItem: true, user: { select: { name: true } } },
  });

  const now = new Date();
  let day12Fired = 0;
  let earningsFired = 0;

  for (const position of positions) {
    const daysHeld = Math.floor((now - new Date(position.buyDate)) / DAY_MS);
    const gainPct = ((Number(position.currentPrice) - Number(position.buyPrice)) / Number(position.buyPrice)) * 100;

    const data = { daysHeld };

    if (daysHeld >= 12 && daysHeld < 15 && gainPct < 10 && !position.day12AlertSent) {
      data.day12AlertSent = true;
      await createAlert({
        userId: position.userId,
        type: 'day12_time',
        title: `${position.name}: ${daysHeld} of 15 days elapsed`,
        body: `Currently ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}% (${R(position.currentPrice)}). Full target not reached with ${15 - daysHeld} days left. Review: hold to day 15, exit now, or extend?`,
      });
      day12Fired += 1;
    }

    const symbol = position.watchlistItem?.symbol;
    if (symbol && !position.earningsAlertSent) {
      try {
        const nextResults = await fetchNextResultsDate(symbol);
        if (nextResults && isSameDay(nextResults, now)) {
          data.earningsAlertSent = true;
          await createAlert({
            userId: position.userId,
            type: 'earnings_day',
            title: `${position.name} results today`,
            body: `${position.name} reports results today. Watching for beat/miss. If beat confirmed: hold for 2-3 days post-results drift. If miss: consider exiting at tomorrow's open.`,
          });
          earningsFired += 1;
        }
      } catch (err) {
        console.log(`  [${symbol}] earnings-day check failed: ${err.message}`);
      }
    }

    await prisma.position.update({ where: { id: position.id }, data });
  }

  console.log(`Daily position checks: ${positions.length} open positions, ${day12Fired} day-12 alert(s), ${earningsFired} earnings-day alert(s).`);
}

module.exports = { runDailyPositionChecks };

if (require.main === module) {
  const { trackJobRun } = require('../services/jobs/trackJobRun');
  trackJobRun('daily_position_checks', runDailyPositionChecks)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

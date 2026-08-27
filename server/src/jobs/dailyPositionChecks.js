require('dotenv').config();
const prisma = require('../lib/prisma');
const { fetchNextResultsDate } = require('../services/marketData/nseCalendar');
const { createAlert } = require('../services/alerts/createAlert');
const { getHistory } = require('../services/marketData/priceHistoryStore');
const { recommendForPosition } = require('../services/portfolio/recommendations');

const R = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const DAY_MS = 24 * 60 * 60 * 1000;
const isSameDay = (a, b) => a.toISOString().split('T')[0] === b.toISOString().split('T')[0];
const daysBetween = (a, b) => Math.ceil((a - b) / DAY_MS);

/** Dedup helper — has this alert type already been sent to this user in the last `days` days? */
async function sentRecently(userId, type, titlePrefix, days = 5) {
  const since = new Date(Date.now() - days * DAY_MS);
  const hit = await prisma.alert.findFirst({
    where: { userId, type, createdAt: { gte: since }, title: { startsWith: titlePrefix } },
  });
  return !!hit;
}

/**
 * Daily post-close checks for open positions:
 *  - recompute real daysHeld from buyDate
 *  - day-N time alert (N = user's swing window − 3, fired once) — PRD "day-12 time alert"
 *  - earnings-day + earnings-exit ("results tomorrow") alerts — PRD 2.4
 *  - catalyst 7-day / 1-day alerts for held `catalyst` positions — PRD 8
 */
async function runDailyPositionChecks() {
  const positions = await prisma.position.findMany({
    where: { status: 'open' },
    include: { watchlistItem: true, user: { select: { name: true } } },
  });

  // one settings lookup per user, cached for the run
  const swingWindowByUser = new Map();
  async function swingWindowFor(userId) {
    if (!swingWindowByUser.has(userId)) {
      const s = await prisma.settings.findUnique({ where: { userId }, select: { swingWindow: true } });
      swingWindowByUser.set(userId, s?.swingWindow || 15);
    }
    return swingWindowByUser.get(userId);
  }

  // latest sector ranks for the sector-rotation alert (v4.0 FRD)
  const sectorRanks = await prisma.sectorRank.findMany();
  const rankBySector = Object.fromEntries(sectorRanks.map((r) => [r.sector, r]));

  const now = new Date();
  let dayNFired = 0;
  let earningsFired = 0;
  let earningsExitFired = 0;
  let catalystFired = 0;
  let sectorRotationFired = 0;
  let bookProfitFired = 0;

  for (const position of positions) {
    const daysHeld = Math.floor((now - new Date(position.buyDate)) / DAY_MS);
    const gainPct = ((Number(position.currentPrice) - Number(position.buyPrice)) / Number(position.buyPrice)) * 100;
    const data = { daysHeld };

    const swingWindow = await swingWindowFor(position.userId);
    const dayNThreshold = Math.max(3, swingWindow - 3); // PRD uses 12 of 15

    if (daysHeld >= dayNThreshold && daysHeld < swingWindow && gainPct < 10 && !position.day12AlertSent) {
      data.day12AlertSent = true;
      await createAlert({
        userId: position.userId,
        type: 'day12_time',
        title: `${position.name}: ${daysHeld} of ${swingWindow} days elapsed`,
        body: `Currently ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}% (${R(position.currentPrice)}). Full target not reached with ${swingWindow - daysHeld} days left. Review: hold to day ${swingWindow}, exit now, or extend?`,
      });
      dayNFired += 1;
    }

    const symbol = position.watchlistItem?.symbol;

    // --- earnings-day + earnings-exit ---
    if (symbol && (!position.earningsAlertSent || !position.earningsExitAlertSent)) {
      try {
        const nextResults = await fetchNextResultsDate(symbol);
        if (nextResults) {
          const daysToResults = daysBetween(nextResults, now);

          if (daysToResults === 1 && !position.earningsExitAlertSent) {
            data.earningsExitAlertSent = true;
            await createAlert({
              userId: position.userId,
              type: 'earnings_exit',
              title: `${position.name}: results tomorrow — exit or hold?`,
              body: `${position.name} reports tomorrow. Currently ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}% (${R(position.currentPrice)}). Option A: exit today, bank the pre-results drift, skip event risk. Option B: hold through and exit 2–3 days after if the beat confirms.`,
            });
            earningsExitFired += 1;
          }

          if (isSameDay(nextResults, now) && !position.earningsAlertSent) {
            data.earningsAlertSent = true;
            await createAlert({
              userId: position.userId,
              type: 'earnings_day',
              title: `${position.name} results today`,
              body: `${position.name} reports results today. Watching for beat/miss. If beat confirmed: hold for 2-3 days post-results drift. If miss: consider exiting at tomorrow's open.`,
            });
            earningsFired += 1;
          }
        }
      } catch (err) {
        console.log(`  [${symbol}] earnings check failed: ${err.message}`);
      }
    }

    // --- catalyst 7-day / 1-day (held catalyst positions) ---
    if (position.catalystDate && (!position.catalyst7dAlertSent || !position.catalyst1dAlertSent)) {
      const daysToEvent = daysBetween(new Date(position.catalystDate), now);

      if (daysToEvent <= 7 && daysToEvent > 1 && !position.catalyst7dAlertSent) {
        data.catalyst7dAlertSent = true;
        await createAlert({
          userId: position.userId,
          type: 'catalyst_7day',
          title: `${position.name}: catalyst in ${daysToEvent} days`,
          body: `${position.name} — the dated catalyst is ${daysToEvent} days out. Position at ${R(position.buyPrice)}, now ${R(position.currentPrice)} (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%). Hold through the event or tighten your stop.`,
        });
        catalystFired += 1;
      }

      if (daysToEvent <= 1 && daysToEvent >= 0 && !position.catalyst1dAlertSent) {
        data.catalyst1dAlertSent = true;
        await createAlert({
          userId: position.userId,
          type: 'catalyst_1day',
          title: `${position.name}: catalyst tomorrow`,
          body: `${position.name} — the catalyst lands within a day. Currently ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}% (${R(position.currentPrice)}). Decide now: hold through the outcome, or exit ahead of event risk.`,
        });
        catalystFired += 1;
      }
    }

    // --- v4.0 FRD: sector-rotation alert (held position's sector rotated into strength) ---
    const sr = rankBySector[position.sector];
    if (sr && sr.rank <= 3 && sr.score >= 65) {
      if (!(await sentRecently(position.userId, 'sector_rotation', `${position.name}:`, 10))) {
        await createAlert({
          userId: position.userId,
          type: 'sector_rotation',
          title: `${position.name}: ${position.sector} rotating into strength`,
          body: `${position.sector} is now ranked #${sr.rank} (score ${sr.score}/100) in the sector model. Your ${position.name} position (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%) is positioned for the rotation — consider holding for the fuller move.`,
        });
        sectorRotationFired += 1;
      }
    }

    // --- v4.0 FRD: portfolio-intelligence book-profit nudge ---
    if (symbol) {
      const rows = await getHistory(symbol, 120).catch(() => []);
      const sig = await prisma.signal.findFirst({ where: { symbol, active: true }, select: { id: true } });
      const rec = recommendForPosition(position, { swingWindow, signalActive: !!sig, rows });
      if (rec.action === 'book_profit' && !(await sentRecently(position.userId, 'book_profit', `${position.name}:`, 3))) {
        await createAlert({
          userId: position.userId,
          type: 'book_profit',
          title: `${position.name}: book profit`,
          body: rec.reason,
        });
        bookProfitFired += 1;
      }
    }

    await prisma.position.update({ where: { id: position.id }, data });
  }

  const summary = `${positions.length} open · day-N ${dayNFired} · earnings-day ${earningsFired} · earnings-exit ${earningsExitFired} · catalyst ${catalystFired} · rotation ${sectorRotationFired} · book-profit ${bookProfitFired}`;
  console.log(`Daily position checks: ${summary}.`);
  return { positions: positions.length, dayNFired, earningsFired, earningsExitFired, catalystFired, sectorRotationFired, bookProfitFired };
}

module.exports = { runDailyPositionChecks };

if (require.main === module) {
  const { trackJobRun } = require('../services/jobs/trackJobRun');
  trackJobRun('daily_position_checks', runDailyPositionChecks)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

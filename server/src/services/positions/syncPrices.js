const prisma = require('../../lib/prisma');
const { getLatestClose } = require('../marketData/priceHistoryStore');
const { createAlert } = require('../alerts/createAlert');

const R = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const GAIN_ALERT_TYPE = { 2: 'gain_2', 5: 'gain_5', 10: 'gain_10' };

function newlyHitLevels(position, newPrice) {
  const gainPct = ((newPrice - Number(position.buyPrice)) / Number(position.buyPrice)) * 100;
  const already = new Set(position.alertsHit);
  const newlyHit = position.alertLevels.filter((lvl) => gainPct >= lvl && !already.has(lvl));
  const allHit = [...new Set([...position.alertsHit, ...newlyHit])];
  return { gainPct, allHit, newlyHit };
}

async function fireGainAlert(position, level, gainPct, newPrice, userName) {
  const pl = Math.round((newPrice - Number(position.buyPrice)) * position.qty);
  const type = GAIN_ALERT_TYPE[level] || 'gain_2';
  const title = level >= 10
    ? `Full target hit on ${position.name}!`
    : `${position.name} ${level}% alert fired`;
  const body = level >= 10
    ? `${position.name} hit its full +${level}% target at ${R(newPrice)}. P&L: +${R(pl)}. Strong sell signal — swing complete.`
    : `Hey ${userName}! ${position.name} hit +${level}% (${R(newPrice)}). P&L: +${R(pl)} (${position.qty} shares). Currently at +${gainPct.toFixed(1)}% overall.`;
  await createAlert({ userId: position.userId, type, title, body });
}

async function fireStopLossAlert(position, newPrice, userName) {
  const loss = Math.round((Number(position.buyPrice) - newPrice) * position.qty);
  await createAlert({
    userId: position.userId,
    type: 'stop_loss',
    title: `Stop loss hit — ${position.name}`,
    body: `${userName}, ${position.name} hit its stop at ${R(newPrice)}. Exit recommended. Loss: ${R(loss)}. Protecting capital.`,
  });
}

/** Syncs one position's currentPrice from stored PriceHistory and fires any newly-crossed gain/stop alerts. */
async function syncOnePosition(position, userName) {
  const symbol = position.watchlistItem?.symbol;
  if (!symbol) return null;
  const latestClose = await getLatestClose(symbol);
  if (latestClose == null) return null;

  const { gainPct, allHit, newlyHit } = newlyHitLevels(position, latestClose);
  const stopNewlyHit = latestClose <= Number(position.stop) && !position.stopAlertSent;

  const updated = await prisma.position.update({
    where: { id: position.id },
    data: { currentPrice: latestClose, alertsHit: allHit, stopAlertSent: position.stopAlertSent || stopNewlyHit },
  });

  for (const level of newlyHit) await fireGainAlert(position, level, gainPct, latestClose, userName);
  if (stopNewlyHit) await fireStopLossAlert(position, latestClose, userName);

  return updated;
}

/** For the authenticated-user API route. */
async function syncPositionsForUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const positions = await prisma.position.findMany({ where: { userId, status: 'open' }, include: { watchlistItem: true } });

  const updated = [];
  const skipped = [];
  for (const position of positions) {
    const result = await syncOnePosition(position, user.name.split(' ')[0]);
    if (result) updated.push(result); else skipped.push(position.name);
  }
  return { updated, skipped };
}

/** For the cron job — every open position across every user. */
async function syncAllOpenPositions() {
  const positions = await prisma.position.findMany({
    where: { status: 'open' },
    include: { watchlistItem: true, user: { select: { name: true } } },
  });

  let updated = 0;
  for (const position of positions) {
    const result = await syncOnePosition(position, position.user.name.split(' ')[0]);
    if (result) updated += 1;
  }
  return { total: positions.length, updated };
}

module.exports = { syncPositionsForUser, syncAllOpenPositions };

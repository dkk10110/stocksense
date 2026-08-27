const prisma = require('../../lib/prisma');
const { getHistory, getLatestClose } = require('../marketData/priceHistoryStore');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * PRD 9, Week 4 — opens one paper trade per generated signal (no real capital).
 * Idempotent: skips if this signal already has an open paper trade.
 */
async function openPaperTrade(signal) {
  const existing = await prisma.paperTrade.findFirst({ where: { signalId: signal.id, status: 'open' } });
  if (existing) return existing;

  return prisma.paperTrade.create({
    data: {
      signalId: signal.id,
      symbol: signal.symbol,
      type: signal.type,
      entryPrice: signal.price,
      target: signal.target,
      stop: signal.stop,
      confidence: signal.confidence,
      swingDays: signal.days,
    },
  });
}

/**
 * Walks every open paper trade forward against stored daily closes since it opened.
 * First touch wins: target hit → target_hit, stop hit → stopped, else after swingDays → expired.
 * Records days-to-outcome and peak gain % along the way.
 */
async function evaluateOpenPaperTrades() {
  const open = await prisma.paperTrade.findMany({ where: { status: 'open' } });
  let closed = 0;

  for (const t of open) {
    const rows = await getHistory(t.symbol, 400);
    const since = rows.filter((r) => new Date(r.date) >= new Date(t.openedAt));
    if (!since.length) continue;

    const entry = Number(t.entryPrice);
    const target = Number(t.target);
    const stop = Number(t.stop);
    let peakGainPct = t.peakGainPct != null ? Number(t.peakGainPct) : 0;
    let outcome = null;
    let outcomeDate = null;
    let exitPrice = null;

    for (const r of since) {
      const hi = Number(r.high);
      const lo = Number(r.low);
      peakGainPct = Math.max(peakGainPct, ((hi - entry) / entry) * 100);

      if (lo <= stop) { outcome = 'stopped'; outcomeDate = new Date(r.date); exitPrice = stop; break; }
      if (hi >= target) { outcome = 'target_hit'; outcomeDate = new Date(r.date); exitPrice = target; break; }
    }

    const ageDays = Math.floor((Date.now() - new Date(t.openedAt)) / DAY_MS);
    if (!outcome && ageDays >= t.swingDays) {
      outcome = 'expired';
      outcomeDate = new Date();
      exitPrice = await getLatestClose(t.symbol);
    }

    if (outcome) {
      await prisma.paperTrade.update({
        where: { id: t.id },
        data: {
          status: outcome,
          exitPrice: exitPrice != null ? exitPrice : undefined,
          exitReason: outcome,
          closedAt: outcomeDate,
          daysToOutcome: Math.max(0, Math.round((outcomeDate - new Date(t.openedAt)) / DAY_MS)),
          peakGainPct: Number(peakGainPct.toFixed(2)),
        },
      });
      closed += 1;
    } else {
      await prisma.paperTrade.update({ where: { id: t.id }, data: { peakGainPct: Number(peakGainPct.toFixed(2)) } });
    }
  }

  return { evaluated: open.length, closed };
}

/** Per-type + overall accuracy scorecard for the paper run. `winRate` = target_hit / (closed trades). */
async function paperTradeStats() {
  const all = await prisma.paperTrade.findMany();
  const bucket = (list) => {
    const closed = list.filter((t) => t.status !== 'open');
    const wins = closed.filter((t) => t.status === 'target_hit');
    const stopped = closed.filter((t) => t.status === 'stopped');
    const expired = closed.filter((t) => t.status === 'expired');
    const withDays = closed.filter((t) => t.daysToOutcome != null);
    return {
      total: list.length,
      open: list.length - closed.length,
      closed: closed.length,
      targetHit: wins.length,
      stopped: stopped.length,
      expired: expired.length,
      winRate: closed.length ? Math.round((wins.length / closed.length) * 100) : null,
      avgDaysToOutcome: withDays.length ? Number((withDays.reduce((s, t) => s + t.daysToOutcome, 0) / withDays.length).toFixed(1)) : null,
      avgPeakGainPct: list.length ? Number((list.reduce((s, t) => s + (t.peakGainPct != null ? Number(t.peakGainPct) : 0), 0) / list.length).toFixed(1)) : null,
    };
  };

  const byType = {};
  for (const type of ['compression', 'catalyst', 'fallen', 'earnings', 'volume']) {
    byType[type] = bucket(all.filter((t) => t.type === type));
  }
  return { overall: bucket(all), byType };
}

module.exports = { openPaperTrade, evaluateOpenPaperTrades, paperTradeStats };

require('dotenv').config();
const prisma = require('../lib/prisma');
const { collectTrackedSymbols } = require('../services/marketData/trackedSymbols');
const { getHistory } = require('../services/marketData/priceHistoryStore');
const { fetchFundamentals } = require('../services/marketData/screenerIn');
const { fetchNextResultsDate } = require('../services/marketData/nseCalendar');
const { getMacroSnapshot, getFiiDiiFlow } = require('../services/marketData/macro');
const { isConfigured: newsApiConfigured, fetchRecentArticles } = require('../services/marketData/newsApi');
const { scoreNewsSentiment } = require('../services/ai/newsSentiment');
const { classifyDrop } = require('../services/ai/classifyDrop');
const { extractCatalystEvent } = require('../services/ai/extractCatalystEvent');
const { detectCompression } = require('../services/detectors/compression');
const { detectVolumeReversal } = require('../services/detectors/volumeReversal');
const { detectFallenAngel } = require('../services/detectors/fallenAngel');
const { detectEarningsPlay } = require('../services/detectors/earningsPlay');
const { detectCatalystCountdown } = require('../services/detectors/catalystCountdown');
const { scoreDetection } = require('../services/scoring/compositeScorer');
const { formatEvidence, generateHeadline } = require('../services/scoring/formatEvidence');
const { generateWhyBuyNow } = require('../services/ai/explainSignal');
const { createAlert } = require('../services/alerts/createAlert');
const { openPaperTrade } = require('../services/paperTrading/paperTrades');

const R = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

async function bestEffort(promise, label, symbol) {
  try {
    return await promise;
  } catch (err) {
    console.log(`    [${symbol}] ${label} unavailable: ${err.message}`);
    return null;
  }
}

async function resolveNameAndSector(symbol) {
  const wl = await prisma.watchlistItem.findFirst({ where: { symbol }, select: { name: true, sector: true } });
  if (wl) return wl;
  const sig = await prisma.signal.findFirst({ where: { symbol }, select: { name: true, sector: true } });
  if (sig) return sig;
  return { name: symbol, sector: 'Unknown' };
}

async function processSymbol(symbol, shared) {
  const rows = await getHistory(symbol, 300);
  if (rows.length < 30) {
    console.log(`  ${symbol}: skipped — not enough price history (${rows.length} rows)`);
    return [];
  }

  const fundamentals = await bestEffort(fetchFundamentals(symbol), 'fundamentals', symbol);
  const nextResultsDate = await bestEffort(fetchNextResultsDate(symbol), 'results date', symbol);

  // News-derived inputs — all no-op gracefully when NewsAPI / the AI layer isn't configured.
  const name = (await resolveNameAndSector(symbol)).name;
  const articles = newsApiConfigured()
    ? await bestEffort(fetchRecentArticles(`${name} ${symbol} stock`, { symbol }), 'news', symbol)
    : null;
  const newsSentiment = await bestEffort(scoreNewsSentiment(symbol, articles), 'news sentiment', symbol);
  const dropClassification = await bestEffort(classifyDrop(symbol, articles), 'drop classification', symbol);
  const catalystEvent = await bestEffort(extractCatalystEvent(symbol, articles), 'catalyst extraction', symbol);

  const context = { rows, fundamentals, macro: shared.macro, fiiDii: shared.fiiDii, newsSentiment };

  const detections = [
    detectCompression(rows),
    detectVolumeReversal(rows),
    detectFallenAngel(rows, fundamentals, dropClassification),
    detectEarningsPlay(rows, fundamentals, nextResultsDate),
    detectCatalystCountdown(rows, catalystEvent, shared.fiiDii),
  ].filter(Boolean);

  const accepted = [];
  for (const detection of detections) {
    const scored = scoreDetection(detection, context);
    if (!scored.passedAllGates) {
      console.log(`  ${symbol}: ${detection.type} detected but failed gates — ${JSON.stringify(scored.gates)}`);
      continue;
    }
    accepted.push({ detection, scored });
  }
  return accepted;
}

async function generateSignals() {
  const symbols = await collectTrackedSymbols();
  console.log(`Generating signals for ${symbols.length} symbols: ${symbols.join(', ')}\n`);

  const macro = await bestEffort(getMacroSnapshot(), 'macro snapshot', 'macro');
  const fiiDii = await bestEffort(getFiiDiiFlow(), 'FII/DII flow', 'macro');
  console.log(`Macro context: VIX=${macro?.vix ?? 'unknown'}, S&P500=${macro?.sp500ChangePct?.toFixed(2) ?? '?'}%, Brent=${macro?.brentChangePct?.toFixed(2) ?? '?'}%, FII/DII net=${fiiDii ? fiiDii.fiiNetCr + fiiDii.diiNetCr : 'unknown'}\n`);

  let created = 0;
  for (const symbol of symbols) {
    const accepted = await processSymbol(symbol, { macro: macro || {}, fiiDii });

    // Regenerate from scratch for this symbol: deactivate old signals and unlink watchlist items.
    const staleSignals = await prisma.signal.findMany({ where: { symbol, active: true }, select: { id: true, type: true } });
    const staleTypes = new Set(staleSignals.map((s) => s.type));
    const staleIds = staleSignals.map((s) => s.id);
    if (staleIds.length) {
      await prisma.signal.updateMany({ where: { id: { in: staleIds } }, data: { active: false } });
      await prisma.watchlistItem.updateMany({ where: { signalId: { in: staleIds } }, data: { signalId: null } });
    }

    for (const { detection, scored } of accepted) {
      const { name, sector } = await resolveNameAndSector(symbol);
      const insight = await generateWhyBuyNow(detection);
      const { indicators, catalysts } = formatEvidence(detection);

      const signal = await prisma.signal.create({
        data: {
          name, symbol, sector, type: detection.type,
          price: detection.price,
          entryLow: scored.trade.entryLow, entryHigh: scored.trade.entryHigh,
          target: scored.trade.target, stop: scored.trade.stop, days: scored.trade.days,
          confidence: scored.confidence, upside: scored.upside,
          rsi: Math.round(detection.evidence.rsi ?? detection.evidence.rsiNow ?? 50),
          headline: generateHeadline(detection),
          insight, indicators, catalysts,
          probBasis: scored.probBasis, rr: scored.trade.rr,
          active: true,
          scoreBreakdown: scored.layers,
          catalystDate: detection.catalystDate ?? null,
          catalystLabel: detection.catalystLabel ?? null,
        },
      });

      await prisma.watchlistItem.updateMany({ where: { symbol }, data: { signalId: signal.id } });
      await openPaperTrade(signal); // PRD 9 wk4 — paper-trade every generated signal
      console.log(`  ${symbol}: ✅ created ${detection.type} signal — confidence ${scored.confidence}%, R/R 1:${scored.trade.rr}`);
      created += 1;

      // Only alert on a genuinely new/changed setup for this symbol, not every run's regeneration.
      if (!staleTypes.has(detection.type)) {
        const watchers = await prisma.watchlistItem.findMany({ where: { symbol }, select: { userId: true }, distinct: ['userId'] });
        for (const { userId } of watchers) {
          await createAlert({
            userId,
            type: 'forward_signal',
            signalType: detection.type,
            title: `New forward signal — ${name}`,
            body: `${generateHeadline(detection)}. Entry window ${R(scored.trade.entryLow)}–${R(scored.trade.entryHigh)} today. Target ${R(scored.trade.target)} (+${scored.upside}%) in ${scored.trade.days} days. Confidence ${scored.confidence}%.`,
          });
          if (detection.type === 'fallen') {
            await createAlert({
              userId,
              type: 'rsi_reversal',
              title: `${name} RSI turning — fallen angel reversal confirmed`,
              body: `RSI moved from ${detection.evidence.rsiMin} to ${detection.evidence.rsiNow}. Entry window ${R(scored.trade.entryLow)}–${R(scored.trade.entryHigh)}. Stop ${R(scored.trade.stop)}.`,
            });
          }
        }
      }
    }
  }

  console.log(`\nDone. ${created} signal(s) generated.`);
  return { created };
}

module.exports = { generateSignals };

if (require.main === module) {
  generateSignals()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

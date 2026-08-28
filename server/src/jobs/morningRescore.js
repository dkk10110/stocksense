require('dotenv').config();
const prisma = require('../lib/prisma');
const { getMacroSnapshot, getFiiDiiFlow } = require('../services/marketData/macro');
const { getLatestClose } = require('../services/marketData/priceHistoryStore');
const { isConfigured: newsApiConfigured, fetchRecentArticles } = require('../services/marketData/newsApi');
const { scoreNewsSentiment } = require('../services/ai/newsSentiment');
const { createAlert } = require('../services/alerts/createAlert');
const { WEIGHTS, scoreMacro, scoreFiiDii, scoreNewsIntelligence } = require('../services/scoring/compositeScorer');

/**
 * PRD §5.2 — 9:20 AM pass. Re-fetches overnight macro (VIX, S&P/Nasdaq/Brent/INR), FII/DII flow,
 * and (when configured) re-runs the news-sentiment scan per active signal. Recomputes the macro +
 * FII/DII + news layers on top of each signal's stored other layers, WITHOUT re-running detectors.
 * Also refreshes entry windows off the latest stored close (pre-market proxy). Alerts if a signal's
 * confidence moved by more than 5 points.
 */
async function runMorningRescore() {
  console.log('=== Morning re-score starting ===');
  const macro = await getMacroSnapshot().catch((e) => { console.log(`  macro unavailable: ${e.message}`); return null; });
  const fiiDii = await getFiiDiiFlow().catch((e) => { console.log(`  FII/DII unavailable: ${e.message}`); return null; });
  console.log(`  VIX=${macro?.vix ?? '?'}, S&P500=${macro?.sp500ChangePct?.toFixed(2) ?? '?'}%, Brent=${macro?.brentChangePct?.toFixed(2) ?? '?'}%, FII/DII net=${fiiDii ? (fiiDii.fiiNetCr + fiiDii.diiNetCr).toFixed(0) : '?'}Cr`);

  if (macro?.vix != null && macro.vix > 18) {
    console.log('  VIX above 18 — suppressing new-signal generation until the next evening scan. Existing active signals left as-is.');
    return { adjusted: 0, suppressed: true };
  }

  const macroLayer = scoreMacro(macro || {});
  const fiiDiiLayer = scoreFiiDii(fiiDii);

  const activeSignals = await prisma.signal.findMany({ where: { active: true } });
  const sentimentBySymbol = new Map();
  let adjusted = 0;
  let windowsRefreshed = 0;

  for (const signal of activeSignals) {
    const layers = signal.scoreBreakdown || {};

    // news re-scan (once per symbol per run) — only when NewsAPI + AI are configured
    let newsLayer = null;
    if (newsApiConfigured()) {
      if (!sentimentBySymbol.has(signal.symbol)) {
        try {
          const articles = await fetchRecentArticles(`${signal.name} ${signal.symbol} stock`, { symbol: signal.symbol });
          sentimentBySymbol.set(signal.symbol, scoreNewsIntelligence(await scoreNewsSentiment(signal.symbol, articles)));
        } catch (e) {
          console.log(`  [${signal.symbol}] news re-scan failed: ${e.message}`);
          sentimentBySymbol.set(signal.symbol, null);
        }
      }
      newsLayer = sentimentBySymbol.get(signal.symbol);
    }

    const oldMacro = layers.macro?.score ?? 50;
    const oldFiiDii = layers.fiiDii?.score ?? 50;
    const oldNews = layers.newsIntelligence?.score ?? 50;

    let delta = (macroLayer.score - oldMacro) * WEIGHTS.macro + (fiiDiiLayer.score - oldFiiDii) * WEIGHTS.fiiDii;
    if (newsLayer && !newsLayer.pending) delta += (newsLayer.score - oldNews) * WEIGHTS.newsIntelligence;
    const newConfidence = Math.round(signal.confidence + delta);

    // refresh entry window off the latest close (pre-market proxy) — keeps the same band width
    const latestClose = await getLatestClose(signal.symbol);
    const updateData = {};
    if (latestClose != null && Math.abs(latestClose - Number(signal.price)) / Number(signal.price) > 0.005) {
      const bandLow = Number(signal.entryLow) / Number(signal.price);
      const bandHigh = Number(signal.entryHigh) / Number(signal.price);
      updateData.price = latestClose;
      updateData.entryLow = Number((latestClose * bandLow).toFixed(2));
      updateData.entryHigh = Number((latestClose * bandHigh).toFixed(2));
      windowsRefreshed += 1;
    }

    if (Math.abs(newConfidence - signal.confidence) > 5) {
      updateData.confidence = newConfidence;
      updateData.scoreBreakdown = {
        ...layers,
        macro: macroLayer,
        fiiDii: fiiDiiLayer,
        ...(newsLayer ? { newsIntelligence: newsLayer } : {}),
      };

      const watchers = await prisma.watchlistItem.findMany({ where: { signalId: signal.id }, select: { userId: true }, distinct: ['userId'] });
      for (const { userId } of watchers) {
        await createAlert({
          userId,
          type: 'forward_signal',
          signalType: signal.type,
          title: `${signal.name} confidence updated — ${signal.confidence}% → ${newConfidence}%`,
          body: `Overnight conditions moved this signal by ${Math.abs(newConfidence - signal.confidence)} points. VIX ${macro?.vix ?? '?'}, S&P500 ${macro?.sp500ChangePct?.toFixed(2) ?? '?'}%, FII/DII net ₹${fiiDii ? (fiiDii.fiiNetCr + fiiDii.diiNetCr).toFixed(0) : '?'}Cr.`,
        });
      }
      adjusted += 1;
    }

    if (Object.keys(updateData).length) {
      await prisma.signal.update({ where: { id: signal.id }, data: updateData });
    }
  }

  console.log(`=== Morning re-score complete — ${adjusted} signal(s) adjusted >5pts, ${windowsRefreshed} entry window(s) refreshed ===`);
  return { adjusted, windowsRefreshed, suppressed: false };
}

module.exports = { runMorningRescore };

if (require.main === module) {
  const { trackJobRun } = require('../services/jobs/trackJobRun');
  trackJobRun('morning_rescore', runMorningRescore)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

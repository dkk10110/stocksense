require('dotenv').config();
const prisma = require('../lib/prisma');
const { getIndiaVix, getFiiDiiFlow, getGlobalMacro } = require('../services/marketData/macro');
const { createAlert } = require('../services/alerts/createAlert');
const { WEIGHTS } = require('../services/scoring/compositeScorer');

/**
 * PRD §5.2 — 9:20 AM pass. Re-fetches overnight macro (VIX, FII/DII, global indices) and adjusts each
 * active signal's macro + FII/DII layers on top of its already-stored other layers, without re-running
 * the full detector pass. Alerts only if confidence moved by more than 5 points, per the PRD's own threshold.
 *
 * Known gap: the PRD also calls for "update entry windows based on pre-market levels" and a fresh news
 * scan — both need Angel One (pre-market ticks) and the news pipeline (deferred since Phase 4/5), so
 * entry windows are left untouched here rather than faked from stale data.
 */
async function runMorningRescore() {
  console.log('=== Morning re-score starting ===');
  const vix = await getIndiaVix().catch((e) => { console.log(`  VIX unavailable: ${e.message}`); return null; });
  const fiiDii = await getFiiDiiFlow().catch((e) => { console.log(`  FII/DII unavailable: ${e.message}`); return null; });
  const macro = await getGlobalMacro().catch((e) => { console.log(`  Global macro unavailable: ${e.message}`); return null; });
  console.log(`  VIX=${vix ?? 'unknown'}, FII/DII net=${fiiDii ? fiiDii.fiiNetCr + fiiDii.diiNetCr : 'unknown'}, S&P500=${macro?.sp500ChangePct?.toFixed(2) ?? 'unknown'}%`);

  if (vix != null && vix > 18) {
    console.log('  VIX above 18 — suppressing new-signal generation until the next evening scan. Existing active signals are left as-is.');
    return { adjusted: 0, suppressed: true };
  }

  const scoreMacro = (v) => (v == null ? 50 : v < 14 ? 100 : v < 18 ? 70 : v < 22 ? 40 : 10);
  const scoreFiiDii = (fd) => {
    if (!fd || fd.fiiNetCr == null || fd.diiNetCr == null) return 50;
    return Math.max(0, Math.min(100, 50 + ((fd.fiiNetCr + fd.diiNetCr) / 2000) * 50));
  };

  const macroScore = scoreMacro(vix);
  const fiiDiiScore = scoreFiiDii(fiiDii);

  const activeSignals = await prisma.signal.findMany({ where: { active: true } });
  let adjusted = 0;

  for (const signal of activeSignals) {
    const layers = signal.scoreBreakdown || {};
    const oldMacroScore = layers.macro?.score ?? 50;
    const oldFiiDiiScore = layers.fiiDii?.score ?? 50;
    const delta = (macroScore - oldMacroScore) * WEIGHTS.macro + (fiiDiiScore - oldFiiDiiScore) * WEIGHTS.fiiDii;
    const newConfidence = Math.round(signal.confidence + delta);

    if (Math.abs(newConfidence - signal.confidence) > 5) {
      const updatedLayers = {
        ...layers,
        macro: { score: macroScore, pending: false, note: `India VIX ${vix}` },
        fiiDii: { score: Math.round(fiiDiiScore), pending: false, note: `market-wide net flow ₹${(fiiDii.fiiNetCr + fiiDii.diiNetCr).toFixed(0)}Cr (not stock-specific)` },
      };
      await prisma.signal.update({ where: { id: signal.id }, data: { confidence: newConfidence, scoreBreakdown: updatedLayers } });

      const watchers = await prisma.watchlistItem.findMany({ where: { signalId: signal.id }, select: { userId: true }, distinct: ['userId'] });
      for (const { userId } of watchers) {
        await createAlert({
          userId,
          type: 'forward_signal',
          title: `${signal.name} confidence updated — ${signal.confidence}% → ${newConfidence}%`,
          body: `Overnight macro conditions moved this signal's confidence by ${Math.abs(newConfidence - signal.confidence)} points. VIX now ${vix}, FII/DII net ₹${fiiDii ? (fiiDii.fiiNetCr + fiiDii.diiNetCr).toFixed(0) : '—'}Cr.`,
        });
      }
      adjusted += 1;
    }
  }

  console.log(`=== Morning re-score complete — ${adjusted} signal(s) adjusted by >5 points ===`);
  return { adjusted, suppressed: false };
}

module.exports = { runMorningRescore };

if (require.main === module) {
  const { trackJobRun } = require('../services/jobs/trackJobRun');
  trackJobRun('morning_rescore', runMorningRescore)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

const prisma = require('../../lib/prisma');
const { getUniverse, sectorOf } = require('./universe');
const { ingestUniverse } = require('./ingestUniverse');
const { assessLiquidity } = require('./liquidityFilter');
const { getHistory } = require('../marketData/priceHistoryStore');
const { getBenchmarkHistory, getMacroSnapshot, getFiiDiiFlow } = require('../marketData/macro');
const { rankSectors } = require('../sector/sectorRanking');
const { returnPct, sma, closes } = require('../indicators');

const { detectCompression } = require('../detectors/compression');
const { detectVolumeReversal } = require('../detectors/volumeReversal');
const { detectFallenAngel } = require('../detectors/fallenAngel');
const { detectInstitutionalAccumulation } = require('../detectors/institutionalAccumulation');
const { detectRelativeStrengthLeader } = require('../detectors/relativeStrengthLeader');
const { detectSectorRotation } = require('../detectors/sectorRotation');
const { detectHighDeliveryAccumulation } = require('../detectors/highDeliveryAccumulation');
const { detectMultiTimeframeBreakout } = require('../detectors/multiTimeframeBreakout');

const { scoreV4 } = require('../scoring/scoreV4');
const { fetchFundamentals } = require('../marketData/screenerIn');
const { scoreNewsSentiment } = require('../ai/newsSentiment');
const { isConfigured: newsApiConfigured, fetchRecentArticles } = require('../marketData/newsApi');
const { generateNarrative, narrativeStillValid } = require('../ai/narrative');
const { createAlert } = require('../alerts/createAlert');
const { computeTradeLevelsForDiscovery } = require('./tradeLevels');
const { openPaperTrade } = require('../paperTrading/paperTrades');
const { formatEvidence } = require('../scoring/formatEvidence');

const PROMOTE_MIN_CONFIDENCE = Number(process.env.DISCOVERY_PROMOTE_CONFIDENCE || 70);

const SHORTLIST_SIZE = Number(process.env.DISCOVERY_SHORTLIST || 12);
const MIN_CONFIDENCE = 60;

function percentileRank(sortedAsc, value) {
  let below = 0;
  for (const v of sortedAsc) { if (v < value) below += 1; else break; }
  return (below / sortedAsc.length) * 100;
}

/** v4.0 FRD — Market Discovery Engine: post-close market-wide scan → ranked shortlist. */
async function runDiscoveryScan({ skipIngest = false } = {}) {
  const run = await prisma.discoveryRun.create({ data: {} });
  const t0 = Date.now();

  try {
    if (!skipIngest) {
      const ing = await ingestUniverse();
      console.log(`  ingested ${ing.saved} rows across ${ing.universe} symbols (${ing.failures.length} failed)`);
    }

    const [benchRows, macro, fiiDii, prevRun] = await Promise.all([
      getBenchmarkHistory(400).catch(() => []),
      getMacroSnapshot().catch(() => ({})),
      getFiiDiiFlow().catch(() => null),
      prisma.discoveryRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: 'desc' } }),
    ]);
    const prevShortlistBy = Object.fromEntries((prevRun?.shortlist || []).map((s) => [s.symbol, s]));

    // 1. load + liquidity filter
    const universe = getUniverse();
    const bySymbol = new Map();
    for (const { symbol, sector } of universe) {
      const rows = await getHistory(symbol, 320);
      const liq = assessLiquidity(rows);
      if (!liq.pass) continue;
      bySymbol.set(symbol, { rows, sector, liquidity: liq.metrics });
    }
    const scanned = [...bySymbol.keys()];

    // 2. RS percentile across the scanned set (63-day return)
    const returns = scanned.map((s) => returnPct(bySymbol.get(s).rows, 63)).sort((a, b) => a - b);

    // 3. sector ranking
    const sectorInput = new Map([...bySymbol].map(([s, o]) => [s, { rows: o.rows, sector: o.sector }]));
    const { all: sectorAll, top: sectorTop } = rankSectors(sectorInput, benchRows);
    const prevRanks = await prisma.sectorRank.findMany();
    const prevScoreBy = Object.fromEntries(prevRanks.map((r) => [r.sector, r.score]));
    const sectorBy = Object.fromEntries(sectorAll.map((r) => [r.sector, r]));

    // sector 21d avg member return, for the rotation detector
    const sectorAvg21 = {};
    for (const r of sectorAll) {
      const rets = r.members.map((m) => returnPct(bySymbol.get(m).rows, 21));
      sectorAvg21[r.sector] = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
    }

    // 4. market breadth
    let advancers = 0, decliners = 0, above50 = 0;
    for (const s of scanned) {
      const c = closes(bySymbol.get(s).rows);
      if (c[c.length - 1] > c[c.length - 2]) advancers++; else decliners++;
      const ma50 = sma(bySymbol.get(s).rows, 50);
      if (ma50 != null && c[c.length - 1] > ma50) above50++;
    }
    const breadth = {
      advancers, decliners,
      advanceDeclineRatio: Number((advancers / Math.max(1, decliners)).toFixed(2)),
      pctAbove50EMA: Math.round((above50 / Math.max(1, scanned.length)) * 100),
    };

    // 5. deterministic detectors across the universe
    const DETECTORS = (rows, ctx) => [
      detectCompression(rows),
      detectVolumeReversal(rows),
      detectFallenAngel(rows, null, null),
      detectInstitutionalAccumulation(rows),
      detectRelativeStrengthLeader(rows, benchRows, ctx.rsPercentile),
      detectSectorRotation(rows, ctx.sectorCtx),
      detectHighDeliveryAccumulation(rows, null),
      detectMultiTimeframeBreakout(rows),
    ].filter(Boolean);

    const candidates = [];
    for (const symbol of scanned) {
      const { rows, sector, liquidity } = bySymbol.get(symbol);
      const rsPercentile = percentileRank(returns, returnPct(rows, 63));
      const sr = sectorBy[sector];
      const sectorCtx = sr ? {
        sector, rank: sr.rank, score: sr.score,
        prevScore: prevScoreBy[sector] ?? null,
        avgMember21dReturnPct: sectorAvg21[sector],
      } : null;

      const hits = DETECTORS(rows, { rsPercentile, sectorCtx });
      for (const detection of hits) {
        const scored = scoreV4(detection, {
          rows, benchRows,
          sectorScore: sr ? sr.score : null,
          rsPercentile,
          fundamentals: null,
          newsSentiment: null,
          catalyst: null,
          breadth,
          vix: macro?.vix ?? null,
          fiiDii,
          liquidity,
          earningsInDays: null,
        });
        if (scored.confidence < MIN_CONFIDENCE) continue;
        candidates.push({ symbol, name: symbol, sector, detection, scored, rsPercentile });
      }
    }

    // 6. shortlist = top by confidence, one entry per symbol (best detector wins)
    const bestBySymbol = new Map();
    for (const c of candidates) {
      const cur = bestBySymbol.get(c.symbol);
      if (!cur || c.scored.confidence > cur.scored.confidence) bestBySymbol.set(c.symbol, c);
    }
    const shortlist = [...bestBySymbol.values()]
      .sort((a, b) => b.scored.confidence - a.scored.confidence)
      .slice(0, SHORTLIST_SIZE);

    // 7. enrich shortlist only (FRD: "Call OpenAI only after final shortlist")
    const enriched = [];
    for (const c of shortlist) {
      const { rows } = bySymbol.get(c.symbol);
      const fundamentals = await fetchFundamentals(c.symbol).catch(() => null);
      const articles = newsApiConfigured() ? await fetchRecentArticles(`${c.symbol} stock`, { symbol: c.symbol }).catch(() => null) : null;
      const newsSentiment = await scoreNewsSentiment(c.symbol, articles).catch(() => null);

      const rescored = scoreV4(c.detection, {
        rows, benchRows,
        sectorScore: sectorBy[c.sector] ? sectorBy[c.sector].score : null,
        rsPercentile: c.rsPercentile,
        fundamentals, newsSentiment, catalyst: null, breadth,
        vix: macro?.vix ?? null, fiiDii, liquidity: bySymbol.get(c.symbol).liquidity, earningsInDays: null,
      });

      const trade = computeTradeLevelsForDiscovery(c.detection, rows);
      const signalStub = {
        name: c.symbol, symbol: c.symbol, type: c.detection.type, sector: c.sector,
        price: c.detection.price, ...trade, confidence: rescored.confidence,
        scoreBreakdown: rescored.layers, headline: `${c.detection.type} — discovery shortlist`,
        rr: trade.rr, days: trade.days,
      };
      // FRD: "Cache explanations and reuse when signals are unchanged."
      const prev = prevShortlistBy[c.symbol];
      const narrative = narrativeStillValid(
        prev ? { narrative: prev.narrative, type: prev.type, confidence: prev.confidence } : null,
        { type: c.detection.type, confidence: rescored.confidence },
      )
        ? { ...prev.narrative, reused: true }
        : await generateNarrative(signalStub, { evidence: c.detection.evidence, articles });

      enriched.push({
        symbol: c.symbol, name: c.symbol, sector: c.sector, type: c.detection.type,
        price: c.detection.price, ...trade,
        confidence: rescored.confidence, riskPenalty: rescored.riskPenalty, riskNote: rescored.riskNote,
        rsPercentile: Math.round(c.rsPercentile),
        sectorScore: sectorBy[c.sector] ? sectorBy[c.sector].score : null,
        scoreBreakdown: rescored.layers, evidence: c.detection.evidence,
        narrative,
      });
    }

    // 8. persist sector ranks
    for (const r of sectorAll) {
      await prisma.sectorRank.upsert({
        where: { sector: r.sector },
        update: { score: r.score, rank: r.rank, rs: r.rs, momentum: r.momentum, breakdown: r.breakdown },
        create: { sector: r.sector, score: r.score, rank: r.rank, rs: r.rs, momentum: r.momentum, breakdown: r.breakdown },
      });
    }

    // 9. persist DiscoveryRun
    await prisma.discoveryRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        universeSize: universe.length,
        scannedCount: scanned.length,
        shortlist: enriched,
        sectorRanks: sectorTop,
        breadth,
        note: `${enriched.length} shortlisted from ${candidates.length} raw candidates in ${((Date.now() - t0) / 1000).toFixed(0)}s`,
      },
    });

    // 10. promote high-confidence shortlist entries to real Signal rows so they flow into the
    //     Signals feed + paper-trading pipeline (FRD "Shortlist top opportunities").
    let promoted = 0;
    for (const e of enriched) {
      if (e.confidence < PROMOTE_MIN_CONFIDENCE) continue;
      const existing = await prisma.signal.findFirst({ where: { symbol: e.symbol, type: e.type, active: true } });
      if (existing) continue;
      const { indicators, catalysts } = formatEvidence({ type: e.type, evidence: e.evidence });
      const sig = await prisma.signal.create({
        data: {
          name: e.name, symbol: e.symbol, sector: e.sector, type: e.type,
          price: e.price, entryLow: e.entryLow, entryHigh: e.entryHigh, target: e.target, stop: e.stop,
          days: e.days, confidence: e.confidence, upside: e.upside,
          rsi: Math.round(e.evidence?.rsi ?? e.evidence?.rsiNow ?? 50),
          headline: `${e.type} — discovery shortlist (sector #${e.sectorScore ?? '?'}, RS ${e.rsPercentile}%)`,
          insight: e.narrative?.whyBuy || 'Surfaced by the market-wide discovery scan.',
          indicators, catalysts,
          probBasis: 200, rr: e.rr, active: true,
          scoreBreakdown: e.scoreBreakdown,
          scoringModel: 'v4', sectorScore: e.sectorScore ?? null, rsScore: e.rsPercentile ?? null,
          riskPenalty: e.riskPenalty ?? 0, narrative: e.narrative, fromDiscovery: true,
        },
      });
      await openPaperTrade(sig);
      promoted += 1;
    }

    // 11. alert on genuinely new shortlist entries (vs the previous run)
    const prevSymbols = new Set((prevRun?.shortlist || []).map((s) => s.symbol));
    const fresh = enriched.filter((e) => !prevSymbols.has(e.symbol) && e.confidence >= 70);
    if (fresh.length) {
      const users = await prisma.user.findMany({ select: { id: true } });
      for (const e of fresh.slice(0, 5)) {
        for (const u of users) {
          await createAlert({
            userId: u.id,
            type: 'new_opportunity',
            title: `Discovery: ${e.name} (${e.sector}) — ${e.confidence}%`,
            body: `${e.type} setup surfaced by the market scan. Entry ₹${Math.round(e.entryLow)}–₹${Math.round(e.entryHigh)}, target ₹${Math.round(e.target)}, stop ₹${Math.round(e.stop)}. Sector rank ${e.sectorScore ?? '?'}/100, RS ${e.rsPercentile}%.`,
          });
        }
      }
    }

    console.log(`Discovery scan: ${scanned.length}/${universe.length} passed liquidity, ${enriched.length} shortlisted, ${promoted} promoted to signals, ${fresh.length} new.`);
    return { scanned: scanned.length, shortlisted: enriched.length, promoted, newOpportunities: fresh.length };
  } catch (err) {
    await prisma.discoveryRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), note: `failed: ${err.message}` } }).catch(() => {});
    throw err;
  }
}

module.exports = { runDiscoveryScan };

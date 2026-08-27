require('dotenv').config();
const prisma = require('../lib/prisma');
const { collectTrackedSymbols } = require('../services/marketData/trackedSymbols');
const { getHistory } = require('../services/marketData/priceHistoryStore');
const { detectCompression } = require('../services/detectors/compression');
const { detectVolumeReversal } = require('../services/detectors/volumeReversal');
const { detectFallenAngel } = require('../services/detectors/fallenAngel');
const { TYPE_DEFAULTS } = require('../services/scoring/typeDefaults');

/**
 * Walk-forward historical accuracy check (PRD §2 cited figures, PRD 9 wk2 target ≥58%).
 *
 * For every stored trading day, run the price-only detectors against the history *up to that day*.
 * When one fires, look forward `days` bars: a "hit" = +targetPct reached before −stopPct.
 *
 * Scope: compression / volume / fallen only. Earnings and catalyst need historical fundamentals /
 * corporate-calendar / news that aren't stored, so they can't be walk-forward tested here — run the
 * live paper-trading validation (`npm run cron:paper` + GET /api/paper) for those.
 */
const DETECTORS = [
  { type: 'compression', fn: (rows) => detectCompression(rows), minRows: 90 },
  { type: 'volume', fn: (rows) => detectVolumeReversal(rows), minRows: 215 },
  { type: 'fallen', fn: (rows) => detectFallenAngel(rows, null, null), minRows: 265 },
];

function evaluateForward(rows, startIdx, entry, targetPct, stopPct, days) {
  const target = entry * (1 + targetPct / 100);
  const stop = entry * (1 - stopPct / 100);
  for (let j = startIdx + 1; j <= Math.min(startIdx + days, rows.length - 1); j++) {
    const hi = Number(rows[j].high);
    const lo = Number(rows[j].low);
    if (lo <= stop) return { outcome: 'stop', bars: j - startIdx };
    if (hi >= target) return { outcome: 'target', bars: j - startIdx };
  }
  return { outcome: 'timeout', bars: Math.min(days, rows.length - 1 - startIdx) };
}

async function backtestSymbol(symbol, acc) {
  const rows = await getHistory(symbol, 3000);
  if (rows.length < 120) {
    console.log(`  ${symbol}: only ${rows.length} bars — skipped`);
    return;
  }

  for (const det of DETECTORS) {
    const d = TYPE_DEFAULTS[det.type];
    let lastFireIdx = -999;
    for (let i = det.minRows; i < rows.length - 5; i++) {
      if (i - lastFireIdx < d.days) continue; // don't double-count overlapping fires of the same setup
      const hit = det.fn(rows.slice(0, i + 1));
      if (!hit) continue;
      lastFireIdx = i;

      const entry = Number(rows[i].close);
      const res = evaluateForward(rows, i, entry, d.targetPct, d.stopPct, d.days);
      const s = acc[det.type];
      s.fires += 1;
      if (res.outcome === 'target') { s.targetHits += 1; s.barsToTarget.push(res.bars); }
      else if (res.outcome === 'stop') s.stops += 1;
      else s.timeouts += 1;

      // PRD's own "hit ≥2% before stop in the window" definition, tracked alongside full-target.
      const soft = evaluateForward(rows, i, entry, 2, d.stopPct, d.days);
      if (soft.outcome === 'target') s.soft2pctHits += 1;
    }
  }
}

async function main() {
  const symbols = await collectTrackedSymbols();
  console.log(`Backtesting ${symbols.length} symbols (compression / volume / fallen)\n`);

  const acc = {};
  for (const d of DETECTORS) acc[d.type] = { fires: 0, targetHits: 0, soft2pctHits: 0, stops: 0, timeouts: 0, barsToTarget: [] };

  for (const symbol of symbols) {
    process.stdout.write(`  ${symbol}... `);
    await backtestSymbol(symbol, acc);
    console.log('done');
  }

  console.log('\n=== Results ===');
  const prdCited = { compression: 72, volume: 61, fallen: 65 };
  for (const [type, s] of Object.entries(acc)) {
    if (!s.fires) { console.log(`${type.padEnd(12)} no fires in the stored history`); continue; }
    const fullRate = Math.round((s.targetHits / s.fires) * 100);
    const softRate = Math.round((s.soft2pctHits / s.fires) * 100);
    const avgBars = s.barsToTarget.length ? (s.barsToTarget.reduce((a, b) => a + b, 0) / s.barsToTarget.length).toFixed(1) : '—';
    console.log(
      `${type.padEnd(12)} fires=${String(s.fires).padStart(4)}  ≥2%-before-stop=${String(softRate + '%').padStart(4)}  full-target=${String(fullRate + '%').padStart(4)}  ` +
      `stops=${s.stops}  timeouts=${s.timeouts}  avgBarsToTarget=${avgBars}   (PRD cited ${prdCited[type]}%)`,
    );
  }
  console.log('\nNote: earnings & catalyst are not in this walk-forward test (need historical fundamentals / calendar / news). Use paper trading for those.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

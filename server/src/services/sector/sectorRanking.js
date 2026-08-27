const { returnPct, avgVolume, volumes } = require('../indicators');

/**
 * v4.0 FRD — Sector Ranking Engine.
 * Inputs per the FRD: Relative Strength, Momentum, Volume, Delivery %, FII/DII, News, Government Policy.
 * Output: Sector Score (0-100).
 *
 * Deterministic and free-data-only. Delivery % (needs NSE bhavcopy delivery data — blocked from
 * cloud IPs), per-sector News, and Government Policy have no free source, so they're reported as
 * `pending` and their weight is redistributed across the components we can actually compute.
 */
const WEIGHTS = { rs: 0.40, momentum: 0.30, volume: 0.20, breadth: 0.10 };

const clamp = (n) => Math.max(0, Math.min(100, n));

function stockRs(rows, benchReturn63) {
  const r63 = returnPct(rows, 63);
  return r63 - benchReturn63; // outperformance vs NIFTY over ~3 months
}

function stockVolumeExpansion(rows) {
  const v = volumes(rows);
  const avg20 = avgVolume(rows, 20);
  if (!avg20 || v.length < 5) return 1;
  const recent5 = v.slice(-5).reduce((s, x) => s + x, 0) / 5;
  return recent5 / avg20;
}

/**
 * @param {Map<string,{rows:Array,sector:string}>} bySymbol
 * @param {Array} benchRows  NIFTY history rows
 * @returns {Array} sorted desc: [{ sector, score, rank, rs, momentum, volume, breadth, members, breakdown }]
 */
function rankSectors(bySymbol, benchRows, { topN = 7 } = {}) {
  const benchReturn63 = returnPct(benchRows, 63);
  const sectors = new Map();

  for (const [symbol, { rows, sector }] of bySymbol) {
    if (!rows || rows.length < 65) continue;
    const s = sectors.get(sector) || { rs: [], mom: [], vol: [], above50: [], members: [] };
    s.rs.push(stockRs(rows, benchReturn63));
    s.mom.push(returnPct(rows, 21));
    s.vol.push(stockVolumeExpansion(rows));
    const c = rows.map((r) => Number(r.close));
    const ema50 = c.length >= 50 ? c.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
    s.above50.push(ema50 != null && c[c.length - 1] > ema50 ? 1 : 0);
    s.members.push(symbol);
    sectors.set(sector, s);
  }

  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  const rows = [...sectors.entries()].map(([sector, s]) => {
    const rsRaw = avg(s.rs);          // outperformance %, roughly -20..+20
    const momRaw = avg(s.mom);        // 21d return %, roughly -15..+15
    const volRaw = avg(s.vol);        // expansion ratio, ~0.5..2
    const breadthRaw = avg(s.above50); // 0..1

    const rs = clamp(50 + rsRaw * 2.5);
    const momentum = clamp(50 + momRaw * 3);
    const volume = clamp(30 + (volRaw - 1) * 60 + 20);
    const breadth = clamp(breadthRaw * 100);

    const score = Math.round(rs * WEIGHTS.rs + momentum * WEIGHTS.momentum + volume * WEIGHTS.volume + breadth * WEIGHTS.breadth);
    return {
      sector, score, rs: Math.round(rs), momentum: Math.round(momentum), volume: Math.round(volume), breadth: Math.round(breadth),
      members: s.members,
      breakdown: {
        outperformancePct: Number(rsRaw.toFixed(1)),
        momentum21dPct: Number(momRaw.toFixed(1)),
        volumeExpansion: Number(volRaw.toFixed(2)),
        pctAbove50EMA: Math.round(breadthRaw * 100),
        pendingInputs: ['deliveryPct', 'perSectorNews', 'governmentPolicy'],
      },
    };
  });

  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { all: rows, top: rows.slice(0, topN) };
}

module.exports = { rankSectors, WEIGHTS };

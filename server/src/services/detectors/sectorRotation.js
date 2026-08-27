const { returnPct, closes, latestRsi } = require('../indicators');

/**
 * v4.0 FRD — Sector Rotation.
 * Money is rotating INTO this stock's sector (sector is in the top ranks and its score is
 * improving), and this stock is a lead horse — outperforming its own sector's average over
 * the last month while not yet extended. `sectorCtx` comes from the Sector Ranking Engine.
 *
 * @param {object} sectorCtx { rank, score, prevScore, avgMember21dReturnPct }
 */
function detectSectorRotation(rows, sectorCtx, { maxRank = 5, minScoreGain = 3 } = {}) {
  if (rows.length < 60 || !sectorCtx) return null;
  if (sectorCtx.rank == null || sectorCtx.rank > maxRank) return null;

  const improving = sectorCtx.prevScore == null
    ? sectorCtx.score >= 60 // no history yet — require an outright strong sector
    : sectorCtx.score - sectorCtx.prevScore >= minScoreGain;
  if (!improving) return null;

  const stock21 = returnPct(rows, 21);
  if (sectorCtx.avgMember21dReturnPct != null && stock21 <= sectorCtx.avgMember21dReturnPct) return null;
  if (stock21 <= 0) return null;

  const rsi = latestRsi(rows);
  if (rsi == null || rsi > 72) return null;

  const last = rows[rows.length - 1];
  return {
    type: 'rotation',
    symbol: last.symbol,
    price: Number(closes(rows).slice(-1)[0].toFixed(2)),
    evidence: {
      sector: sectorCtx.sector,
      sectorRank: sectorCtx.rank,
      sectorScore: sectorCtx.score,
      sectorScoreChange: sectorCtx.prevScore == null ? null : Number((sectorCtx.score - sectorCtx.prevScore).toFixed(0)),
      stock21dReturnPct: Number(stock21.toFixed(1)),
      sectorAvg21dReturnPct: sectorCtx.avgMember21dReturnPct != null ? Number(sectorCtx.avgMember21dReturnPct.toFixed(1)) : null,
      rsi: Math.round(rsi),
    },
  };
}

module.exports = { detectSectorRotation };

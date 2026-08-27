/**
 * v4.0 FRD — Portfolio Intelligence: "Track sector allocation and portfolio risk."
 * Pure function over open Position rows.
 */
function assessPortfolio(positions) {
  const open = positions.filter((p) => p.status === 'open');
  if (!open.length) {
    return { deployedCr: 0, positions: 0, totalRiskAmt: 0, portfolioHeatPct: 0, sectorAllocation: [], concentration: null, flags: [] };
  }

  let deployed = 0;
  let totalRisk = 0;
  const bySector = {};
  const sized = [];

  for (const p of open) {
    const buy = Number(p.buyPrice);
    const cur = Number(p.currentPrice);
    const stop = Number(p.stop);
    const value = cur * p.qty;
    const riskAmt = Math.max(0, (buy - stop) * p.qty); // capital at risk to the stop
    deployed += value;
    totalRisk += riskAmt;
    bySector[p.sector] = (bySector[p.sector] || 0) + value;
    sized.push({ name: p.name, sector: p.sector, value, weightPct: 0, riskAmt });
  }

  sized.forEach((s) => { s.weightPct = Number(((s.value / deployed) * 100).toFixed(1)); });
  sized.sort((a, b) => b.value - a.value);

  const sectorAllocation = Object.entries(bySector)
    .map(([sector, value]) => ({ sector, weightPct: Number(((value / deployed) * 100).toFixed(1)) }))
    .sort((a, b) => b.weightPct - a.weightPct);

  const largest = sized[0];
  const topSector = sectorAllocation[0];
  const flags = [];
  if (largest && largest.weightPct > 40) flags.push(`Single position ${largest.name} is ${largest.weightPct}% of the book`);
  if (topSector && topSector.weightPct > 50) flags.push(`${topSector.sector} is ${topSector.weightPct}% of the book — sector-concentrated`);
  const heatPct = deployed ? (totalRisk / deployed) * 100 : 0;
  if (heatPct > 6) flags.push(`Portfolio heat ${heatPct.toFixed(1)}% — total stop risk above the 6% comfort line`);

  return {
    deployedCr: Number((deployed / 1e7).toFixed(3)),
    deployedAmt: Math.round(deployed),
    positions: open.length,
    totalRiskAmt: Math.round(totalRisk),
    portfolioHeatPct: Number(heatPct.toFixed(2)),
    sectorAllocation,
    concentration: largest ? { name: largest.name, weightPct: largest.weightPct } : null,
    holdings: sized.map((s) => ({ name: s.name, sector: s.sector, weightPct: s.weightPct, riskAmt: Math.round(s.riskAmt) })),
    flags,
  };
}

module.exports = { assessPortfolio };

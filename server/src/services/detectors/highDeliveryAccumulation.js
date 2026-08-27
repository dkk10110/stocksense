const { closes, volumes, avgVolume, latestRsi } = require('../indicators');

/**
 * v4.0 FRD — High Delivery Accumulation.
 *
 * The real signal is NSE bhavcopy "delivery %" (shares actually delivered vs traded) staying
 * elevated — i.e. buyers taking delivery, not intraday churn. That data is blocked from cloud
 * IPs (see nseBhavcopy). This uses a computable proxy for the same idea: steady-to-rising
 * volume with a NARROW daily range (low churn) and a slow price grind higher — accumulation
 * that isn't showing up as volatility. `deliveryPct` is used directly when available.
 */
function detectHighDeliveryAccumulation(rows, deliveryPct = null, { window = 20 } = {}) {
  if (rows.length < 60) return null;

  const c = closes(rows);
  const v = volumes(rows);
  const avg20 = avgVolume(rows, 20);
  if (!avg20) return null;

  const recent = rows.slice(-window);
  const avgRangePct = recent.reduce((s, r) => s + (Number(r.high) - Number(r.low)) / Number(r.close), 0) / window * 100;
  const recentVolAvg = v.slice(-window).reduce((s, x) => s + x, 0) / window;
  const volSteady = recentVolAvg >= avg20 * 0.9;
  const priceGrind = c[c.length - 1] > c[c.length - 1 - window];
  const ret = ((c[c.length - 1] - c[c.length - 1 - window]) / c[c.length - 1 - window]) * 100;

  const narrowRange = avgRangePct < 2.5;
  const strongDelivery = deliveryPct != null ? deliveryPct >= 60 : null;

  // require the proxy pattern; if real delivery data is present it must also confirm
  if (!(narrowRange && volSteady && priceGrind && ret > 1 && ret < 12)) return null;
  if (strongDelivery === false) return null;

  const rsi = latestRsi(rows);
  if (rsi == null || rsi > 68) return null;

  const last = rows[rows.length - 1];
  return {
    type: 'high_delivery',
    symbol: last.symbol,
    price: Number(c[c.length - 1].toFixed(2)),
    evidence: {
      deliveryPct: deliveryPct != null ? Number(deliveryPct.toFixed(1)) : null,
      deliveryProxy: deliveryPct == null ? 'narrow-range + steady volume + price grind (NSE delivery data unavailable)' : undefined,
      avgDailyRangePct: Number(avgRangePct.toFixed(2)),
      volumeVs20dAvg: Number((recentVolAvg / avg20).toFixed(2)),
      priceMove20dPct: Number(ret.toFixed(1)),
      rsi: Math.round(rsi),
    },
  };
}

module.exports = { detectHighDeliveryAccumulation };

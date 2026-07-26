const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SIGNALS = [
  {
    name: 'BHEL', symbol: 'BHEL', sector: 'PSU Infra', type: 'compression',
    price: 218, entryLow: 215, entryHigh: 222, target: 242, stop: 209, days: 12,
    confidence: 72, upside: 10.1, rsi: 47,
    headline: 'Pre-breakout compression detected — buy before the move',
    insight: 'BHEL has traded in a tight ₹215–₹223 band for <strong>7 consecutive days</strong> with volume declining to 0.4× average. This is classic coiling energy. The last 3 times this compression pattern appeared in BHEL, it moved an average of <strong>+11.2% in the following 12 days</strong>. The government energy project pipeline (₹42,000Cr) is a fundamental tailwind. Entry before the breakout, not after.',
    indicators: [
      { label: '7-day compression (tight band)', color: 'purple' },
      { label: 'Volume 0.4× avg — drying up', color: 'green' },
      { label: 'FII net buyer ₹820Cr sector', color: 'green' },
      { label: 'Govt energy pipeline ₹42,000Cr', color: 'green' },
      { label: 'RSI 47 — room to run', color: 'blue' },
      { label: '52wk high ₹280 — 22% below ATH', color: 'amber' },
    ],
    catalysts: ['Thermal project approval due in 8 days', 'Q1 FY27 results in 22 days'],
    probBasis: 284, rr: 2.7,
  },
  {
    name: 'Sun Pharma', symbol: 'SUNPHARMA', sector: 'Pharma', type: 'catalyst',
    price: 1247, entryLow: 1240, entryHigh: 1260, target: 1346, stop: 1210, days: 14,
    confidence: 68, upside: 7.9, rsi: 54,
    headline: 'Catalyst countdown — US FDA decision in 9 days',
    insight: 'Sun Pharma has a key US FDA advisory panel decision on its dermatology drug in <strong>9 days</strong>. Historical data: when this drug category gets FDA committee recommendation, Sun Pharma has moved <strong>+8–14%</strong> in the subsequent 2 weeks. Current price is already compressing near 50-day EMA support at ₹1,245. RSI neutral at 54 — no overbought risk. FII has been accumulating quietly for 3 straight sessions. Entry now, before the event.',
    indicators: [
      { label: 'FDA decision in 9 days', color: 'amber' },
      { label: '3-day FII quiet accumulation', color: 'green' },
      { label: 'RSI 54 — neutral, room to run', color: 'blue' },
      { label: 'Price at 50-EMA support', color: 'green' },
      { label: 'Q4 beat: +11% vs estimate', color: 'green' },
      { label: 'Volume building (+1.4× avg)', color: 'green' },
    ],
    catalysts: ['US FDA advisory panel — 9 days', 'Q1 guidance update — 18 days'],
    probBasis: 197, rr: 2.7,
  },
  {
    name: 'Tata ELXSI', symbol: 'TATAELXSI', sector: 'IT / Auto-tech', type: 'fallen',
    price: 5240, entryLow: 5200, entryHigh: 5280, target: 5762, stop: 4980, days: 15,
    confidence: 65, upside: 9.9, rsi: 34,
    headline: 'Fallen angel reversal — RSI turning from extreme oversold',
    insight: 'Tata ELXSI is <strong>38% below its January ATH</strong> of ₹8,430. The drop was driven entirely by IT sector FII exit — not a business problem. Q4 revenue grew 18% YoY, margins intact, zero debt. RSI touched 28 (extreme oversold) 3 days ago and is now <strong>turning upward to 34</strong> — this RSI reversal from below 30 is the entry trigger. A new ₹480Cr automotive software deal announced today is the catalyst that proves the business is healthy. Risk: IT sector FII selling must slow further. Stop is placed at ₹4,980.',
    indicators: [
      { label: 'RSI 28→34 turning from oversold', color: 'purple' },
      { label: '38% below ATH — extreme discount', color: 'blue' },
      { label: 'Zero debt, 18% revenue growth', color: 'green' },
      { label: '₹480Cr deal win announced today', color: 'green' },
      { label: 'FII IT sector selling slowing', color: 'amber' },
      { label: 'Support at 3-year demand zone', color: 'green' },
    ],
    catalysts: ['New automotive client deal', 'IT sector FII selling pace declining'],
    probBasis: 312, rr: 2.0,
  },
  {
    name: 'Hero MotoCorp', symbol: 'HEROMOTOCO', sector: 'Auto', type: 'catalyst',
    price: 4320, entryLow: 4280, entryHigh: 4360, target: 4666, stop: 4147, days: 11,
    confidence: 71, upside: 8.0, rsi: 59,
    headline: 'Rural demand surge — May sales data catalyst tomorrow',
    insight: 'Hero MotoCorp monthly sales data releases <strong>tomorrow morning</strong>. Industry channel checks indicate May rural 2-wheeler sales up 18% YoY — best in 3 years driven by good monsoon expectations. When sales beat consensus by >10%, Hero has moved <strong>+6–9%</strong> in the following 10 days historically. Current price is above all key EMAs. RSI 59 — bullish but not overbought. Volume has been picking up for 4 days. Enter today before tomorrow\'s data release.',
    indicators: [
      { label: 'Sales data tomorrow — 18% YoY beat expected', color: 'amber' },
      { label: 'RSI 59 — bullish momentum', color: 'green' },
      { label: 'Above 20, 50, 200-day EMA', color: 'green' },
      { label: '4-day volume build-up', color: 'green' },
      { label: 'Monsoon forecast positive for rural', color: 'blue' },
      { label: 'DII accumulating ahead of data', color: 'green' },
    ],
    catalysts: ['SIAM May sales data — tomorrow 10 AM', 'Q1 FY27 results — 28 days'],
    probBasis: 241, rr: 2.0,
  },
  {
    name: 'HAL', symbol: 'HAL', sector: 'Defence PSU', type: 'earnings',
    price: 4156, entryLow: 4100, entryHigh: 4200, target: 4489, stop: 3988, days: 13,
    confidence: 63, upside: 8.0, rsi: 52,
    headline: 'Earnings play — results in 6 days, 3 consecutive beats',
    insight: 'HAL reports Q4 FY27 results in <strong>6 days</strong>. It has beaten analyst estimates by an average of 14% for 3 consecutive quarters. The defence order book has never been larger. The pattern is consistent: HAL moves <strong>+7–11% in the 15 days around results</strong> when it beats. Current price is ₹267 below its 52-week high with RSI at 52 — neutral, no overbought risk. The MoD ₹22,000Cr helicopter order is a confirmed tailwind. Entry now for the pre-results and post-results run.',
    indicators: [
      { label: 'Results in 6 days — 3 consecutive beats', color: 'amber' },
      { label: 'Order book at all-time high', color: 'green' },
      { label: 'MoD ₹22,000Cr order confirmed', color: 'green' },
      { label: 'RSI 52 — neutral, not overbought', color: 'blue' },
      { label: '14% avg earnings beat (3 qtrs)', color: 'green' },
      { label: 'Institutional holding increasing', color: 'green' },
    ],
    catalysts: ['Q4 FY27 earnings — 6 days', 'Defence budget allocation review — 19 days'],
    probBasis: 178, rr: 2.0,
  },
];

const WATCHLIST_EXTRA = [
  { name: 'SBI', symbol: 'SBIN', sector: 'Banking', price: 812 },
  { name: 'SAIL', symbol: 'SAIL', sector: 'Steel', price: 118 },
  { name: 'IOCL', symbol: 'IOC', sector: 'Oil & Gas', price: 154 },
];

const ALERTS = [
  { type: 'gain_2', title: 'BHEL 2% alert fired — still room to 10% target', body: 'Bought ₹218 → Now ₹223 (+2.3%). P&L: +₹1,000 on 200 shares. Your signal target was +10.1% at ₹242. System says: hold — the compression breakout thesis is still intact. FII still buying.' },
  { type: 'forward_signal', title: 'New forward signal — Hero MotoCorp entry now', body: 'Sales data tomorrow. Entry window ₹4,280–₹4,360 today. Target ₹4,666 (+8%) in 11 days. Confidence 71%. Buy before the data release, not after.' },
  { type: 'forward_signal', title: 'New forward signal — HAL earnings play', body: 'Results in 6 days. 3 consecutive beats. Entry ₹4,100–₹4,200. Target ₹4,489 (+8%) in 13 days. Confidence 63%. Pre-results entry.' },
  { type: 'rsi_reversal', title: 'Tata ELXSI — position day 3, RSI strengthening', body: 'RSI moved from 34 to 38. FII IT sector selling slowed further. Fallen angel thesis intact. Stop ₹4,980 holds. 12 days remain in swing window.' },
  { type: 'gain_2', title: 'HAL 2% target hit — hold for full target', body: 'HAL up 0.8% since entry at ₹4,156. Now ₹4,189. Earnings results in 6 days. System says: hold position — pre-earnings run typically adds another 4–6%.' },
];

const DEFAULT_ALERTS_CONFIG = {
  safety2: true, mid5: true, full10: true, stopLoss: true,
  dayExpiry: true, compression: true, fallenAngel: true, catalyst: true,
};

async function main() {
  console.log('Seeding signals...');
  const createdSignals = {};
  for (const s of SIGNALS) {
    const signal = await prisma.signal.create({ data: s });
    createdSignals[s.name] = signal;
  }

  console.log('Seeding demo user...');
  const passwordHash = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'rajnish@example.com' },
    update: {},
    create: {
      name: 'Rajnish Kumar',
      email: 'rajnish@example.com',
      passwordHash,
      broker: 'Zerodha',
      riskPref: 'balanced',
      settings: { create: { alertsConfig: DEFAULT_ALERTS_CONFIG, swingWindow: 15, profitTarget: 'balanced' } },
    },
  });

  console.log('Seeding watchlist...');
  const wlItems = {};
  for (const s of SIGNALS) {
    const wl = await prisma.watchlistItem.create({
      data: { userId: user.id, name: s.name, symbol: s.symbol, sector: s.sector, price: s.price, signalId: createdSignals[s.name].id },
    });
    wlItems[s.name] = wl;
  }
  for (const w of WATCHLIST_EXTRA) {
    await prisma.watchlistItem.create({ data: { userId: user.id, ...w } });
  }

  console.log('Seeding positions...');
  await prisma.position.create({
    data: { userId: user.id, watchlistItemId: wlItems['BHEL'].id, name: 'BHEL', sector: 'PSU Infra', broker: 'Groww', buyPrice: 218, qty: 200, buyDate: new Date('2026-06-14'), alertLevels: [2, 5, 10], alertsHit: [2], daysHeld: 5, stop: 209, currentPrice: 223 },
  });
  await prisma.position.create({
    data: { userId: user.id, watchlistItemId: wlItems['Tata ELXSI'].id, name: 'Tata ELXSI', sector: 'IT', broker: 'Zerodha', buyPrice: 5240, qty: 10, buyDate: new Date('2026-06-16'), alertLevels: [2, 5, 10], alertsHit: [], daysHeld: 3, stop: 4980, currentPrice: 5198 },
  });
  await prisma.position.create({
    data: { userId: user.id, watchlistItemId: wlItems['HAL'].id, name: 'HAL', sector: 'Defence', broker: 'Angel One', buyPrice: 4156, qty: 20, buyDate: new Date('2026-06-12'), alertLevels: [2, 5, 10], alertsHit: [2], daysHeld: 7, stop: 3988, currentPrice: 4189 },
  });

  console.log('Seeding alerts...');
  for (const a of ALERTS) {
    await prisma.alert.create({ data: { userId: user.id, ...a } });
  }

  console.log('Seed complete. Demo login: rajnish@example.com / password123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

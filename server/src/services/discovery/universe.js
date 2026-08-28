/**
 * v4.0 FRD — Market Discovery Engine universe.
 *
 * The FRD calls for scanning "~2,000 NSE stocks". NSE's full equity list
 * (https://archives.nseindia.com/content/equities/EQUITY_L.csv) is blocked from
 * datacenter/cloud IPs (same anti-bot behaviour as the bhavcopy endpoint), so this
 * ships a curated, sector-tagged list of ~160 liquid NSE names as the working universe.
 *
 * To run the true 2,000-name scan, drop the EQUITY_L.csv contents into
 * `getFullUniverse()` (or point it at a data-vendor feed) — everything downstream
 * (liquidity filter, indicators, sector ranking, scoring) already scales to it.
 */

// symbol -> sector (app vocabulary, aligned with SectorRank + the client sector chips)
const CURATED = {
  // Banking & Financials
  HDFCBANK: 'Banking', ICICIBANK: 'Banking', SBIN: 'Banking', KOTAKBANK: 'Banking', AXISBANK: 'Banking',
  INDUSINDBK: 'Banking', PNB: 'Banking', BANKBARODA: 'Banking', FEDERALBNK: 'Banking', IDFCFIRSTB: 'Banking',
  BAJFINANCE: 'Financials', BAJAJFINSV: 'Financials', SBILIFE: 'Financials', HDFCLIFE: 'Financials',
  ICICIPRULI: 'Financials', CHOLAFIN: 'Financials', MUTHOOTFIN: 'Financials', LICHSGFIN: 'Financials',
  SHRIRAMFIN: 'Financials', PFC: 'Financials', RECLTD: 'Financials',
  // IT
  TCS: 'IT', INFY: 'IT', WIPRO: 'IT', HCLTECH: 'IT', TECHM: 'IT', LTIM: 'IT', PERSISTENT: 'IT',
  COFORGE: 'IT', MPHASIS: 'IT', TATAELXSI: 'IT', LTTS: 'IT',
  // Pharma & Healthcare
  SUNPHARMA: 'Pharma', DRREDDY: 'Pharma', CIPLA: 'Pharma', DIVISLAB: 'Pharma', LUPIN: 'Pharma',
  AUROPHARMA: 'Pharma', TORNTPHARM: 'Pharma', ALKEM: 'Pharma', BIOCON: 'Pharma', ZYDUSLIFE: 'Pharma',
  APOLLOHOSP: 'Healthcare', MAXHEALTH: 'Healthcare', FORTIS: 'Healthcare',
  // FMCG
  HINDUNILVR: 'FMCG', ITC: 'FMCG', NESTLEIND: 'FMCG', BRITANNIA: 'FMCG', DABUR: 'FMCG',
  MARICO: 'FMCG', GODREJCP: 'FMCG', COLPAL: 'FMCG', TATACONSUM: 'FMCG', VBL: 'FMCG', UBL: 'FMCG',
  // Auto
  MARUTI: 'Auto', TATAMOTORS: 'Auto', M_M: 'Auto', BAJAJ_AUTO: 'Auto', HEROMOTOCO: 'Auto',
  EICHERMOT: 'Auto', TVSMOTOR: 'Auto', ASHOKLEY: 'Auto', BHARATFORG: 'Auto', MOTHERSON: 'Auto',
  BOSCHLTD: 'Auto', ESCORTS: 'Auto', BALKRISIND: 'Auto',
  // Energy / Oil & Gas
  RELIANCE: 'Energy', ONGC: 'Energy', IOC: 'Energy', BPCL: 'Energy', GAIL: 'Energy',
  HINDPETRO: 'Energy', PETRONET: 'Energy', OIL: 'Energy', ADANIGREEN: 'Renewables', TATAPOWER: 'Renewables',
  'ORIANA-SM': 'Renewables', SUZLON: 'Renewables', INOXWIND: 'Renewables', WAAREEENER: 'Renewables', PREMIERENE: 'Renewables',
  NTPC: 'Power', POWERGRID: 'Power', ADANIPOWER: 'Power', JSWENERGY: 'Power', NHPC: 'Power',
  // Metals & Mining
  TATASTEEL: 'Steel', JSWSTEEL: 'Steel', HINDALCO: 'Steel', SAIL: 'Steel', JINDALSTEL: 'Steel',
  NMDC: 'Steel', VEDL: 'Steel', COALINDIA: 'Steel', APLAPOLLO: 'Steel', HINDZINC: 'Steel',
  // Cement & Infra
  ULTRACEMCO: 'Cement', SHREECEM: 'Cement', AMBUJACEM: 'Cement', ACC: 'Cement', DALBHARAT: 'Cement',
  LT: 'Infra', ADANIPORTS: 'Infra', GMRAIRPORT: 'Infra', IRB: 'Infra', NBCC: 'Infra',
  // Defence & PSU capital goods
  HAL: 'Defence', BEL: 'Defence', BDL: 'Defence', MAZDOCK: 'Defence', COCHINSHIP: 'Defence',
  BHEL: 'PSU Infra', BEML: 'PSU Infra', RVNL: 'PSU Infra', IRCON: 'PSU Infra', RITES: 'PSU Infra',
  // Chemicals
  PIDILITIND: 'Chemicals', SRF: 'Chemicals', UPL: 'Chemicals', PIIND: 'Chemicals', DEEPAKNTR: 'Chemicals',
  AARTIIND: 'Chemicals', NAVINFLUOR: 'Chemicals', ATUL: 'Chemicals',
  // Consumer / Retail / Misc
  TITAN: 'Consumer', DMART: 'Consumer', TRENT: 'Consumer', ASIANPAINT: 'Consumer', BERGEPAINT: 'Consumer',
  HAVELLS: 'Consumer', VOLTAS: 'Consumer', DIXON: 'Consumer', CROMPTON: 'Consumer', PAGEIND: 'Consumer',
  // Telecom & Media
  BHARTIARTL: 'Telecom', IDEA: 'Telecom', INDUSTOWER: 'Telecom', ZEEL: 'Media', PVRINOX: 'Media',
  // Realty
  DLF: 'Realty', GODREJPROP: 'Realty', OBEROIRLTY: 'Realty', PRESTIGE: 'Realty', PHOENIXLTD: 'Realty',
};

// Yahoo Finance uses '.NS' and expects '-' not '_' — e.g. M&M -> M-M.NS, BAJAJ-AUTO.NS
const YF_OVERRIDES = { M_M: 'M&M', BAJAJ_AUTO: 'BAJAJ-AUTO' };

function toYahoo(symbol) {
  return `${(YF_OVERRIDES[symbol] || symbol)}.NS`;
}

/** [{ symbol, sector }] — the working discovery universe. */
function getUniverse() {
  return Object.entries(CURATED).map(([symbol, sector]) => ({ symbol, sector }));
}

/** Hook point for the full ~2,000-name NSE list (EQUITY_L.csv). Returns the curated list until wired. */
async function getFullUniverse() {
  return getUniverse();
}

function sectorOf(symbol) {
  return CURATED[symbol] || 'Unknown';
}

const ALL_SECTORS = [...new Set(Object.values(CURATED))];

module.exports = { getUniverse, getFullUniverse, sectorOf, toYahoo, ALL_SECTORS };

const prisma = require('../../lib/prisma');

// Maps an AlertType (and, for forward_signal, the signal's type) onto a key in
// Settings.alertsConfig. PRD §6.1 / §8 — the Profile toggles must actually gate delivery.
const TYPE_TO_KEY = {
  gain_2: 'safety2',
  gain_5: 'mid5',
  gain_10: 'full10',
  stop_loss: 'stopLoss',
  day12_time: 'dayExpiry',
  rsi_reversal: 'fallenAngel',
  catalyst_7day: 'catalyst',
  catalyst_1day: 'catalyst',
  earnings_day: 'earningsPlay',
  earnings_exit: 'earningsPlay',
  // v4.0 FRD notification types
  sector_rotation: 'sectorRotation',
  book_profit: 'portfolioAdvice',
  new_opportunity: 'discovery',
};

const SIGNAL_TYPE_TO_KEY = {
  compression: 'compression',
  fallen: 'fallenAngel',
  catalyst: 'catalyst',
  earnings: 'earningsPlay',
  volume: 'volumeReversal',
};

/**
 * Whether this user wants a given alert delivered. Missing key => true (opt-out, not opt-in),
 * so pre-existing settings rows without the newer keys still send everything.
 */
async function isAlertEnabled(userId, type, signalType) {
  const settings = await prisma.settings.findUnique({ where: { userId } });
  const cfg = settings?.alertsConfig || {};

  let key = TYPE_TO_KEY[type];
  if (type === 'forward_signal') key = SIGNAL_TYPE_TO_KEY[signalType]; // undefined if signalType unknown

  if (!key) return true; // unmapped alert types (e.g. a raw forward_signal with no type) always send
  return cfg[key] !== false;
}

module.exports = { isAlertEnabled, TYPE_TO_KEY, SIGNAL_TYPE_TO_KEY };

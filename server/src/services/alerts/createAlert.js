const prisma = require('../../lib/prisma');
const { sendMessage } = require('../whatsapp/client');
const { isAlertEnabled } = require('./alertPrefs');

const EMOJI = {
  forward_signal: '⚡', catalyst_7day: '⏱', catalyst_1day: '⚠',
  rsi_reversal: '◎', gain_2: '↑', gain_5: '↑', gain_10: '✓',
  stop_loss: '⚠', day12_time: '⏳', earnings_day: '♥', earnings_exit: '⏰',
  sector_rotation: '🔄', book_profit: '💰', new_opportunity: '🔍',
};

/**
 * Writes an Alert row (so it shows on the app's Alerts screen) and sends the same text via WhatsApp.
 * Respects the user's Profile alert toggles (PRD §6.1) — a disabled type is skipped entirely and
 * returns null. Pass `signalType` for `forward_signal` alerts so the per-type toggle can gate it.
 */
async function createAlert({ userId, type, title, body, signalType }) {
  if (!(await isAlertEnabled(userId, type, signalType))) {
    return null;
  }
  const alert = await prisma.alert.create({ data: { userId, type, title, body } });
  const emoji = EMOJI[type] || '•';
  await sendMessage(`${emoji} ${title}\n${body}`);
  return alert;
}

module.exports = { createAlert };

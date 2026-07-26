const prisma = require('../../lib/prisma');
const { sendMessage } = require('../telegram/bot');

const EMOJI = {
  forward_signal: '⚡', catalyst_7day: '⏱', catalyst_1day: '⚠',
  rsi_reversal: '◎', gain_2: '↑', gain_5: '↑', gain_10: '✓',
  stop_loss: '⚠', day12_time: '⏳', earnings_day: '♥',
};

/** Writes an Alert row (so it shows on the app's Alerts screen) and sends the same text via Telegram. */
async function createAlert({ userId, type, title, body }) {
  const alert = await prisma.alert.create({ data: { userId, type, title, body } });
  const emoji = EMOJI[type] || '•';
  await sendMessage(`${emoji} ${title}\n${body}`);
  return alert;
}

module.exports = { createAlert };

const axios = require('axios');

function isConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Sends a message via Telegram's Bot API. No-ops (logs only) if unconfigured, so the pipeline never breaks on this. */
async function sendMessage(text) {
  if (!isConfigured()) {
    console.log(`  [Telegram] not configured — would have sent: ${text.slice(0, 80)}...`);
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error(`  [Telegram] send failed: ${err.response?.data?.description || err.message}`);
  }
}

module.exports = { isConfigured, sendMessage };

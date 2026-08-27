const axios = require('axios');

/**
 * WhatsApp alert delivery. Supports two providers via WHATSAPP_PROVIDER:
 *   - "cloud"  (default) — WhatsApp Cloud API (Meta Graph API)
 *   - "twilio"           — Twilio Programmable Messaging (WhatsApp)
 *
 * No-ops (logs only) when unconfigured, so the alert pipeline never breaks on this —
 * same graceful-degradation pattern as every other external integration in this app.
 */

const PROVIDER = (process.env.WHATSAPP_PROVIDER || 'cloud').toLowerCase();
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

/** Recipient in the digits-only E.164 form the APIs want (e.g. 919812345678). */
function recipient() {
  return String(process.env.WHATSAPP_TO || '').replace(/[^\d]/g, '');
}

function isCloudConfigured() {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN && recipient());
}

function isTwilioConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM && recipient());
}

function isConfigured() {
  return PROVIDER === 'twilio' ? isTwilioConfigured() : isCloudConfigured();
}

/**
 * WhatsApp Cloud API. If WHATSAPP_TEMPLATE_NAME is set, sends an approved template with the
 * alert text as body parameter {{1}} (required for business-initiated messages outside the
 * 24-hour customer-service window). Otherwise sends free-form text (works in-session / for testing).
 */
async function sendViaCloud(text) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const headers = { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };

  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const payload = templateName
    ? {
      messaging_product: 'whatsapp',
      to: recipient(),
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text }] }],
      },
    }
    : {
      messaging_product: 'whatsapp',
      to: recipient(),
      type: 'text',
      text: { preview_url: false, body: text },
    };

  await axios.post(url, payload, { headers, timeout: 15000 });
}

/** Twilio WhatsApp. Free-form body; Twilio handles template/session rules on its side. */
async function sendViaTwilio(text) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({
    From: process.env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
      ? process.env.TWILIO_WHATSAPP_FROM
      : `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
    To: `whatsapp:+${recipient()}`,
    Body: text,
  });
  await axios.post(url, params, {
    auth: { username: sid, password: process.env.TWILIO_AUTH_TOKEN },
    timeout: 15000,
  });
}

/** Sends a WhatsApp message. No-ops (logs only) if unconfigured. Never throws. */
async function sendMessage(text) {
  if (!isConfigured()) {
    console.log(`  [WhatsApp] not configured (provider=${PROVIDER}) — would have sent: ${text.slice(0, 80)}...`);
    return;
  }
  try {
    if (PROVIDER === 'twilio') await sendViaTwilio(text);
    else await sendViaCloud(text);
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    console.error(`  [WhatsApp] send failed (provider=${PROVIDER}): ${detail}`);
  }
}

module.exports = { isConfigured, sendMessage, PROVIDER };

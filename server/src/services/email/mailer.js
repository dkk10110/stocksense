const nodemailer = require('nodemailer');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/** Sends an email, or logs it if no SMTP is configured — same graceful-degradation pattern as every other integration in this app. */
async function sendEmail({ to, subject, text }) {
  if (!isConfigured()) {
    console.log(`  [Email] not configured — would have sent to ${to}: "${subject}"\n  ${text}`);
    return;
  }
  try {
    await getTransport().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
  } catch (err) {
    console.error(`  [Email] send failed: ${err.message}`);
  }
}

module.exports = { isConfigured, sendEmail };

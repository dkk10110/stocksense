const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { sendEmail } = require('../services/email/mailer');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authLimiter);

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

const DEFAULT_ALERTS_CONFIG = {
  safety2: true, mid5: true, full10: true, stopLoss: true, dayExpiry: true,
  compression: true, fallenAngel: true, catalyst: true, earningsPlay: true, volumeReversal: true,
  sectorRotation: true, portfolioAdvice: true, discovery: true,
};

function signToken(user) {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, broker: user.broker, riskPref: user.riskPref };
}

router.post('/signup', async (req, res) => {
  const { name, email, password, phone, broker, riskPref } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name, email, passwordHash, phone, broker,
      riskPref: riskPref || 'balanced',
      settings: { create: { alertsConfig: DEFAULT_ALERTS_CONFIG, swingWindow: 15, profitTarget: 'balanced' } },
    },
  });

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

  res.json({ token: signToken(user), user: publicUser(user) });
});

// POST /api/auth/forgot-password  { email }
// Always responds the same way regardless of whether the email exists, to avoid leaking which emails are registered.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash, resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    const resetUrl = `${process.env.CORS_ORIGIN || 'http://localhost:5173'}/reset-password?token=${token}`;
    await sendEmail({
      to: user.email,
      subject: 'StockSense AI — reset your password',
      text: `Reset your password: ${resetUrl}\n\nThis link expires in 30 minutes. If you didn't request this, ignore this email.`,
    });
  }

  res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
});

// POST /api/auth/reset-password  { token, newPassword }
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await prisma.user.findFirst({ where: { resetTokenHash, resetTokenExpiry: { gt: new Date() } } });
  if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiry: null },
  });

  res.json({ message: 'Password reset. You can now sign in with your new password.' });
});

module.exports = router;

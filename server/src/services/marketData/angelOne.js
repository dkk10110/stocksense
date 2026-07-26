const axios = require('axios');
const { authenticator } = require('otplib');

const BASE_URL = 'https://apiconnect.angelone.in';

// India VIX's fixed NSE instrument token — same for every account, not a secret.
const INDIA_VIX_TOKEN = '99926017';

let cachedSession = null; // { jwtToken, expiresAt }

function isConfigured() {
  return !!(process.env.ANGEL_ONE_API_KEY && process.env.ANGEL_ONE_CLIENT_CODE && process.env.ANGEL_ONE_PASSWORD && process.env.ANGEL_ONE_TOTP_SECRET);
}

function baseHeaders() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': process.env.ANGEL_ONE_API_KEY,
  };
}

async function login() {
  if (!isConfigured()) {
    throw new Error('Angel One is not configured — set ANGEL_ONE_API_KEY, ANGEL_ONE_CLIENT_CODE, ANGEL_ONE_PASSWORD, ANGEL_ONE_TOTP_SECRET in server/.env');
  }
  if (cachedSession && cachedSession.expiresAt > Date.now()) return cachedSession.jwtToken;

  const totp = authenticator.generate(process.env.ANGEL_ONE_TOTP_SECRET);
  const res = await axios.post(
    `${BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`,
    { clientcode: process.env.ANGEL_ONE_CLIENT_CODE, password: process.env.ANGEL_ONE_PASSWORD, totp },
    { headers: baseHeaders() },
  );

  if (!res.data?.status) throw new Error(`Angel One login failed: ${res.data?.message || 'unknown error'}`);

  const { jwtToken } = res.data.data;
  cachedSession = { jwtToken, expiresAt: Date.now() + 6 * 60 * 60 * 1000 }; // sessions last ~8h; refresh a bit early
  return jwtToken;
}

async function authedPost(path, body) {
  const jwtToken = await login();
  const res = await axios.post(`${BASE_URL}${path}`, body, {
    headers: { ...baseHeaders(), Authorization: `Bearer ${jwtToken}` },
  });
  if (!res.data?.status) throw new Error(`Angel One request failed: ${res.data?.message || 'unknown error'}`);
  return res.data.data;
}

/** Last traded price for one NSE equity symbol. Requires the symbol's Angel One instrument token. */
async function getLtp(tradingSymbol, symbolToken, exchange = 'NSE') {
  const data = await authedPost('/rest/secure/angelbroking/order/v1/getLtpData', {
    exchange, tradingsymbol: tradingSymbol, symboltoken: symbolToken,
  });
  return data.ltp;
}

/** Current India VIX level, used as the PRD's signal-suppression gate (VIX > 18 = pause new signals). */
async function getIndiaVix() {
  const data = await authedPost('/rest/secure/angelbroking/order/v1/getLtpData', {
    exchange: 'NSE', tradingsymbol: 'INDIAVIX', symboltoken: INDIA_VIX_TOKEN,
  });
  return data.ltp;
}

module.exports = { isConfigured, login, getLtp, getIndiaVix };

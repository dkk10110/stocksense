const cron = require('node-cron');
const { runEveningScan } = require('./eveningScan');
const { runMorningRescore } = require('./morningRescore');
const { runPositionPoll } = require('./positionPoll');
const { runDailyPositionChecks } = require('./dailyPositionChecks');
const { runPaperTradeEval } = require('./paperTradeEval');
const { runDiscovery } = require('./discoveryScan');
const { trackJobRun } = require('../services/jobs/trackJobRun');

const TIMEZONE = 'Asia/Kolkata'; // this is an India-specific app — never rely on server-local time for these

function safeRun(jobName, fn) {
  return async () => {
    try {
      await trackJobRun(jobName, fn);
    } catch (err) {
      // trackJobRun already persisted the failure to JobRun — this is just the console-visible fallback.
      console.error(`[cron] ${jobName} failed:`, err);
    }
  };
}

/** Registers all scheduled jobs. Call once, from the main server process only — not from one-off scripts. */
function startScheduler() {
  // PRD §5.1 — evening scan, 6:15 PM Mon-Fri: ingest the day's prices, re-run detection + scoring.
  cron.schedule('15 18 * * 1-5', safeRun('evening_scan', runEveningScan), { timezone: TIMEZONE });

  // PRD §5.2 — morning re-score, 9:20 AM Mon-Fri: adjust confidence on overnight VIX/FII-DII moves.
  cron.schedule('20 9 * * 1-5', safeRun('morning_rescore', runMorningRescore), { timezone: TIMEZONE });

  // Intraday position poll, every 5 minutes during NSE market hours (9:15 AM - 3:30 PM Mon-Fri).
  cron.schedule('*/5 9-15 * * 1-5', safeRun('position_poll', runPositionPoll), { timezone: TIMEZONE });

  // Day-N time-expiry + earnings + catalyst held-position checks, once daily shortly after market close.
  cron.schedule('35 15 * * 1-5', safeRun('daily_position_checks', runDailyPositionChecks), { timezone: TIMEZONE });

  // Paper-trading validation sweep (PRD 9 wk4) — walk open paper trades to an outcome, daily after close.
  cron.schedule('40 15 * * 1-5', safeRun('paper_trade_eval', runPaperTradeEval), { timezone: TIMEZONE });

  // v4.0 FRD — market-wide Discovery scan, 7:00 PM Mon-Fri (after the evening scan/ingest).
  cron.schedule('0 19 * * 1-5', safeRun('discovery_scan', runDiscovery), { timezone: TIMEZONE });

  console.log(`[cron] Scheduler started (timezone: ${TIMEZONE}) — evening scan 18:15, discovery scan 19:00, morning re-score 09:20, position poll every 5min 09:15-15:30, daily checks 15:35, paper-trade eval 15:40.`);
}

module.exports = { startScheduler };

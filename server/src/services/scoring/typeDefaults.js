/**
 * Target/stop/swing-window defaults per signal type, since the detectors identify *that* a setup
 * exists but not the trade-management numbers. These are derived from the PRD's own stated figures
 * per type (Section 2), not a fresh backtest — documented per-field below so the source is traceable.
 */
const TYPE_DEFAULTS = {
  // PRD 2.1: "Average gain when target hit: +9.1%". Stop derived from the BHEL worked example (₹218 → ₹209 ≈ 4.1%).
  compression: { targetPct: 9.1, stopPct: 4.1, days: 12 },
  // PRD 2.2: gain range "+8-14%" (midpoint used); "Stop: tight (2-2.5%)" stated explicitly.
  catalyst: { targetPct: 10.0, stopPct: 2.5, days: 14 },
  // PRD 2.3: Tata ELXSI worked example (₹5,240 → ₹5,762 ≈ +9.9%; stop ₹4,980 ≈ 5.0%).
  fallen: { targetPct: 9.9, stopPct: 5.0, days: 15 },
  // PRD 2.4: HAL worked example (+8.0%); "Stop is tighter (2%) given event risk" stated explicitly.
  earnings: { targetPct: 8.0, stopPct: 2.0, days: 13 },
  // PRD 2.5: "Target: 5-8% above current price" (midpoint used). Stop uses the detected support level directly, not a flat %.
  volume: { targetPct: 6.5, stopPct: 3.5, days: 12 },
};

module.exports = { TYPE_DEFAULTS };

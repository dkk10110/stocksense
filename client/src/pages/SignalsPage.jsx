import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';

const R = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

const TYPE_META = {
  compression: { label: 'Pre-breakout setup', tagCls: 'tag-pre', stripeCls: 'stripe-compression' },
  catalyst: { label: 'Catalyst play', tagCls: 'tag-cat', stripeCls: 'stripe-catalyst' },
  fallen: { label: 'Fallen angel reversal', tagCls: 'tag-fall', stripeCls: 'stripe-fallen' },
  earnings: { label: 'Earnings play', tagCls: 'tag-earn', stripeCls: 'stripe-earnings' },
  volume: { label: 'Volume reversal', tagCls: 'tag-vol', stripeCls: 'stripe-volume' },
};
const FILTERS = [
  { key: 'all', label: 'All signals' },
  { key: 'compression', label: 'Pre-breakout' },
  { key: 'catalyst', label: 'Catalyst' },
  { key: 'fallen', label: 'Fallen angel' },
  { key: 'earnings', label: 'Earnings play' },
  { key: 'volume', label: 'Volume reversal' },
];
const confColor = (c) => (c >= 70 ? '#16a34a' : c >= 60 ? '#d97706' : '#dc2626');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // India has no DST — fixed +05:30

// The composite scorer stamps VIX onto every generated signal's macro layer ("India VIX 14.03").
function extractVix(signals) {
  for (const s of signals || []) {
    const m = s.scoreBreakdown?.macro?.note?.match(/[\d.]+/);
    if (m) return Number(m[0]);
  }
  return null;
}

const fmtIST = (d) =>
  d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

// Next scheduled scan — mirrors the server scheduler: 09:20 and 18:15 IST, Mon–Fri.
function nextScanTime(now = new Date()) {
  const istMs = now.getTime() + IST_OFFSET_MS;
  const slotsMin = [9 * 60 + 20, 18 * 60 + 15];
  for (let addDays = 0; addDays < 7; addDays++) {
    const day = new Date(istMs + addDays * 86400000);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const dayStartIST = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    for (const min of slotsMin) {
      const candIST = dayStartIST + min * 60000;
      if (candIST > istMs) return new Date(candIST - IST_OFFSET_MS);
    }
  }
  return null;
}

export default function SignalsPage() {
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();
  const { openBuyModal } = useModal();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: signals, isLoading: loadingSignals } = useQuery({
    queryKey: ['signals', filter],
    queryFn: () => api.get('/signals', { params: filter === 'all' ? {} : { type: filter } }).then((r) => r.data),
  });
  const { data: watchlist } = useQuery({ queryKey: ['watchlist'], queryFn: () => api.get('/watchlist').then((r) => r.data) });
  const { data: positions } = useQuery({ queryKey: ['positions'], queryFn: () => api.get('/positions').then((r) => r.data) });

  const linkForSignal = useMutation({
    mutationFn: (signal) => api.post('/watchlist', { name: signal.name, sector: signal.sector, price: signal.price, signalId: signal.id }),
    onSuccess: (res) => queryClient.setQueryData(['watchlist'], (old = []) => (old.some((w) => w.id === res.data.id) ? old : [...old, res.data])),
  });

  const heldWatchlistIds = useMemo(() => new Set((positions || []).map((p) => p.watchlistItemId)), [positions]);

  const metrics = useMemo(() => {
    if (!signals?.length) return { count: 0, avgConf: 0, avgUp: 0 };
    const count = signals.length;
    const avgConf = signals.reduce((s, x) => s + x.confidence, 0) / count;
    const avgUp = signals.reduce((s, x) => s + Number(x.upside), 0) / count;
    return { count, avgConf, avgUp };
  }, [signals]);

  const vix = useMemo(() => extractVix(signals), [signals]);
  const scoredAt = useMemo(() => {
    if (!signals?.length) return null;
    const latest = signals.reduce((max, s) => (s.createdAt > max ? s.createdAt : max), signals[0].createdAt);
    return new Date(latest);
  }, [signals]);
  const nextScan = nextScanTime();

  const onMarkAsBought = async (signal) => {
    let wl = (watchlist || []).find((w) => w.signalId === signal.id);
    if (!wl) {
      try {
        const res = await linkForSignal.mutateAsync(signal);
        wl = res.data;
      } catch (err) {
        toast(err.response?.data?.error || 'Could not prepare this trade.');
        return;
      }
    }
    openBuyModal(wl.id, signal.name, Number(signal.entryLow));
  };

  if (loadingSignals) return <p style={{ padding: 20 }}>Loading signals…</p>;

  return (
    <div>
      <div className="metrics">
        <div className="mc"><div className="mc-l">Forward signals</div><div className="mc-v b">{metrics.count}</div></div>
        <div className="mc"><div className="mc-l">Avg confidence</div><div className="mc-v g">{metrics.avgConf.toFixed(0)}%</div></div>
        <div className="mc"><div className="mc-l">Avg upside</div><div className="mc-v g">+{metrics.avgUp.toFixed(1)}%</div></div>
        <div className="mc">
          <div className="mc-l">VIX{vix == null ? '' : vix <= 18 ? ' — safe' : ' — elevated'}</div>
          <div className={`mc-v ${vix == null ? 'a' : vix <= 18 ? 'g' : 'r'}`}>{vix == null ? '—' : vix.toFixed(1)}</div>
        </div>
      </div>

      <div className="signal-epoch">
        <div className="epoch-pulse"></div>
        <div>
          <div className="epoch-text">Signals generated for the <strong>next entry window</strong>. These stocks are set up to move in the next 15 days. Buy before the move, not after.</div>
          <div className="epoch-time">
            {scoredAt ? `Scored: ${fmtIST(scoredAt)}` : 'No signals scored yet'}
            {nextScan ? ` · Next scan: ${fmtIST(nextScan)}` : ''}
            {vix == null ? '' : ` · VIX ${vix.toFixed(1)}`}
            {` · ${signals?.length || 0} signal${signals?.length === 1 ? '' : 's'} active`}
          </div>
        </div>
      </div>

      <div className="filter-row">
        {FILTERS.map((f) => (
          <button key={f.key} className={`fp${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      <div id="sig-cards">
        {!signals?.length && <div className="empty"><p>No signals match this filter right now.</p></div>}
        {signals?.map((s) => {
          const tm = TYPE_META[s.type];
          const wl = (watchlist || []).find((w) => w.signalId === s.id);
          const isHeld = wl ? heldWatchlistIds.has(wl.id) : false;
          const probC = confColor(s.confidence);
          const stopPct = (((Number(s.price) - Number(s.stop)) / Number(s.price)) * 100).toFixed(1);
          return (
            <div className="sig-card" key={s.id}>
              <div className={`sig-stripe ${tm.stripeCls}`}></div>
              <div className="sig-body">
                <div className="sig-top">
                  <div className="sig-left">
                    <div className="sig-name">{s.name}</div>
                    <div className="sig-sector">{s.sector}</div>
                    <div className="sig-tags">
                      <span className={`tag ${tm.tagCls}`}>{tm.label}</span>
                      {isHeld && <span className="tag tag-held">Position held</span>}
                    </div>
                  </div>
                  <div className="sig-right">
                    <div className="sig-confidence" style={{ color: probC }}>{s.confidence}%</div>
                    <div className="sig-conf-label">Confidence</div>
                    <div className="sig-days">↑ {Number(s.upside)}% · {s.days} days</div>
                  </div>
                </div>

                <div className="insight-box">
                  <div className="insight-label">Why buy now — before the move</div>
                  <div className="insight-text" dangerouslySetInnerHTML={{ __html: s.insight }} />
                </div>

                <div className="entry-window">
                  <div>
                    <div className="ew-label">Entry window</div>
                    <div className="ew-range">{R(s.entryLow)}–{R(s.entryHigh)}</div>
                    <div className="ew-note">Buy today or at open tomorrow</div>
                  </div>
                  <div className="ew-right">
                    <div className="ew-target">Target {R(s.target)} (+{Number(s.upside)}%)</div>
                    <div className="ew-stop">Stop {R(s.stop)} (−{stopPct}%)</div>
                  </div>
                </div>

                <div className="sig-data">
                  <div><div className="dc-l">Current</div><div className="dc-v">{R(s.price)}</div></div>
                  <div><div className="dc-l">Target</div><div className="dc-v g">{R(s.target)}</div></div>
                  <div><div className="dc-l">Stop</div><div className="dc-v r">{R(s.stop)}</div></div>
                  <div><div className="dc-l">RSI</div><div className="dc-v b">{s.rsi}</div></div>
                  <div><div className="dc-l">R / R</div><div className="dc-v p">1 : {Number(s.rr)}</div></div>
                  <div><div className="dc-l">Window</div><div className="dc-v a">{s.days} days</div></div>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--g4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Why the move is coming</div>
                  <div className="indicator-row">
                    {s.indicators.map((ind, i) => <span key={i} className={`ind-chip ind-${ind.color}`}>{ind.label}</span>)}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--g4)', textTransform: 'uppercase', letterSpacing: '.07em', margin: '8px 0 6px' }}>Upcoming catalysts</div>
                  <div className="indicator-row">
                    {s.catalysts.map((c, i) => <span key={i} className="ind-chip ind-amber">{c}</span>)}
                  </div>
                </div>

                <div className="prob-row">
                  <div className="prob-label">Profit probability</div>
                  <div className="prob-track"><div className="prob-fill" style={{ width: `${s.confidence}%`, background: probC }}></div></div>
                  <div className="prob-val" style={{ color: probC }}>{s.confidence}%</div>
                </div>
                <div className="prob-basis">Based on {s.probBasis} similar setups in NSE historical data · R/R {Number(s.rr)} : 1 · Even at 40% win rate, expected value is positive</div>

                <div className="sig-footer" style={{ marginTop: 12 }}>
                  {!isHeld && (
                    <button className="btn btn-buy" onClick={() => onMarkAsBought(s)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
                      Mark as bought
                    </button>
                  )}
                  {isHeld && <button className="btn btn-brand" onClick={() => navigate('/positions')}>View position</button>}
                  <button className="btn" onClick={() => navigate('/watchlist')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    Add to watchlist
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

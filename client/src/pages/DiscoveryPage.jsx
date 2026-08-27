import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const R = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const TYPE_LABEL = {
  compression: 'Pre-breakout', catalyst: 'Catalyst', fallen: 'Fallen angel', earnings: 'Earnings play', volume: 'Volume reversal',
  institutional: 'Institutional accumulation', rotation: 'Sector rotation', rs_leader: 'Relative-strength leader',
  high_delivery: 'High-delivery accumulation', mtf_breakout: 'Multi-timeframe breakout',
};
const confColor = (c) => (c >= 70 ? '#16a34a' : c >= 60 ? '#d97706' : '#dc2626');

export default function DiscoveryPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ['discovery'], queryFn: () => api.get('/discovery').then((r) => r.data) });

  if (isLoading) return <p style={{ padding: 20 }}>Loading discovery scan…</p>;

  const { run, shortlist = [], sectorRanks = [], breadth } = data || {};

  if (!run) {
    return (
      <div className="empty" style={{ marginTop: 24 }}>
        <p>No market scan has run yet. The discovery scan runs after close (7:00 PM IST), or run <code>npm run discovery:scan</code>.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="metrics">
        <div className="mc"><div className="mc-l">Universe scanned</div><div className="mc-v b">{run.scannedCount}/{run.universeSize}</div></div>
        <div className="mc"><div className="mc-l">Shortlisted</div><div className="mc-v g">{shortlist.length}</div></div>
        <div className="mc"><div className="mc-l">Adv / Dec</div><div className="mc-v a">{breadth ? `${breadth.advancers}/${breadth.decliners}` : '—'}</div></div>
        <div className="mc"><div className="mc-l">% above 50-EMA</div><div className="mc-v p">{breadth ? breadth.pctAbove50EMA + '%' : '—'}</div></div>
      </div>

      <div className="signal-epoch">
        <div className="epoch-pulse"></div>
        <div>
          <div className="epoch-text">Market-wide discovery scan — <strong>{run.scannedCount} liquid NSE stocks</strong> ranked by sector strength, institutional footprint, relative strength and setup quality.</div>
          <div className="epoch-time">Last run: {new Date(run.finishedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {run.note}</div>
        </div>
      </div>

      <div className="sec-hdr"><div className="sec-title">Sector ranking</div></div>
      <div style={{ overflowX: 'auto', marginBottom: 18 }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--g4)' }}>
            <th style={{ padding: '6px 8px' }}>#</th><th style={{ padding: '6px 8px' }}>Sector</th>
            <th style={{ padding: '6px 8px' }}>Score</th><th style={{ padding: '6px 8px' }}>RS</th><th style={{ padding: '6px 8px' }}>Momentum</th>
          </tr></thead>
          <tbody>
            {sectorRanks.map((s) => (
              <tr key={s.sector} style={{ borderTop: '1px solid var(--g1)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700 }}>{s.rank}</td>
                <td style={{ padding: '6px 8px' }}>{s.sector}</td>
                <td style={{ padding: '6px 8px', fontWeight: 700, color: confColor(s.score) }}>{s.score}</td>
                <td style={{ padding: '6px 8px' }}>{s.rs}</td>
                <td style={{ padding: '6px 8px' }}>{s.momentum}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sec-hdr"><div className="sec-title">Shortlist</div></div>
      <div id="sig-cards">
        {!shortlist.length && <div className="empty"><p>No stocks passed the shortlist gate in the last scan.</p></div>}
        {shortlist.map((s) => {
          const c = confColor(s.confidence);
          const isOpen = open === s.symbol;
          return (
            <div className="sig-card" key={s.symbol}>
              <div className="sig-body">
                <div className="sig-top">
                  <div className="sig-left">
                    <div className="sig-name">{s.name} <span style={{ color: 'var(--g4)', fontWeight: 600 }}>· {s.symbol}</span></div>
                    <div className="sig-sector">{s.sector} · sector score {s.sectorScore ?? '—'}/100 · RS {s.rsPercentile}%</div>
                    <div className="sig-tags"><span className="tag tag-pre">{TYPE_LABEL[s.type] || s.type}</span></div>
                  </div>
                  <div className="sig-right">
                    <div className="sig-confidence" style={{ color: c }}>{s.confidence}%</div>
                    <div className="sig-conf-label">v4 confidence</div>
                    <div className="sig-days">↑ {s.upside}% · {s.days}d</div>
                  </div>
                </div>

                <div className="insight-box">
                  <div className="insight-label">Why buy now</div>
                  <div className="insight-text">{s.narrative?.whyBuy}</div>
                </div>

                <div className="entry-window">
                  <div>
                    <div className="ew-label">Entry window</div>
                    <div className="ew-range">{R(s.entryLow)}–{R(s.entryHigh)}</div>
                  </div>
                  <div className="ew-right">
                    <div className="ew-target">Target {R(s.target)} (+{s.upside}%)</div>
                    <div className="ew-stop">Stop {R(s.stop)} · R/R 1:{s.rr}</div>
                  </div>
                </div>

                <button className="btn" style={{ marginTop: 8 }} onClick={() => setOpen(isOpen ? null : s.symbol)}>
                  {isOpen ? 'Hide detail' : 'Risks · Entry/Exit · News · Score'}
                </button>

                {isOpen && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--g6)' }}>
                    <p><strong>Risks:</strong> {s.narrative?.risks}</p>
                    <p><strong>Entry / exit:</strong> {s.narrative?.entryExit}</p>
                    <p><strong>News:</strong> {s.narrative?.newsSummary}</p>
                    <div className="indicator-row" style={{ marginTop: 6 }}>
                      {Object.entries(s.scoreBreakdown || {}).map(([k, v]) => (
                        <span key={k} className={`ind-chip ${v.pending ? 'ind-amber' : 'ind-blue'}`}>{k}: {v.score}{v.pending ? ' (pending)' : ''}</span>
                      ))}
                      {s.riskPenalty > 0 && <span className="ind-chip ind-red">risk −{s.riskPenalty} ({s.riskNote})</span>}
                    </div>
                  </div>
                )}

                <div className="sig-footer" style={{ marginTop: 12 }}>
                  <button className="btn btn-brand" onClick={() => navigate('/watchlist')}>Add to watchlist</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

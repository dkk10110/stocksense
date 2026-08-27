import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';

const R = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const P = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

const REC_META = {
  buy: { label: 'BUY', color: '#16a34a' },
  hold: { label: 'HOLD', color: '#2563eb' },
  average: { label: 'AVERAGE', color: '#7c3aed' },
  exit: { label: 'EXIT', color: '#dc2626' },
  book_profit: { label: 'BOOK PROFIT', color: '#16a34a' },
};

export default function PositionsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: positions, isLoading } = useQuery({ queryKey: ['positions'], queryFn: () => api.get('/positions').then((r) => r.data) });
  const { data: intel } = useQuery({ queryKey: ['portfolio-intel'], queryFn: () => api.get('/portfolio/intelligence').then((r) => r.data) });
  const recFor = (id) => (intel?.holdings || []).find((h) => h.id === id);

  const simulate = useMutation({
    mutationFn: ({ id, deltaPct }) => api.post(`/positions/${id}/simulate`, { deltaPct }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['positions'] }),
  });

  const sell = useMutation({
    mutationFn: (id) => api.post(`/positions/${id}/sell`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      const { name, pl, gainPct } = res.data;
      toast(`${name} marked sold — ${pl >= 0 ? '+' : ''}${R(Math.abs(pl))} (${gainPct >= 0 ? '+' : ''}${gainPct}%). Logged to your scorecard.`);
    },
  });

  const syncPrices = useMutation({
    mutationFn: () => api.post('/positions/sync-prices'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      const { updated, skipped } = res.data;
      toast(`Synced ${updated.length} position${updated.length === 1 ? '' : 's'} from real market data${skipped.length ? ` — ${skipped.length} skipped (no price data)` : ''}.`);
    },
  });

  const totals = useMemo(() => {
    if (!positions?.length) return null;
    const totInv = positions.reduce((s, p) => s + Number(p.buyPrice) * p.qty, 0);
    const totPnL = positions.reduce((s, p) => s + (Number(p.currentPrice) - Number(p.buyPrice)) * p.qty, 0);
    const gains = positions.map((p) => ((Number(p.currentPrice) - Number(p.buyPrice)) / Number(p.buyPrice)) * 100);
    return { totInv, totPnL, best: Math.max(...gains) };
  }, [positions]);

  if (isLoading) return <p style={{ padding: 20 }}>Loading positions…</p>;

  return (
    <div>
      <div className="metrics">
        <div className="mc"><div className="mc-l">Open</div><div className="mc-v">{positions.length || '—'}</div></div>
        <div className="mc"><div className="mc-l">Invested</div><div className="mc-v b">{totals ? R(totals.totInv) : '—'}</div></div>
        <div className="mc"><div className="mc-l">Unrealised P&amp;L</div><div className={`mc-v ${totals && totals.totPnL >= 0 ? 'g' : 'r'}`}>{totals ? (totals.totPnL >= 0 ? '+' : '') + R(Math.abs(totals.totPnL)) : '—'}</div></div>
        <div className="mc"><div className="mc-l">Best gain</div><div className="mc-v g">{totals ? (totals.best >= 0 ? '+' : '') + totals.best.toFixed(1) + '%' : '—'}</div></div>
      </div>

      {positions.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <button className="btn btn-brand" disabled={syncPrices.isPending} onClick={() => syncPrices.mutate()}>
            {syncPrices.isPending ? 'Syncing…' : 'Sync real prices'}
          </button>
        </div>
      )}

      {intel?.risk && positions.length > 0 && (
        <div className="add-panel" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: 'var(--g9)' }}>Portfolio intelligence</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, marginBottom: intel.risk.flags.length ? 8 : 0 }}>
            <span>Deployed <strong>{R(intel.risk.deployedAmt)}</strong></span>
            <span>Stop risk <strong>{R(intel.risk.totalRiskAmt)}</strong></span>
            <span>Heat <strong style={{ color: intel.risk.portfolioHeatPct > 6 ? '#dc2626' : '#16a34a' }}>{intel.risk.portfolioHeatPct}%</strong></span>
            <span>Sectors: {intel.risk.sectorAllocation.map((s) => `${s.sector} ${s.weightPct}%`).join(' · ')}</span>
          </div>
          {intel.risk.flags.map((f, i) => (
            <div key={i} style={{ fontSize: 11, color: '#d97706', fontWeight: 700 }}>⚠ {f}</div>
          ))}
        </div>
      )}

      <div id="pos-cards">
        {!positions.length && (
          <div className="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
            <p>No open positions yet.<br />Go to <strong>Signals</strong> and tap Mark as bought.</p>
          </div>
        )}
        {positions.map((pos) => {
          const gain = ((Number(pos.currentPrice) - Number(pos.buyPrice)) / Number(pos.buyPrice)) * 100;
          const pl = (Number(pos.currentPrice) - Number(pos.buyPrice)) * pos.qty;
          const dLeft = Math.max(0, 15 - pos.daysHeld);
          const nxt = pos.alertLevels.find((l) => !pos.alertsHit.includes(l) && gain < l);
          const prog = nxt ? Math.min(100, Math.max(0, (gain / nxt) * 100)).toFixed(0) : 100;
          const stopHit = Number(pos.currentPrice) <= Number(pos.stop);
          const gColor = gain >= 0 ? '#16a34a' : '#dc2626';

          return (
            <div className={`pos-card${stopHit ? ' stop-hit' : ''}`} key={pos.id}>
              <div className="pos-hdr">
                <div>
                  <div className="sig-name">
                    {pos.name}
                    {(() => {
                      const rec = recFor(pos.id);
                      const m = rec && REC_META[rec.action];
                      return m ? <span className="tag" style={{ marginLeft: 8, background: m.color, color: '#fff' }}>{m.label}</span> : null;
                    })()}
                  </div>
                  <div className="pos-meta">{pos.sector} · {pos.qty} shares · {pos.broker} · {pos.daysHeld}d held</div>
                </div>
                <div className="pos-pnl">
                  <div className="pos-pnl-amt" style={{ color: gColor }}>{pl >= 0 ? '+' : ''}{R(Math.abs(pl))}</div>
                  <div className="pos-pnl-pct" style={{ color: gColor }}>{P(gain)}</div>
                </div>
              </div>

              {recFor(pos.id) && (
                <div style={{ fontSize: 11, color: 'var(--g5)', marginBottom: 10, padding: '6px 10px', background: 'var(--g0)', borderRadius: 'var(--r)' }}>
                  {recFor(pos.id).reason}
                </div>
              )}

              {stopHit && (
                <div style={{ background: 'var(--err-bg)', border: '1px solid var(--err-b)', borderRadius: 'var(--r)', padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--err)', fontWeight: 700 }}>
                  Stop loss triggered at {R(pos.stop)} — exit recommended to protect capital.
                </div>
              )}

              <div className="pos-data">
                <div><div className="dc-l">Buy price</div><div className="dc-v">{R(pos.buyPrice)}</div></div>
                <div><div className="dc-l">Current</div><div className="dc-v" style={{ color: gColor }}>{R(pos.currentPrice)}</div></div>
                <div><div className="dc-l">Stop</div><div className="dc-v r">{R(pos.stop)}</div></div>
                <div><div className="dc-l">Days left</div><div className="dc-v" style={{ color: dLeft <= 3 ? '#d97706' : 'var(--g8)' }}>{dLeft}/15</div></div>
              </div>

              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--g4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Profit alert ladder</div>
              <div className="ladder">
                {[2, 5, 10].map((pct) => {
                  const hit = pos.alertsHit.includes(pct);
                  const isNxt = pct === nxt;
                  return (
                    <div className={`ls${hit ? ' hit' : isNxt ? ' nxt' : ''}`} key={pct}>
                      <div className="ls-pct">{hit ? '✓' : '+'}{pct}%</div>
                      <div className="ls-p">{R(Number(pos.buyPrice) * (1 + pct / 100))}</div>
                    </div>
                  );
                })}
                <div className="ls stp"><div className="ls-pct">Stop</div><div className="ls-p">{R(pos.stop)}</div></div>
              </div>

              {nxt ? (
                <div className="prog-wrap">
                  <div className="prog-labels"><span>Progress to {nxt}% alert</span><span>{prog}%</span></div>
                  <div className="prog-track"><div className="prog-fill" style={{ width: `${prog}%` }}></div></div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginBottom: 10 }}>All profit targets reached</div>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-buy" onClick={() => sell.mutate(pos.id)}>Mark sold</button>
                <button className="btn" onClick={() => simulate.mutate({ id: pos.id, deltaPct: 1 })}>+1%</button>
                <button className="btn" onClick={() => simulate.mutate({ id: pos.id, deltaPct: -1 })}>−1%</button>
                <button className="btn" style={{ color: 'var(--err)' }} onClick={() => simulate.mutate({ id: pos.id, deltaPct: -5 })}>−5%</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

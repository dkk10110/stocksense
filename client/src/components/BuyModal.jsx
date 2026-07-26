import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';

const R = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const todayISO = () => new Date().toISOString().split('T')[0];
const ALERT_PRESETS = [
  { levels: [2, 5, 10], pct: '2·5·10%', label: 'All levels' },
  { levels: [2], pct: '2%', label: 'Safety only' },
  { levels: [10], pct: '10%', label: 'Full target' },
];

export default function BuyModal() {
  const { buyTarget, closeBuyModal } = useModal();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [broker, setBroker] = useState('Groww');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState(100);
  const [date, setDate] = useState(todayISO());
  const [alertLevels, setAlertLevels] = useState([2, 5, 10]);

  useEffect(() => {
    if (buyTarget) {
      setBroker('Groww');
      setPrice(buyTarget.suggestedPrice ?? '');
      setQty(100);
      setDate(todayISO());
      setAlertLevels([2, 5, 10]);
    }
  }, [buyTarget]);

  const confirmBuy = useMutation({
    mutationFn: () =>
      api.post('/positions', {
        watchlistItemId: buyTarget.watchlistItemId,
        broker,
        buyPrice: parseFloat(price),
        qty: parseInt(qty, 10),
        buyDate: date,
        alertLevels,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast(`${buyTarget.name} marked as bought.`);
      closeBuyModal();
    },
    onError: (err) => toast(err.response?.data?.error || 'Could not save this position.'),
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeBuyModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeBuyModal]);

  if (!buyTarget) return null;

  const pr = parseFloat(price) || 0;
  const qt = parseInt(qty, 10) || 0;
  const inv = pr * qt;

  return (
    <div className="modal-bg on" onClick={(e) => e.target === e.currentTarget && closeBuyModal()}>
      <div className="modal">
        <div className="modal-h">Mark as bought — {buyTarget.name}</div>
        <div className="modal-sub">Enter actual price from your broker app. Suggested entry: {R(buyTarget.suggestedPrice)}</div>
        <div className="modal-grid">
          <div className="fld">
            <label>Broker / platform</label>
            <select value={broker} onChange={(e) => setBroker(e.target.value)}>
              <option>Groww</option><option>Zerodha</option><option>Angel One</option><option>Upstox</option><option>Dhan</option><option>Other</option>
            </select>
          </div>
          <div className="fld">
            <label>Buy price (₹)</label>
            <input type="number" step="0.05" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="fld">
            <label>Quantity (shares)</label>
            <input type="number" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="fld">
            <label>Buy date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--g4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          Alert me when gain reaches
        </div>
        <div className="alert-opts">
          {ALERT_PRESETS.map((p) => (
            <div
              key={p.label}
              className={`ao${JSON.stringify(alertLevels) === JSON.stringify(p.levels) ? ' on' : ''}`}
              onClick={() => setAlertLevels(p.levels)}
            >
              <div className="ao-pct">{p.pct}</div>
              <div className="ao-lbl">{p.label}</div>
            </div>
          ))}
        </div>
        <div className="pnl-box">
          <div className="pnl-title">Projected P&amp;L at your entry price</div>
          <div className="pnl-row"><span className="pnl-k">Capital deployed</span><span className="pnl-v">{inv ? R(inv) : '—'}</span></div>
          <div className="pnl-row"><span className="pnl-k">At 2% (safety alert)</span><span className="pnl-v g">{inv ? '+' + R(pr * 0.02 * qt) : '—'}</span></div>
          <div className="pnl-row"><span className="pnl-k">At 5% (mid target)</span><span className="pnl-v g">{inv ? '+' + R(pr * 0.05 * qt) : '—'}</span></div>
          <div className="pnl-row"><span className="pnl-k">At 10% (full target)</span><span className="pnl-v g">{inv ? '+' + R(pr * 0.10 * qt) : '—'}</span></div>
          <div className="pnl-row"><span className="pnl-k">If stop loss hit (−3%)</span><span className="pnl-v r">{inv ? '−' + R(pr * 0.03 * qt) : '—'}</span></div>
          <div className="pnl-row"><span className="pnl-k">Risk / reward ratio</span><span className="pnl-v b">{pr ? `1 : ${(pr * 0.10 / (pr * 0.03)).toFixed(1)}` : '—'}</span></div>
        </div>
        <div className="modal-btns">
          <button className="btn btn-buy btn-lg" disabled={!pr || !qt || confirmBuy.isPending} onClick={() => confirmBuy.mutate()}>
            Confirm — mark as bought
          </button>
          <button className="btn btn-lg" onClick={closeBuyModal}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

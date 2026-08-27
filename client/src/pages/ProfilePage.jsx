import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

const ALERT_TOGGLES = [
  { key: 'safety2', label: '2% safety alert' },
  { key: 'mid5', label: '5% mid-target alert' },
  { key: 'full10', label: '10% full-target alert' },
  { key: 'stopLoss', label: 'Stop-loss alert' },
  { key: 'dayExpiry', label: 'Day-N time-expiry alert' },
  { key: 'compression', label: 'Pre-breakout compression alert' },
  { key: 'fallenAngel', label: 'Fallen angel reversal alert' },
  { key: 'catalyst', label: 'Catalyst countdown alert (7 / 1 day)' },
  { key: 'earningsPlay', label: 'Earnings play alert' },
  { key: 'volumeReversal', label: 'Volume reversal alert' },
  { key: 'discovery', label: 'Discovery — new opportunity alert' },
  { key: 'sectorRotation', label: 'Sector rotation alert' },
  { key: 'portfolioAdvice', label: 'Portfolio advice (book-profit) alert' },
];

const TYPE_LABEL = { compression: 'Pre-breakout', catalyst: 'Catalyst', fallen: 'Fallen angel', earnings: 'Earnings play', volume: 'Volume reversal' };

const monthYear = (iso) => new Date(iso).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({ queryKey: ['profile'], queryFn: () => api.get('/profile').then((r) => r.data) });

  const updateSettings = useMutation({
    mutationFn: (payload) => api.patch('/profile/settings', payload),
    onSuccess: (res) => queryClient.setQueryData(['profile'], (old) => ({ ...old, settings: res.data })),
  });

  if (isLoading) return <p style={{ padding: 20 }}>Loading profile…</p>;

  const initials = profile.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const { alertsConfig, swingWindow, profitTarget } = profile.settings;

  const toggle = (key) => updateSettings.mutate({ alertsConfig: { ...alertsConfig, [key]: !alertsConfig[key] } });

  const doLogout = () => { logout(); navigate('/login'); };

  return (
    <div>
      <div className="prof-card">
        <div className="prof-hero">
          <div className="av-lg">{initials}</div>
          <div>
            <div className="prof-name">{profile.name}</div>
            <div className="prof-meta">{profile.email}</div>
            <div className="prof-meta">Member since {monthYear(profile.createdAt)}</div>
          </div>
        </div>

        <div className="set-title">Monthly scorecard</div>
        <div className="sc-grid">
          <div className="sc-cell"><div className="sc-val" style={{ color: '#16a34a' }}>{profile.scorecard.winRate != null ? profile.scorecard.winRate + '%' : '—'}</div><div className="sc-lbl">Win rate</div></div>
          <div className="sc-cell"><div className="sc-val">{profile.scorecard.tradesClosed}</div><div className="sc-lbl">Trades closed</div></div>
          <div className="sc-cell"><div className="sc-val" style={{ color: '#16a34a' }}>{profile.scorecard.avgGain != null ? (profile.scorecard.avgGain >= 0 ? '+' : '') + profile.scorecard.avgGain.toFixed(1) + '%' : '—'}</div><div className="sc-lbl">Avg gain</div></div>
        </div>

        {profile.scorecard.byType && (
          <>
            <div className="set-title">By signal type</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--g4)' }}>
                    <th style={{ padding: '6px 8px' }}>Type</th>
                    <th style={{ padding: '6px 8px' }}>Trades</th>
                    <th style={{ padding: '6px 8px' }}>Win rate</th>
                    <th style={{ padding: '6px 8px' }}>Avg gain</th>
                    <th style={{ padding: '6px 8px' }}>Avg days</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(profile.scorecard.byType).map(([type, s]) => (
                    <tr key={type} style={{ borderTop: '1px solid var(--g1)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>{TYPE_LABEL[type] || type}</td>
                      <td style={{ padding: '6px 8px' }}>{s.tradesClosed}</td>
                      <td style={{ padding: '6px 8px' }}>{s.winRate != null ? s.winRate + '%' : '—'}</td>
                      <td style={{ padding: '6px 8px', color: s.avgGain >= 0 ? '#16a34a' : '#dc2626' }}>{s.avgGain != null ? (s.avgGain >= 0 ? '+' : '') + s.avgGain.toFixed(1) + '%' : '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{s.avgDaysHeld != null ? s.avgDaysHeld : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="set-title">Alert preferences</div>
        {ALERT_TOGGLES.map((t) => (
          <div className="set-row" key={t.key}>
            <span className="set-name">{t.label}</span>
            <button className={`toggle${alertsConfig[t.key] ? ' on' : ''}`} onClick={() => toggle(t.key)}></button>
          </div>
        ))}

        <div className="set-title">Trading preferences</div>
        <div className="set-row">
          <span className="set-name">Swing window</span>
          <select value={swingWindow} onChange={(e) => updateSettings.mutate({ swingWindow: Number(e.target.value) })} style={{ border: '1px solid var(--g2)', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}>
            <option value={10}>10 days</option>
            <option value={15}>15 days (default)</option>
            <option value={21}>21 days</option>
          </select>
        </div>
        <div className="set-row">
          <span className="set-name">Profit target</span>
          <select value={profitTarget} onChange={(e) => updateSettings.mutate({ profitTarget: e.target.value })} style={{ border: '1px solid var(--g2)', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}>
            <option value="conservative">Conservative 2–5%</option>
            <option value="balanced">Balanced 5–10%</option>
            <option value="aggressive">Aggressive 8–15%</option>
          </select>
        </div>
      </div>

      <button className="logout-btn" onClick={doLogout}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
        Sign out
      </button>
      <p className="disc">StockSense AI generates forward-looking research signals for personal swing trading. All signals are for educational and research purposes only — not investment advice. Past signal accuracy does not guarantee future returns. Always do your own due diligence.</p>
    </div>
  );
}

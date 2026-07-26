import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

const CATEGORY = {
  gain_2: 'fired', gain_5: 'fired', gain_10: 'fired',
  forward_signal: 'signal',
  rsi_reversal: 'warn', catalyst_7day: 'warn', catalyst_1day: 'warn', day12_time: 'warn', earnings_day: 'warn',
  stop_loss: 'danger',
};
const DOT_COLOR = { fired: 'g', signal: 'b', warn: 'a', danger: 'r' };

const formatTime = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const { data: alerts, isLoading } = useQuery({ queryKey: ['alerts'], queryFn: () => api.get('/alerts').then((r) => r.data) });

  const dismiss = useMutation({
    mutationFn: (id) => api.post(`/alerts/${id}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
  const dismissAll = useMutation({
    mutationFn: () => api.post('/alerts/dismiss-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  if (isLoading) return <p style={{ padding: 20 }}>Loading alerts…</p>;

  return (
    <div>
      <div className="sec-hdr" style={{ marginBottom: 14 }}>
        <div className="sec-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          Smart alerts
        </div>
        {alerts.length > 0 && <button className="btn" onClick={() => dismissAll.mutate()}>Mark all read</button>}
      </div>

      <div id="al-list">
        {!alerts.length && (
          <div className="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            <p>All caught up.</p>
          </div>
        )}
        {alerts.map((a) => {
          const cat = CATEGORY[a.type] || 'signal';
          return (
            <div className={`al-card ${cat}`} key={a.id}>
              <div className="al-hdr">
                <div className={`al-dot ${DOT_COLOR[cat]}`}></div>
                <div className="al-title">{a.title}</div>
                <div className="al-time">{formatTime(a.createdAt)}</div>
              </div>
              <div className="al-body">{a.body}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn" onClick={() => dismiss.mutate(a.id)}>Dismiss</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

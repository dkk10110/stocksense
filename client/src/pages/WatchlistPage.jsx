import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';

const R = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const SECTORS = ['Auto', 'Banking', 'Defence', 'Energy', 'FMCG', 'IT', 'Pharma', 'PSU Infra', 'Renewables', 'Steel'];
const TYPE_LABEL = { compression: 'tag-pre', catalyst: 'tag-cat', fallen: 'tag-fall', earnings: 'tag-earn', volume: 'tag-vol' };
const TYPE_TEXT = { compression: 'Pre-breakout setup', catalyst: 'Catalyst play', fallen: 'Fallen angel reversal', earnings: 'Earnings play', volume: 'Volume reversal' };

const EMPTY_FORM = { name: '', symbol: '', sector: '', price: '', high: '' };

export default function WatchlistPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState(null); // { ok: boolean, text: string }
  const lastLookedUp = useRef('');

  // typeahead
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const searchTimer = useRef(null);
  const pickedRef = useRef(false); // set when a result is chosen, so blur doesn't re-lookup
  const navigate = useNavigate();
  const { openBuyModal } = useModal();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({ queryKey: ['watchlist'], queryFn: () => api.get('/watchlist').then((r) => r.data) });
  const { data: positions } = useQuery({ queryKey: ['positions'], queryFn: () => api.get('/positions').then((r) => r.data) });
  const heldIds = useMemo(() => new Set((positions || []).map((p) => p.watchlistItemId)), [positions]);

  const addStock = useMutation({
    mutationFn: (payload) => api.post('/watchlist', payload),
    onSuccess: (res) => {
      queryClient.setQueryData(['watchlist'], (old = []) => [...old, res.data]);
      setForm(EMPTY_FORM);
      setLookupMsg(null);
      lastLookedUp.current = '';
      setResults([]);
      setShowResults(false);
      setShowAdd(false);
      toast(`${res.data.name} added to watchlist.`);
    },
  });

  const sectorOptions = useMemo(() => {
    // any resolved sector not in our list (e.g. a raw Yahoo sector) gets shown too
    if (form.sector && !SECTORS.includes(form.sector)) return [form.sector, ...SECTORS];
    return SECTORS;
  }, [form.sector]);

  // Resolve a name/ticker to a real NSE symbol and auto-fill sector / price / 52-week high.
  const fillFromSymbol = async (query) => {
    const q = String(query || '').trim();
    if (q.length < 2 || q.toLowerCase() === lastLookedUp.current.toLowerCase()) return;
    lastLookedUp.current = q;
    setLooking(true);
    setLookupMsg(null);
    try {
      const { data } = await api.get('/watchlist/lookup', { params: { q } });
      setForm((f) => ({
        ...f,
        name: data.name || f.name,
        symbol: data.symbol || '',
        sector: data.sector || f.sector,
        price: data.price != null ? String(data.price) : f.price,
        high: data.high52w != null ? String(data.high52w) : f.high,
      }));
      setErrors({});
      setLookupMsg({
        ok: true,
        text: data.sector
          ? `Matched ${data.symbol} — details auto-filled. Edit any field if needed.`
          : `Matched ${data.symbol} — price filled, but pick a sector (couldn't detect it).`,
      });
    } catch (err) {
      setForm((f) => ({ ...f, symbol: '' }));
      setLookupMsg({ ok: false, text: err.response?.data?.error || 'Lookup failed — enter the details manually.' });
    } finally {
      setLooking(false);
    }
  };

  // Fired on blur — only re-looks-up if the user typed and didn't pick from the dropdown.
  const runLookup = () => {
    if (pickedRef.current || looking) { pickedRef.current = false; return; }
    fillFromSymbol(form.name);
  };

  // Debounced typeahead as the user types.
  const onNameChange = (value) => {
    setForm((f) => ({ ...f, name: value, symbol: '' }));
    setLookupMsg(null);
    setActiveIdx(-1);
    clearTimeout(searchTimer.current);
    const q = value.trim();
    if (q.length < 2) { setResults([]); setShowResults(false); return; }
    setSearching(true);
    setShowResults(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/watchlist/search', { params: { q } });
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  const pickResult = (r) => {
    pickedRef.current = true;
    setShowResults(false);
    setResults([]);
    setActiveIdx(-1);
    setForm((f) => ({ ...f, name: r.name, symbol: r.symbol }));
    fillFromSymbol(r.symbol);
  };

  const onNameKeyDown = (e) => {
    if (!showResults || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); pickResult(results[activeIdx]); }
    else if (e.key === 'Escape') { setShowResults(false); }
  };

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const removeStock = useMutation({
    mutationFn: (id) => api.delete(`/watchlist/${id}`),
    onSuccess: (_res, id) => queryClient.setQueryData(['watchlist'], (old = []) => old.filter((w) => w.id !== id)),
  });

  const submitAdd = (e) => {
    e.preventDefault();
    const priceNum = parseFloat(form.price);
    const highNum = form.high !== '' ? parseFloat(form.high) : null;
    const nameOk = !!form.name.trim();
    const sectorOk = !!form.sector;
    const priceOk = form.price !== '' && priceNum > 0;
    setErrors({ name: !nameOk, sector: !sectorOk, price: !priceOk });
    if (!nameOk || !sectorOk || !priceOk) return;
    addStock.mutate({
      name: form.name.trim(),
      sector: form.sector,
      price: priceNum,
      symbol: form.symbol || null,
      high52w: Number.isFinite(highNum) ? highNum : null,
    });
  };

  const handleMarkBought = (w) => openBuyModal(w.id, w.name, Number(w.signal.entryLow));

  const handleRemove = (w) => {
    const held = heldIds.has(w.id);
    if (held && !confirm(`${w.name} has an open position. Remove it from your watchlist anyway? Your position will stay in Positions.`)) return;
    removeStock.mutate(w.id);
  };

  if (isLoading) return <p style={{ padding: 20 }}>Loading watchlist…</p>;

  const withSignal = items.filter((w) => w.signalId).length;
  const held = items.filter((w) => heldIds.has(w.id)).length;
  const watchingOnly = items.filter((w) => !w.signalId && !heldIds.has(w.id)).length;

  return (
    <div>
      <div className="metrics">
        <div className="mc"><div className="mc-l">Watching</div><div className="mc-v b">{items.length}</div></div>
        <div className="mc"><div className="mc-l">With signals</div><div className="mc-v g">{withSignal}</div></div>
        <div className="mc"><div className="mc-l">Held</div><div className="mc-v p">{held}</div></div>
        <div className="mc"><div className="mc-l">Watching only</div><div className="mc-v a">{watchingOnly}</div></div>
      </div>

      <div className="sec-hdr">
        <div className="sec-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
          My watchlist
        </div>
        <button className="btn" onClick={() => setShowAdd((v) => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Add stock
        </button>
      </div>

      {showAdd && (
        <form className="add-panel" onSubmit={submitAdd}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--g9)' }}>Add stock to watchlist</div>
          <div className="add-grid">
            <div className="fld" style={{ position: 'relative' }}>
              <label>Stock / symbol</label>
              <input
                type="text"
                placeholder="e.g. Tata, Infosys, WIPRO..."
                value={form.name}
                autoComplete="off"
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={onNameKeyDown}
                onFocus={() => { if (results.length) setShowResults(true); }}
                onBlur={() => { setTimeout(() => setShowResults(false), 150); runLookup(); }}
                className={errors.name ? 'err' : ''}
              />
              {showResults && (searching || results.length > 0) && (
                <div
                  style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: '#fff', border: '1px solid var(--g2)', borderRadius: 8,
                    marginTop: 4, boxShadow: '0 6px 20px rgba(0,0,0,.12)', maxHeight: 260, overflowY: 'auto',
                  }}
                >
                  {searching && !results.length && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--g4)' }}>Searching…</div>}
                  {results.map((r, i) => (
                    <div
                      key={r.symbol}
                      onMouseDown={(e) => { e.preventDefault(); pickResult(r); }}
                      onMouseEnter={() => setActiveIdx(i)}
                      style={{
                        padding: '9px 12px', cursor: 'pointer', fontSize: 13,
                        background: i === activeIdx ? 'var(--g0)' : '#fff',
                        display: 'flex', justifyContent: 'space-between', gap: 10,
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <span style={{ color: 'var(--g4)', fontWeight: 700, flexShrink: 0 }}>{r.symbol}</span>
                    </div>
                  ))}
                </div>
              )}
              {looking && <div className="err-msg on" style={{ color: 'var(--g4)' }}>Looking up…</div>}
              {!looking && lookupMsg && (
                <div className="err-msg on" style={{ color: lookupMsg.ok ? '#16a34a' : '#dc2626' }}>{lookupMsg.text}</div>
              )}
              {!looking && !lookupMsg && errors.name && <div className="err-msg on">Enter a stock name.</div>}
            </div>
            <div className="fld">
              <label>Sector{form.symbol && form.sector ? ' · auto' : ''}</label>
              <select
                value={form.sector}
                onChange={(e) => { setForm({ ...form, sector: e.target.value }); setErrors((x) => ({ ...x, sector: false })); }}
                className={errors.sector ? 'err' : ''}
              >
                <option value="">— select sector —</option>
                {sectorOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {errors.sector && <div className="err-msg on">Pick a sector.</div>}
            </div>
            <div className="fld">
              <label>Current price (₹){form.symbol ? ' · auto' : ''}</label>
              <input type="number" placeholder="e.g. 218" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={errors.price ? 'err' : ''} />
              {errors.price && <div className="err-msg on">Enter a valid price.</div>}
            </div>
            <div className="fld">
              <label>52-week high (₹){form.symbol ? ' · auto' : ''}</label>
              <input type="number" placeholder="e.g. 280" value={form.high} onChange={(e) => setForm({ ...form, high: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-brand btn-lg" disabled={looking}>Add to watchlist</button>
            <button
              type="button"
              className="btn btn-lg"
              onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); setLookupMsg(null); setErrors({}); lastLookedUp.current = ''; setResults([]); setShowResults(false); }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div id="wl-list">
        {items.map((w) => {
          const sig = w.signal;
          const isHeld = heldIds.has(w.id);
          return (
            <div className="sig-card" key={w.id} style={{ borderLeft: `4px solid ${sig ? '#1a56db' : '#e5e7eb'}` }}>
              <div className="sig-body" style={{ padding: 14 }}>
                <div className="sig-top" style={{ marginBottom: sig ? 10 : 0 }}>
                  <div className="sig-left">
                    <div className="sig-name">{w.name}{w.symbol ? <span style={{ color: 'var(--g4)', fontWeight: 600 }}> · {w.symbol}</span> : null}</div>
                    <div className="sig-sector">{w.sector} · {R(w.price)}{w.high52w ? ` · 52w high ${R(w.high52w)}` : ''}</div>
                    <div className="sig-tags" style={{ marginTop: 5 }}>
                      {sig ? <span className={`tag ${TYPE_LABEL[sig.type]}`}>{TYPE_TEXT[sig.type]}</span> : <span className="tag tag-gray">Watching — no signal yet</span>}
                      {isHeld && <span className="tag tag-held">Held</span>}
                    </div>
                  </div>
                  {sig && (
                    <div className="sig-right">
                      <div className="sig-confidence" style={{ color: sig.confidence >= 70 ? '#16a34a' : sig.confidence >= 60 ? '#d97706' : '#dc2626' }}>{sig.confidence}%</div>
                      <div className="sig-conf-label">Confidence</div>
                    </div>
                  )}
                </div>
                {sig ? (
                  <div style={{ fontSize: 12, color: 'var(--g5)', marginBottom: 10, padding: '8px 10px', background: 'var(--g0)', borderRadius: 'var(--r)' }}>{sig.headline}</div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--g4)', padding: '4px 0' }}>System is scanning for a forward entry signal. You'll be alerted when conditions align.</div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {sig && !isHeld && <button className="btn btn-buy" onClick={() => handleMarkBought(w)}>Mark as bought</button>}
                  {sig && <button className="btn btn-brand" onClick={() => navigate('/signals')}>View full signal</button>}
                  {isHeld && <button className="btn" onClick={() => navigate('/positions')}>View position</button>}
                  <button className="btn btn-danger" onClick={() => handleRemove(w)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
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

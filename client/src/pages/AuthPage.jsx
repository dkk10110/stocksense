import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const BROKERS = ['Groww', 'Zerodha', 'Angel One', 'Upstox', 'Other'];
const RISK_OPTIONS = ['Conservative (2–5%)', 'Balanced (5–10%)', 'Aggressive (8–15%)'];

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [loginForm, setLoginForm] = useState({ email: 'rajnish@example.com', password: 'password123' });
  const [signupForm, setSignupForm] = useState({ name: '', email: '', phone: '', password: '', broker: BROKERS[0], riskPref: RISK_OPTIONS[1] });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const switchTab = (t) => { setMode(t); setError(''); setFieldErrors({}); };

  const submitLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!loginForm.email) { setError('Enter your email to sign in.'); return; }
    try {
      await login(loginForm.email, loginForm.password);
      navigate('/signals');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid email or password.');
    }
  };

  const submitSignup = async (e) => {
    e.preventDefault();
    setError('');
    const emailOk = /^\S+@\S+\.\S+$/.test(signupForm.email);
    const nameOk = !!signupForm.name.trim();
    setFieldErrors({ name: !nameOk, email: !emailOk });
    if (!nameOk || !emailOk) return;
    try {
      await signup(signupForm);
      navigate('/signals');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    }
  };

  return (
    <div id="auth">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="auth-icon">
            <svg viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
          </div>
          <div className="auth-h">Stock<span>Sense</span> AI</div>
          <div className="auth-sub">Forward signals. Buy before the move. Profit in 15 days.</div>
        </div>
        <div className="auth-card">
          <div className="auth-tabs">
            <button className={`at-btn${mode === 'login' ? ' on' : ''}`} onClick={() => switchTab('login')}>Sign in</button>
            <button className={`at-btn${mode === 'signup' ? ' on' : ''}`} onClick={() => switchTab('signup')}>Create account</button>
          </div>
          {error && <div className="auth-error on">{error}</div>}

          {mode === 'login' && (
            <form className="af on" onSubmit={submitLogin}>
              <div className="fld">
                <label>Email</label>
                <input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} />
              </div>
              <div className="fld">
                <label>Password</label>
                <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
              </div>
              <button className="btn-primary" type="submit">Sign in</button>
              <p className="auth-note"><Link to="/forgot-password">Forgot password?</Link></p>
              <p className="auth-note">Demo: rajnish@example.com / password123 — tap Sign in to explore with pre-loaded forward signals.</p>
            </form>
          )}

          {mode === 'signup' && (
            <form className="af on" onSubmit={submitSignup}>
              <div className="frow">
                <div className="fld">
                  <label>Full name</label>
                  <input type="text" placeholder="Rajnish Kumar" value={signupForm.name} onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })} className={fieldErrors.name ? 'err' : ''} />
                  {fieldErrors.name && <div className="err-msg on">Enter your name.</div>}
                </div>
                <div className="fld">
                  <label>Email</label>
                  <input type="email" placeholder="you@email.com" value={signupForm.email} onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })} className={fieldErrors.email ? 'err' : ''} />
                  {fieldErrors.email && <div className="err-msg on">Enter a valid email.</div>}
                </div>
              </div>
              <div className="fld">
                <label>Phone (Telegram alerts)</label>
                <input type="tel" placeholder="+91 98765 43210" value={signupForm.phone} onChange={(e) => setSignupForm({ ...signupForm, phone: e.target.value })} />
              </div>
              <div className="frow">
                <div className="fld">
                  <label>Password</label>
                  <input type="password" placeholder="Create password" value={signupForm.password} onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })} />
                </div>
                <div className="fld">
                  <label>Primary broker</label>
                  <select value={signupForm.broker} onChange={(e) => setSignupForm({ ...signupForm, broker: e.target.value })}>
                    {BROKERS.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="fld">
                <label>Risk preference</label>
                <select value={signupForm.riskPref} onChange={(e) => setSignupForm({ ...signupForm, riskPref: e.target.value })}>
                  {RISK_OPTIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <button className="btn-primary" type="submit">Create account & start</button>
              <p className="auth-note">Free personal use. No subscription.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    }
  };

  if (!token) {
    return (
      <div id="auth">
        <div className="auth-box">
          <div className="auth-card">
            <div className="auth-error on">This reset link is missing its token. Request a new one.</div>
            <p className="auth-note"><Link to="/forgot-password">Request a new reset link</Link></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="auth">
      <div className="auth-box">
        <div className="auth-logo">
          <div className="auth-icon">
            <svg viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
          </div>
          <div className="auth-h">Stock<span>Sense</span> AI</div>
          <div className="auth-sub">Set a new password</div>
        </div>
        <div className="auth-card">
          {done ? (
            <p className="auth-note">Password reset. Redirecting to sign in…</p>
          ) : (
            <form onSubmit={submit}>
              {error && <div className="auth-error on">{error}</div>}
              <div className="fld">
                <label>New password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
              </div>
              <div className="fld">
                <label>Confirm password</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
              </div>
              <button className="btn-primary" type="submit">Reset password</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

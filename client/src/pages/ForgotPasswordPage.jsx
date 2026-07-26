import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
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
          <div className="auth-sub">Reset your password</div>
        </div>
        <div className="auth-card">
          {sent ? (
            <p className="auth-note">If an account exists with that email, a reset link has been sent. Check your inbox (and the server console, if this is a local dev setup without email configured).</p>
          ) : (
            <form onSubmit={submit}>
              {error && <div className="auth-error on">{error}</div>}
              <div className="fld">
                <label>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button className="btn-primary" type="submit">Send reset link</button>
            </form>
          )}
          <p className="auth-note"><Link to="/login">Back to sign in</Link></p>
        </div>
      </div>
    </div>
  );
}

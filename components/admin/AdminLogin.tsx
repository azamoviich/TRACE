import React, { useState } from 'react';
import { traceApi } from '../../services/traceApi';

export const AdminLogin: React.FC<{ onLogin: (token: string) => void }> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      const { token } = await traceApi.admin.login(password);
      localStorage.setItem('trace_admin_token', token);
      onLogin(token);
    } catch (ex: any) {
      // Distinguish a rejected password from the request never reaching the
      // server — a network/5xx failure isn't "wrong password". traceApi's
      // helpers throw `Error("${status}: ${body}")`, so sniff the prefix.
      const msg = String(ex?.message ?? '');
      setErr(msg.startsWith('401') || msg.startsWith('403') ? 'Wrong password' : 'Could not reach the server — try again');
    } finally {
      setLoading(false);
    }
  };

  // Same sign-in look as the tenant login (TRACE-mockups admin.html); the
  // admin panel is an internal English-only tool.
  return (
    <div className="rd rd-gate rd-login">
      <div className="gate-wrap">
        <div className="gate-brand"><span className="brand-mark" aria-hidden="true" /><span>TRACE</span></div>
        <p className="gate-sub">Admin panel</p>
        <form className="gate-card" onSubmit={submit}>
          <div className="fld">
            <label htmlFor="adm-pw">Password</label>
            <input id="adm-pw" className="in" type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus autoComplete="current-password" aria-invalid={!!err || undefined} />
          </div>
          {err && <p className="ferr" role="alert">{err}</p>}
          <button type="submit" className="btn solid gate-go" disabled={loading || !password}>
            {loading ? <span className="gate-spin" aria-label="Signing in" /> : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
};

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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[320px]">
        <div className="mb-8 text-center">
          <h1 className="font-display text-[24px] font-black text-text tracking-[0.25em]">TRACE</h1>
          <p className="text-[9px] uppercase tracking-[0.3em] text-muted mt-1">Admin Panel</p>
        </div>
        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.18em] text-muted mb-2 font-medium">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              className="w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-text text-[14px] focus:border-primary focus:outline-none transition-colors"
            />
          </div>
          {err && <p className="text-danger text-[11px]">{err}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 rounded-lg text-[13px] transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
};

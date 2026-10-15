// Screens before the dashboard, in the redesign look (TRACE-mockups admin.html
// login + owner app splash): boot splash, sign-in (web, and the exe's variant
// with QR pairing), and the demo's POS / theme pickers. Styles: styles/rd/gate.css.
import React, { useEffect, useRef, useState } from 'react';
import { Language } from '../../types';
import { TRANSLATIONS, nextLang, tr } from '../../constants';
import { isDemoTenant, tenantAuth, desktopCrossTenantLogin, createQrSession, pollQrSession, QrSession, isTauriApp } from '../../services/traceApi';

const Mark: React.FC<{ big?: boolean }> = ({ big }) => <span className={`brand-mark${big ? ' big' : ''}`} aria-hidden="true" />;

/** Full-screen launch state: mark, wordmark, a thin sweeping bar. */
export const RdSplash: React.FC<{ label?: string }> = ({ label }) => (
  <div className="rd rd-gate rd-splash" role="status" aria-live="polite" aria-label={label ?? 'TRACE'}>
    <span className="sp-mark"><Mark big /></span>
    <span className="sp-word">TRACE</span>
    <span className="sp-bar"><span /></span>
  </div>
);

const LangBtn: React.FC<{ lang: Language; setLang: (l: Language) => void }> = ({ lang, setLang }) => (
  <button type="button" className="gate-lang" onClick={() => setLang(nextLang(lang))} aria-label={tr(lang, 'Язык', 'Language', 'Til')}>
    <i className="ph ph-globe" aria-hidden="true" />{lang.toUpperCase()}
  </button>
);

export const RdLogin: React.FC<{ onLogin: (remember: boolean) => void; lang: Language; setLang: (l: Language) => void }> = ({ onLogin, lang, setLang }) => {
  const t = TRANSLATIONS[lang];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginVal, setLoginVal] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const demo = isDemoTenant();
  const exe = isTauriApp();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const trimmedLogin = loginVal.trim();
    const ok = demo
      ? (trimmedLogin === 'admin' && passwordVal === '123')
      : await tenantAuth(trimmedLogin, passwordVal);
    // Exe: credentials for a different restaurant redirect there instead.
    if (!ok && await desktopCrossTenantLogin(trimmedLogin, passwordVal, rememberMe)) return;
    setLoading(false);
    if (ok) onLogin(rememberMe);
    else setError(tr(lang, 'Неверный логин или пароль', 'Invalid login or password', "Login yoki parol noto'g'ri"));
  };

  // QR login — exe only, real tenants only. Never runs in a plain browser tab.
  const [qrSession, setQrSession] = useState<QrSession | null>(null);
  const [qrStatus, setQrStatus] = useState<'pending' | 'expired' | 'confirmed'>('pending');
  const rememberMeRef = useRef(rememberMe);
  rememberMeRef.current = rememberMe;
  useEffect(() => {
    if (demo || !exe) return;
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | undefined;
    const startSession = async () => {
      const session = await createQrSession();
      if (cancelled) return;
      if (!session) { setTimeout(startSession, 3000); return; } // backend hiccup — keep retrying quietly
      setQrSession(session);
      setQrStatus('pending');
      pollId = setInterval(async () => {
        const status = await pollQrSession(session.sessionId);
        if (cancelled) return;
        if (status === 'confirmed') {
          setQrStatus('confirmed');
          clearInterval(pollId);
          setTimeout(() => onLogin(rememberMeRef.current), 500);
        } else if (status === 'expired') {
          setQrStatus('expired');
          clearInterval(pollId);
          setTimeout(startSession, 1200);
        }
      }, 2000);
    };
    startSession();
    return () => { cancelled = true; if (pollId) clearInterval(pollId); };
  }, []);

  const withQr = exe && !demo;
  return (
    <div className="rd rd-gate rd-login">
      <LangBtn lang={lang} setLang={setLang} />
      <div className={`gate-wrap${withQr ? ' wide' : ''}`}>
        <div className="gate-brand"><Mark /><span>TRACE</span></div>
        <p className="gate-sub">{demo ? tr(lang, 'Демо: логин admin, пароль 123', 'Demo: login admin, password 123', 'Demo: login admin, parol 123') : 'Restaurant OS'}</p>
        <div className="gate-row">
          <form className="gate-card" onSubmit={handleLogin}>
            <div className="fld">
              <label htmlFor="gate-login">{tr(lang, 'Логин', 'Login', 'Login')}</label>
              <input id="gate-login" className="in" type="text" value={loginVal} onChange={e => setLoginVal(e.target.value)} autoComplete="username"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus aria-invalid={!!error || undefined} />
            </div>
            <div className="fld">
              <label htmlFor="gate-pw">{t.password}</label>
              <span className="pw">
                <input id="gate-pw" className="in" type={showPw ? 'text' : 'password'} value={passwordVal} onChange={e => setPasswordVal(e.target.value)} autoComplete="current-password" aria-invalid={!!error || undefined} />
                <button type="button" className="pw-eye" onClick={() => setShowPw(v => !v)} aria-label={showPw ? tr(lang, 'Скрыть пароль', 'Hide password', 'Parolni yashirish') : tr(lang, 'Показать пароль', 'Show password', "Parolni ko'rsatish")}>
                  <i className={`ph ${showPw ? 'ph-eye-slash' : 'ph-eye'}`} aria-hidden="true" />
                </button>
              </span>
            </div>
            <label className="gate-check">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
              <span>{t.remember_me}</span>
            </label>
            {error && <p className="ferr" role="alert">{error}</p>}
            <button type="submit" className="btn solid gate-go" disabled={loading || !loginVal || !passwordVal}>
              {loading ? <span className="gate-spin" aria-label={tr(lang, 'Входим…', 'Signing in…', 'Kirilmoqda…')} /> : tr(lang, 'Войти', 'Sign in', 'Kirish')}
            </button>
          </form>

          {withQr && (
            <div className="gate-card gate-qr">
              <p className="qr-t">{tr(lang, 'Вход через телефон', 'Sign in with your phone', 'Telefon orqali kirish')}</p>
              <div className={`qr-box ${qrStatus}`}>
                {qrSession ? <img src={qrSession.qrDataUrl} alt="QR" /> : <span className="gate-spin dark" />}
                {qrStatus === 'expired' && <span className="qr-over"><span className="gate-spin dark" /></span>}
                {qrStatus === 'confirmed' && <span className="qr-over ok"><i className="ph ph-check" aria-hidden="true" /></span>}
              </div>
              <p className="qr-hint">{qrStatus === 'expired' ? t.qr_login_expired : qrStatus === 'confirmed' ? t.qr_login_confirmed : t.qr_login_hint}</p>
            </div>
          )}
        </div>
        <p className="gate-legal">
          {t.legal_agree_prefix}{' '}
          <a href="https://trace-os.uz/privacy" target="_blank" rel="noopener noreferrer">{t.legal_privacy}</a>
          {' '}{t.legal_and}{' '}
          <a href="https://trace-os.uz/terms" target="_blank" rel="noopener noreferrer">{t.legal_terms}</a>
        </p>
      </div>
    </div>
  );
};

/** Two big choices (demo POS, first-run theme). */
const RdChoice: React.FC<{ kicker?: string; title: string; sub: string; options: { key: string; label: string; preview: React.ReactNode }[]; onChoose: (k: string) => void }> = ({ kicker, title, sub, options, onChoose }) => (
  <div className="rd rd-gate rd-choice">
    <div className="gate-wrap">
      <div className="gate-brand"><Mark /><span>TRACE</span></div>
      {kicker && <p className="gate-kicker">{kicker}</p>}
      <h1>{title}</h1>
      <p className="gate-sub">{sub}</p>
      <div className="choice-grid">
        {options.map(o => (
          <button key={o.key} type="button" className="choice" onClick={() => onChoose(o.key)}>
            <span className="choice-pv">{o.preview}</span>
            <span className="choice-l">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

export const RdDemoPosPicker: React.FC<{ lang: Language; onChoose: (p: 'iiko' | 'poster') => void }> = ({ lang, onChoose }) => (
  <RdChoice
    kicker={tr(lang, 'Демо · данные вымышленные', 'Demo · sample data', "Demo · namuna ma'lumotlar")}
    title={tr(lang, 'Какую кассу показать?', 'Which POS should we show?', "Qaysi kassani ko'rsataylik?")}
    sub={tr(lang, 'Демо подстроится под вашу систему', 'The demo adapts to your system', 'Demo tizimingizga moslashadi')}
    options={[
      { key: 'iiko', label: 'iiko', preview: <span className="pos-word">iiko</span> },
      { key: 'poster', label: 'Poster POS', preview: <span className="pos-word">Poster</span> },
    ]}
    onChoose={k => onChoose(k as 'iiko' | 'poster')}
  />
);

export const RdThemePicker: React.FC<{ lang: Language; onChoose: (t: 'light' | 'dark') => void }> = ({ lang, onChoose }) => (
  <RdChoice
    title={tr(lang, 'Как будет выглядеть TRACE?', 'How should TRACE look?', "TRACE qanday ko'rinsin?")}
    sub={tr(lang, 'Поменять можно в любой момент в настройках', 'You can change this any time in Settings', "Buni istalgan vaqtda Sozlamalarda o'zgartirish mumkin")}
    options={[
      { key: 'light', label: tr(lang, 'Светлая', 'Light', "Yorug'"), preview: <span className="theme-pv light"><i /><i /><i /></span> },
      { key: 'dark', label: tr(lang, 'Тёмная', 'Dark', "Qorong'i"), preview: <span className="theme-pv dark"><i /><i /><i /></span> },
    ]}
    onChoose={k => onChoose(k as 'light' | 'dark')}
  />
);

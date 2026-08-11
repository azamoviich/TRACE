import React, { useState, useEffect } from 'react';
import { ViewState, Language } from './types';
import { TopNav } from './components/TopNav';
import { AskAI } from './components/AskAI';
import { ToastContainer, ToastMessage, ToastType } from './components/Toast';
import { Dashboard } from './components/views/Dashboard';
import { Reviews } from './components/views/Reviews';
import { Loyalty } from './components/views/Loyalty';
import { Sales } from './components/views/Sales';
import { Operations } from './components/views/Operations';
import { Financial } from './components/views/Financial';
import { Reports } from './components/views/Reports';
import { Settings } from './components/views/Settings';
import { Admin } from './components/views/Admin';
import { Compare } from './components/views/Compare';
import { Globe, Sun, Moon } from 'lucide-react';
import { TRANSLATIONS, nextLang, tr } from './constants';
import { isAdminSubdomain, isDemoTenant, isManagerPortal, getServiceInspectorRawSlug, LIVE_MODE, tenantAuth, verifyTenantToken, clearTenantToken, traceApi, getActiveBranchId, setActiveBranch, BranchSummary, ALL_BRANCHES_ID, staffLogin, getStaffToken, clearStaffToken, StaffLoginResult } from './services/traceApi';
import { ManagerPortal } from './components/ManagerPortal';
import { ServiceInspectorPublic } from './components/ServiceInspectorPublic';
import { ServiceInspector } from './components/views/ServiceInspector';
import { PWAInstallGuide } from './components/PWAInstallGuide';
import { Sidebar } from './components/Sidebar';
import {
  NavStyle, MobileNavStyle, NAV_STYLE_KEY, MOBILE_NAV_STYLE_KEY, HIDDEN_PAGES_KEY, DEFAULT_PAGE_KEY, ACCENT_KEY, LOGO_URL_KEY,
  loadNavStyle, loadMobileNavStyle, loadHiddenPages, loadDefaultPage, loadAccent, applyAccent, loadLogoUrl,
} from './components/navConfig';

const Login: React.FC<{ onLogin: (remember: boolean) => void; onStaffLogin: (info: StaffLoginResult) => void; lang: Language; setLang: (l: Language) => void }> = ({ onLogin, onStaffLogin, lang, setLang }) => {
  const [staffMode, setStaffMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginVal, setLoginVal] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const t = TRANSLATIONS[lang];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (staffMode) {
      const result = await staffLogin(loginVal, passwordVal);
      setLoading(false);
      if (result) onStaffLogin(result);
      else setError(tr(lang, 'Неверный логин или пароль', 'Invalid login or password', 'Login yoki parol noto\'g\'ri'));
      return;
    }
    const ok = isDemoTenant()
      ? (loginVal === 'admin' && passwordVal === '123')
      : await tenantAuth(loginVal, passwordVal);
    setLoading(false);
    if (ok) onLogin(rememberMe);
    else setError(tr(lang, 'Неверный логин или пароль', 'Invalid login or password', 'Login yoki parol noto\'g\'ri'));
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-5 right-5 z-20">
        <button
          onClick={() => setLang(nextLang(lang))}
          className="text-muted hover:text-text flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.15em] glass glass-hover px-3 py-1.5 rounded-full transition-colors"
        >
          <Globe size={13} />
          {lang.toUpperCase()}
        </button>
      </div>

      <div className="w-full max-w-[360px] animate-slide-up">
        <div className="mb-10 text-center">
          <div className="inline-flex w-14 h-14 rounded-[18px] glass overflow-hidden mb-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <img src="/trace-logo.png" alt="TRACE" className="w-full h-full object-cover invert dark:invert-0"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          </div>
          <h1 className="font-display text-[28px] font-black text-text tracking-[0.25em] leading-none">TRACE</h1>
          <p className="text-[9px] uppercase tracking-[0.3em] text-muted mt-2">Restaurant OS</p>
        </div>

        <div className="glass rounded-[28px] p-7 shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.18em] text-muted mb-2 font-medium">{t.login}</label>
              <input type="text" value={loginVal} onChange={e => setLoginVal(e.target.value)} autoComplete="username"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-4 py-3 text-text text-[14px] focus:border-primary/60 focus:bg-white/[0.05] focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.18em] text-muted mb-2 font-medium">{t.password}</label>
              <input type="password" value={passwordVal} onChange={e => setPasswordVal(e.target.value)} autoComplete="current-password"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-4 py-3 text-text text-[14px] focus:border-primary/60 focus:bg-white/[0.05] focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all" />
            </div>
            {!staffMode && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary cursor-pointer" />
                <span className="text-[12px] text-muted">{t.remember_me}</span>
              </label>
            )}
            {error && <p className="text-[12px] text-danger">{error}</p>}
            <button
              type="submit" disabled={loading || !loginVal || !passwordVal}
              className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded-2xl text-[13px] transition-all mt-1 flex items-center justify-center gap-2 disabled:opacity-70 shadow-[0_8px_24px_rgba(255,107,53,0.3)] hover:shadow-[0_8px_28px_rgba(255,107,53,0.45)] active:scale-[0.98]"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : t.enter_system}
            </button>
          </form>

          {!isDemoTenant() && (
            <button
              type="button"
              onClick={() => { setStaffMode(m => !m); setError(''); setLoginVal(''); setPasswordVal(''); }}
              className="w-full text-center text-[11px] text-muted hover:text-text mt-4 transition-colors"
            >
              {staffMode
                ? tr(lang, '← Вход владельца', '← Owner login', "← Egasi kirishi")
                : tr(lang, 'Вход для менеджера', 'Manager login', 'Menejer kirishi')}
            </button>
          )}
        </div>

        <p className="text-center text-[11px] text-muted mt-4 leading-relaxed">
          {t.legal_agree_prefix}{' '}
          <a href="https://trace-os.uz/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-text">{t.legal_privacy}</a>
          {' '}{t.legal_and}{' '}
          <a href="https://trace-os.uz/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-text">{t.legal_terms}</a>
        </p>
      </div>
    </div>
  );
};

const ThemePicker: React.FC<{ lang: Language; onChoose: (t: 'light' | 'dark') => void }> = ({ lang, onChoose }) => {
  return (
    <div className="min-h-screen bg-background text-text flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] text-center animate-fade-in">
        <div className="inline-flex w-14 h-14 rounded-[18px] glass overflow-hidden mb-6 shadow-[0_8px_32px_rgba(0,0,0,0.15)]">
          <img src="/trace-logo.png" alt="TRACE" className="w-full h-full object-cover invert dark:invert-0"
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
        <h1 className="text-[20px] font-bold mb-2">
          {tr(lang, 'Выберите тему оформления', 'Choose your appearance', "Ko'rinishni tanlang")}
        </h1>
        <p className="text-[14px] text-muted mb-8">
          {tr(lang, 'Вы всегда сможете изменить это в настройках', 'You can change this anytime in Settings', "Buni istalgan vaqtda Sozlamalarda o'zgartirishingiz mumkin")}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onChoose('light')}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-border hover:border-primary bg-card transition-colors"
          >
            <div className="w-full h-24 rounded-xl flex items-center justify-center" style={{ background: '#f7f5f2', border: '1px solid #e5e2dd' }}>
              <Sun size={28} color="#ff6b35" />
            </div>
            <span className="text-[15px] font-semibold text-text">{tr(lang, 'Светлая', 'Light', "Yorug'")}</span>
          </button>
          <button
            onClick={() => onChoose('dark')}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-border hover:border-primary bg-card transition-colors"
          >
            <div className="w-full h-24 rounded-xl flex items-center justify-center" style={{ background: '#1a1a1d', border: '1px solid #303036' }}>
              <Moon size={28} color="#ff6b35" />
            </div>
            <span className="text-[15px] font-semibold text-text">{tr(lang, 'Тёмная', 'Dark', 'Qora')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  if (isAdminSubdomain()) return <Admin />;
  if (isManagerPortal()) return <ManagerPortal />;
  if (getServiceInspectorRawSlug()) return <ServiceInspectorPublic />;

  const [isLoggedIn, setIsLoggedIn] = useState(() => isDemoTenant());
  const [authChecking, setAuthChecking] = useState(() => !isDemoTenant() && localStorage.getItem('trace_remember') === '1');
  const [staffSession, setStaffSession] = useState<StaffLoginResult | null>(() => {
    if (!getStaffToken()) return null;
    try { return JSON.parse(localStorage.getItem('trace_staff_session') ?? 'null'); } catch { return null; }
  });
  const [currentView, setCurrentView] = useState<ViewState>(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    const valid: ViewState[] = ['dashboard', 'sales', 'operations', 'financial', 'reviews', 'loyalty', 'reports', 'settings', 'compare', 'service_inspector'];
    return valid.includes(v as ViewState) ? (v as ViewState) : loadDefaultPage();
  });
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('trace_lang');
    return (saved === 'ru' || saved === 'en' || saved === 'uz') ? saved : 'ru';
  });
  const setLang = (l: Language) => { setLangState(l); localStorage.setItem('trace_lang', l); };
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('trace_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [themeChosen, setThemeChosen] = useState(() => localStorage.getItem('trace_theme') !== null);

  const [navStyle, setNavStyleState] = useState<NavStyle>(loadNavStyle);
  const setNavStyle = (s: NavStyle) => { setNavStyleState(s); localStorage.setItem(NAV_STYLE_KEY, s); };
  const [mobileNavStyle, setMobileNavStyleState] = useState<MobileNavStyle>(loadMobileNavStyle);
  const setMobileNavStyle = (s: MobileNavStyle) => { setMobileNavStyleState(s); localStorage.setItem(MOBILE_NAV_STYLE_KEY, s); };
  const [hiddenPages, setHiddenPagesState] = useState<ViewState[]>(loadHiddenPages);
  const setHiddenPages = (pages: ViewState[]) => { setHiddenPagesState(pages); localStorage.setItem(HIDDEN_PAGES_KEY, JSON.stringify(pages)); };

  // A page hidden while it was the active tab needs somewhere safe to land.
  useEffect(() => {
    if (hiddenPages.includes(currentView)) setCurrentView('dashboard');
  }, [hiddenPages]);

  const [defaultPage, setDefaultPageState] = useState<ViewState>(loadDefaultPage);
  const setDefaultPage = (p: ViewState) => { setDefaultPageState(p); localStorage.setItem(DEFAULT_PAGE_KEY, p); };

  const [accent, setAccentState] = useState<string>(loadAccent);
  const setAccent = (rgb: string) => { setAccentState(rgb); localStorage.setItem(ACCENT_KEY, rgb); applyAccent(rgb); };
  useEffect(() => { applyAccent(accent); }, []);

  const [logoUrl, setLogoUrlState] = useState<string | null>(loadLogoUrl);
  const setLogoUrl = (url: string | null) => {
    setLogoUrlState(url);
    if (url) localStorage.setItem(LOGO_URL_KEY, url); else localStorage.removeItem(LOGO_URL_KEY);
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const setTheme = (t: 'light' | 'dark') => {
    setThemeState(t);
    localStorage.setItem('trace_theme', t);
    setThemeChosen(true);
  };
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiContext, setAiContext] = useState<string>('');
  const [demoBannerVisible, setDemoBannerVisible] = useState(!LIVE_MODE);

  const [selectedBranch] = useState<string | null>(null);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(getActiveBranchId());
  const [hasChainServer, setHasChainServer] = useState(false);

  // Verify saved token on startup — kicks user out only if password explicitly changed
  useEffect(() => {
    if (!authChecking) return;
    verifyTenantToken().then(result => {
      if (result === true) setIsLoggedIn(true);
      else if (result === false) { localStorage.removeItem('trace_remember'); clearTenantToken(); }
      // null = network error: keep tokens, just show login (user can retry)
      setAuthChecking(false);
    });
  }, []);

  // Reset AI context when switching views so stale data doesn't bleed across sections
  useEffect(() => { setAiContext(''); }, [currentView]);

  // Load sibling branches once (multi-branch orgs only — empty for single-branch tenants)
  useEffect(() => {
    if (isDemoTenant()) return;
    traceApi.org.branches().then(setBranches).catch(() => {});
    traceApi.org.info().then(info => setHasChainServer(info.hasChainServer)).catch(() => {});
  }, []);

  // "All branches" only makes sense once there's more than one branch AND an
  // iikoChain server is configured for the org (see Admin.tsx Chain tab) —
  // otherwise there's no coherent combined source for OLAP-derived reports.
  const showAllBranchesOption = branches.length > 1 && hasChainServer;

  const handleSwitchBranch = (id: string | null) => {
    setActiveBranch(id);
    setActiveBranchId(id);
  };

  const t = TRANSLATIONS[lang];

  const showToast = (message: string, type: ToastType) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  if (authChecking) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
      <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>;
  }

  if (!isLoggedIn && !staffSession) {
    return <Login
      onLogin={(remember) => {
        if (remember) {
          localStorage.setItem('trace_remember', '1');
          // Promote token from sessionStorage → localStorage so it survives tab close
          const t = sessionStorage.getItem('trace_token');
          if (t) { localStorage.setItem('trace_token', t); sessionStorage.removeItem('trace_token'); }
        } else {
          localStorage.removeItem('trace_remember');
          // Keep token in sessionStorage only — clears when tab closes
          const t = localStorage.getItem('trace_token');
          if (t) { sessionStorage.setItem('trace_token', t); localStorage.removeItem('trace_token'); }
        }
        setIsLoggedIn(true);
      }}
      onStaffLogin={(info) => {
        localStorage.setItem('trace_staff_session', JSON.stringify(info));
        setStaffSession(info);
      }}
      lang={lang} setLang={setLang}
    />;
  }

  if (staffSession) {
    return (
      <div className="min-h-screen bg-background text-text font-sans selection:bg-primary/20">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <div className="sticky top-0 z-30 glass border-b border-white/[0.06] px-4 md:px-10 py-3 flex items-center justify-between">
          <div>
            <div className="font-display text-[15px] font-bold tracking-wide">{staffSession.displayName}</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted">{staffSession.roleName}</div>
          </div>
          <button
            onClick={() => { clearStaffToken(); localStorage.removeItem('trace_staff_session'); setStaffSession(null); }}
            className="text-[11px] text-muted hover:text-text glass glass-hover px-3 py-1.5 rounded-full transition-colors"
          >
            {tr(lang, 'Выйти', 'Log out', 'Chiqish')}
          </button>
        </div>
        <main className="px-4 md:px-10 py-5 md:py-8 max-w-[1400px] mx-auto">
          <ServiceInspector lang={lang} onShowToast={showToast} />
        </main>
      </div>
    );
  }

  if (!themeChosen) {
    return <ThemePicker lang={lang} onChoose={setTheme} />;
  }

  const renderContent = () => {
    const branchKey = activeBranchId ?? 'self';
    switch (currentView) {
      case 'dashboard':   return <Dashboard key={branchKey} lang={lang} onShowToast={showToast} branch={selectedBranch} onContextReady={setAiContext} />;
      case 'sales':       return <Sales key={branchKey} lang={lang} onShowToast={showToast} branch={selectedBranch} onContextReady={setAiContext} />;
      case 'operations':  return <Operations key={branchKey} lang={lang} onShowToast={showToast} branch={selectedBranch} onContextReady={setAiContext} branches={branches} isAllBranches={activeBranchId === ALL_BRANCHES_ID} />;
      case 'financial':   return <Financial key={branchKey} lang={lang} onShowToast={showToast} branch={selectedBranch} onContextReady={setAiContext} />;
      case 'reviews':     return <Reviews key={branchKey} lang={lang} onContextReady={setAiContext} />;
      case 'loyalty':     return <Loyalty key={branchKey} lang={lang} />;
      case 'reports':     return <Reports lang={lang} onShowToast={showToast} onNavigate={setCurrentView} />;
      case 'settings':    return (
        <Settings
          lang={lang}
          onShowToast={showToast}
          theme={theme}
          setTheme={setTheme}
          navStyle={navStyle}
          setNavStyle={setNavStyle}
          mobileNavStyle={mobileNavStyle}
          setMobileNavStyle={setMobileNavStyle}
          hiddenPages={hiddenPages}
          setHiddenPages={setHiddenPages}
          defaultPage={defaultPage}
          setDefaultPage={setDefaultPage}
          accent={accent}
          setAccent={setAccent}
          logoUrl={logoUrl}
          setLogoUrl={setLogoUrl}
        />
      );
      case 'compare':     return <Compare lang={lang} branches={branches} />;
      case 'service_inspector': return isDemoTenant() ? <Dashboard key={branchKey} lang={lang} onShowToast={showToast} branch={selectedBranch} onContextReady={setAiContext} /> : <ServiceInspector lang={lang} onShowToast={showToast} />;
      default:            return <Dashboard lang={lang} onShowToast={showToast} branch={selectedBranch} />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-text font-sans selection:bg-primary/20">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {navStyle === 'side' && (
        <Sidebar
          currentView={currentView}
          onNavigate={setCurrentView}
          onLogout={() => { localStorage.removeItem('trace_remember'); clearTenantToken(); setIsLoggedIn(false); }}
          lang={lang}
          hiddenPages={hiddenPages}
          logoUrl={logoUrl}
        />
      )}

      <TopNav
        currentView={currentView}
        onNavigate={setCurrentView}
        onLogout={() => { localStorage.removeItem('trace_remember'); clearTenantToken(); setIsLoggedIn(false); }}
        lang={lang}
        setLang={setLang}
        onOpenAI={() => setAiOpen(true)}
        branches={branches}
        activeBranchId={activeBranchId}
        onSwitchBranch={handleSwitchBranch}
        showAllBranchesOption={showAllBranchesOption}
        theme={theme}
        setTheme={setTheme}
        navStyle={navStyle}
        mobileNavStyle={mobileNavStyle}
        hiddenPages={hiddenPages}
        logoUrl={logoUrl}
      />

      {demoBannerVisible && (
        <div className={`fixed top-[52px] left-0 right-0 z-40 flex justify-center px-3 pt-2 ${navStyle === 'side' ? 'lg:pl-14' : ''}`}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl text-[11px] font-medium max-w-full glass"
            style={{ borderColor: 'rgba(245,158,11,0.22)', background: 'rgba(245,158,11,0.08)' }}>
            <span style={{ color: '#f59e0b' }}>⚠</span>
            <span className="text-muted truncate">
              {tr(lang, 'Демо-режим · Данные тестовые', 'Demo mode · Fictional data', 'Demo rejim · Sinov ma\'lumotlari')}
            </span>
            <button onClick={() => setDemoBannerVisible(false)}
              className="ml-auto flex-shrink-0 text-muted hover:text-text transition-colors text-[13px] leading-none">✕</button>
          </div>
        </div>
      )}

      <main className={`min-h-screen ${mobileNavStyle === 'bottom' ? 'pb-[76px] md:pb-0' : ''} ${demoBannerVisible ? 'pt-[96px]' : 'pt-[52px]'} ${navStyle === 'side' ? 'lg:pl-14' : ''}`}>
        <div className="px-4 md:px-10 py-5 md:py-8 max-w-[1400px] mx-auto">
          {renderContent()}
        </div>
      </main>

      <AskAI
        context={aiContext || (t[currentView as keyof typeof t] as string) || 'General'}
        lang={lang}
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
      />

      {!isDemoTenant() && <PWAInstallGuide lang={lang} />}
    </div>
  );
}

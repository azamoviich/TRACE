import React, { useState, useEffect } from 'react';
import { ViewState, Language } from './types';
import { TopNav } from './components/TopNav';
import { RdHeader, RdFooter, RdTabbar } from './components/rd/Shell';
import { RdSplash, RdLogin, RdDemoPosPicker, RdThemePicker } from './components/rd/Gate';
import { RdChat } from './components/rd/Chat';
import { ToastContainer, ToastMessage, ToastType } from './components/Toast';
import { Dashboard } from './components/views/Dashboard';
import { Reviews } from './components/views/Reviews';
import { Loyalty } from './components/views/Loyalty';
import { Sales } from './components/views/Sales';
import { Operations } from './components/views/Operations';
import { Financial } from './components/views/Financial';
import { Plan } from './components/views/Plan';
import { Reports } from './components/views/Reports';
import { Settings } from './components/views/Settings';
import { Admin } from './components/views/Admin';
import { Compare } from './components/views/Compare';
import { Checklists } from './components/views/Checklists';
import { Workforce } from './components/views/Workforce';
import { Employees } from './components/views/Employees';
import { Booking } from './components/views/Booking';
import { GuestBooking } from './components/guest/GuestBooking';
import { TRANSLATIONS, tr } from './constants';
import { isAdminSubdomain, isDemoTenant, isManagerPortal, isChecklistManagerHost, LIVE_MODE,  verifyTenantToken, clearTenantToken, traceApi, getActiveBranchId, setActiveBranch, BranchSummary, ALL_BRANCHES_ID, parseEmployeeChecklistHost, setDemoPos, isTauriApp, consumeBootstrapToken, getTenantRole, isBookingHost, bookingApi, BookingApiError } from './services/traceApi';
import { ManagerPortal } from './components/ManagerPortal';
import { ChecklistManagerPortal } from './components/ChecklistManagerPortal';
import { EmployeeChecklistPortal } from './components/EmployeeChecklistPortal';
import { PWAInstallGuide } from './components/PWAInstallGuide';
import { Sidebar } from './components/Sidebar';
import { useWindowMaximized } from './hooks/useWindowMaximized';
import {
  NAV_ITEMS, EMPLOYEE_APP_PAGE_IDS, NavStyle, MobileNavStyle, NAV_STYLE_KEY, MOBILE_NAV_STYLE_KEY, HIDDEN_PAGES_KEY, DEFAULT_PAGE_KEY, ACCENT_KEY, LOGO_URL_KEY,
  loadNavStyle, loadMobileNavStyle, loadHiddenPages, loadDefaultPage, loadAccent, applyAccent, loadLogoUrl,
} from './components/navConfig';

export default function App() {
  // Public guest booking page (book.trace-os.uz/{slug}, book.{slug}.trace-os.uz).
  if (isBookingHost()) return <GuestBooking />;
  if (isAdminSubdomain()) return <Admin />;
  if (isManagerPortal()) return <ManagerPortal />;
  if (isChecklistManagerHost()) return <ChecklistManagerPortal />;
  const employeeChecklistHost = parseEmployeeChecklistHost();
  if (employeeChecklistHost) return <EmployeeChecklistPortal roleSlug={employeeChecklistHost.roleSlug} tenantSubdomain={employeeChecklistHost.tenantSubdomain} />;

  // Handed off by the exe's launcher after a first-run login/QR there (see
  // consumeBootstrapToken) — must run before isLoggedIn/authChecking read
  // localStorage below, and only once (StrictMode double-invokes lazy
  // initializers, but the second run finds no ?bootstrapToken= left to consume).
  const [bootstrapped] = useState(consumeBootstrapToken);

  const [isLoggedIn, setIsLoggedIn] = useState(() => isDemoTenant() || bootstrapped);
  // Logging out in the exe must send the device back to the restaurant
  // picker (launcher/index.html), not just re-show this same tenant's own
  // login form — this exe is a single shared download used by every
  // customer, so a different owner needs to be able to sign into their own
  // restaurant from here. switchAccount=1 tells the launcher's init() to
  // skip its "jump straight to the remembered tenant" shortcut even if this
  // device still has one saved (see launcher/index.html).
  const handleLogout = () => {
    localStorage.removeItem('trace_remember');
    clearTenantToken();
    if (isTauriApp()) {
      // Driven from Rust (src-tauri's `sign_out` command) rather than a
      // plain window.location.href — navigating tauri.localhost via JS from
      // this remote origin hit ERR_CONNECTION_REFUSED on WebView2. Falls
      // back to the old direct navigation if an older installed exe doesn't
      // have the command yet.
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('sign_out'))
        .catch(() => { window.location.href = 'https://tauri.localhost/index.html?switchAccount=1'; });
      return;
    }
    setIsLoggedIn(false);
  };
  const [authChecking, setAuthChecking] = useState(() => !isDemoTenant() && !bootstrapped && localStorage.getItem('trace_remember') === '1');
  const [currentView, setCurrentView] = useState<ViewState>(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    const valid: ViewState[] = ['dashboard', 'sales', 'operations', 'financial', 'plan', 'reviews', 'loyalty', 'reports', 'settings', 'compare', 'checklists', 'employees', 'workforce', 'booking'];
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
  // Demo tenants get asked every load — no persistence — so switching POS/theme
  // to compare demos doesn't require clearing localStorage by hand.
  const [themeChosen, setThemeChosen] = useState(() => !isDemoTenant() && localStorage.getItem('trace_theme') !== null);
  const [demoPosChosen, setDemoPosChosen] = useState(() => !isDemoTenant());

  const [navStyle, setNavStyleState] = useState<NavStyle>(loadNavStyle);
  const setNavStyle = (s: NavStyle) => { setNavStyleState(s); localStorage.setItem(NAV_STYLE_KEY, s); };
  // 'auto' tracks the actual window state (maximized -> side nav, normal -> top nav);
  // an explicit 'top'/'side' choice in Settings stays pinned regardless of window size.
  const isWindowMaximized = useWindowMaximized();
  const effectiveNavStyle: 'top' | 'side' = navStyle === 'auto' ? (isWindowMaximized ? 'side' : 'top') : navStyle;
  const [mobileNavStyle, setMobileNavStyleState] = useState<MobileNavStyle>(loadMobileNavStyle);
  const setMobileNavStyle = (s: MobileNavStyle) => { setMobileNavStyleState(s); localStorage.setItem(MOBILE_NAV_STYLE_KEY, s); };
  // Restricted marketer login: only Reviews + Loyalty exist for this account.
  const isMarketing = isLoggedIn && !isDemoTenant() && getTenantRole() === 'marketing';
  // Restricted hostess login: only Booking exists for this account.
  const isHostess = isLoggedIn && !isDemoTenant() && getTenantRole() === 'hostess';
  const isRestricted = isMarketing || isHostess;
  const [hiddenPagesState, setHiddenPagesState] = useState<ViewState[]>(loadHiddenPages);
  // План и факт exists only for iiko restaurants (GET /plan/meta); hidden
  // from the nav until that's confirmed so other venues never see it flash.
  const [planAvailable, setPlanAvailable] = useState<boolean | null>(null);
  // Employee App is a per-tenant add-on switched on in the admin panel
  // (GET /settings/feature-flags). Off or still unknown → its pages don't exist.
  const [employeeAppEnabled, setEmployeeAppEnabled] = useState<boolean | null>(null);
  // Бронирование is rolled out restaurant by restaurant (backend BOOKING_SUBDOMAINS);
  // hidden until the API confirms it's open here.
  const [bookingAvailable, setBookingAvailable] = useState<boolean | null>(null);
  // Pages this tenant doesn't have at all — unlike hiddenPagesState these are
  // never the user's choice, so they're kept out of Settings and localStorage.
  const unavailablePages: ViewState[] = [
    ...(planAvailable ? [] : ['plan' as ViewState]),
    ...(employeeAppEnabled ? [] : EMPLOYEE_APP_PAGE_IDS),
    ...(bookingAvailable ? [] : ['booking' as ViewState]),
  ];
  const hiddenPages: ViewState[] = isMarketing
    ? NAV_ITEMS.map(n => n.id).filter(id => id !== 'reviews' && id !== 'loyalty')
    : isHostess
    ? NAV_ITEMS.map(n => n.id).filter(id => id !== 'booking')
    : [...hiddenPagesState, ...unavailablePages];
  const setHiddenPages = (pages: ViewState[]) => { setHiddenPagesState(pages); localStorage.setItem(HIDDEN_PAGES_KEY, JSON.stringify(pages)); };

  // A page hidden while it was the active tab needs somewhere safe to land.
  useEffect(() => {
    if (currentView === 'plan' && planAvailable === null) return; // still checking — don't bounce a ?view=plan deep link
    if (EMPLOYEE_APP_PAGE_IDS.includes(currentView) && employeeAppEnabled === null && !hiddenPagesState.includes(currentView)) return; // same for ?view=employees etc.
    if (currentView === 'booking' && bookingAvailable === null) return;
    if (hiddenPages.includes(currentView)) setCurrentView('dashboard');
  }, [hiddenPages]);

  useEffect(() => {
    if (isMarketing && currentView !== 'reviews' && currentView !== 'loyalty') setCurrentView('reviews');
    if (isHostess && currentView !== 'booking') setCurrentView('booking');
  }, [isMarketing, isHostess, currentView]);

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
  // AI context per page: kept pages report theirs once, so remember each.
  const [aiContexts, setAiContexts] = useState<Partial<Record<ViewState, string>>>({});
  // Pages opened so far (kept mounted, see the page container below).
  const [visited, setVisited] = useState<{ key: string; views: ViewState[] }>({ key: '', views: [] });
  const ctxSetters = React.useRef(new Map<ViewState, (c: string) => void>());
  const ctxSetter = (v: ViewState) => {
    let f = ctxSetters.current.get(v);
    if (!f) { f = (c: string) => setAiContexts(m => (m[v] === c ? m : { ...m, [v]: c })); ctxSetters.current.set(v, f); }
    return f;
  };

  const [demoBannerVisible, setDemoBannerVisible] = useState(!LIVE_MODE);

  const [selectedBranch] = useState<string | null>(null);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  // A deep link (e.g. a Telegram review notification) can carry ?branch=<id>
  // to force the right sibling branch open — sessionStorage's saved
  // selection is per-origin, not per-link, so without this a manager who'd
  // previously switched to viewing a different branch on this same
  // subdomain would land back on that stale branch instead of the one the
  // notification was actually about.
  const [activeBranchId, setActiveBranchId] = useState<string | null>(() => {
    const linked = new URLSearchParams(window.location.search).get('branch');
    if (linked) { setActiveBranch(linked); return linked; }
    return getActiveBranchId();
  });
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


  // Only "booking_off" hides it — other errors (e.g. "All branches" selected) keep the section.
  useEffect(() => {
    if (!isLoggedIn || isMarketing) return;
    bookingApi.settings.get()
      .then(() => setBookingAvailable(true))
      .catch(e => setBookingAvailable(!(e instanceof BookingApiError && e.code === 'booking_off')));
  }, [isLoggedIn, isMarketing]);

  // "All branches" keeps the page visible — it explains plans are per-branch.
  useEffect(() => {
    if (!isLoggedIn || isRestricted) return;
    traceApi.plan.meta()
      .then(m => setPlanAvailable(m.supported || m.reason === 'all_branches'))
      .catch(() => setPlanAvailable(false));
  }, [isLoggedIn, isRestricted, activeBranchId]);

  useEffect(() => {
    if (!isLoggedIn || isRestricted) return;
    traceApi.settings.featureFlags()
      .then(f => setEmployeeAppEnabled(!!f.employeeAppEnabled))
      .catch(() => setEmployeeAppEnabled(false));
  }, [isLoggedIn, isRestricted]);

  // Load sibling branches once (multi-branch orgs only — empty for single-branch tenants)
  useEffect(() => {
    if (isDemoTenant() || isRestricted) return;
    traceApi.org.branches().then(setBranches).catch(() => {});
    traceApi.org.info().then(info => setHasChainServer(info.hasChainServer)).catch(() => {});
  }, [isRestricted]);

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

  if (authChecking) return <RdSplash />;

  if (!isLoggedIn) {
    return <RdLogin
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
      lang={lang} setLang={setLang}
    />;
  }

  if (!demoPosChosen) {
    return <RdDemoPosPicker lang={lang} onChoose={(p) => { setDemoPos(p); setDemoPosChosen(true); }} />;
  }

  if (!themeChosen) {
    return <RdThemePicker lang={lang} onChoose={setTheme} />;
  }

  const effectiveView = (v: ViewState): ViewState => isMarketing && v !== 'loyalty' ? 'reviews' : isHostess ? 'booking' : v;
  const renderContent = (view: ViewState) => {
    const branchKey = activeBranchId ?? 'self';
    // Add-on off (or flag still loading on a ?view= deep link) — never mount
    // these views, they'd only fire requests the backend refuses.
    if (EMPLOYEE_APP_PAGE_IDS.includes(view) && !employeeAppEnabled) return null;
    const setAiContext = ctxSetter(view);
    switch (view) {
      case 'dashboard':   return <Dashboard key={branchKey} lang={lang} onShowToast={showToast} branch={selectedBranch} onContextReady={setAiContext} onOpenPlan={planAvailable && !hiddenPages.includes('plan') ? () => setCurrentView('plan') : undefined} onNavigate={setCurrentView} />;
      case 'sales':       return <Sales key={branchKey} lang={lang} onShowToast={showToast} branch={selectedBranch} onContextReady={setAiContext} />;
      case 'operations':  return <Operations key={branchKey} lang={lang} onShowToast={showToast} branch={selectedBranch} onContextReady={setAiContext} branches={branches} isAllBranches={activeBranchId === ALL_BRANCHES_ID} onNavigate={setCurrentView} />;
      case 'financial':   return <Financial key={branchKey} lang={lang} onShowToast={showToast} branch={selectedBranch} onContextReady={setAiContext} onNavigate={setCurrentView} />;
      case 'plan':        return <Plan key={branchKey} lang={lang} onShowToast={showToast} onContextReady={setAiContext} />;
      case 'reviews':     return <Reviews key={branchKey} lang={lang} onContextReady={setAiContext} />;
      case 'loyalty':     return <Loyalty key={branchKey} lang={lang} />;
      case 'checklists':  return <Checklists key={branchKey} lang={lang} onShowToast={showToast} />;
      case 'employees':   return <Employees key={branchKey} lang={lang} onShowToast={showToast} />;
      case 'workforce':   return <Workforce key={branchKey} lang={lang} onShowToast={showToast} />;
      case 'booking':     return <Booking key={branchKey} lang={lang} onShowToast={showToast} />;
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
          hiddenPages={hiddenPagesState}
          unavailablePages={unavailablePages}
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
      default:            return <Dashboard lang={lang} onShowToast={showToast} branch={selectedBranch} />;
    }
  };

  // Redesigned pages render their own markup under .rd; the rest still use
  // Tailwind and sit in the same container with the new tokens.
  const REDESIGNED: Partial<Record<ViewState, string>> = { dashboard: 'dash', sales: 'sales', operations: 'ops', financial: 'fin', employees: 'staff', plan: 'plan', reviews: 'reviews', booking: 'book' };
  // Pages stay mounted once opened (hidden when not current), so going back
  // to one is instant instead of a fresh load behind skeletons.
  const shownView = effectiveView(currentView);
  const aiContext = aiContexts[shownView] ?? '';
  const branchKeyNow = activeBranchId ?? 'self';
  const visitedViews = visited.key === branchKeyNow ? visited.views : [];
  if (!visitedViews.includes(shownView)) setVisited({ key: branchKeyNow, views: [...visitedViews, shownView] });

  return (
    <div className="rd-app">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* display:contents — the sticky header must sit directly in .rd-app,
          or sticky can't outlive this wrapper and the bar scrolls away. */}
      <div className="rd rd-contents">
        <RdHeader
          currentView={currentView}
          onNavigate={setCurrentView}
          onLogout={handleLogout}
          lang={lang}
          setLang={setLang}
          onOpenAI={isRestricted ? undefined : () => setAiOpen(true)}
          branches={branches}
          activeBranchId={activeBranchId}
          onSwitchBranch={handleSwitchBranch}
          showAllBranchesOption={showAllBranchesOption}
          theme={theme}
          setTheme={setTheme}
          hiddenPages={hiddenPages}
          logoUrl={logoUrl}
        />
        {demoBannerVisible && (
          <div className="rd-demo">
            <b>{tr(lang, 'Демо', 'Demo', 'Demo')}</b>
            <span>{tr(lang, 'Данные примерные, касса не подключена', 'Sample data, no POS connected', "Namuna ma'lumotlar, kassa ulanmagan")}</span>
            <button onClick={() => setDemoBannerVisible(false)}>{tr(lang, 'Скрыть', 'Hide', 'Yashirish')}</button>
          </div>
        )}
      </div>

      <main id="content" className="rd-main">
        {(visitedViews.includes(shownView) ? visitedViews : [...visitedViews, shownView]).map(v => {
          const rd = REDESIGNED[v];
          return (
            <div key={`${v}|${branchKeyNow}`} hidden={v !== shownView} className={rd ? `rd-page rd rd-${rd}` : 'rd-page rd-legacy'}>
              {renderContent(v)}
            </div>
          );
        })}
      </main>

      <div className="rd">
        <RdFooter lang={lang} />
        <RdTabbar currentView={currentView} onNavigate={setCurrentView} lang={lang} hiddenPages={hiddenPages}
          hasBranches={branches.length > 1} onOpenAI={isRestricted ? undefined : () => setAiOpen(true)} />
      </div>

      {!isRestricted && <div className="rd rd-contents"><RdChat
        context={aiContext || (t[currentView as keyof typeof t] as string) || 'General'}
        lang={lang}
        view={shownView}
        open={aiOpen}
        onOpen={() => setAiOpen(true)}
        onClose={() => setAiOpen(false)}
      /></div>}

      {!isDemoTenant() && <PWAInstallGuide lang={lang} />}
    </div>
  );
}

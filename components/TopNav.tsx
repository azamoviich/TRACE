import React, { useState } from 'react';
import {
  LogOut, Menu, X, Globe, Sparkles, GitCompare, Sun, Moon,
} from 'lucide-react';
import { ViewState, Language } from '../types';
import { TRANSLATIONS, nextLang, tr } from '../constants';
import { BranchSummary, ALL_BRANCHES_ID } from '../services/traceApi';
import { NAV_ITEMS, NavStyle, MobileNavStyle } from './navConfig';

interface TopNavProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
  lang: Language;
  setLang: (l: Language) => void;
  onOpenAI?: () => void;
  branches?: BranchSummary[];
  activeBranchId?: string | null;
  onSwitchBranch?: (id: string | null) => void;
  // Only true when the org has an iikoChain server configured — gates the
  // "All branches" option (see traceApi.org.info / Admin.tsx Chain tab).
  showAllBranchesOption?: boolean;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  // Customizable from Settings — see components/navConfig.ts.
  navStyle: NavStyle;
  mobileNavStyle: MobileNavStyle;
  hiddenPages: ViewState[];
  logoUrl: string | null;
}

const NAV = NAV_ITEMS;

const COMPARE_NAV = { id: 'compare' as ViewState, icon: GitCompare };

// Spring easing: slight overshoot feels snappy
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
// Stagger per item: 22ms offset
const STAGGER = 22;

export const TopNav: React.FC<TopNavProps> = ({
  currentView, onNavigate, onLogout, lang, setLang, onOpenAI,
  branches = [], activeBranchId, onSwitchBranch, showAllBranchesOption, theme, setTheme,
  navStyle, mobileNavStyle, hiddenPages, logoUrl,
}) => {
  const t = TRANSLATIONS[lang];
  const [navHovered, setNavHovered] = useState(false);
  const [itemHover, setItemHover] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const showBranches = branches.length > 1;
  const baseNav = NAV.filter(n => !hiddenPages.includes(n.id));
  const navItems = showBranches ? [...baseNav, COMPARE_NAV] : baseNav;

  // Mobile bottom tab bar: primary 4 sections always visible + "More" sheet for the rest.
  // In drawer mode there's no bottom bar, so the sheet carries every item instead.
  const BOTTOM_NAV = mobileNavStyle === 'bottom' ? navItems.slice(0, 4) : [];
  const MORE_NAV = mobileNavStyle === 'bottom' ? navItems.slice(4) : navItems;

  const handleNav = (id: string) => {
    onNavigate(id as ViewState);
    setMobileOpen(false);
  };

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 h-[52px] glass-strong flex items-center px-5 md:px-8 shadow-[0_4px_16px_rgba(0,0,0,0.06)] ${navStyle === 'side' ? 'lg:pl-[72px]' : ''}`}>

        {/* Mobile menu trigger — only when the phone nav is set to drawer mode */}
        {mobileNavStyle === 'drawer' && (
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden mr-3 -ml-1 flex-shrink-0 text-muted hover:text-text transition-colors"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Logo — a custom upload from Settings replaces the wordmark */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Logo"
            onClick={() => handleNav('dashboard')}
            className="h-7 w-auto max-w-[120px] object-contain cursor-pointer select-none mr-6 flex-shrink-0 rounded"
          />
        ) : (
          <span
            className="font-display font-black text-[16px] tracking-[0.22em] text-text cursor-pointer select-none mr-6 flex-shrink-0"
            onClick={() => handleNav('dashboard')}
          >
            TRACE
          </span>
        )}

        <div className="hidden md:block w-px h-4 bg-border mr-6 flex-shrink-0" />

        {/* Desktop nav — hidden when the desktop nav style is set to sidebar */}
        <nav
          className={`${navStyle === 'side' ? 'lg:hidden' : ''} hidden md:flex items-center gap-0.5 flex-1 h-full`}
          onMouseEnter={() => setNavHovered(true)}
          onMouseLeave={() => { setNavHovered(false); setItemHover(null); }}
        >
          {navItems.map(({ id, icon: Icon }, i) => {
            const isActive = currentView === id;
            const isHov = itemHover === i;
            const delay = navHovered ? i * STAGGER : 0;

            return (
              <button
                key={id}
                onClick={() => handleNav(id)}
                onMouseEnter={() => setItemHover(i)}
                onMouseLeave={() => setItemHover(null)}
                className={`relative flex items-center h-8 rounded-[10px] flex-shrink-0 outline-none
                  ${isActive
                    ? 'bg-primary text-white shadow-[0_2px_12px_rgba(255,107,53,0.35)]'
                    : isHov
                      ? 'text-text bg-card-hover'
                      : 'text-muted'
                  }`}
                style={{
                  padding: navHovered ? '0 10px' : '0 8px',
                  gap: navHovered ? '6px' : '0px',
                  transition: [
                    `padding 280ms ${SPRING} ${delay}ms`,
                    `gap 280ms ${SPRING} ${delay}ms`,
                    'background-color 120ms ease',
                    'color 120ms ease',
                  ].join(', '),
                }}
              >
                {/* Icon — floats up slightly on hover */}
                <span
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    transform: isHov && !isActive ? 'translateY(-1px)' : 'translateY(0)',
                    transition: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <Icon size={15} />
                </span>

                {/* Label — slides out with spring */}
                <span
                  className="text-[12px] font-medium whitespace-nowrap overflow-hidden leading-none"
                  style={{
                    maxWidth: navHovered ? '90px' : '0px',
                    opacity: navHovered ? 1 : 0,
                    transition: [
                      `max-width 280ms ${SPRING} ${delay}ms`,
                      `opacity 200ms ${EASE_OUT} ${navHovered ? delay + 40 : 0}ms`,
                    ].join(', '),
                  }}
                >
                  {t[id as keyof typeof t] as string}
                </span>

                {/* Active underline dot — visible only when nav is resting */}
                {isActive && (
                  <span
                    className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white"
                    style={{
                      opacity: navHovered ? 0 : 0.6,
                      transform: navHovered ? 'translateX(-50%) scaleX(0)' : 'translateX(-50%) scaleX(1)',
                      transition: 'opacity 180ms ease, transform 220ms ease',
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-4 ml-auto flex-shrink-0">
          {/* Branch switcher */}
          {showBranches && onSwitchBranch && (
            <select
              value={activeBranchId ?? branches[0]?.id ?? ''}
              onChange={(e) => onSwitchBranch(e.target.value)}
              className="text-[14px] font-semibold text-text bg-transparent border border-border rounded-full px-3 h-9 outline-none glass-hover cursor-pointer max-w-[160px]"
              title={t.branch}
            >
              {showAllBranchesOption && (
                <option value={ALL_BRANCHES_ID} className="bg-card text-text">
                  {tr(lang, 'Все филиалы', 'All branches', 'Barcha filiallar')}
                </option>
              )}
              {branches.map(b => (
                <option key={b.id} value={b.id} className="bg-card text-text">{b.name}</option>
              ))}
            </select>
          )}

          {/* Live indicator */}
          <div className="hidden md:flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full bg-primary"
              style={{ animation: 'livePulse 2.4s ease-in-out infinite' }}
            />
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
              {tr(lang, 'В эфире', 'Live', 'Jonli')}
            </span>
          </div>

          <div className="hidden md:block w-px h-4 bg-border" />

          {onOpenAI && (
            <button
              onClick={onOpenAI}
              className="hidden md:flex items-center gap-1.5 px-3 h-7 rounded-full glass glass-hover text-primary transition-all duration-150 text-[11px] font-semibold"
              style={{ borderColor: 'rgba(255,107,53,0.25)' }}
            >
              <Sparkles size={12} />
              <span>Ask AI</span>
            </button>
          )}

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="hidden md:flex items-center justify-center w-7 h-7 rounded-full text-muted hover:text-text glass-hover transition-colors"
            title={tr(lang, 'Тема', 'Theme', 'Mavzu')}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          <button
            onClick={() => setLang(nextLang(lang))}
            className="flex items-center gap-1 text-[11px] uppercase tracking-[0.15em] text-muted hover:text-text font-semibold transition-colors px-2 h-7 rounded-full glass-hover"
          >
            <Globe size={13} />
            {lang}
          </button>

          <button
            onClick={onLogout}
            className="hidden md:flex items-center gap-1.5 text-[11px] text-muted hover:text-danger transition-colors"
          >
            <LogOut size={13} />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col">
          <div className="absolute inset-0 bg-black/80" onClick={() => setMobileOpen(false)} />
          <div className="relative bg-surface border-b border-border max-h-screen overflow-y-auto rounded-b-3xl">
            <div className="flex items-center justify-between px-5 h-[52px] sticky top-0 z-10">
              <span className="font-display font-black text-[16px] tracking-[0.22em] text-text">TRACE</span>
              <button onClick={() => setMobileOpen(false)} className="text-muted hover:text-text">
                <X size={18} />
              </button>
            </div>
            <nav className="px-4 pb-6 space-y-1">
              {MORE_NAV.map(({ id, icon: Icon }) => {
                const isActive = currentView === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleNav(id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-medium transition-colors ${
                      isActive ? 'bg-primary text-white shadow-[0_2px_12px_rgba(255,107,53,0.35)]' : 'text-muted hover:text-text hover:bg-card-hover'
                    }`}
                  >
                    <Icon size={17} />
                    {t[id as keyof typeof t]}
                  </button>
                );
              })}
              {onOpenAI && (
                <button
                  onClick={() => { onOpenAI(); setMobileOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-medium text-primary hover:bg-primary/10 transition-colors border-t border-border pt-4 mt-2"
                >
                  <Sparkles size={17} />
                  Ask AI
                </button>
              )}
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-medium text-muted hover:text-text hover:bg-card-hover transition-colors"
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                {theme === 'dark'
                  ? tr(lang, 'Светлая тема', 'Light mode', 'Yorug\' mavzu')
                  : tr(lang, 'Тёмная тема', 'Dark mode', 'Qora mavzu')}
              </button>
              <button
                onClick={() => { onLogout(); setMobileOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-medium text-muted hover:text-danger hover:bg-danger/8 transition-colors mt-2 border-t border-border pt-4"
              >
                <LogOut size={17} />
                {t.logout}
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar — only in 'bottom' phone nav style; 'drawer' style uses the burger + sheet instead */}
      {mobileNavStyle === 'bottom' && (
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch bg-surface border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {BOTTOM_NAV.map(({ id, icon: Icon }) => {
          const isActive = currentView === id;
          return (
            <button
              key={id}
              onClick={() => handleNav(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-medium transition-colors ${
                isActive ? 'text-primary' : 'text-muted'
              }`}
            >
              <Icon size={20} />
              {t[id as keyof typeof t] as string}
            </button>
          );
        })}
        <button
          onClick={() => setMobileOpen(true)}
          className={`flex-1 flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-medium transition-colors ${
            mobileOpen || MORE_NAV.some(({ id }) => id === currentView) ? 'text-primary' : 'text-muted'
          }`}
        >
          <Menu size={20} />
          {t.more}
        </button>
      </nav>
      )}
    </>
  );
};

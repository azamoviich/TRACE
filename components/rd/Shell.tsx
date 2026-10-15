// Redesign shell (TRACE-mockups, Oct 2026): quiet top bar with text nav,
// account menu, "ask about the data" bar, status footer and a phone tab bar.
// Styles: styles/rd/shell.css (scoped under .rd).
import React, { useEffect, useRef, useState } from 'react';
import { ViewState, Language } from '../../types';
import { TRANSLATIONS, nextLang, tr } from '../../constants';
import { BranchSummary, ALL_BRANCHES_ID, getSubdomain, getTenantRole, traceApi, IntegrationStatus, isDemoTenant } from '../../services/traceApi';
import { NAV_ITEMS } from '../navConfig';

// Main sections shown as text links; everything else lives under "Ещё".
const PRIMARY: ViewState[] = ['dashboard', 'sales', 'operations', 'financial', 'employees', 'plan', 'reviews'];
const TAB_PRIMARY: { id: ViewState; icon: string }[] = [
  { id: 'dashboard', icon: 'ph-house' },
  { id: 'sales', icon: 'ph-chart-bar' },
  { id: 'operations', icon: 'ph-squares-four' },
  { id: 'financial', icon: 'ph-wallet' },
];
const ICONS: Partial<Record<ViewState, string>> = {
  dashboard: 'ph-house', sales: 'ph-chart-bar', operations: 'ph-squares-four', financial: 'ph-wallet',
  plan: 'ph-target', reviews: 'ph-star', loyalty: 'ph-heart', employees: 'ph-users', checklists: 'ph-list-checks',
  workforce: 'ph-chats-circle', reports: 'ph-file-text', settings: 'ph-gear-six', compare: 'ph-git-diff',
};

export const SUPPORT_PHONE = '+998 71 205 48 17';
export const SUPPORT_TEL = 'tel:+998712054817';

function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
}

function initials(name: string) {
  const parts = name.replace(/[-_.]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? 'T') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;

// Mockup wording for section names (falls back to TRANSLATIONS).
export function navLabel(id: ViewState, lang: Language): string {
  if (id === 'dashboard') return tr(lang, 'Главная', 'Home', 'Bosh sahifa');
  if (id === 'plan') return tr(lang, 'План и факт', 'Plan vs actual', 'Reja va fakt');
  return (TRANSLATIONS[lang] as Record<string, string>)[id] ?? id;
}

interface HeaderProps {
  currentView: ViewState;
  onNavigate: (v: ViewState) => void;
  onLogout: () => void;
  lang: Language;
  setLang: (l: Language) => void;
  onOpenAI?: () => void;
  branches: BranchSummary[];
  activeBranchId: string | null;
  onSwitchBranch: (id: string | null) => void;
  showAllBranchesOption: boolean;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  hiddenPages: ViewState[];
  logoUrl: string | null;
}

function useNav(hiddenPages: ViewState[], hasBranches: boolean) {
  const visible = NAV_ITEMS.map(n => n.id).filter(id => !hiddenPages.includes(id));
  // "Сотрудники" in the mockup — when the employee module is off, fall back to nothing.
  const primary = PRIMARY.filter(id => visible.includes(id));
  const rest = [...visible.filter(id => !primary.includes(id)), ...(hasBranches ? ['compare' as ViewState] : [])];
  return { primary, rest };
}

export const RdHeader: React.FC<HeaderProps> = ({
  currentView, onNavigate, onLogout, lang, setLang, onOpenAI, branches, activeBranchId, onSwitchBranch,
  showAllBranchesOption, theme, setTheme, hiddenPages, logoUrl,
}) => {
  const t = TRANSLATIONS[lang] as Record<string, string>;
  const [acctOpen, setAcctOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  useOutside(acctRef, acctOpen, () => setAcctOpen(false));
  useOutside(moreRef, moreOpen, () => setMoreOpen(false));
  const { primary, rest } = useNav(hiddenPages, branches.length > 1);

  // "/" opens the data chat, like the mockup's ask bar.
  useEffect(() => {
    if (!onOpenAI) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || el.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      onOpenAI();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenAI]);

  const tenant = cap(getSubdomain() || 'TRACE');
  const role = getTenantRole() === 'marketing' ? tr(lang, 'Маркетолог', 'Marketer', 'Marketolog') : tr(lang, 'Владелец', 'Owner', 'Egasi');
  const activeBranch = branches.find(b => b.id === activeBranchId) ?? branches[0];
  const branchLabel = activeBranchId === ALL_BRANCHES_ID
    ? tr(lang, 'Все филиалы', 'All branches', 'Barcha filiallar')
    : activeBranch?.name;
  const go = (id: ViewState) => { onNavigate(id); setMoreOpen(false); setAcctOpen(false); };
  const darkLabel = theme === 'dark' ? tr(lang, 'Светлая тема', 'Light theme', "Yorug' mavzu") : tr(lang, 'Тёмная тема', 'Dark theme', 'Qorongʻi mavzu');
  const langName = { ru: 'Русский', en: 'English', uz: "O'zbekcha" }[lang];

  return (
    <header className="top">
      <div className="top-inner">
        <a className="brand" href="#" onClick={e => { e.preventDefault(); go('dashboard'); }} aria-label={tr(lang, 'TRACE, на главную', 'TRACE, home', 'TRACE, bosh sahifa')}>
          {logoUrl
            ? <img src={logoUrl} alt="" className="rd-logo-img" />
            : <><span className="brand-mark" aria-hidden="true" /><span className="brand-word">TRACE</span></>}
        </a>

        {branches.length > 1 && (
          <label className="branch rd-branch" aria-label={t.branch}>
            <span className="rd-branch-txt">{tenant} · {branchLabel}</span> <span aria-hidden="true">▾</span>
            <select value={activeBranchId ?? branches[0]?.id ?? ''} onChange={e => onSwitchBranch(e.target.value)}>
              {showAllBranchesOption && <option value={ALL_BRANCHES_ID}>{tr(lang, 'Все филиалы', 'All branches', 'Barcha filiallar')}</option>}
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}

        <nav className="main" aria-label={tr(lang, 'Разделы', 'Sections', "Bo'limlar")}>
          {primary.map(id => (
            <a key={id} href={`?view=${id}`} aria-current={currentView === id ? 'page' : undefined}
              onClick={e => { e.preventDefault(); go(id); }}>{navLabel(id, lang)}</a>
          ))}
          {rest.length > 0 && (
            <div className="rd-more" ref={moreRef}>
              <button type="button" aria-haspopup="menu" aria-expanded={moreOpen}
                aria-current={rest.includes(currentView) ? 'page' : undefined}
                onClick={() => setMoreOpen(o => !o)}>
                {rest.includes(currentView) ? navLabel(currentView, lang) : t.more}
                <i className="ph ph-caret-down chev" aria-hidden="true" />
              </button>
              {moreOpen && (
                <div className="acct-menu rd-more-menu" role="menu">
                  {rest.map(id => (
                    <button key={id} role="menuitem" aria-current={currentView === id ? 'page' : undefined} onClick={() => go(id)}>
                      <i className={`ph ${ICONS[id] ?? 'ph-circle'}`} aria-hidden="true" />{navLabel(id, lang)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="top-right">
          {onOpenAI && (
            <button className="ask-bar" type="button" onClick={onOpenAI} aria-keyshortcuts="/"
              aria-label={tr(lang, 'Спросить по данным', 'Ask about the data', "Ma'lumotlar bo'yicha so'rash")}>
              <i className="ph ph-chat-teardrop-text" aria-hidden="true" />
              <span className="ask-txt">{tr(lang, 'Спросить по данным', 'Ask about the data', "Ma'lumot bo'yicha so'rash")}</span>
              <kbd>/</kbd>
            </button>
          )}
          <div className="acct" ref={acctRef}>
            <button className="acct-btn" aria-haspopup="menu" aria-expanded={acctOpen} onClick={() => setAcctOpen(o => !o)}>
              <span className="avatar" aria-hidden="true">{initials(tenant)}</span>
              <span className="acct-name">{tenant}<span className="acct-caret" aria-hidden="true"><i className="ph ph-caret-down" /></span></span>
            </button>
            {acctOpen && (
              <div className="acct-menu" role="menu">
                <div className="acct-who">
                  <div className="acct-full">{tenant}{isDemoTenant() ? ' · Demo' : ''}</div>
                  <div className="acct-role">{role}{branchLabel ? ` · ${branchLabel}` : ''}</div>
                </div>
                <button role="menuitem" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{darkLabel}</button>
                <button role="menuitem" onClick={() => setLang(nextLang(lang))}>{tr(lang, 'Язык', 'Language', 'Til')}: {langName}</button>
                {!hiddenPages.includes('settings') && <button role="menuitem" onClick={() => go('settings')}>{t.settings}</button>}
                <hr />
                <button role="menuitem" className="acct-out" onClick={() => { setAcctOpen(false); onLogout(); }}>{t.logout}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

// Status line under every page: POS sync state + support phone.
export const RdFooter: React.FC<{ lang: Language; pluginConnected?: boolean }> = ({ lang, pluginConnected }) => {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [at, setAt] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () => traceApi.sales.status()
      .then(s => { if (!alive) return; setStatus(s); setAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })); })
      .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const ok = tr(lang, 'подключено', 'connected', 'ulangan');
  const bad = tr(lang, 'нет связи', 'offline', 'aloqa yo‘q');
  const items: { name: string; ok: boolean; text: string }[] = [];
  if (status?.iikoServer) items.push({ name: 'iiko Server', ok: status.iikoServer.ok, text: status.iikoServer.ok ? `${tr(lang, 'синхронизация', 'synced', 'sinxron')} ${at}` : bad });
  if (status && !status.poster && pluginConnected) items.push({ name: 'iikoFront', ok: true, text: tr(lang, 'касса на связи', 'till online', 'kassa ulangan') });
  if (status?.iikoCloud) items.push({ name: 'iikoCloud', ok: status.iikoCloud.ok, text: status.iikoCloud.ok ? ok : bad });
  if (status?.poster) items.push({ name: 'Poster', ok: status.poster.ok, text: status.poster.ok ? `${tr(lang, 'синхронизация', 'synced', 'sinxron')} ${at}` : bad });
  const allOk = items.length > 0 && items.every(i => i.ok);
  return (
    <footer className="status">
      {items.map(i => <span key={i.name} className={i.ok ? 'ok' : 'rd-bad'}><b>{i.name}</b>: {i.text}</span>)}
      {items.length > 0 && (
        <span className={`sys-ph ${allOk ? 'ok' : 'rd-bad'}`}>
          <b>{allOk ? tr(lang, 'Касса на связи', 'POS online', 'Kassa ulangan') : tr(lang, 'Есть проблема со связью', 'Connection issue', 'Aloqada muammo')}</b>{at ? `, ${tr(lang, 'синхронизация', 'synced', 'sinxron')} ${at}` : ''}
        </span>
      )}
      <span className="support">{tr(lang, 'Поддержка TRACE', 'TRACE support', 'TRACE yordam')}: <a href={SUPPORT_TEL}>{SUPPORT_PHONE}</a></span>
    </footer>
  );
};

// Phone tab bar: four main sections + "Ещё" sheet with the rest.
export const RdTabbar: React.FC<{
  currentView: ViewState; onNavigate: (v: ViewState) => void; lang: Language; hiddenPages: ViewState[]; hasBranches: boolean;
  onOpenAI?: () => void;
}> = ({ currentView, onNavigate, lang, hiddenPages, hasBranches, onOpenAI }) => {
  const t = TRANSLATIONS[lang] as Record<string, string>;
  const [open, setOpen] = useState(false);
  const tabs = TAB_PRIMARY.filter(x => !hiddenPages.includes(x.id));
  const visible = NAV_ITEMS.map(n => n.id).filter(id => !hiddenPages.includes(id));
  const rest = [...visible.filter(id => !tabs.some(x => x.id === id)), ...(hasBranches ? ['compare' as ViewState] : [])];
  const go = (id: ViewState) => { onNavigate(id); setOpen(false); };
  return (
    <>
      <nav className="tabbar" aria-label={tr(lang, 'Разделы', 'Sections', "Bo'limlar")}>
        {tabs.map(x => (
          <a key={x.id} href={`?view=${x.id}`} aria-current={currentView === x.id ? 'page' : undefined} onClick={e => { e.preventDefault(); go(x.id); }}>
            <span className="tb-ico" aria-hidden="true"><i className={`ph ${x.icon}`} /></span>{navLabel(x.id, lang)}
          </a>
        ))}
        <a href="#" aria-current={rest.includes(currentView) || open ? 'page' : undefined} onClick={e => { e.preventDefault(); setOpen(true); }}>
          <span className="tb-ico" aria-hidden="true"><i className="ph ph-dots-three" /></span>{t.more}
        </a>
      </nav>
      {open && (
        <>
          <div className="sheet-scrim" onClick={() => setOpen(false)} />
          <div className="rd-sheet" role="dialog" aria-label={t.more}>
            <div className="rd-sheet-grip" />
            {onOpenAI && (
              <button className="rd-sheet-ask" onClick={() => { setOpen(false); onOpenAI(); }}>
                <i className="ph ph-chat-teardrop-text" aria-hidden="true" />{tr(lang, 'Спросить по данным', 'Ask about the data', "Ma'lumot bo'yicha so'rash")}
              </button>
            )}
            {rest.map(id => (
              <button key={id} aria-current={currentView === id ? 'page' : undefined} onClick={() => go(id)}>
                <i className={`ph ${ICONS[id] ?? 'ph-circle'}`} aria-hidden="true" />{navLabel(id, lang)}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
};

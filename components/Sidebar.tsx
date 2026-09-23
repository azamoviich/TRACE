import React from 'react';
import { LogOut } from 'lucide-react';
import { ViewState, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { NAV_ITEMS } from './navConfig';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
  lang: Language;
  hiddenPages: ViewState[];
  logoUrl: string | null;
}

// Desktop-only expanded rail: icon + label, one row per page, full panel
// width. Mobile navigation (bottom tabs or drawer) lives in TopNav — it
// already owns the mobile header/branch/theme/lang controls. Colors are the
// same theme-aware tokens the rest of the app uses (see index.html's
// --color-* vars) so this follows the light/dark toggle like everything else.
export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  onLogout,
  lang,
  hiddenPages,
  logoUrl,
}) => {
  const t = TRANSLATIONS[lang];
  const navItems = NAV_ITEMS.filter(({ id }) => !hiddenPages.includes(id));

  return (
    <aside className="hidden lg:flex fixed top-0 bottom-0 left-0 z-50 w-56 bg-card border-r border-border flex-col py-4 px-3 gap-1">
      <div className="flex items-center gap-2.5 mb-5 px-1 flex-shrink-0">
        <div className="w-8 h-8 flex-shrink-0 overflow-hidden rounded-lg">
          <img
            src={logoUrl || '/trace-logo.png'}
            alt="TRACE"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
              const p = e.currentTarget.parentElement;
              if (p) {
                p.style.background = '#ff6b35';
                p.innerHTML = '<span style="color:white;font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center;height:100%">T</span>';
              }
            }}
          />
        </div>
        {!logoUrl && (
          <span className="font-display font-black text-[14px] tracking-[0.2em] text-text truncate">TRACE</span>
        )}
      </div>

      <nav className="flex flex-col gap-1 flex-1 w-full overflow-y-auto">
        {navItems.map(({ id, icon: Icon }) => {
          const isActive = currentView === id;
          const label = t[id as keyof typeof t] as string;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`w-full h-10 rounded-xl flex items-center gap-3 px-3 flex-shrink-0 transition-all duration-150 ${
                isActive
                  ? 'bg-primary text-white shadow-[0_2px_12px_rgba(255,107,53,0.35)]'
                  : 'text-muted hover:text-text hover:bg-card-hover'
              }`}
            >
              <Icon size={17} className="flex-shrink-0" />
              <span className="text-[13px] font-medium truncate">{label}</span>
            </button>
          );
        })}
      </nav>

      <button
        onClick={onLogout}
        className="w-full h-10 rounded-xl flex items-center gap-3 px-3 flex-shrink-0 text-muted hover:text-danger hover:bg-danger/8 transition-all duration-150"
      >
        <LogOut size={17} className="flex-shrink-0" />
        <span className="text-[13px] font-medium truncate">{t.logout}</span>
      </button>
    </aside>
  );
};

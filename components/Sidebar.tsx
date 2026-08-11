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
}

// Desktop-only icon rail. Mobile navigation (bottom tabs or drawer) lives in
// TopNav — it already owns the mobile header/branch/theme/lang controls.
export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  onLogout,
  lang,
  hiddenPages,
}) => {
  const t = TRANSLATIONS[lang];
  const navItems = NAV_ITEMS.filter(({ id }) => !hiddenPages.includes(id));

  return (
    <aside className="hidden lg:flex fixed top-0 left-0 z-50 h-screen w-14 bg-[#080808] border-r border-border flex-col items-center py-4 gap-1">
      <div className="w-8 h-8 mb-4 flex-shrink-0 overflow-hidden rounded-lg">
        <img
          src="/trace-logo.png"
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

      <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
        {navItems.map(({ id, icon: Icon }) => {
          const isActive = currentView === id;
          const label = t[id as keyof typeof t] as string;
          return (
            <div key={id} className="relative group w-full">
              <button
                onClick={() => onNavigate(id)}
                className={`w-full h-9 rounded-xl flex items-center justify-center transition-all duration-150 ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-muted hover:text-text hover:bg-[#181818]'
                }`}
              >
                <Icon size={17} />
              </button>
              <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-[#1c1c1c] border border-border rounded-lg text-[11px] font-medium text-text whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                {label}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="relative group w-full px-2">
        <button
          onClick={onLogout}
          className="w-full h-9 rounded-xl flex items-center justify-center text-muted hover:text-danger hover:bg-danger/8 transition-all duration-150"
        >
          <LogOut size={17} />
        </button>
        <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-[#1c1c1c] border border-border rounded-lg text-[11px] font-medium text-text whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
          {t.logout}
        </div>
      </div>
    </aside>
  );
};

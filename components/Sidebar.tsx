import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Activity,
  DollarSign,
  Star,
  Heart,
  FileText,
  LogOut,
  X,
} from 'lucide-react';
import { ViewState, Language } from '../types';
import { TRANSLATIONS } from '../constants';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (val: boolean) => void;
  lang: Language;
}

const NAV = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'sales', icon: TrendingUp },
  { id: 'operations', icon: Activity },
  { id: 'financial', icon: DollarSign },
  { id: 'reviews', icon: Star },
  { id: 'loyalty', icon: Heart },
  { id: 'reports', icon: FileText },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  onLogout,
  isMobileOpen,
  setIsMobileOpen,
  lang,
}) => {
  const t = TRANSLATIONS[lang];

  const handleNav = (id: string) => {
    onNavigate(id as ViewState);
    if (window.innerWidth < 1024) setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile drawer — full-width text nav */}
      <div className={`
        fixed top-0 left-0 z-50 h-screen w-56 bg-[#080808] border-r border-border flex flex-col
        transition-transform duration-200 lg:hidden
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-border flex-shrink-0">
          <span className="font-display font-black text-[18px] tracking-[0.18em] text-text">TRACE</span>
          <button onClick={() => setIsMobileOpen(false)} className="text-muted hover:text-text transition-colors">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {NAV.map(({ id, icon: Icon }) => {
            const isActive = currentView === id;
            return (
              <button
                key={id}
                onClick={() => handleNav(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
                  isActive ? 'bg-primary text-white' : 'text-muted hover:text-text hover:bg-[#141414]'
                }`}
              >
                <Icon size={16} />
                {t[id as keyof typeof t]}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-muted hover:text-danger hover:bg-danger/8 transition-colors"
          >
            <LogOut size={16} />
            {t.logout}
          </button>
        </div>
      </div>

      {/* Desktop — icon-only 56px */}
      <aside className="hidden lg:flex fixed top-0 left-0 z-50 h-screen w-14 bg-[#080808] border-r border-border flex-col items-center py-4 gap-1">

        {/* Logo */}
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

        {/* Nav items */}
        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          {NAV.map(({ id, icon: Icon }) => {
            const isActive = currentView === id;
            const label = t[id as keyof typeof t] as string;
            return (
              <div key={id} className="relative group w-full">
                <button
                  onClick={() => handleNav(id)}
                  className={`w-full h-9 rounded-xl flex items-center justify-center transition-all duration-150 ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-muted hover:text-text hover:bg-[#181818]'
                  }`}
                >
                  <Icon size={17} />
                </button>
                {/* Tooltip */}
                <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-[#1c1c1c] border border-border rounded-lg text-[11px] font-medium text-text whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                  {label}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Logout */}
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
    </>
  );
};

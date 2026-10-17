import {
  LayoutDashboard, TrendingUp, Activity, DollarSign,
  Star, Heart, FileText, Settings2, ClipboardCheck, Target, UserRound, MessagesSquare, CalendarCheck,
} from 'lucide-react';
import { ViewState } from '../types';

export interface NavItem {
  id: ViewState;
  icon: typeof LayoutDashboard;
}

// Full nav, in menu order. 'compare' is appended dynamically when the
// tenant has multiple branches — it isn't user-hideable.
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'sales', icon: TrendingUp },
  { id: 'operations', icon: Activity },
  { id: 'booking', icon: CalendarCheck },
  { id: 'financial', icon: DollarSign },
  { id: 'plan', icon: Target },
  { id: 'reviews', icon: Star },
  { id: 'loyalty', icon: Heart },
  { id: 'employees', icon: UserRound },
  { id: 'checklists', icon: ClipboardCheck },
  { id: 'workforce', icon: MessagesSquare },
  { id: 'reports', icon: FileText },
  { id: 'settings', icon: Settings2 },
];

// Pages the user is allowed to hide from Settings. Dashboard and Settings
// stay pinned so there's always a way in and a way back to this screen.
export const HIDEABLE_PAGE_IDS: ViewState[] = [
  'sales', 'operations', 'booking', 'financial', 'plan', 'reviews', 'loyalty', 'reports', 'employees', 'checklists', 'workforce',
];

// Pages that belong to the Employee App add-on (admin panel → Employee Hub
// master toggle). With the module off they don't exist for the tenant at all —
// not in the nav, not in Settings' hide list — and the backend 403s the routes.
export const EMPLOYEE_APP_PAGE_IDS: ViewState[] = ['employees', 'checklists', 'workforce'];

export const NAV_STYLE_KEY = 'trace_nav_style';
export const MOBILE_NAV_STYLE_KEY = 'trace_mobile_nav_style';
export const HIDDEN_PAGES_KEY = 'trace_hidden_pages';
export const DEFAULT_PAGE_KEY = 'trace_default_page';
export const ACCENT_KEY = 'trace_accent';
export const LOGO_URL_KEY = 'trace_logo_url';

// 'auto' follows the window's maximized state (see hooks/useWindowMaximized) —
// side nav when maximized, top nav otherwise. 'top'/'side' are explicit user
// overrides from Settings and stay pinned regardless of window state.
export type NavStyle = 'top' | 'side' | 'auto';
export type MobileNavStyle = 'bottom' | 'drawer';

export function loadNavStyle(): NavStyle {
  const saved = localStorage.getItem(NAV_STYLE_KEY);
  return saved === 'side' || saved === 'top' ? saved : 'auto';
}

export function loadMobileNavStyle(): MobileNavStyle {
  return localStorage.getItem(MOBILE_NAV_STYLE_KEY) === 'drawer' ? 'drawer' : 'bottom';
}

export function loadHiddenPages(): ViewState[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HIDDEN_PAGES_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((id: string) => HIDEABLE_PAGE_IDS.includes(id as ViewState)) : [];
  } catch {
    return [];
  }
}

// The page a user lands on right after opening the app — must be one of the
// pages they haven't hidden, so this is re-validated against hiddenPages at
// use time rather than trusted blindly.
export const DEFAULT_PAGE_CHOICES: ViewState[] = ['dashboard', 'sales', 'operations', 'booking', 'financial', 'plan', 'reviews', 'loyalty', 'reports'];

export function loadDefaultPage(): ViewState {
  const saved = localStorage.getItem(DEFAULT_PAGE_KEY);
  return DEFAULT_PAGE_CHOICES.includes(saved as ViewState) ? (saved as ViewState) : 'dashboard';
}

// Accent colours (TRACE-mockups/owner/settings.js ACCENTS). `rgb` is the
// "R G B" triplet for the legacy --color-primary var; `light`/`dark` drive
// the redesign's --accent in each theme.
export interface AccentSwatch {
  id: string;
  rgb: string;
  light: string;
  dark: string;
  name: [string, string, string];
}

export const ACCENT_SWATCHES: AccentSwatch[] = [
  { id: 'orange', rgb: '255 107 53', light: '#E8642C', dark: '#F0784A', name: ['Оранжевый TRACE', 'TRACE orange', "TRACE to'q sariq"] },  // default
  { id: 'blue', rgb: '47 111 159', light: '#2F6F9F', dark: '#6FA6D6', name: ['Синий', 'Blue', "Ko'k"] },
  { id: 'green', rgb: '47 125 79', light: '#2F7D4F', dark: '#6BBF8A', name: ['Зелёный', 'Green', 'Yashil'] },
  { id: 'graphite', rgb: '28 27 25', light: '#1C1B19', dark: '#EDEAE4', name: ['Графит', 'Graphite', 'Grafit'] },
];

export function loadAccent(): string {
  const saved = localStorage.getItem(ACCENT_KEY);
  return saved && ACCENT_SWATCHES.some(s => s.rgb === saved) ? saved : ACCENT_SWATCHES[0].rgb;
}

function darken(rgb: string, amount = 0.85): string {
  return rgb.split(' ').map(n => Math.round(Number(n) * amount)).join(' ');
}

export function applyAccent(rgb: string) {
  document.documentElement.style.setProperty('--color-primary', rgb);
  document.documentElement.style.setProperty('--color-primary-hover', darken(rgb));
  // Redesign tokens: a style tag, so the .dark override keeps working.
  const sw = ACCENT_SWATCHES.find(s => s.rgb === rgb);
  let tag = document.getElementById('rd-accent');
  if (!sw || sw.id === 'orange') { tag?.remove(); return; }
  if (!tag) { tag = document.createElement('style'); tag.id = 'rd-accent'; document.head.appendChild(tag); }
  const soft = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  tag.textContent = `:root{--accent:${sw.light};--accent-soft:${soft(sw.light, 14)};--focus:${sw.light}}.dark{--accent:${sw.dark};--accent-soft:${soft(sw.dark, 18)};--focus:${sw.dark}}`;
}

export function loadLogoUrl(): string | null {
  return localStorage.getItem(LOGO_URL_KEY);
}

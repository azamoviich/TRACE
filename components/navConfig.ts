import {
  LayoutDashboard, TrendingUp, Activity, DollarSign,
  Star, Heart, FileText, ClipboardCheck, Settings2,
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
  { id: 'financial', icon: DollarSign },
  { id: 'reviews', icon: Star },
  { id: 'loyalty', icon: Heart },
  { id: 'reports', icon: FileText },
  { id: 'service_inspector', icon: ClipboardCheck },
  { id: 'settings', icon: Settings2 },
];

// Pages the user is allowed to hide from Settings. Dashboard and Settings
// stay pinned so there's always a way in and a way back to this screen.
export const HIDEABLE_PAGE_IDS: ViewState[] = [
  'sales', 'operations', 'financial', 'reviews', 'loyalty', 'reports', 'service_inspector',
];

export const NAV_STYLE_KEY = 'trace_nav_style';
export const MOBILE_NAV_STYLE_KEY = 'trace_mobile_nav_style';
export const HIDDEN_PAGES_KEY = 'trace_hidden_pages';
export const DEFAULT_PAGE_KEY = 'trace_default_page';
export const ACCENT_KEY = 'trace_accent';
export const LOGO_URL_KEY = 'trace_logo_url';

export type NavStyle = 'top' | 'side';
export type MobileNavStyle = 'bottom' | 'drawer';

export function loadNavStyle(): NavStyle {
  return localStorage.getItem(NAV_STYLE_KEY) === 'side' ? 'side' : 'top';
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
export const DEFAULT_PAGE_CHOICES: ViewState[] = ['dashboard', 'sales', 'operations', 'financial', 'reviews', 'loyalty', 'reports'];

export function loadDefaultPage(): ViewState {
  const saved = localStorage.getItem(DEFAULT_PAGE_KEY);
  return DEFAULT_PAGE_CHOICES.includes(saved as ViewState) ? (saved as ViewState) : 'dashboard';
}

// Accent color swatches — each is an "R G B" triplet matching the
// --color-primary custom property format set up in index.html, so applying
// one is just overwriting that CSS var on <html>. Hover shade is a fixed
// ~10% darken, computed at apply time rather than hand-picked per swatch.
export interface AccentSwatch {
  id: string;
  rgb: string;
}

export const ACCENT_SWATCHES: AccentSwatch[] = [
  { id: 'orange', rgb: '255 107 53' },  // TRACE default
  { id: 'blue', rgb: '37 99 235' },
  { id: 'green', rgb: '22 163 74' },
  { id: 'purple', rgb: '124 58 237' },
  { id: 'pink', rgb: '219 39 119' },
  { id: 'teal', rgb: '13 148 136' },
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
}

export function loadLogoUrl(): string | null {
  return localStorage.getItem(LOGO_URL_KEY);
}

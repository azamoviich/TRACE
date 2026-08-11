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

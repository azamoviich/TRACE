export interface Review {
  id: string;
  author: string;
  platform: 'Google' | 'TripAdvisor' | 'Yandex' | '2GIS' | 'Rahmat';
  rating: number;
  date: string;
  text: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface Metric {
  label: string;
  value: string;
  change: number; // percentage
  trend: 'up' | 'down' | 'neutral';
  isCurrency?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  orders: number;
  revenue: number;
  trend: 'up' | 'down';
  image?: string;
  description?: string;
  inStock?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
  chartData?: any; 
}

export interface IntegrationStatus {
  id: string;
  name: string;
  status: 'connected' | 'syncing' | 'error' | 'disconnected';
  lastSync: string;
  type: 'POS' | 'Accounting' | 'Database';
}

export type ViewState =
  | 'dashboard'
  | 'sales'
  | 'operations'
  | 'financial'
  | 'reviews'
  | 'loyalty'
  | 'reports'
  | 'settings'
  | 'compare'
  | 'checklists';

export type TimeRange = 'today' | '7days' | '30days' | 'month' | 'custom';

export interface ShiftFeedback {
  id?: string;
  table: string;
  note: string;
  time?: string;
  photos?: string[];
}

export interface ShiftReport {
  id: string;
  tenant_id: string;
  branch: string;
  shift: 'morning' | 'evening';
  date: string;
  manager_name: string;
  prev_manager: string | null;
  weather: string | null;
  cash_total: number | null;
  guests_count: number | null;
  avg_check: number | null;
  report_text: string;
  good_feedbacks: ShiftFeedback[];
  bad_feedbacks: ShiftFeedback[];
  status: 'good' | 'bad';
  created_at: string;
  tables_total: number | null;
  tables_covered: number | null;
}

export interface ChecklistRole {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface ChecklistEmployee {
  id: string;
  tenant_id: string;
  role_id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface ChecklistManager {
  id: string;
  name: string;
  portal_subdomain: string;
  active: boolean;
  created_at: string;
  role_ids: string[];
}

export type ChecklistItemType = 'checkbox' | 'yesno' | 'text' | 'number' | 'rating';

export type ChecklistAnswerValue = { text: string } | { number: number } | { rating: number };

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  text: string;
  sort_order: number;
  requires_photo: boolean;
  item_type: ChecklistItemType;
  active: boolean;
  // Present only when returned alongside completion state (employee "today" view)
  done?: boolean;
  photo_url?: string | null;
  answer_value?: ChecklistAnswerValue | null;
  completed_at?: string | null;
}

export interface Checklist {
  id: string;
  tenant_id: string;
  role_id: string;
  name: string;
  description: string;
  created_by: string;
  active: boolean;
  created_at: string;
}

export interface ChecklistWithItems {
  checklist: Checklist;
  items: ChecklistItem[];
}

export interface ChecklistTodayItem extends Checklist {
  items: ChecklistItem[];
}

export interface ChecklistStats {
  done: number;
  total: number;
  leaderboard: { employee_id: string; name: string; done: number; total: number }[];
  recentPhotos: { photo_url: string; completed_at: string; employee_name: string; item_text: string }[];
}

export type Language = 'ru' | 'en' | 'uz';

export type ComparisonPeriod = 'yesterday' | 'last_week' | 'last_month' | 'last_year';
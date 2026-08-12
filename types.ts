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
  | 'compare';

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

export type Language = 'ru' | 'en' | 'uz';

export type ComparisonPeriod = 'yesterday' | 'last_week' | 'last_month' | 'last_year';
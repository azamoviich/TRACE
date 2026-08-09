import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, RefreshCw, X, Check, ChevronRight,
  Copy, ExternalLink, LogOut, Zap,
  Globe, CheckCircle2,
  Building2, Activity, LayoutGrid, Pencil,
  Settings2, Star, KeyRound, Server, GripVertical,
} from 'lucide-react';
import { traceApi, Tenant, LiveStatus, RealtimeEvent, HallPlan, IikoSection, Organization } from '../../services/traceApi';
import { HallEditor } from '../HallEditor';

const DOMAIN = 'trace-os.uz';

// Manager portal (shift reports, report.trace-os.uz) is a custom feature
// built for Benedict Cafè only — hide its settings for every other tenant.
const MANAGER_PORTAL_ORG_ID = '0de2aed4-3217-4c01-971b-e8362546253f';

// ── helpers ──────────────────────────────────────────────────────────────────

function tenantUrl(subdomain: string) {
  return `https://${subdomain}.${DOMAIN}`;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function mask(s: string | null | undefined): string {
  if (!s) return '—';
  if (s.length <= 8) return '••••••••';
  return '••••' + s.slice(-4);
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// ── Form primitives ──────────────────────────────────────────────────────────

const inputBase = 'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-text text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted/40';

const FieldLabel: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <label className="block text-[9px] uppercase tracking-[0.18em] text-muted mb-1.5 font-medium">
    {children}{hint && <span className="text-muted/50 normal-case font-normal ml-1">{hint}</span>}
  </label>
);

const Field: React.FC<{
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
  min?: number;
  max?: number;
}> = ({ label, hint, value, onChange, placeholder, mono, type = 'text', min, max }) => (
  <div>
    <FieldLabel hint={hint}>{label}</FieldLabel>
    <input
      type={type}
      min={min}
      max={max}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`${inputBase} ${mono ? 'font-mono' : ''}`}
    />
  </div>
);

const PasswordField: React.FC<{
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, hint, value, onChange, placeholder }) => {
  const [show, setShow] = useState(false);
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className={`${inputBase} font-mono pr-12`}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors text-[10px] font-semibold px-1.5 py-1 rounded hover:bg-zinc-800"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
};

const ServerField: React.FC<{
  proto: 'http' | 'https';
  onProtoChange: (p: 'http' | 'https') => void;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}> = ({ proto, onProtoChange, value, onChange, label = 'iiko Server' }) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex rounded-lg overflow-hidden border border-border">
        {(['http', 'https'] as const).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onProtoChange(p)}
            className={`px-2.5 py-1 text-[10px] font-mono font-semibold transition-colors
              ${proto === p ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
    <div className="flex items-center border border-border rounded-lg overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
      <span className="px-3 text-[11px] text-muted font-mono bg-zinc-900/80 border-r border-border py-2.5 flex-shrink-0">{proto}://</span>
      <input
        type="text"
        placeholder="192.168.1.1:8080"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-background px-3 py-2.5 text-text text-[12px] font-mono focus:outline-none min-w-0 placeholder:text-muted/40"
      />
    </div>
  </div>
);

const SectionHeading: React.FC<{ icon: React.ReactNode; title: string; hint?: string }> = ({ icon, title, hint }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="text-primary">{icon}</span>
    <h3 className="text-[10px] uppercase tracking-[0.22em] font-semibold text-text">{title}</h3>
    {hint && <span className="text-[10px] text-muted normal-case tracking-normal">{hint}</span>}
  </div>
);

const SETTINGS_TABS = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'access', label: 'Access', icon: KeyRound },
] as const;

// Only shown when the tenant belongs to a multi-branch organization — the
// chain server is org-wide, editing it from any one branch's panel affects
// every sibling branch.
const CHAIN_TAB = { id: 'chain', label: 'Chain', icon: Server } as const;

type SettingsTab = typeof SETTINGS_TABS[number]['id'] | typeof CHAIN_TAB['id'];

const SettingsTabs: React.FC<{ active: SettingsTab; onChange: (t: SettingsTab) => void; showChain?: boolean }> = ({ active, onChange, showChain }) => (
  <div className="flex gap-1 mb-4 p-1 bg-zinc-900/60 rounded-lg border border-border/60">
    {[...SETTINGS_TABS, ...(showChain ? [CHAIN_TAB] : [])].map(t => (
      <button
        key={t.id}
        type="button"
        onClick={() => onChange(t.id)}
        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors
          ${active === t.id ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}
      >
        <t.icon size={11} />
        {t.label}
      </button>
    ))}
  </div>
);

const ReadRow: React.FC<{ label: string; children: React.ReactNode; mono?: boolean; stacked?: boolean }> = ({ label, children, mono, stacked }) => (
  stacked ? (
    <div>
      <span className="block text-[9px] text-muted uppercase tracking-[0.15em] mb-0.5">{label}</span>
      <span className={`text-[11px] text-text break-all ${mono ? 'font-mono' : ''}`}>{children}</span>
    </div>
  ) : (
    <div className="flex items-center gap-3">
      <span className="text-[9px] text-muted uppercase tracking-[0.15em] w-24 flex-shrink-0">{label}</span>
      <span className={`text-[12px] text-text ${mono ? 'font-mono' : ''}`}>{children}</span>
    </div>
  )
);

const Empty = () => <span className="text-muted italic">not set</span>;

const EVENT_TYPE_LABELS: Record<string, string> = {
  order_opened: 'Order opened',
  order_updated: 'Order updated',
  order_closed: 'Order closed',
  order_removed: 'Order removed',
  cashier_session_opened: 'Shift opened',
  cashier_session_closed: 'Shift closed',
  stop_list_added: 'Stop list',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  order_opened: 'text-emerald-400',
  order_updated: 'text-sky-400',
  order_closed: 'text-orange-400',
  order_removed: 'text-red-400',
  cashier_session_opened: 'text-violet-400',
  cashier_session_closed: 'text-violet-300',
  stop_list_added: 'text-amber-400',
};

// ── AdminLogin ────────────────────────────────────────────────────────────────

const AdminLogin: React.FC<{ onLogin: (token: string) => void }> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      const { token } = await traceApi.admin.login(password);
      localStorage.setItem('trace_admin_token', token);
      onLogin(token);
    } catch {
      setErr('Wrong password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[320px]">
        <div className="mb-8 text-center">
          <h1 className="font-display text-[24px] font-black text-text tracking-[0.25em]">TRACE</h1>
          <p className="text-[9px] uppercase tracking-[0.3em] text-muted mt-1">Admin Panel</p>
        </div>
        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.18em] text-muted mb-2 font-medium">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              className="w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-text text-[14px] focus:border-primary focus:outline-none transition-colors"
            />
          </div>
          {err && <p className="text-red-400 text-[11px]">{err}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 rounded-lg text-[13px] transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ── StatsBar ──────────────────────────────────────────────────────────────────

const StatsBar: React.FC<{
  tenants: Tenant[];
  statuses: Record<string, LiveStatus>;
  statusLoading: boolean;
}> = ({ tenants, statuses, statusLoading }) => {
  const total = tenants.length;
  const active = tenants.filter(t => t.enabled).length;
  const inactive = tenants.filter(t => !t.enabled).length;
  const pluginConnected = Object.values(statuses).filter(s => s.pluginConnected).length;
  const eventsToday = Object.values(statuses).reduce((sum, s) => sum + (s.eventsToday ?? 0), 0);

  const stats = [
    { label: 'Total', value: String(total), icon: <Building2 size={13} />, color: 'text-text' },
    { label: 'Active', value: String(active), icon: <CheckCircle2 size={13} />, color: 'text-emerald-400' },
    { label: 'Inactive', value: String(inactive), icon: <Building2 size={13} />, color: 'text-zinc-500' },
    {
      label: 'Plugin live',
      value: statusLoading ? '—' : String(pluginConnected),
      icon: <Activity size={13} />,
      color: 'text-sky-400',
    },
    {
      label: 'Orders today',
      value: statusLoading ? '—' : eventsToday.toLocaleString(),
      icon: <Zap size={13} />,
      color: 'text-orange-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
      {stats.map(({ label, value, icon, color }) => (
        <div key={label} className="bg-card border border-border rounded-xl px-4 py-3.5 flex items-center gap-3">
          <span className={`${color} opacity-60`}>{icon}</span>
          <div>
            <div className={`text-[22px] font-bold tracking-tight leading-none mb-0.5 ${color}`}>{value}</div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── TenantRow ─────────────────────────────────────────────────────────────────

const TenantRow: React.FC<{
  tenant: Tenant;
  status: LiveStatus | undefined;
  selected: boolean;
  branchCount: number;
  onClick: () => void;
}> = ({ tenant, status, selected, branchCount, onClick }) => {
  const pluginLive = status?.pluginConnected ?? false;

  return (
    <tr
      onClick={onClick}
      className={`border-b border-border cursor-pointer transition-colors group
        ${selected ? 'bg-primary/[0.06]' : 'hover:bg-card/70'}`}
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-bold flex-shrink-0
              ${tenant.enabled ? 'bg-primary/10 text-primary' : 'bg-zinc-800 text-muted'}`}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-[13px] font-semibold text-text leading-tight flex items-center gap-1.5">
              {tenant.name}
              {branchCount > 1 && (
                <span className="text-[9px] font-semibold text-muted bg-zinc-800 rounded-full px-1.5 py-0.5">
                  {branchCount} branches
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted font-mono mt-0.5">{tenant.subdomain}.{DOMAIN}</div>
          </div>
        </div>
      </td>

      <td className="px-4 py-3.5">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider
            ${tenant.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800/80 text-muted'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${tenant.enabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
          {tenant.enabled ? 'Active' : 'Disabled'}
        </span>
      </td>

      <td className="px-4 py-3.5">
        {status === undefined ? (
          <span className="w-12 h-3 bg-zinc-800 rounded animate-pulse block" />
        ) : pluginLive ? (
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <span className="relative flex w-2 h-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
            </span>
            Live
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="w-2 h-2 rounded-full bg-zinc-700 flex-shrink-0" />
            Offline
          </span>
        )}
      </td>

      <td className="px-4 py-3.5">
        {status === undefined ? (
          <span className="w-14 h-3 bg-zinc-800 rounded animate-pulse block" />
        ) : (
          <span className="text-[11px] text-muted">{relativeTime(status.lastEventAt)}</span>
        )}
      </td>

      <td className="px-4 py-3.5 w-8">
        <ChevronRight
          size={13}
          className={`transition-all ${selected ? 'text-primary rotate-90' : 'text-muted/40 group-hover:text-muted group-hover:translate-x-px'}`}
        />
      </td>
    </tr>
  );
};

// ── TenantCard (mobile list item) ────────────────────────────────────────────

const TenantCard: React.FC<{
  tenant: Tenant;
  status: LiveStatus | undefined;
  selected: boolean;
  branchCount: number;
  onClick: () => void;
}> = ({ tenant, status, selected, branchCount, onClick }) => {
  const pluginLive = status?.pluginConnected ?? false;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 flex items-center gap-3 border-b border-border last:border-0 transition-colors
        ${selected ? 'bg-primary/[0.06]' : 'active:bg-card/70'}`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0
          ${tenant.enabled ? 'bg-primary/10 text-primary' : 'bg-zinc-800 text-muted'}`}
      >
        {tenant.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-text leading-tight flex items-center gap-1.5 flex-wrap">
          <span className="truncate">{tenant.name}</span>
          {branchCount > 1 && (
            <span className="text-[9px] font-semibold text-muted bg-zinc-800 rounded-full px-1.5 py-0.5 flex-shrink-0">
              {branchCount} branches
            </span>
          )}
          {!tenant.enabled && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted bg-zinc-800/80 rounded-full px-1.5 py-0.5 flex-shrink-0">
              Disabled
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-muted font-mono truncate">{tenant.subdomain}.{DOMAIN}</span>
          {status !== undefined && (
            pluginLive ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 flex-shrink-0">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-400" />
                </span>
                Live
              </span>
            ) : (
              <span className="text-[10px] text-muted flex-shrink-0">Offline</span>
            )
          )}
          {status !== undefined && (
            <span className="text-[10px] text-muted/70 flex-shrink-0">{relativeTime(status.lastEventAt)}</span>
          )}
        </div>
      </div>
      <ChevronRight size={14} className={`flex-shrink-0 ${selected ? 'text-primary rotate-90' : 'text-muted/40'}`} />
    </button>
  );
};

// ── TenantDrawer ──────────────────────────────────────────────────────────────

const TenantDrawer: React.FC<{
  tenant: Tenant | null;
  tenants: Tenant[];
  token: string;
  status: LiveStatus | undefined;
  events: RealtimeEvent[];
  eventsLoading: boolean;
  onClose: () => void;
  onUpdated: (t: Tenant) => void;
  onDeleted: (id: string) => void;
  onOpenEditor: (plan: HallPlan, section?: IikoSection) => void;
  onBranchAdded: (t: Tenant) => void;
  onSelectBranch: (t: Tenant) => void;
}> = ({ tenant, tenants, token, status, events, eventsLoading, onClose, onUpdated, onDeleted, onOpenEditor, onBranchAdded, onSelectBranch }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ name: string; pos_type: 'iiko' | 'poster'; poster_account_name: string; poster_access_token: string; poster_spot_id: string; iiko_login: string; iiko_password: string; iiko_server_host: string; iiko_cloud_api: string; iiko_loyalty_app_id: string; iiko_loyalty_client_secret: string; onec_base_url: string; onec_login: string; onec_password: string; app_login: string; app_password: string; manager_pin: string; google_maps_url: string; yandex_maps_url: string; tripadvisor_url: string; twogis_url: string; telegram_chat_id: string; plan: 'base' | 'pro'; review_refresh_google: string; review_refresh_yandex: string; review_refresh_2gis: string; review_refresh_tripadvisor: string }>({ name: '', pos_type: 'iiko', poster_account_name: '', poster_access_token: '', poster_spot_id: '', iiko_login: '', iiko_password: '', iiko_server_host: '', iiko_cloud_api: '', iiko_loyalty_app_id: '', iiko_loyalty_client_secret: '', onec_base_url: '', onec_login: '', onec_password: '', app_login: '', app_password: '', manager_pin: '', google_maps_url: '', yandex_maps_url: '', tripadvisor_url: '', twogis_url: '', telegram_chat_id: '', plan: 'pro', review_refresh_google: '', review_refresh_yandex: '', review_refresh_2gis: '', review_refresh_tripadvisor: '' });
  const [serverProto, setServerProto] = useState<'http' | 'https'>('http');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; error?: string; entitySets?: string[] }> | null>(null);
  const [hallPlans, setHallPlans] = useState<HallPlan[]>([]);
  const [hallPlansLoading, setHallPlansLoading] = useState(false);
  const [draggedPlanId, setDraggedPlanId] = useState<string | null>(null);
  const [iikoSections, setIikoSections] = useState<IikoSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsErr, setSectionsErr] = useState('');
  const [siblingBranches, setSiblingBranches] = useState<{ id: string; name: string; subdomain: string }[]>([]);
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');

  // iikoChain — org-wide, not per-branch. Separate edit state from the
  // tenant `editing` flag above since it's a different entity (organizations,
  // not tenants) with its own save action.
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgEditing, setOrgEditing] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgSaveErr, setOrgSaveErr] = useState('');
  const [orgServerProto, setOrgServerProto] = useState<'http' | 'https'>('http');
  const [orgForm, setOrgForm] = useState({ iiko_chain_server_host: '', iiko_chain_login: '', iiko_chain_password: '' });

  const loadOrganization = useCallback(async (tenantId: string) => {
    try {
      const org = await traceApi.admin.organization(token, tenantId);
      setOrganization(org);
    } catch {
      setOrganization(null);
    }
  }, [token]);

  const loadBranches = useCallback(async (tenantId: string) => {
    try {
      const branches = await traceApi.admin.branches(token, tenantId);
      setSiblingBranches(branches);
    } catch {
      setSiblingBranches([]);
    }
  }, [token]);

  const loadHallPlans = useCallback(async (tenantId: string) => {
    setHallPlansLoading(true);
    try {
      const plans = await traceApi.admin.hallPlans(token, tenantId);
      setHallPlans(plans);
    } finally {
      setHallPlansLoading(false);
    }
  }, [token]);

  const fetchIikoSections = useCallback(async (tenantId: string) => {
    setSectionsLoading(true);
    setSectionsErr('');
    try {
      const sections = await traceApi.admin.iikoSections(token, tenantId);
      setIikoSections(sections);
      const existingIds = new Set(hallPlans.map(p => p.iiko_section_id));
      const newPlans: HallPlan[] = sections
        .filter(s => !existingIds.has(s.id))
        .map((s, i) => ({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          iiko_section_id: s.id,
          name: s.name,
          display_order: hallPlans.length + i,
          elements: [],
        }));
      if (newPlans.length > 0) setHallPlans(prev => [...prev, ...newPlans]);
    } catch (e: any) {
      setSectionsErr('Could not load sections from iiko — check the tenant\'s Cloud API credentials');
    } finally {
      setSectionsLoading(false);
    }
  }, [token, hallPlans]);

  const deletePlan = useCallback(async (planId: string) => {
    if (!tenant) return;
    await traceApi.admin.deleteHallPlan(token, tenant.id, planId);
    setHallPlans(prev => prev.filter(p => p.id !== planId));
  }, [token, tenant]);

  useEffect(() => {
    if (tenant) {
      const raw = tenant.iiko_server ?? '';
      const isHttps = raw.startsWith('https://');
      setServerProto(isHttps ? 'https' : 'http');
      const host = raw.replace(/^https?:\/\//, '');
      setForm({ name: tenant.name, pos_type: tenant.pos_type ?? 'iiko', poster_account_name: tenant.poster_account_name ?? '', poster_access_token: tenant.poster_access_token ?? '', poster_spot_id: tenant.poster_spot_id ?? '', iiko_login: tenant.iiko_login ?? '', iiko_password: tenant.iiko_password ?? '', iiko_server_host: host, iiko_cloud_api: tenant.iiko_cloud_api ?? '', iiko_loyalty_app_id: tenant.iiko_loyalty_app_id ?? '', iiko_loyalty_client_secret: tenant.iiko_loyalty_client_secret ?? '', onec_base_url: tenant.onec_base_url ?? '', onec_login: tenant.onec_login ?? '', onec_password: tenant.onec_password ?? '', app_login: (tenant as any).app_login ?? '', app_password: '', manager_pin: '', google_maps_url: tenant.google_maps_url ?? '', yandex_maps_url: tenant.yandex_maps_url ?? '', tripadvisor_url: tenant.tripadvisor_url ?? '', twogis_url: tenant.twogis_url ?? '', telegram_chat_id: tenant.telegram_chat_id ?? '', plan: tenant.plan === 'base' ? 'base' : 'pro', review_refresh_google: tenant.review_refresh_google != null ? String(tenant.review_refresh_google) : '', review_refresh_yandex: tenant.review_refresh_yandex != null ? String(tenant.review_refresh_yandex) : '', review_refresh_2gis: tenant.review_refresh_2gis != null ? String(tenant.review_refresh_2gis) : '', review_refresh_tripadvisor: tenant.review_refresh_tripadvisor != null ? String(tenant.review_refresh_tripadvisor) : '' });
      setEditing(false);
      setSettingsTab('general');
      setSaveErr('');
      setConfirmDelete(false);
      setTestResult(null);
      setHallPlans([]);
      setIikoSections([]);
      setSectionsErr('');
      setAddBranchOpen(false);
      setOrganization(null);
      setOrgEditing(false);
      setOrgSaveErr('');
      loadHallPlans(tenant.id);
      loadBranches(tenant.id);
      if (tenant.organization_id) loadOrganization(tenant.id);
    }
  }, [tenant?.id]);

  // Populate the chain-server form whenever a fresh organization loads —
  // separate effect since organization arrives async, after the tenant one above.
  useEffect(() => {
    if (!organization) return;
    const raw = organization.iiko_chain_server ?? '';
    setOrgServerProto(raw.startsWith('https://') ? 'https' : 'http');
    setOrgForm({
      iiko_chain_server_host: raw.replace(/^https?:\/\//, ''),
      iiko_chain_login: organization.iiko_chain_login ?? '',
      iiko_chain_password: organization.iiko_chain_password ?? '',
    });
  }, [organization]);

  const handleSaveOrganization = async () => {
    if (!organization) return;
    setOrgSaving(true);
    setOrgSaveErr('');
    try {
      const iiko_chain_server = orgForm.iiko_chain_server_host ? `${orgServerProto}://${orgForm.iiko_chain_server_host}` : null;
      const updated = await traceApi.admin.updateOrganization(token, organization.id, {
        iiko_chain_server,
        iiko_chain_login: orgForm.iiko_chain_login || null,
        iiko_chain_password: orgForm.iiko_chain_password || null,
      });
      setOrganization(updated);
      setOrgEditing(false);
    } catch (ex: any) {
      setOrgSaveErr(ex.message);
    } finally {
      setOrgSaving(false);
    }
  };

  const handleSave = async () => {
    if (!tenant) return;
    setSaving(true);
    setSaveErr('');
    try {
      const iiko_server = form.iiko_server_host ? `${serverProto}://${form.iiko_server_host}` : null;
      const parseCount = (v: string) => v.trim() === '' ? null : Math.max(1, Math.min(50, parseInt(v, 10) || 0));
      const updated = await traceApi.admin.update(token, tenant.id, {
        name: form.name,
        pos_type: form.pos_type,
        iiko_login: form.pos_type === 'iiko' ? (form.iiko_login || null) : null,
        iiko_password: form.pos_type === 'iiko' ? (form.iiko_password || null) : null,
        iiko_server: form.pos_type === 'iiko' ? iiko_server : null,
        iiko_cloud_api: form.pos_type === 'iiko' ? (form.iiko_cloud_api || null) : null,
        poster_account_name: form.pos_type === 'poster' ? (form.poster_account_name || null) : null,
        poster_access_token: form.pos_type === 'poster' ? (form.poster_access_token || null) : null,
        poster_spot_id: form.pos_type === 'poster' ? (form.poster_spot_id || null) : null,
        iiko_loyalty_app_id: form.iiko_loyalty_app_id || null,
        iiko_loyalty_client_secret: form.iiko_loyalty_client_secret || null,
        onec_base_url: form.onec_base_url || null,
        onec_login: form.onec_login || null,
        onec_password: form.onec_password || null,
        google_maps_url: form.google_maps_url || null,
        yandex_maps_url: form.yandex_maps_url || null,
        tripadvisor_url: form.tripadvisor_url || null,
        twogis_url: form.twogis_url || null,
        telegram_chat_id: form.telegram_chat_id || null,
        plan: form.plan,
        review_refresh_google: parseCount(form.review_refresh_google),
        review_refresh_yandex: parseCount(form.review_refresh_yandex),
        review_refresh_2gis: parseCount(form.review_refresh_2gis),
        review_refresh_tripadvisor: parseCount(form.review_refresh_tripadvisor),
        ...(form.app_login ? { app_login: form.app_login } : {}),
        ...(form.app_password ? { app_password: form.app_password } : {}),
        ...(form.manager_pin ? { manager_pin: form.manager_pin } : {}),
      });
      onUpdated(updated);
      setEditing(false);
    } catch (ex: any) {
      setSaveErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!tenant) return;
    setToggling(true);
    try {
      if (tenant.enabled) {
        const updated = await traceApi.admin.disable(token, tenant.id);
        onUpdated(updated);
      } else {
        const updated = await traceApi.admin.update(token, tenant.id, { enabled: true });
        onUpdated(updated);
      }
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!tenant) return;
    setDeleting(true);
    try {
      await traceApi.admin.deleteTenant(token, tenant.id);
      onDeleted(tenant.id);
      onClose();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleTest = async () => {
    if (!tenant) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await traceApi.admin.testConnection(token, tenant.id);
      setTestResult(result);
    } catch {
      setTestResult({ cloud_api: { ok: false, error: 'Request failed' }, server: { ok: false, error: 'Request failed' } });
    } finally {
      setTesting(false);
    }
  };

  const copyUrl = () => {
    if (!tenant) return;
    copyToClipboard(tenantUrl(tenant.subdomain));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const open = !!tenant;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed right-0 top-0 bottom-0 w-full sm:w-[420px] bg-[#0d0d10] border-l border-border z-50 flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {tenant && (
          <>
            {/* Drawer header */}
            <div className="flex items-start justify-between p-5 border-b border-border flex-shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[15px] font-bold text-text leading-tight">{tenant.name}</span>
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider flex-shrink-0
                      ${tenant.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-muted'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${tenant.enabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    {tenant.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={tenantUrl(tenant.subdomain)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-muted hover:text-primary transition-colors flex items-center gap-1 font-mono"
                  >
                    <Globe size={10} />
                    {tenant.subdomain}.{DOMAIN}
                    <ExternalLink size={9} className="ml-0.5" />
                  </a>
                  <button onClick={copyUrl} className="text-muted hover:text-text transition-colors">
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                <button
                  onClick={handleToggle}
                  disabled={toggling}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors font-medium disabled:opacity-50 min-w-[58px] flex items-center justify-center
                    ${tenant.enabled
                      ? 'border-zinc-700 text-muted hover:text-text hover:border-zinc-500'
                      : 'border-emerald-500/30 text-emerald-400 hover:border-emerald-400/70'}`}
                >
                  {toggling
                    ? <span className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />
                    : tenant.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 text-muted hover:text-text transition-colors rounded-lg hover:bg-zinc-800"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">

              {/* Branches */}
              <div className="p-5 border-b border-border">
                <div className="flex items-center justify-between mb-3.5">
                  <h3 className="text-[9px] uppercase tracking-[0.22em] font-semibold text-muted">
                    Branches
                  </h3>
                  <button
                    onClick={() => setAddBranchOpen(true)}
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-zinc-700 text-muted hover:text-text hover:border-zinc-500 transition-colors font-medium flex items-center gap-1"
                  >
                    <Plus size={11} />
                    Add Branch
                  </button>
                </div>
                {siblingBranches.length > 0 ? (
                  <div className="space-y-1">
                    {siblingBranches.map(b => {
                      const isCurrent = b.id === tenant.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          disabled={isCurrent}
                          onClick={() => {
                            const target = tenants.find(t => t.id === b.id);
                            if (target) onSelectBranch(target);
                          }}
                          className={`w-full flex items-center justify-between text-[12px] px-2.5 py-1.5 rounded-lg transition-colors text-left
                            ${isCurrent ? 'bg-primary/10' : 'hover:bg-zinc-800/60 cursor-pointer'}`}
                        >
                          <span className={`text-text ${isCurrent ? 'font-semibold' : ''}`}>{b.name}</span>
                          <span className="flex items-center gap-1.5 text-muted font-mono text-[11px]">
                            {b.subdomain}.{DOMAIN}
                            {!isCurrent && <ChevronRight size={11} className="text-muted/50" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted">Single-branch restaurant.</p>
                )}
              </div>

              {/* Restaurant settings */}
              <div className="p-5 border-b border-border">
                <div className="flex items-center justify-between mb-3.5">
                  <h3 className="text-[9px] uppercase tracking-[0.22em] font-semibold text-muted">
                    Settings
                  </h3>
                  <button
                    onClick={() => { setEditing(e => !e); setSaveErr(''); setConfirmDelete(false); }}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1.5
                      ${editing
                        ? 'border-primary/50 text-primary'
                        : 'border-border text-muted hover:text-text hover:border-primary/50'}`}
                  >
                    {editing ? <X size={11} /> : <Pencil size={11} />}
                    {editing ? 'Cancel' : 'Edit'}
                  </button>
                </div>

                <SettingsTabs active={settingsTab} onChange={setSettingsTab} showChain={!!tenant.organization_id} />

                {editing ? (
                  <div className="space-y-3">
                    {settingsTab === 'general' && (
                      <>
                        <Field label="Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
                        <div>
                          <FieldLabel>Plan</FieldLabel>
                          <div className="flex rounded-lg overflow-hidden border border-border w-fit">
                            {(['base', 'pro'] as const).map(p => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setForm(f => ({ ...f, plan: p }))}
                                className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors
                                  ${form.plan === p ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted mt-1.5">
                            {form.plan === 'base'
                              ? 'AI chat limited to 5 msgs / 2h, Daily Briefing only — other AI features locked'
                              : 'Full access to all AI features'}
                          </p>
                        </div>
                        <div>
                          <FieldLabel>POS System</FieldLabel>
                          <div className="flex rounded-lg overflow-hidden border border-border w-fit">
                            {(['iiko', 'poster'] as const).map(p => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setForm(f => ({ ...f, pos_type: p }))}
                                className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors
                                  ${form.pos_type === p ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>
                        {form.pos_type === 'iiko' && (
                          <div className="pt-2 border-t border-border/40 space-y-3">
                            <ServerField
                              proto={serverProto}
                              onProtoChange={setServerProto}
                              value={form.iiko_server_host}
                              onChange={v => setForm(f => ({ ...f, iiko_server_host: v }))}
                            />
                            <Field label="Login" mono value={form.iiko_login} onChange={v => setForm(f => ({ ...f, iiko_login: v }))} />
                            <PasswordField label="Password" value={form.iiko_password} onChange={v => setForm(f => ({ ...f, iiko_password: v }))} />
                            <Field
                              label="Cloud API Key"
                              mono
                              placeholder="b5e2300c-a7b9-4613-..."
                              value={form.iiko_cloud_api}
                              onChange={v => setForm(f => ({ ...f, iiko_cloud_api: v }))}
                            />
                          </div>
                        )}
                        {form.pos_type === 'poster' && (
                          <div className="pt-2 border-t border-border/40 space-y-3">
                            <Field
                              label="Account Name"
                              mono
                              placeholder="demo"
                              value={form.poster_account_name}
                              onChange={v => setForm(f => ({ ...f, poster_account_name: v }))}
                            />
                            <PasswordField label="Access Token" value={form.poster_access_token} onChange={v => setForm(f => ({ ...f, poster_access_token: v }))} />
                            <Field
                              label="Spot ID"
                              mono
                              placeholder="leave blank if account has only one spot"
                              value={form.poster_spot_id}
                              onChange={v => setForm(f => ({ ...f, poster_spot_id: v }))}
                            />
                          </div>
                        )}
                        <div className="pt-2 border-t border-border/40 space-y-3">
                          <p className="text-[11px] text-muted/70">iikoLoyalty — separate credentials from iiko developer portal, needed for the Loyalty page's live balance lookup</p>
                          <Field
                            label="Loyalty App ID"
                            mono
                            value={form.iiko_loyalty_app_id}
                            onChange={v => setForm(f => ({ ...f, iiko_loyalty_app_id: v }))}
                          />
                          <PasswordField label="Loyalty Client Secret" value={form.iiko_loyalty_client_secret} onChange={v => setForm(f => ({ ...f, iiko_loyalty_client_secret: v }))} />
                        </div>
                        <div className="pt-2 border-t border-border/40 space-y-3">
                          <p className="text-[11px] text-muted/70">1С (Бухгалтерия/ЗУП) — labor cost &amp; P&amp;L source of truth. Base URL is the published OData root, e.g. https://server/base/odata/standard.odata (on-premise VPN/port-forward) or a 1cFresh cloud URL.</p>
                          <Field
                            label="Base URL"
                            mono
                            placeholder="https://host/base/odata/standard.odata"
                            value={form.onec_base_url}
                            onChange={v => setForm(f => ({ ...f, onec_base_url: v }))}
                          />
                          <Field label="Login" mono value={form.onec_login} onChange={v => setForm(f => ({ ...f, onec_login: v }))} />
                          <PasswordField label="Password" value={form.onec_password} onChange={v => setForm(f => ({ ...f, onec_password: v }))} />
                        </div>
                      </>
                    )}

                    {settingsTab === 'reviews' && (
                      <>
                        <Field
                          label="Google Maps URL"
                          hint="(for review pulling)"
                          mono
                          placeholder="https://www.google.com/maps/place/..."
                          value={form.google_maps_url}
                          onChange={v => setForm(f => ({ ...f, google_maps_url: v }))}
                        />
                        <Field
                          label="Yandex Maps URL"
                          hint="(for review pulling)"
                          mono
                          placeholder="https://yandex.com/maps/org/.../reviews/"
                          value={form.yandex_maps_url}
                          onChange={v => setForm(f => ({ ...f, yandex_maps_url: v }))}
                        />
                        <Field
                          label="2GIS URL"
                          hint="(for review pulling)"
                          mono
                          placeholder="https://2gis.ru/.../firm/..."
                          value={form.twogis_url}
                          onChange={v => setForm(f => ({ ...f, twogis_url: v }))}
                        />
                        <Field
                          label="TripAdvisor URL"
                          hint="(for review pulling)"
                          mono
                          placeholder="https://www.tripadvisor.com/Restaurant_Review-..."
                          value={form.tripadvisor_url}
                          onChange={v => setForm(f => ({ ...f, tripadvisor_url: v }))}
                        />
                        <div className="pt-2 border-t border-border/40">
                          <Field
                            label="Telegram Chat ID"
                            hint="(group notified on new reviews)"
                            mono
                            placeholder="-1001234567890"
                            value={form.telegram_chat_id}
                            onChange={v => setForm(f => ({ ...f, telegram_chat_id: v }))}
                          />
                        </div>
                        <div className="pt-2 border-t border-border/40">
                          <FieldLabel hint="(reviews fetched per platform on the daily 7AM pull, default 5 / TripAdvisor 3)">
                            Review refresh count
                          </FieldLabel>
                          <div className="grid grid-cols-4 gap-2">
                            {([
                              ['review_refresh_google', 'Google'],
                              ['review_refresh_yandex', 'Yandex'],
                              ['review_refresh_2gis', '2GIS'],
                              ['review_refresh_tripadvisor', 'TripAdvisor'],
                            ] as const).map(([field, label]) => (
                              <div key={field}>
                                <label className="block text-[8px] uppercase tracking-[0.15em] text-muted/70 mb-1">{label}</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={50}
                                  placeholder={field === 'review_refresh_tripadvisor' ? '3' : '5'}
                                  value={form[field]}
                                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                                  className={`${inputBase} px-2 font-mono text-center`}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {settingsTab === 'access' && (
                      <>
                        <div>
                          <SectionHeading icon={<KeyRound size={12} />} title="TRACE App Login" />
                          <div className="space-y-3">
                            <Field label="Login" mono placeholder="admin" value={form.app_login} onChange={v => setForm(f => ({ ...f, app_login: v }))} />
                            <PasswordField
                              label="New Password"
                              hint="(leave blank to keep)"
                              placeholder="••••••••"
                              value={form.app_password}
                              onChange={v => setForm(f => ({ ...f, app_password: v }))}
                            />
                          </div>
                        </div>
                        {tenant.organization_id === MANAGER_PORTAL_ORG_ID && (
                          <div className="bg-[#111] border border-border rounded-lg p-3 mt-1">
                            <Field
                              label="Manager Portal PIN"
                              hint="(report.trace-os.uz — leave blank to keep)"
                              mono
                              placeholder="New PIN code"
                              value={form.manager_pin}
                              onChange={v => setForm(f => ({ ...f, manager_pin: v }))}
                            />
                          </div>
                        )}
                      </>
                    )}

                    {saveErr && <p className="text-red-400 text-[10px]">{saveErr}</p>}
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-[12px] font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60 mt-1"
                    >
                      {saving
                        ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Check size={13} />}
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {settingsTab === 'general' && (
                      <>
                        <ReadRow label="Name">{tenant.name}</ReadRow>
                        <ReadRow label="Plan">
                          <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded ${tenant.plan === 'base' ? 'bg-muted/15 text-muted' : 'bg-primary/15 text-primary'}`}>
                            {tenant.plan === 'base' ? 'Base' : 'Pro'}
                          </span>
                        </ReadRow>
                        <ReadRow label="POS System">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded bg-muted/15 text-muted">
                            {(tenant.pos_type ?? 'iiko') === 'poster' ? 'Poster' : 'iiko'}
                          </span>
                        </ReadRow>
                        {(tenant.pos_type ?? 'iiko') === 'iiko' && (
                          <div className="pt-1.5 border-t border-border/40 space-y-2.5">
                            <ReadRow label="iiko Server" mono stacked>{tenant.iiko_server || <Empty />}</ReadRow>
                            <ReadRow label="Login" mono>{tenant.iiko_login || <Empty />}</ReadRow>
                            <ReadRow label="Password" mono>{mask(tenant.iiko_password)}</ReadRow>
                            <ReadRow label="Cloud API Key" mono>{mask(tenant.iiko_cloud_api)}</ReadRow>
                          </div>
                        )}
                        {tenant.pos_type === 'poster' && (
                          <div className="pt-1.5 border-t border-border/40 space-y-2.5">
                            <ReadRow label="Account Name" mono>{tenant.poster_account_name || <Empty />}</ReadRow>
                            <ReadRow label="Access Token" mono>{mask(tenant.poster_access_token)}</ReadRow>
                            <ReadRow label="Spot ID" mono>{tenant.poster_spot_id || <Empty />}</ReadRow>
                          </div>
                        )}
                        <div className="pt-1.5 border-t border-border/40 space-y-2.5">
                          <ReadRow label="Loyalty App ID" mono>{tenant.iiko_loyalty_app_id || <Empty />}</ReadRow>
                          <ReadRow label="Loyalty Client Secret" mono>{mask(tenant.iiko_loyalty_client_secret)}</ReadRow>
                        </div>
                        <div className="pt-1.5 border-t border-border/40 space-y-2.5">
                          <ReadRow label="1C Base URL" mono stacked>{tenant.onec_base_url || <Empty />}</ReadRow>
                          <ReadRow label="1C Login" mono>{tenant.onec_login || <Empty />}</ReadRow>
                          <ReadRow label="1C Password" mono>{mask(tenant.onec_password)}</ReadRow>
                        </div>
                      </>
                    )}

                    {settingsTab === 'reviews' && (
                      <>
                        <ReadRow label="Google Maps URL" mono stacked>{tenant.google_maps_url || <Empty />}</ReadRow>
                        <ReadRow label="Yandex Maps URL" mono stacked>{tenant.yandex_maps_url || <Empty />}</ReadRow>
                        <ReadRow label="2GIS URL" mono stacked>{tenant.twogis_url || <Empty />}</ReadRow>
                        <ReadRow label="TripAdvisor URL" mono stacked>{tenant.tripadvisor_url || <Empty />}</ReadRow>
                        <div className="pt-1.5 border-t border-border/40">
                          <ReadRow label="Telegram Chat ID" mono stacked>{tenant.telegram_chat_id || <Empty />}</ReadRow>
                        </div>
                        <div className="pt-1.5 border-t border-border/40">
                          <span className="block text-[9px] text-muted uppercase tracking-[0.15em] mb-1">Review refresh count</span>
                          <span className="text-[11px] text-text font-mono">
                            Google {tenant.review_refresh_google ?? 5} · Yandex {tenant.review_refresh_yandex ?? 5} · 2GIS {tenant.review_refresh_2gis ?? 5} · TripAdvisor {tenant.review_refresh_tripadvisor ?? 3}
                          </span>
                        </div>
                      </>
                    )}

                    {settingsTab === 'access' && (
                      <>
                        <ReadRow label="App Login" mono>{(tenant as any).app_login || <span className="text-muted italic">admin (default)</span>}</ReadRow>
                        {tenant.organization_id === MANAGER_PORTAL_ORG_ID && (
                          <p className="text-[10px] text-muted">Manager Portal PIN is set per-branch — edit to update.</p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Chain tab — a separate entity (organization, not tenant), so it
                    has its own edit/save state independent of the `editing` flag
                    above, and renders regardless of whether the tenant's own
                    fields are in edit mode. */}
                {settingsTab === 'chain' && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-muted/70">
                      iikoChain — a chain-level iiko server that reports data combined across every branch in
                      this organization. Set once here; it applies to all {siblingBranches.length || 1} branches,
                      not just this one.
                    </p>
                    {!organization ? (
                      <p className="text-[11px] text-muted">Loading…</p>
                    ) : orgEditing ? (
                      <div className="space-y-3">
                        <ServerField
                          label="iikoChain Server"
                          proto={orgServerProto}
                          onProtoChange={setOrgServerProto}
                          value={orgForm.iiko_chain_server_host}
                          onChange={v => setOrgForm(f => ({ ...f, iiko_chain_server_host: v }))}
                        />
                        <Field label="Login" mono value={orgForm.iiko_chain_login} onChange={v => setOrgForm(f => ({ ...f, iiko_chain_login: v }))} />
                        <PasswordField label="Password" value={orgForm.iiko_chain_password} onChange={v => setOrgForm(f => ({ ...f, iiko_chain_password: v }))} />
                        {orgSaveErr && <p className="text-red-400 text-[10px]">{orgSaveErr}</p>}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSaveOrganization}
                            disabled={orgSaving}
                            className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-[12px] font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                          >
                            {orgSaving
                              ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <Check size={13} />}
                            Save
                          </button>
                          <button
                            onClick={() => setOrgEditing(false)}
                            className="flex items-center gap-1.5 text-muted hover:text-text text-[12px] font-semibold px-3 py-2 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <ReadRow label="iikoChain Server" mono stacked>{organization.iiko_chain_server || <Empty />}</ReadRow>
                        <ReadRow label="Login" mono>{organization.iiko_chain_login || <Empty />}</ReadRow>
                        <ReadRow label="Password" mono>{mask(organization.iiko_chain_password)}</ReadRow>
                        <button
                          onClick={() => setOrgEditing(true)}
                          className="flex items-center gap-1.5 text-muted hover:text-text text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-border transition-colors mt-1"
                        >
                          <Pencil size={11} />
                          Edit
                        </button>
                        {!organization.iiko_chain_server && (
                          <p className="text-[10px] text-amber-400/80 pt-1">
                            Not configured — the "All branches" option won't appear in the app's branch
                            selector until this is set.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Test connection */}
              <div className="p-5 border-b border-border">
                <div className="flex items-center justify-between mb-3.5">
                  <h3 className="text-[9px] uppercase tracking-[0.22em] font-semibold text-muted">Connection Test</h3>
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-primary/50 transition-colors disabled:opacity-50"
                  >
                    {testing
                      ? <span className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />
                      : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                    {testing ? 'Testing...' : 'Test'}
                  </button>
                </div>
                {testResult && (
                  <div className="space-y-2">
                    {Object.entries(testResult).map(([key, val]) => (
                      <div key={key}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted uppercase tracking-[0.15em]">
                            {key === 'cloud_api' ? 'Cloud API' : key === 'onec' ? '1C' : 'iiko Server'}
                          </span>
                          <span className={`flex items-center gap-1.5 text-[11px] font-mono ${val.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                            {val.ok ? '✓ OK' : `✗ ${val.error ?? 'Failed'}`}
                          </span>
                        </div>
                        {key === 'onec' && val.ok && (val as any).entitySets && (
                          <p className="text-[9px] text-muted/60 mt-1 leading-relaxed break-all">
                            {(val as any).entitySets.length} entity sets: {(val as any).entitySets.slice(0, 12).join(', ')}
                            {(val as any).entitySets.length > 12 ? '…' : ''}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Danger zone */}
              <div className="p-5 border-b border-border">
                <h3 className="text-[9px] uppercase tracking-[0.22em] font-semibold text-muted mb-3.5">Danger Zone</h3>
                {confirmDelete ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-red-400">Delete <strong>{tenant.name}</strong> permanently? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-400 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deleting ? <span className="w-3 h-3 border border-red-400/30 border-t-red-400 rounded-full animate-spin" /> : null}
                        Yes, delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="text-muted hover:text-text text-[11px] px-3 py-1.5 border border-border rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-[11px] text-red-400/70 hover:text-red-400 border border-red-500/20 hover:border-red-500/50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Delete restaurant
                  </button>
                )}
              </div>

              {/* Plugin status */}
              <div className="p-5 border-b border-border">
                <h3 className="text-[9px] uppercase tracking-[0.22em] font-semibold text-muted mb-3.5">
                  Plugin
                </h3>

                {status === undefined ? (
                  <div className="space-y-2.5">
                    {[80, 60, 70].map(w => (
                      <div key={w} className="h-3 bg-zinc-800 rounded animate-pulse" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] text-muted uppercase tracking-[0.15em] w-24 flex-shrink-0">Status</span>
                      {status.pluginConnected ? (
                        <span className="flex items-center gap-1.5 text-[12px] text-emerald-400">
                          <span className="relative flex w-2 h-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
                          </span>
                          Connected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[12px] text-muted">
                          <span className="w-2 h-2 rounded-full bg-zinc-700" />
                          Offline
                        </span>
                      )}
                    </div>

                    {status.pluginConnected && status.connectedSince && (
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] text-muted uppercase tracking-[0.15em] w-24 flex-shrink-0">Since</span>
                        <span className="text-[12px] text-text font-mono">
                          {new Date(status.connectedSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}

                    {status.ip && (
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] text-muted uppercase tracking-[0.15em] w-24 flex-shrink-0">IP</span>
                        <span className="text-[12px] text-text font-mono">{status.ip}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <span className="text-[9px] text-muted uppercase tracking-[0.15em] w-24 flex-shrink-0">Events today</span>
                      <span className="text-[12px] text-text font-mono tabular-nums">
                        {status.eventsToday.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[9px] text-muted uppercase tracking-[0.15em] w-24 flex-shrink-0">Last event</span>
                      <span className="text-[12px] text-muted">{relativeTime(status.lastEventAt)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Floor Plans */}
              <div className="p-5 border-b border-border">
                <div className="flex items-center justify-between mb-3.5">
                  <h3 className="text-[9px] uppercase tracking-[0.22em] font-semibold text-muted">
                    Floor Plans
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        if (!tenant) return;
                        const newPlan: HallPlan = {
                          id: crypto.randomUUID(),
                          tenant_id: tenant.id,
                          name: `Hall ${hallPlans.length + 1}`,
                          display_order: hallPlans.length,
                          elements: [],
                        };
                        setHallPlans(prev => [...prev, newPlan]);
                        onOpenEditor(newPlan, undefined);
                      }}
                      className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-muted hover:text-text hover:border-primary/50 transition-colors flex items-center gap-1.5"
                    >
                      <Plus size={9} />
                      Add Hall
                    </button>
                    <button
                      onClick={() => tenant && fetchIikoSections(tenant.id)}
                      disabled={sectionsLoading}
                      className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-muted hover:text-text hover:border-primary/50 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <RefreshCw size={9} className={sectionsLoading ? 'animate-spin' : ''} />
                      Sync iiko
                    </button>
                  </div>
                </div>

                {sectionsErr && (
                  <p className="text-red-400 text-[10px] mb-2">{sectionsErr}</p>
                )}

                {hallPlansLoading ? (
                  <div className="space-y-2">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="h-10 bg-zinc-800/60 rounded animate-pulse" />
                    ))}
                  </div>
                ) : hallPlans.length === 0 ? (
                  <p className="text-[11px] text-muted py-2">
                    No halls yet — click "Sync from iiko" to import sections.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {[...hallPlans].sort((a, b) => a.display_order - b.display_order).map((plan, idx) => {
                      const section = iikoSections.find(s => s.id === plan.iiko_section_id);
                      const hasElements = plan.elements.length > 0;
                      return (
                        <div
                          key={plan.id}
                          draggable
                          onDragStart={() => setDraggedPlanId(plan.id)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={async () => {
                            if (!draggedPlanId || draggedPlanId === plan.id || !tenant) return;
                            const ordered = [...hallPlans].sort((a, b) => a.display_order - b.display_order);
                            const fromIdx = ordered.findIndex(p => p.id === draggedPlanId);
                            const toIdx = ordered.findIndex(p => p.id === plan.id);
                            if (fromIdx === -1 || toIdx === -1) return;
                            const [moved] = ordered.splice(fromIdx, 1);
                            ordered.splice(toIdx, 0, moved);
                            const reindexed = ordered.map((p, i) => ({ ...p, display_order: i }));
                            setHallPlans(reindexed);
                            setDraggedPlanId(null);
                            await Promise.all(
                              reindexed
                                .filter((p, i) => hallPlans.find(hp => hp.id === p.id)?.display_order !== i)
                                .map(p => traceApi.admin.saveHallPlan(token, tenant.id, p))
                            );
                          }}
                          onDragEnd={() => setDraggedPlanId(null)}
                          className={`flex items-center justify-between py-2 px-3 rounded-xl bg-zinc-900/60 border transition-colors ${
                            draggedPlanId === plan.id ? 'border-primary/60 opacity-50' : 'border-border/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <GripVertical size={12} className="text-muted/50 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                            <span className="text-[9px] text-muted/60 font-mono w-3.5 flex-shrink-0 text-right">{idx + 1}</span>
                            <LayoutGrid size={12} className={`flex-shrink-0 ${hasElements ? 'text-emerald-400' : 'text-muted'}`} />
                            <div className="min-w-0 flex-1">
                              <input
                                value={plan.name}
                                onChange={e => setHallPlans(prev => prev.map(p => p.id === plan.id ? { ...p, name: e.target.value } : p))}
                                onBlur={async e => {
                                  if (!tenant || e.target.value === plan.name) return;
                                  await traceApi.admin.saveHallPlan(token, tenant.id, { ...plan, name: e.target.value });
                                }}
                                className="w-full bg-transparent text-[12px] font-medium text-text leading-tight focus:outline-none focus:bg-zinc-800 focus:px-1 rounded transition-all"
                              />
                              <p className="text-[9px] text-muted">
                                {hasElements ? `${plan.elements.length} elements` : 'Not drawn yet'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 ml-2">
                            <button
                              onClick={() => onOpenEditor(plan, section)}
                              className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-primary/10"
                              title="Draw floor plan"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => deletePlan(plan.id)}
                              className="p-1.5 text-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                              title="Delete"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent events */}
              <div className="p-5">
                <h3 className="text-[9px] uppercase tracking-[0.22em] font-semibold text-muted mb-3.5">
                  Recent Events
                </h3>

                {eventsLoading ? (
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-9 bg-zinc-800/60 rounded animate-pulse" />
                    ))}
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-muted text-[12px] text-center py-8">No events yet</p>
                ) : (
                  <div className="space-y-px">
                    {events.map(ev => {
                      const data = (ev.payload as any)?.data;
                      const subtitle = data?.table?.name ?? data?.cashier ?? null;
                      return (
                        <div
                          key={ev.id}
                          className="flex items-center justify-between py-2 border-b border-border/30 last:border-0 gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`text-[10px] font-semibold font-mono flex-shrink-0 ${EVENT_TYPE_COLORS[ev.type] ?? 'text-muted'}`}
                            >
                              {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                            </span>
                            {subtitle && (
                              <span className="text-[10px] text-muted truncate">{subtitle}</span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted font-mono flex-shrink-0">
                            {new Date(ev.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {addBranchOpen && tenant && (
        <AddBranchModal
          token={token}
          parentId={tenant.id}
          onAdded={(newBranch) => {
            setAddBranchOpen(false);
            loadBranches(tenant.id);
            onBranchAdded(newBranch);
          }}
          onClose={() => setAddBranchOpen(false)}
        />
      )}
    </>
  );
};

// ── AddBranchModal ────────────────────────────────────────────────────────────

const AddBranchModal: React.FC<{
  token: string;
  parentId: string;
  onAdded: (t: Tenant) => void;
  onClose: () => void;
}> = ({ token, parentId, onAdded, onClose }) => {
  const [form, setForm] = useState({ subdomain: '', name: '', pos_type: 'iiko' as 'iiko' | 'poster', poster_account_name: '', poster_access_token: '', poster_spot_id: '', iiko_login: '', iiko_password: '', iiko_server_host: '', iiko_cloud_api: '' });
  const [serverProto, setServerProto] = useState<'http' | 'https'>('http');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subdomain || !form.name) {
      setErr('Subdomain and name are required');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const iiko_server = form.iiko_server_host ? `${serverProto}://${form.iiko_server_host}` : null;
      const newBranch = await traceApi.admin.addBranch(token, parentId, {
        subdomain: form.subdomain,
        name: form.name,
        pos_type: form.pos_type,
        iiko_login: form.pos_type === 'iiko' ? (form.iiko_login || null) : null,
        iiko_password: form.pos_type === 'iiko' ? (form.iiko_password || null) : null,
        iiko_server: form.pos_type === 'iiko' ? iiko_server : null,
        iiko_cloud_api: form.pos_type === 'iiko' ? (form.iiko_cloud_api || null) : null,
        poster_account_name: form.pos_type === 'poster' ? (form.poster_account_name || null) : null,
        poster_access_token: form.pos_type === 'poster' ? (form.poster_access_token || null) : null,
        poster_spot_id: form.pos_type === 'poster' ? (form.poster_spot_id || null) : null,
      });
      onAdded(newBranch);
    } catch (ex: any) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[460px] bg-[#0d0d10] border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-[#0d0d10] z-10">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/15 text-primary">
              <Building2 size={14} />
            </span>
            <h2 className="text-[14px] font-semibold text-text">Add Branch</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors p-1 rounded-lg hover:bg-zinc-800">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div>
            <SectionHeading icon={<Building2 size={12} />} title="Branch Info" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Branch Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
              <div>
                <div className="flex items-end justify-between mb-1.5">
                  <FieldLabel>Subdomain</FieldLabel>
                  {form.subdomain && (
                    <span className="text-[9px] text-primary/70 font-mono">{form.subdomain}.{DOMAIN}</span>
                  )}
                </div>
                <input
                  value={form.subdomain}
                  onChange={e => setForm(f => ({ ...f, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                  className={`${inputBase} font-mono`}
                />
              </div>
            </div>
          </div>

          <div className="pt-1 border-t border-border/50">
            <SectionHeading icon={<Server size={12} />} title="POS Connection" hint="optional" />
            <div className="flex rounded-lg overflow-hidden border border-border w-fit mb-3">
              {(['iiko', 'poster'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, pos_type: p }))}
                  className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors
                    ${form.pos_type === p ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}
                >
                  {p}
                </button>
              ))}
            </div>
            {form.pos_type === 'iiko' && (
              <div className="space-y-3">
                <ServerField proto={serverProto} onProtoChange={setServerProto} value={form.iiko_server_host} onChange={v => setForm(f => ({ ...f, iiko_server_host: v }))} />
                <Field label="Login" mono value={form.iiko_login} onChange={v => setForm(f => ({ ...f, iiko_login: v }))} />
                <PasswordField label="Password" value={form.iiko_password} onChange={v => setForm(f => ({ ...f, iiko_password: v }))} />
                <Field label="Cloud API Key" mono placeholder="b5e2300c-a7b9-4613-..." value={form.iiko_cloud_api} onChange={v => setForm(f => ({ ...f, iiko_cloud_api: v }))} />
              </div>
            )}
            {form.pos_type === 'poster' && (
              <div className="space-y-3">
                <Field label="Account Name" mono placeholder="demo" value={form.poster_account_name} onChange={v => setForm(f => ({ ...f, poster_account_name: v }))} />
                <PasswordField label="Access Token" value={form.poster_access_token} onChange={v => setForm(f => ({ ...f, poster_access_token: v }))} />
                <Field label="Spot ID" mono placeholder="leave blank if account has only one spot" value={form.poster_spot_id} onChange={v => setForm(f => ({ ...f, poster_spot_id: v }))} />
              </div>
            )}
          </div>

          {err && <p className="text-red-400 text-[11px]">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white text-[13px] font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Plus size={14} />}
              Add Branch
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-text text-[13px] px-4 py-2.5 rounded-lg border border-border transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── CreateModal ───────────────────────────────────────────────────────────────

const CreateModal: React.FC<{
  token: string;
  onCreated: (t: Tenant) => void;
  onClose: () => void;
}> = ({ token, onCreated, onClose }) => {
  const [form, setForm] = useState({ subdomain: '', name: '', pos_type: 'iiko' as 'iiko' | 'poster', poster_account_name: '', poster_access_token: '', poster_spot_id: '', iiko_login: '', iiko_password: '', iiko_server_host: '', iiko_cloud_api: '' });
  const [serverProto, setServerProto] = useState<'http' | 'https'>('http');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subdomain || !form.name) {
      setErr('Subdomain and name are required');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const iiko_server = form.iiko_server_host ? `${serverProto}://${form.iiko_server_host}` : null;
      const tenant = await traceApi.admin.create(token, {
        subdomain: form.subdomain,
        name: form.name,
        pos_type: form.pos_type,
        iiko_login: form.pos_type === 'iiko' ? (form.iiko_login || null) : null,
        iiko_password: form.pos_type === 'iiko' ? (form.iiko_password || null) : null,
        iiko_server: form.pos_type === 'iiko' ? iiko_server : null,
        iiko_cloud_api: form.pos_type === 'iiko' ? (form.iiko_cloud_api || null) : null,
        poster_account_name: form.pos_type === 'poster' ? (form.poster_account_name || null) : null,
        poster_access_token: form.pos_type === 'poster' ? (form.poster_access_token || null) : null,
        poster_spot_id: form.pos_type === 'poster' ? (form.poster_spot_id || null) : null,
      });
      onCreated(tenant);
    } catch (ex: any) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[460px] bg-[#0d0d10] border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-[#0d0d10] z-10">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/15 text-primary">
              <Building2 size={14} />
            </span>
            <h2 className="text-[14px] font-semibold text-text">Add Restaurant</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors p-1 rounded-lg hover:bg-zinc-800">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div>
            <SectionHeading icon={<Building2 size={12} />} title="Restaurant Info" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Restaurant Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
              <div>
                <div className="flex items-end justify-between mb-1.5">
                  <FieldLabel>Subdomain</FieldLabel>
                  {form.subdomain && (
                    <span className="text-[9px] text-primary/70 font-mono">{form.subdomain}.{DOMAIN}</span>
                  )}
                </div>
                <input
                  value={form.subdomain}
                  onChange={e => setForm(f => ({ ...f, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                  className={`${inputBase} font-mono`}
                />
              </div>
            </div>
          </div>

          <div className="pt-1 border-t border-border/50">
            <SectionHeading icon={<Server size={12} />} title="POS Connection" hint="optional" />
            <div className="flex rounded-lg overflow-hidden border border-border w-fit mb-3">
              {(['iiko', 'poster'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, pos_type: p }))}
                  className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors
                    ${form.pos_type === p ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}
                >
                  {p}
                </button>
              ))}
            </div>
            {form.pos_type === 'iiko' && (
              <div className="space-y-3">
                <ServerField proto={serverProto} onProtoChange={setServerProto} value={form.iiko_server_host} onChange={v => setForm(f => ({ ...f, iiko_server_host: v }))} />
                <Field label="Login" mono value={form.iiko_login} onChange={v => setForm(f => ({ ...f, iiko_login: v }))} />
                <PasswordField label="Password" value={form.iiko_password} onChange={v => setForm(f => ({ ...f, iiko_password: v }))} />
                <Field label="Cloud API Key" mono placeholder="b5e2300c-a7b9-4613-..." value={form.iiko_cloud_api} onChange={v => setForm(f => ({ ...f, iiko_cloud_api: v }))} />
              </div>
            )}
            {form.pos_type === 'poster' && (
              <div className="space-y-3">
                <Field label="Account Name" mono placeholder="demo" value={form.poster_account_name} onChange={v => setForm(f => ({ ...f, poster_account_name: v }))} />
                <PasswordField label="Access Token" value={form.poster_access_token} onChange={v => setForm(f => ({ ...f, poster_access_token: v }))} />
                <Field label="Spot ID" mono placeholder="leave blank if account has only one spot" value={form.poster_spot_id} onChange={v => setForm(f => ({ ...f, poster_spot_id: v }))} />
              </div>
            )}
          </div>

          {err && <p className="text-red-400 text-[11px]">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white text-[13px] font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Plus size={14} />}
              Create Restaurant
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-text text-[13px] px-4 py-2.5 rounded-lg border border-border transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Admin root ────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'active' | 'inactive';

export const Admin: React.FC = () => {
  const [token, setToken] = useState<string>(() => localStorage.getItem('trace_admin_token') || '');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [statuses, setStatuses] = useState<Record<string, LiveStatus>>({});
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [drawerEvents, setDrawerEvents] = useState<RealtimeEvent[]>([]);
  const [drawerEventsLoading, setDrawerEventsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [editingPlan, setEditingPlan] = useState<{ plan: HallPlan; section?: IikoSection; tenantId: string } | null>(null);

  const loadTenants = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const list = await traceApi.admin.tenants(t);
      setTenants(list);
    } catch {
      setToken('');
      localStorage.removeItem('trace_admin_token');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatuses = useCallback(async (t: string) => {
    setStatusLoading(true);
    try {
      const s = await traceApi.admin.liveStatus(t);
      setStatuses(s);
    } catch {
      // Supplementary — silently ignore failures
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadAll = useCallback((t: string) => {
    loadTenants(t);
    loadStatuses(t);
  }, [loadTenants, loadStatuses]);

  useEffect(() => {
    if (token) loadAll(token);
  }, [token, loadAll]);

  // Fetch events when selected tenant changes
  useEffect(() => {
    if (!selectedTenant || !token) {
      setDrawerEvents([]);
      return;
    }
    setDrawerEventsLoading(true);
    traceApi.admin.tenantEvents(token, selectedTenant.id, 15)
      .then(setDrawerEvents)
      .catch(() => setDrawerEvents([]))
      .finally(() => setDrawerEventsLoading(false));
  }, [selectedTenant?.id, token]);

  // Escape closes drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedTenant(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleLogin = (t: string) => {
    setToken(t);
    loadAll(t);
  };

  const handleUpdated = (updated: Tenant) => {
    setTenants(prev => prev.map(t => t.id === updated.id ? updated : t));
    if (selectedTenant?.id === updated.id) setSelectedTenant(updated);
  };

  const handleCreated = (tenant: Tenant) => {
    setTenants(prev => [tenant, ...prev]);
    setCreating(false);
  };

  // After adding a branch, drop into its drawer so the admin can immediately
  // fill in review platform URLs, refresh rates, run a connection test, and
  // set up its hall/floor plan — all per-tenant settings the Add Branch form
  // intentionally keeps minimal.
  const handleBranchAdded = (tenant: Tenant) => {
    setTenants(prev => [tenant, ...prev]);
    setSelectedTenant(tenant);
  };

  const handleDeleted = (id: string) => {
    setTenants(prev => prev.filter(t => t.id !== id));
    setSelectedTenant(null);
  };

  const logout = () => {
    setToken('');
    localStorage.removeItem('trace_admin_token');
    setTenants([]);
    setStatuses({});
    setSelectedTenant(null);
  };

  const handleSavePlan = useCallback(async (updated: HallPlan) => {
    if (!editingPlan) return;
    await traceApi.admin.saveHallPlan(token, editingPlan.tenantId, updated);
    setEditingPlan(prev => prev ? { ...prev, plan: updated } : null);
  }, [token, editingPlan]);

  const filtered = tenants.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.subdomain.toLowerCase().includes(q)) return false;
    }
    switch (filter) {
      case 'active': return t.enabled;
      case 'inactive': return !t.enabled;
      default: return true;
    }
  });

  // Collapse sibling branches into a single row — branches are accessed via
  // the "Branches" list inside the drawer rather than as separate rows.
  const orgCounts = tenants.reduce((acc, t) => {
    if (t.organization_id) acc[t.organization_id] = (acc[t.organization_id] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Pick the earliest-created tenant in each organization as the row shown
  // in the table — newly added branches must not bump the original tenant.
  const collapseByOrg = (list: Tenant[]): Tenant[] => {
    const result: Tenant[] = [];
    const orgSlot = new Map<string, number>();
    for (const t of list) {
      if (t.organization_id) {
        const idx = orgSlot.get(t.organization_id);
        if (idx !== undefined) {
          if (new Date(t.created_at) < new Date(result[idx].created_at)) {
            result[idx] = t;
          }
          continue;
        }
        orgSlot.set(t.organization_id, result.length);
      }
      result.push(t);
    }
    return result;
  };

  const displayed = collapseByOrg(filtered);
  const totalDisplayed = collapseByOrg(tenants).length;

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'inactive', label: 'Inactive' },
  ];

  if (!token) return <AdminLogin onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-background text-text flex flex-col">
      {editingPlan && (
        <HallEditor
          key={editingPlan.plan.id}
          plan={editingPlan.plan}
          section={editingPlan.section}
          onSave={handleSavePlan}
          onClose={() => setEditingPlan(null)}
        />
      )}

      {/* Header */}
      <div className="border-b border-border px-4 sm:px-6 py-3.5 flex items-center justify-between flex-shrink-0 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-display text-[16px] font-black tracking-[0.2em]">TRACE</span>
          <span className="text-muted text-[12px] opacity-40">/</span>
          <span className="text-[10px] uppercase tracking-[0.28em] text-muted font-semibold">Admin</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => loadAll(token)}
            className="flex items-center gap-1.5 text-muted hover:text-text text-[11px] px-2.5 sm:px-3 py-1.5 border border-border rounded-lg transition-colors"
          >
            <RefreshCw size={11} /> <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-[12px] font-semibold px-3 sm:px-3.5 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={13} /> <span className="hidden sm:inline">Add Restaurant</span><span className="sm:hidden">Add</span>
          </button>
          <button
            onClick={logout}
            title="Logout"
            className="flex items-center gap-1.5 text-muted hover:text-text text-[11px] px-2.5 py-1.5 border border-border rounded-lg transition-colors"
          >
            <LogOut size={11} />
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 px-4 py-4 sm:px-6 sm:py-6 max-w-[1080px] w-full mx-auto">

        <StatsBar tenants={tenants} statuses={statuses} statusLoading={statusLoading} />

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 mb-4">
          <div className="relative sm:max-w-[280px] w-full">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search restaurants..."
              className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-[12px] text-text focus:border-primary focus:outline-none transition-colors placeholder:text-muted/60"
            />
          </div>

          <div className="flex items-center gap-1">
            {filterTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors
                  ${filter === tab.id
                    ? 'bg-primary text-white'
                    : 'text-muted hover:text-text border border-border'}`}
              >
                {tab.label}
              </button>
            ))}
            <span className="text-[10px] text-muted ml-auto sm:hidden tabular-nums">
              {displayed.length} / {totalDisplayed}
            </span>
          </div>

          <span className="text-[10px] text-muted ml-auto tabular-nums hidden sm:inline">
            {displayed.length} / {totalDisplayed}
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-24 text-muted">
            <Building2 size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-[13px]">No restaurants yet</p>
            <button
              onClick={() => setCreating(true)}
              className="mt-3 text-primary hover:underline text-[12px]"
            >
              Add your first restaurant →
            </button>
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-24 text-muted text-[13px]">
            No restaurants match your filters.
          </div>
        ) : (
          <>
          {/* Mobile card list */}
          <div className="sm:hidden bg-card border border-border rounded-xl overflow-hidden">
            {displayed.map(t => (
              <TenantCard
                key={t.id}
                tenant={t}
                status={statuses[t.id]}
                selected={selectedTenant?.id === t.id}
                branchCount={t.organization_id ? (orgCounts[t.organization_id] ?? 1) : 1}
                onClick={() => setSelectedTenant(prev => prev?.id === t.id ? null : t)}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border">
                  {['Restaurant', 'Status', 'Plugin', 'Last event', ''].map((col, i) => (
                    <th
                      key={i}
                      className="px-4 py-2.5 text-left text-[8px] uppercase tracking-[0.22em] text-muted font-semibold"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map(t => (
                  <TenantRow
                    key={t.id}
                    tenant={t}
                    status={statuses[t.id]}
                    selected={selectedTenant?.id === t.id}
                    branchCount={t.organization_id ? (orgCounts[t.organization_id] ?? 1) : 1}
                    onClick={() => setSelectedTenant(prev => prev?.id === t.id ? null : t)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <TenantDrawer
        tenant={selectedTenant}
        tenants={tenants}
        token={token}
        status={selectedTenant ? statuses[selectedTenant.id] : undefined}
        events={drawerEvents}
        eventsLoading={drawerEventsLoading}
        onClose={() => setSelectedTenant(null)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
        onOpenEditor={(plan, section) => setEditingPlan({ plan, section, tenantId: selectedTenant!.id })}
        onBranchAdded={handleBranchAdded}
        onSelectBranch={setSelectedTenant}
      />

      {creating && (
        <CreateModal token={token} onCreated={handleCreated} onClose={() => setCreating(false)} />
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, RefreshCw, LogOut, Building2, CheckCircle2, Activity, Zap, WifiOff } from 'lucide-react';
import { traceApi, Tenant, LiveStatus, RealtimeEvent, HallPlan, IikoSection, ConnectionTestResults } from '../../services/traceApi';
import { HallEditor } from '../HallEditor';
import { AdminLogin } from './AdminLogin';
import { TenantItem } from './TenantList';
import { TenantDrawer } from './TenantDrawer';
import { OnboardTenant } from './OnboardTenant';

// ── StatsBar ──────────────────────────────────────────────────────────────

const StatsBar: React.FC<{ tenants: Tenant[]; statuses: Record<string, LiveStatus>; statusLoading: boolean }> = ({ tenants, statuses, statusLoading }) => {
  const total = tenants.length;
  const active = tenants.filter(t => t.enabled).length;
  const inactive = tenants.filter(t => !t.enabled).length;
  const pluginConnected = Object.values(statuses).filter(s => s.pluginConnected).length;
  const eventsToday = Object.values(statuses).reduce((sum, s) => sum + (s.eventsToday ?? 0), 0);

  const stats = [
    { label: 'Total', value: String(total), icon: <Building2 size={13} />, color: 'text-text' },
    { label: 'Active', value: String(active), icon: <CheckCircle2 size={13} />, color: 'text-success' },
    { label: 'Inactive', value: String(inactive), icon: <Building2 size={13} />, color: 'text-muted' },
    { label: 'Plugin live', value: statusLoading ? '—' : String(pluginConnected), icon: <Activity size={13} />, color: 'text-secondary' },
    { label: 'Orders today', value: statusLoading ? '—' : eventsToday.toLocaleString(), icon: <Zap size={13} />, color: 'text-primary' },
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

// ── Admin root ────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'active' | 'inactive';

export const Admin: React.FC = () => {
  const [token, setToken] = useState<string>(() => localStorage.getItem('trace_admin_token') || '');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [statuses, setStatuses] = useState<Record<string, LiveStatus>>({});
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [drawerEvents, setDrawerEvents] = useState<RealtimeEvent[]>([]);
  const [drawerEventsLoading, setDrawerEventsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [editingPlan, setEditingPlan] = useState<{ plan: HallPlan; section?: IikoSection; tenantId: string } | null>(null);
  // Connection-test results, cached per tenant for the session so switching
  // away and back to a tenant doesn't lose a result the admin just checked.
  const [testCache, setTestCache] = useState<Record<string, ConnectionTestResults>>({});

  const loadTenants = useCallback(async (t: string) => {
    setLoading(true);
    setLoadErr('');
    try {
      const list = await traceApi.admin.tenants(t);
      setTenants(list);
    } catch (ex: any) {
      // Only a real auth rejection should log the admin out — a network
      // blip or a backend restart must not silently drop the session.
      const msg = String(ex?.message ?? '');
      if (msg.startsWith('401') || msg.startsWith('403')) {
        setToken('');
        localStorage.removeItem('trace_admin_token');
      } else {
        setLoadErr('Could not reach the server. Retry?');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatuses = useCallback(async (t: string) => {
    setStatusLoading(true);
    try {
      setStatuses(await traceApi.admin.liveStatus(t));
    } catch (ex) {
      console.warn('[admin] live-status fetch failed:', ex);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadAll = useCallback((t: string) => {
    loadTenants(t);
    loadStatuses(t);
  }, [loadTenants, loadStatuses]);

  useEffect(() => { if (token) loadAll(token); }, [token, loadAll]);

  useEffect(() => {
    if (!selectedTenant || !token) { setDrawerEvents([]); return; }
    setDrawerEventsLoading(true);
    traceApi.admin.tenantEvents(token, selectedTenant.id, 15)
      .then(setDrawerEvents)
      .catch(ex => { console.warn('[admin] events fetch failed:', ex); setDrawerEvents([]); })
      .finally(() => setDrawerEventsLoading(false));
  }, [selectedTenant?.id, token]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedTenant(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleLogin = (t: string) => { setToken(t); loadAll(t); };

  const handleUpdated = (updated: Tenant) => {
    setTenants(prev => prev.map(t => t.id === updated.id ? updated : t));
    if (selectedTenant?.id === updated.id) setSelectedTenant(updated);
  };

  const handleCreated = (tenant: Tenant) => {
    setTenants(prev => [tenant, ...prev]);
    setCreating(false);
    // Drop straight into the new tenant's drawer — review URLs, Telegram,
    // loyalty, 1C, and hall plans all still need to be filled in, and the
    // health checklist there makes that obvious immediately.
    setSelectedTenant(tenant);
  };

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

  // Tells TenantDrawer a plan was actually persisted, so it can clear the
  // plan's local "_isNew" flag — otherwise a hall created via "Add Hall" or
  // "Sync iiko" stays permanently un-renameable/un-reorderable/un-deletable
  // via the API even after HallEditor successfully saved it here.
  const [justSavedPlan, setJustSavedPlan] = useState<{ tenantId: string; plan: HallPlan } | null>(null);

  const handleSavePlan = useCallback(async (updated: HallPlan) => {
    if (!editingPlan) return;
    await traceApi.admin.saveHallPlan(token, editingPlan.tenantId, updated);
    setEditingPlan(prev => prev ? { ...prev, plan: updated } : null);
    setJustSavedPlan({ tenantId: editingPlan.tenantId, plan: updated });
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
  // the "Branches" section inside the drawer rather than as separate rows.
  // Counted off `filtered` (not the unfiltered `tenants`) so the badge
  // agrees with what's actually visible under the active search/filter.
  const orgCounts = filtered.reduce((acc, t) => {
    if (t.organization_id) acc[t.organization_id] = (acc[t.organization_id] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const collapseByOrg = useCallback((list: Tenant[]): Tenant[] => {
    const result: Tenant[] = [];
    const orgSlot = new Map<string, number>();
    for (const t of list) {
      if (t.organization_id) {
        const idx = orgSlot.get(t.organization_id);
        if (idx !== undefined) {
          if (new Date(t.created_at) < new Date(result[idx].created_at)) result[idx] = t;
          continue;
        }
        orgSlot.set(t.organization_id, result.length);
      }
      result.push(t);
    }
    return result;
  }, []);

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
          <button onClick={() => loadAll(token)} className="flex items-center gap-1.5 text-muted hover:text-text text-[11px] px-2.5 sm:px-3 py-1.5 border border-border rounded-lg transition-colors">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-[12px] font-semibold px-3 sm:px-3.5 py-1.5 rounded-lg transition-colors">
            <Plus size={13} /> <span className="hidden sm:inline">Add Restaurant</span><span className="sm:hidden">Add</span>
          </button>
          <button onClick={logout} title="Logout" className="flex items-center gap-1.5 text-muted hover:text-text text-[11px] px-2.5 py-1.5 border border-border rounded-lg transition-colors">
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
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${filter === tab.id ? 'bg-primary text-white' : 'text-muted hover:text-text border border-border'}`}
              >
                {tab.label}
              </button>
            ))}
            <span className="text-[10px] text-muted ml-auto sm:hidden tabular-nums">{displayed.length} / {totalDisplayed}</span>
          </div>
          <span className="text-[10px] text-muted ml-auto tabular-nums hidden sm:inline">{displayed.length} / {totalDisplayed}</span>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : loadErr ? (
          <div className="text-center py-24">
            <WifiOff size={28} className="mx-auto mb-3 text-muted opacity-40" />
            <p className="text-[13px] text-muted mb-3">{loadErr}</p>
            <button onClick={() => loadAll(token)} className="text-primary hover:underline text-[12px]">Try again →</button>
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-24 text-muted">
            <Building2 size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-[13px]">No restaurants yet</p>
            <button onClick={() => setCreating(true)} className="mt-3 text-primary hover:underline text-[12px]">Add your first restaurant →</button>
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-24 text-muted text-[13px]">No restaurants match your filters.</div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {displayed.map(t => (
              <TenantItem
                key={t.id}
                tenant={t}
                status={statuses[t.id]}
                // collapseByOrg only ever shows the org's earliest-created
                // tenant as this row — without the org-membership check,
                // selecting a *sibling* branch from the drawer's Branches
                // section left no row highlighted at all.
                selected={selectedTenant?.id === t.id || (!!t.organization_id && t.organization_id === selectedTenant?.organization_id)}
                branchCount={t.organization_id ? (orgCounts[t.organization_id] ?? 1) : 1}
                onClick={() => setSelectedTenant(prev => prev?.id === t.id ? null : t)}
              />
            ))}
          </div>
        )}
      </div>

      <TenantDrawer
        tenant={selectedTenant}
        tenants={tenants}
        token={token}
        status={selectedTenant ? statuses[selectedTenant.id] : undefined}
        events={drawerEvents}
        eventsLoading={drawerEventsLoading}
        testCache={testCache}
        onTestCached={(id, result) => setTestCache(prev => ({ ...prev, [id]: result }))}
        onClose={() => setSelectedTenant(null)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
        onOpenEditor={(plan, section) => setEditingPlan({ plan, section, tenantId: selectedTenant!.id })}
        onBranchAdded={handleBranchAdded}
        onSelectBranch={setSelectedTenant}
        justSavedPlan={justSavedPlan}
      />

      {creating && (
        <OnboardTenant
          token={token}
          existingSubdomains={tenants.map(t => t.subdomain)}
          onCreated={handleCreated}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
};

export default Admin;

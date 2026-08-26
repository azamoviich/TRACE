import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, X, Check, ChevronRight, Copy, ExternalLink, Globe,
  Building2, Activity, LayoutGrid, Pencil, Settings2, KeyRound,
  Server, GripVertical, Loader2, RefreshCw, Send, Download,
} from 'lucide-react';
import { traceApi, Tenant, LiveStatus, RealtimeEvent, HallPlan, IikoSection, Organization, ConnectionTestResults } from '../../services/traceApi';
import { Field, PasswordField, ServerField, SectionHeading, ReadRow, FieldLabel, Empty, PillToggle, inputBase } from './primitives';
import { DOMAIN, tenantUrl, relativeTime, mask, copyToClipboard, BENEDICT_ORG_ID_MANAGER_PORTAL, TEST_KEY_LABELS } from './helpers';
import { computeHealth } from './health';
import { AddBranchModal } from './OnboardTenant';

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
  order_opened: 'text-success',
  order_updated: 'text-secondary',
  order_closed: 'text-primary',
  order_removed: 'text-danger',
  cashier_session_opened: 'text-secondary',
  cashier_session_closed: 'text-secondary',
  stop_list_added: 'text-primary',
};

// A section id + its nav-rail label. Anchors, not tabs — every section is
// always in the DOM, this just scrolls the panel to it. See admin redesign
// plan Phase 3: replaces the old 4-way nested tab bar.
const SECTIONS = [
  { id: 'health', label: 'Health' },
  { id: 'access', label: 'Access & POS' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'branches', label: 'Branches' },
  { id: 'halls', label: 'Floor plans' },
  { id: 'activity', label: 'Activity' },
  { id: 'danger', label: 'Danger zone' },
] as const;

type EditForm = {
  name: string; plan: 'base' | 'pro';
  pos_type: 'iiko' | 'poster';
  poster_account_name: string; poster_access_token: string; poster_spot_id: string;
  iiko_login: string; iiko_password: string; iiko_server_host: string; iiko_cloud_api: string;
  iiko_loyalty_app_id: string; iiko_loyalty_client_secret: string;
  onec_base_url: string; onec_login: string; onec_password: string;
  app_login: string; app_password: string; manager_pin: string;
  google_maps_url: string; yandex_maps_url: string; tripadvisor_url: string; twogis_url: string;
  telegram_chat_id: string;
  review_refresh_google: string; review_refresh_yandex: string; review_refresh_2gis: string; review_refresh_tripadvisor: string;
  iiko_chain_server_host: string; iiko_chain_login: string; iiko_chain_password: string;
};

function formFromTenant(tenant: Tenant, org: Organization | null): EditForm {
  const raw = tenant.iiko_server ?? '';
  const chainRaw = org?.iiko_chain_server ?? '';
  return {
    name: tenant.name, plan: tenant.plan === 'base' ? 'base' : 'pro',
    pos_type: tenant.pos_type ?? 'iiko',
    poster_account_name: tenant.poster_account_name ?? '', poster_access_token: tenant.poster_access_token ?? '', poster_spot_id: tenant.poster_spot_id ?? '',
    iiko_login: tenant.iiko_login ?? '', iiko_password: tenant.iiko_password ?? '',
    iiko_server_host: raw.replace(/^https?:\/\//, ''), iiko_cloud_api: tenant.iiko_cloud_api ?? '',
    iiko_loyalty_app_id: tenant.iiko_loyalty_app_id ?? '', iiko_loyalty_client_secret: tenant.iiko_loyalty_client_secret ?? '',
    onec_base_url: tenant.onec_base_url ?? '', onec_login: tenant.onec_login ?? '', onec_password: tenant.onec_password ?? '',
    app_login: tenant.app_login ?? '', app_password: '', manager_pin: '',
    google_maps_url: tenant.google_maps_url ?? '', yandex_maps_url: tenant.yandex_maps_url ?? '',
    tripadvisor_url: tenant.tripadvisor_url ?? '', twogis_url: tenant.twogis_url ?? '',
    telegram_chat_id: tenant.telegram_chat_id ?? '',
    review_refresh_google: tenant.review_refresh_google != null ? String(tenant.review_refresh_google) : '',
    review_refresh_yandex: tenant.review_refresh_yandex != null ? String(tenant.review_refresh_yandex) : '',
    review_refresh_2gis: tenant.review_refresh_2gis != null ? String(tenant.review_refresh_2gis) : '',
    review_refresh_tripadvisor: tenant.review_refresh_tripadvisor != null ? String(tenant.review_refresh_tripadvisor) : '',
    iiko_chain_server_host: chainRaw.replace(/^https?:\/\//, ''), iiko_chain_login: org?.iiko_chain_login ?? '', iiko_chain_password: org?.iiko_chain_password ?? '',
  };
}

export const TenantDrawer: React.FC<{
  tenant: Tenant | null;
  tenants: Tenant[];
  token: string;
  status: LiveStatus | undefined;
  events: RealtimeEvent[];
  eventsLoading: boolean;
  testCache: Record<string, ConnectionTestResults>;
  onTestCached: (tenantId: string, result: ConnectionTestResults) => void;
  onClose: () => void;
  onUpdated: (t: Tenant) => void;
  onDeleted: (id: string) => void;
  onOpenEditor: (plan: HallPlan, section?: IikoSection) => void;
  onBranchAdded: (t: Tenant) => void;
  onSelectBranch: (t: Tenant) => void;
  // Set by the parent whenever the (separately-rendered) HallEditor
  // actually persists a plan — including ones that started as client-only
  // stubs (from "Add Hall" or "Sync iiko"). Without this, `_isNew` never
  // clears for such a plan even after it's live on the backend, so its
  // rename/reorder/delete-via-API stay silently broken from then on.
  justSavedPlan: { tenantId: string; plan: HallPlan } | null;
}> = ({ tenant, tenants, token, status, events, eventsLoading, testCache, onTestCached, onClose, onUpdated, onDeleted, onOpenEditor, onBranchAdded, onSelectBranch, justSavedPlan }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [serverProto, setServerProto] = useState<'http' | 'https'>('http');
  const [chainProto, setChainProto] = useState<'http' | 'https'>('http');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [toggling, setToggling] = useState(false);
  const [toggleErr, setToggleErr] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTypedSubdomain, setDeleteTypedSubdomain] = useState('');
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hallPlans, setHallPlans] = useState<(HallPlan & { _isNew?: boolean })[]>([]);
  const [hallPlansErr, setHallPlansErr] = useState('');
  const [hallPlansLoading, setHallPlansLoading] = useState(false);
  const [draggedPlanId, setDraggedPlanId] = useState<string | null>(null);
  const [hallActionErr, setHallActionErr] = useState('');
  const [iikoSections, setIikoSections] = useState<IikoSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsErr, setSectionsErr] = useState('');
  const [siblingBranches, setSiblingBranches] = useState<{ id: string; name: string; subdomain: string }[]>([]);
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [pullingReviews, setPullingReviews] = useState(false);
  const [pullReviewsMsg, setPullReviewsMsg] = useState('');
  const [confirmNotify, setConfirmNotify] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState('');

  const testResult = tenant ? testCache[tenant.id] : undefined;

  // Guards the async loads below against a fast tenant-A → tenant-B switch:
  // without this, tenant A's slower response could land after B's drawer
  // is already showing, silently overwriting B's data with A's.
  const activeTenantIdRef = useRef<string | null>(null);
  const renameOriginalRef = useRef<Record<string, string>>({});

  const loadBranches = useCallback(async (tenantId: string) => {
    try {
      const branches = await traceApi.admin.branches(token, tenantId);
      if (activeTenantIdRef.current === tenantId) setSiblingBranches(branches);
    } catch {
      if (activeTenantIdRef.current === tenantId) setSiblingBranches([]);
    }
  }, [token]);

  const loadHallPlans = useCallback(async (tenantId: string) => {
    setHallPlansLoading(true);
    setHallPlansErr('');
    try {
      const plans = await traceApi.admin.hallPlans(token, tenantId);
      if (activeTenantIdRef.current === tenantId) setHallPlans(plans);
    } catch (e: any) {
      if (activeTenantIdRef.current === tenantId) setHallPlansErr(e.message ?? 'Could not load floor plans');
    } finally {
      if (activeTenantIdRef.current === tenantId) setHallPlansLoading(false);
    }
  }, [token]);

  // Read-only sections fetch — no stub-plan creation — so the hall editor
  // has table data (`section`) for plans that already exist, without
  // silently generating new plans just because the drawer was opened.
  const loadIikoSectionsReadOnly = useCallback(async (tenantId: string) => {
    try {
      const sections = await traceApi.admin.iikoSections(token, tenantId);
      if (activeTenantIdRef.current === tenantId) setIikoSections(sections);
    } catch {
      // best-effort — "Sync iiko" surfaces a real error if this matters
    }
  }, [token]);

  // Full sync — fetches sections AND creates local stub plans for any iiko
  // section that doesn't have one yet. User-triggered only ("Sync iiko"
  // button), never automatic.
  const fetchIikoSections = useCallback(async (tenantId: string) => {
    setSectionsLoading(true);
    setSectionsErr('');
    try {
      const sections = await traceApi.admin.iikoSections(token, tenantId);
      setIikoSections(sections);
      setHallPlans(prev => {
        const existingIds = new Set(prev.map(p => p.iiko_section_id));
        const newPlans = sections
          .filter(s => !existingIds.has(s.id))
          .map((s, i) => ({
            id: crypto.randomUUID(), tenant_id: tenantId, iiko_section_id: s.id,
            name: s.name, display_order: prev.length + i, elements: [], _isNew: true,
          }));
        return newPlans.length > 0 ? [...prev, ...newPlans] : prev;
      });
    } catch {
      setSectionsErr("Could not load sections from iiko — check the tenant's Cloud API credentials");
    } finally {
      setSectionsLoading(false);
    }
  }, [token]);

  const deletePlan = useCallback(async (plan: HallPlan & { _isNew?: boolean }) => {
    setHallActionErr('');
    if (plan._isNew) {
      // Never saved — just drop it locally, no API call.
      setHallPlans(prev => prev.filter(p => p.id !== plan.id));
      return;
    }
    if (!tenant) return;
    try {
      await traceApi.admin.deleteHallPlan(token, tenant.id, plan.id);
      setHallPlans(prev => prev.filter(p => p.id !== plan.id));
    } catch (e: any) {
      setHallActionErr(e.message ?? 'Could not delete floor plan');
    }
  }, [token, tenant]);

  useEffect(() => {
    if (!tenant) return;
    activeTenantIdRef.current = tenant.id;
    setForm(formFromTenant(tenant, null));
    // formFromTenant strips the scheme off iiko_server/iiko_chain_server —
    // without re-deriving the proto toggle here it silently stayed at
    // whatever it was left on (including from a *previous* tenant), and
    // saving would rewrite the URL with the wrong/stale scheme.
    setServerProto((tenant.iiko_server ?? '').startsWith('https://') ? 'https' : 'http');
    setChainProto('http'); // corrected below once/if the org loads with its own server
    setEditing(false);
    setSaveErr('');
    setToggleErr('');
    setDeleteErr('');
    setConfirmDelete(false);
    setDeleteTypedSubdomain('');
    setCopied(false);
    setHallPlans([]);
    setHallPlansErr('');
    setIikoSections([]);
    setSectionsErr('');
    setHallActionErr('');
    setAddBranchOpen(false);
    setOrganization(null);
    setPullReviewsMsg('');
    setConfirmNotify(false);
    setNotifyMsg('');
    loadHallPlans(tenant.id);
    loadBranches(tenant.id);
    if (tenant.pos_type !== 'poster') loadIikoSectionsReadOnly(tenant.id);
    if (tenant.organization_id) {
      const tenantIdAtFetch = tenant.id;
      traceApi.admin.organization(token, tenant.id)
        .then(org => {
          if (activeTenantIdRef.current !== tenantIdAtFetch) return; // switched tenants while this was in flight
          setOrganization(org);
          if (org) {
            // Merge only the chain fields into whatever form state already
            // exists instead of rebuilding the whole form — rebuilding would
            // silently discard any edit the admin started typing before
            // this (slower, org-scoped) request resolved.
            const chainRaw = org.iiko_chain_server ?? '';
            setChainProto(chainRaw.startsWith('https://') ? 'https' : 'http');
            setForm(f => f ? {
              ...f,
              iiko_chain_server_host: chainRaw.replace(/^https?:\/\//, ''),
              iiko_chain_login: org.iiko_chain_login ?? '',
              iiko_chain_password: org.iiko_chain_password ?? '',
            } : f);
          }
        })
        .catch(() => { if (activeTenantIdRef.current === tenantIdAtFetch) setOrganization(null); });
    }
  }, [tenant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge in a plan HallEditor just saved (via the parent's handleSavePlan)
  // — clears _isNew now that it's actually persisted, and picks up the
  // drawn elements without a full reload.
  useEffect(() => {
    if (!tenant || !justSavedPlan || justSavedPlan.tenantId !== tenant.id) return;
    setHallPlans(prev => prev.some(p => p.id === justSavedPlan.plan.id)
      ? prev.map(p => p.id === justSavedPlan.plan.id ? { ...justSavedPlan.plan, _isNew: false } : p)
      : [...prev, { ...justSavedPlan.plan, _isNew: false }]);
  }, [justSavedPlan, tenant?.id]);

  const handleSave = async () => {
    if (!tenant || !form) return;
    setSaving(true);
    setSaveErr('');

    let updated: Tenant;
    try {
      const iiko_server = form.iiko_server_host ? `${serverProto}://${form.iiko_server_host}` : null;
      const parseCount = (v: string) => v.trim() === '' ? null : Math.max(1, Math.min(50, parseInt(v, 10) || 0));
      updated = await traceApi.admin.update(token, tenant.id, {
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
    } catch (ex: any) {
      setSaveErr(ex.message);
      setSaving(false);
      return;
    }

    // Tenant save succeeded — commit it regardless of what happens to the
    // chain/org save below. A failed chain save must not make it look like
    // the whole save (including the fields the admin actually came here to
    // change) silently failed.
    onUpdated(updated);
    setEditing(false);

    if (organization) {
      try {
        const iiko_chain_server = form.iiko_chain_server_host ? `${chainProto}://${form.iiko_chain_server_host}` : null;
        const updatedOrg = await traceApi.admin.updateOrganization(token, organization.id, {
          iiko_chain_server,
          iiko_chain_login: form.iiko_chain_login || null,
          iiko_chain_password: form.iiko_chain_password || null,
        });
        setOrganization(updatedOrg);
      } catch (ex: any) {
        setSaveErr(`Saved, but the iikoChain server settings failed: ${ex.message}`);
      }
    }

    setSaving(false);
  };

  const handleToggle = async () => {
    if (!tenant) return;
    setToggling(true);
    setToggleErr('');
    try {
      const updated = tenant.enabled
        ? await traceApi.admin.disable(token, tenant.id)
        : await traceApi.admin.update(token, tenant.id, { enabled: true });
      onUpdated(updated);
    } catch (ex: any) {
      setToggleErr(ex.message ?? 'Could not change status');
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!tenant) return;
    setDeleting(true);
    setDeleteErr('');
    try {
      await traceApi.admin.deleteTenant(token, tenant.id);
      onDeleted(tenant.id);
      onClose();
    } catch (ex: any) {
      setDeleteErr(ex.message ?? 'Could not delete');
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async () => {
    if (!tenant) return;
    setTesting(true);
    try {
      const result = await traceApi.admin.testConnection(token, tenant.id);
      onTestCached(tenant.id, result);
    } catch {
      // The request itself failed (network/exception), not one specific
      // check — report every relevant key as failed rather than just
      // "server", so a full outage doesn't read as "only iiko Server broke".
      onTestCached(tenant.id, {
        cloud_api: { ok: false, error: 'Request failed' },
        server: { ok: false, error: 'Request failed' },
      });
    } finally {
      setTesting(false);
    }
  };

  const handlePullReviews = async () => {
    if (!tenant) return;
    setPullingReviews(true);
    setPullReviewsMsg('');
    try {
      await traceApi.admin.pullReviews(token, tenant.id);
      // The backend fires this async and returns immediately — this only
      // means the pull started, not that it succeeded.
      setPullReviewsMsg('Started — check back in a minute for new reviews.');
    } catch (ex: any) {
      setPullReviewsMsg(`Failed to start: ${ex.message}`);
    } finally {
      setPullingReviews(false);
    }
  };

  const handleNotifyExisting = async () => {
    if (!tenant) return;
    setNotifying(true);
    setNotifyMsg('');
    try {
      const r = await traceApi.admin.notifyExistingReviews(token, tenant.id);
      setNotifyMsg(r.ok
        ? `Sent ${r.sent} notification${r.sent === 1 ? '' : 's'}.`
        : 'Nothing was sent — check the Telegram bot token and that the bot is in the chat.');
    } catch (ex: any) {
      setNotifyMsg(`Failed: ${ex.message}`);
    } finally {
      setNotifying(false);
      setConfirmNotify(false);
    }
  };

  const copyUrl = () => {
    if (!tenant) return;
    copyToClipboard(tenantUrl(tenant.subdomain));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const open = !!tenant;
  const health = tenant ? computeHealth(tenant, status, testResult) : null;

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />}

      <div
        className={`fixed right-0 top-0 bottom-0 w-full sm:w-[720px] bg-surface border-l border-border z-50 flex
          transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {tenant && form && (
          <>
            {/* Section nav rail — anchors, not tabs. Only worth showing once
                the panel is wide enough to have a real second column. */}
            <div className="hidden sm:flex w-[132px] flex-shrink-0 border-r border-border flex-col py-5 gap-0.5 overflow-y-auto">
              {SECTIONS.map(s => (
                <a
                  key={s.id}
                  href={`#drawer-${s.id}`}
                  className="text-[11px] text-muted hover:text-text hover:bg-card-hover px-4 py-1.5 rounded-r-lg transition-colors"
                >
                  {s.label}
                </a>
              ))}
            </div>

            <div className="flex-1 flex flex-col min-w-0">
              {/* Sticky header */}
              <div className="flex items-start justify-between p-5 border-b border-border flex-shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[15px] font-bold text-text leading-tight">{tenant.name}</span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider flex-shrink-0
                      ${tenant.enabled ? 'bg-success/10 text-success' : 'bg-card-hover text-muted'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tenant.enabled ? 'bg-success' : 'bg-muted/50'}`} />
                      {tenant.enabled ? 'Active' : 'Disabled'}
                    </span>
                    {health && (
                      <span className="text-[9px] font-semibold text-muted bg-card-hover rounded-full px-1.5 py-0.5 flex-shrink-0">
                        {health.score}/{health.scoreTotal} healthy
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={tenantUrl(tenant.subdomain)} target="_blank" rel="noreferrer"
                      className="text-[11px] text-muted hover:text-primary transition-colors flex items-center gap-1 font-mono">
                      <Globe size={10} />{tenant.subdomain}.{DOMAIN}<ExternalLink size={9} className="ml-0.5" />
                    </a>
                    <button onClick={copyUrl} className="text-muted hover:text-text transition-colors">
                      {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                  <button
                    onClick={() => { setEditing(e => !e); setSaveErr(''); setConfirmDelete(false); setDeleteTypedSubdomain(''); }}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1.5
                      ${editing ? 'border-primary/50 text-primary' : 'border-border text-muted hover:text-text hover:border-primary/50'}`}
                  >
                    {editing ? <X size={11} /> : <Pencil size={11} />}
                    {editing ? 'Cancel' : 'Edit'}
                  </button>
                  <button
                    onClick={handleToggle}
                    disabled={toggling}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors font-medium disabled:opacity-50 min-w-[58px] flex items-center justify-center
                      ${tenant.enabled ? 'border-border text-muted hover:text-text hover:border-muted' : 'border-success/30 text-success hover:border-success/70'}`}
                  >
                    {toggling ? <span className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" /> : tenant.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={onClose} className="p-1.5 text-muted hover:text-text transition-colors rounded-lg hover:bg-card-hover">
                    <X size={15} />
                  </button>
                </div>
              </div>
              {toggleErr && <p className="text-danger text-[10px] px-5 pt-2">{toggleErr}</p>}

              {editing && (
                <div className="px-5 pt-3 flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-[12px] font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Save all changes
                  </button>
                </div>
              )}
              {/* Outside the `editing` block on purpose — a chain/org save
                  can fail (and report here) after the tenant save already
                  succeeded and closed edit mode. */}
              {saveErr && <p className="text-danger text-[10px] px-5 pt-2">{saveErr}</p>}

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)] [&>section]:scroll-mt-4">

                {/* ── Health ── */}
                <section id="drawer-health" className="p-5 border-b border-border">
                  <div className="flex items-center justify-between mb-3.5">
                    <h3 className="text-[9px] uppercase tracking-[0.22em] font-semibold text-muted">Health</h3>
                    <button
                      onClick={handleTest}
                      disabled={testing}
                      className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-primary/50 transition-colors disabled:opacity-50"
                    >
                      {testing ? <Loader2 size={12} className="animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                      {testing ? 'Testing…' : 'Test connection'}
                    </button>
                  </div>
                  {health && (
                    <div className="space-y-2 mb-3">
                      {health.checks.map(c => (
                        <div key={c.key} className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-2 text-text">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              c.state === 'ok' ? 'bg-success' : c.state === 'missing' ? 'bg-danger' : 'bg-muted/40'
                            }`} />
                            {c.label}
                          </span>
                          <span className="text-muted text-[11px]">{c.detail ?? (c.state === 'ok' ? 'ok' : c.state)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {testResult && (
                    <div className="space-y-2 pt-2 border-t border-border/40">
                      {Object.entries(testResult).map(([key, val]) => val && (
                        <div key={key}>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted uppercase tracking-[0.15em]">{TEST_KEY_LABELS[key] ?? key}</span>
                            <span className={`flex items-center gap-1.5 text-[11px] font-mono ${val.ok ? 'text-success' : 'text-danger'}`}>
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
                </section>

                {/* ── Access & POS ── */}
                <section id="drawer-access" className="p-5 border-b border-border">
                  <SectionHeading icon={<Settings2 size={12} />} title="General" />
                  {editing ? (
                    <div className="space-y-3 mb-5">
                      <Field label="Name" value={form.name} onChange={v => setForm(f => f && ({ ...f, name: v }))} />
                      <div>
                        <FieldLabel>Plan</FieldLabel>
                        <PillToggle options={['base', 'pro'] as const} value={form.plan} onChange={p => setForm(f => f && ({ ...f, plan: p }))} />
                        <p className="text-[10px] text-muted mt-1.5">
                          {form.plan === 'base' ? 'AI chat limited to 5 msgs / 2h, Daily Briefing only — other AI features locked' : 'Full access to all AI features'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 mb-5">
                      <ReadRow label="Name">{tenant.name}</ReadRow>
                      <ReadRow label="Plan">
                        <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded ${tenant.plan === 'base' ? 'bg-muted/15 text-muted' : 'bg-primary/15 text-primary'}`}>
                          {tenant.plan === 'base' ? 'Base' : 'Pro'}
                        </span>
                      </ReadRow>
                    </div>
                  )}

                  <SectionHeading icon={<Server size={12} />} title="POS Connection" />
                  {editing ? (
                    <div className="space-y-3 mb-5">
                      <PillToggle options={['iiko', 'poster'] as const} value={form.pos_type} onChange={p => setForm(f => f && ({ ...f, pos_type: p }))} />
                      {form.pos_type === 'iiko' && (
                        <div className="space-y-3 pt-2">
                          <ServerField proto={serverProto} onProtoChange={setServerProto} value={form.iiko_server_host} onChange={v => setForm(f => f && ({ ...f, iiko_server_host: v }))} />
                          <Field label="Login" mono value={form.iiko_login} onChange={v => setForm(f => f && ({ ...f, iiko_login: v }))} />
                          <PasswordField label="Password" value={form.iiko_password} onChange={v => setForm(f => f && ({ ...f, iiko_password: v }))} />
                          <Field label="Cloud API Key" mono value={form.iiko_cloud_api} onChange={v => setForm(f => f && ({ ...f, iiko_cloud_api: v }))} />
                        </div>
                      )}
                      {form.pos_type === 'poster' && (
                        <div className="space-y-3 pt-2">
                          <Field label="Account Name" mono value={form.poster_account_name} onChange={v => setForm(f => f && ({ ...f, poster_account_name: v }))} />
                          <PasswordField label="Access Token" value={form.poster_access_token} onChange={v => setForm(f => f && ({ ...f, poster_access_token: v }))} />
                          <Field label="Spot ID" mono value={form.poster_spot_id} onChange={v => setForm(f => f && ({ ...f, poster_spot_id: v }))} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5 mb-5">
                      <ReadRow label="POS System">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded bg-muted/15 text-muted">
                          {(tenant.pos_type ?? 'iiko') === 'poster' ? 'Poster' : 'iiko'}
                        </span>
                      </ReadRow>
                      {(tenant.pos_type ?? 'iiko') === 'iiko' ? (
                        <>
                          <ReadRow label="iiko Server" mono stacked>{tenant.iiko_server || <Empty />}</ReadRow>
                          <ReadRow label="Login" mono>{tenant.iiko_login || <Empty />}</ReadRow>
                          <ReadRow label="Password" mono>{mask(tenant.iiko_password)}</ReadRow>
                          <ReadRow label="Cloud API Key" mono>{mask(tenant.iiko_cloud_api)}</ReadRow>
                        </>
                      ) : (
                        <>
                          <ReadRow label="Account Name" mono>{tenant.poster_account_name || <Empty />}</ReadRow>
                          <ReadRow label="Access Token" mono>{mask(tenant.poster_access_token)}</ReadRow>
                          <ReadRow label="Spot ID" mono>{tenant.poster_spot_id || <Empty />}</ReadRow>
                        </>
                      )}
                    </div>
                  )}

                  {organization && (
                    <>
                      <SectionHeading icon={<Server size={12} />} title="iikoChain" hint={`applies to all ${siblingBranches.length || 1} branches`} />
                      {editing ? (
                        <div className="space-y-3 mb-5">
                          <ServerField label="iikoChain Server" proto={chainProto} onProtoChange={setChainProto} value={form.iiko_chain_server_host} onChange={v => setForm(f => f && ({ ...f, iiko_chain_server_host: v }))} />
                          <Field label="Login" mono value={form.iiko_chain_login} onChange={v => setForm(f => f && ({ ...f, iiko_chain_login: v }))} />
                          <PasswordField label="Password" value={form.iiko_chain_password} onChange={v => setForm(f => f && ({ ...f, iiko_chain_password: v }))} />
                        </div>
                      ) : (
                        <div className="space-y-2.5 mb-5">
                          <ReadRow label="iikoChain Server" mono stacked>{organization.iiko_chain_server || <Empty />}</ReadRow>
                          <ReadRow label="Login" mono>{organization.iiko_chain_login || <Empty />}</ReadRow>
                          <ReadRow label="Password" mono>{mask(organization.iiko_chain_password)}</ReadRow>
                          {!organization.iiko_chain_server && (
                            <p className="text-[10px] text-primary/80 pt-1">Not configured — the "All branches" option won't appear in the app's branch selector until this is set.</p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <SectionHeading icon={<KeyRound size={12} />} title="iikoLoyalty" hint="separate credentials from iiko developer portal" />
                  {editing ? (
                    <div className="space-y-3 mb-5">
                      <Field label="Loyalty App ID" mono value={form.iiko_loyalty_app_id} onChange={v => setForm(f => f && ({ ...f, iiko_loyalty_app_id: v }))} />
                      <PasswordField label="Loyalty Client Secret" value={form.iiko_loyalty_client_secret} onChange={v => setForm(f => f && ({ ...f, iiko_loyalty_client_secret: v }))} />
                    </div>
                  ) : (
                    <div className="space-y-2.5 mb-5">
                      <ReadRow label="Loyalty App ID" mono>{tenant.iiko_loyalty_app_id || <Empty />}</ReadRow>
                      <ReadRow label="Loyalty Client Secret" mono>{mask(tenant.iiko_loyalty_client_secret)}</ReadRow>
                    </div>
                  )}

                  <SectionHeading icon={<Server size={12} />} title="1С OData" hint="labor cost & P&L source" />
                  {editing ? (
                    <div className="space-y-3 mb-5">
                      <Field label="Base URL" mono placeholder="https://host/base/odata/standard.odata" value={form.onec_base_url} onChange={v => setForm(f => f && ({ ...f, onec_base_url: v }))} />
                      <Field label="Login" mono value={form.onec_login} onChange={v => setForm(f => f && ({ ...f, onec_login: v }))} />
                      <PasswordField label="Password" value={form.onec_password} onChange={v => setForm(f => f && ({ ...f, onec_password: v }))} />
                    </div>
                  ) : (
                    <div className="space-y-2.5 mb-5">
                      <ReadRow label="Base URL" mono stacked>{tenant.onec_base_url || <Empty />}</ReadRow>
                      <ReadRow label="Login" mono>{tenant.onec_login || <Empty />}</ReadRow>
                      <ReadRow label="Password" mono>{mask(tenant.onec_password)}</ReadRow>
                    </div>
                  )}

                  <SectionHeading icon={<KeyRound size={12} />} title="TRACE App Login" />
                  {editing ? (
                    <div className="space-y-3">
                      <Field label="Login" mono placeholder="admin" value={form.app_login} onChange={v => setForm(f => f && ({ ...f, app_login: v }))} />
                      <PasswordField label="New Password" hint="(leave blank to keep)" value={form.app_password} onChange={v => setForm(f => f && ({ ...f, app_password: v }))} />
                      {tenant.organization_id === BENEDICT_ORG_ID_MANAGER_PORTAL && (
                        <div className="bg-card-hover border border-border rounded-lg p-3">
                          <Field label="Manager Portal PIN" hint="(report.trace-os.uz — leave blank to keep)" mono value={form.manager_pin} onChange={v => setForm(f => f && ({ ...f, manager_pin: v }))} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <ReadRow label="App Login" mono>{tenant.app_login || <span className="text-muted italic">admin (default)</span>}</ReadRow>
                      {tenant.organization_id === BENEDICT_ORG_ID_MANAGER_PORTAL && (
                        <p className="text-[10px] text-muted">Manager Portal PIN is set per-branch — edit to update.</p>
                      )}
                    </div>
                  )}
                </section>

                {/* ── Reviews ── */}
                <section id="drawer-reviews" className="p-5 border-b border-border">
                  <SectionHeading icon={<Settings2 size={12} />} title="Reviews" />
                  {editing ? (
                    <div className="space-y-3">
                      <Field label="Google Maps URL" mono value={form.google_maps_url} onChange={v => setForm(f => f && ({ ...f, google_maps_url: v }))} />
                      <Field label="Yandex Maps URL" mono value={form.yandex_maps_url} onChange={v => setForm(f => f && ({ ...f, yandex_maps_url: v }))} />
                      <Field label="2GIS URL" mono value={form.twogis_url} onChange={v => setForm(f => f && ({ ...f, twogis_url: v }))} />
                      <Field label="TripAdvisor URL" mono value={form.tripadvisor_url} onChange={v => setForm(f => f && ({ ...f, tripadvisor_url: v }))} />
                      <Field label="Telegram Chat ID" mono placeholder="-1001234567890" value={form.telegram_chat_id} onChange={v => setForm(f => f && ({ ...f, telegram_chat_id: v }))} />
                      <div>
                        <FieldLabel hint="(fetched per platform on the daily 7AM pull, default 5 / TripAdvisor 3)">Review refresh count</FieldLabel>
                        <div className="grid grid-cols-4 gap-2">
                          {([['review_refresh_google', 'Google'], ['review_refresh_yandex', 'Yandex'], ['review_refresh_2gis', '2GIS'], ['review_refresh_tripadvisor', 'TripAdvisor']] as const).map(([key, label]) => (
                            <div key={key}>
                              <label className="block text-[8px] uppercase tracking-[0.15em] text-muted/70 mb-1">{label}</label>
                              <input type="number" min={1} max={50} value={form[key]} onChange={e => setForm(f => f && ({ ...f, [key]: e.target.value }))} className={`${inputBase} px-2 font-mono text-center`} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <ReadRow label="Google Maps" mono stacked>{tenant.google_maps_url || <Empty />}</ReadRow>
                      <ReadRow label="Yandex Maps" mono stacked>{tenant.yandex_maps_url || <Empty />}</ReadRow>
                      <ReadRow label="2GIS" mono stacked>{tenant.twogis_url || <Empty />}</ReadRow>
                      <ReadRow label="TripAdvisor" mono stacked>{tenant.tripadvisor_url || <Empty />}</ReadRow>
                      <ReadRow label="Telegram Chat ID" mono stacked>{tenant.telegram_chat_id || <Empty />}</ReadRow>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50 flex-wrap">
                    <button
                      onClick={handlePullReviews}
                      disabled={pullingReviews}
                      className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-primary/50 transition-colors disabled:opacity-50"
                    >
                      {pullingReviews ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                      Pull reviews now
                    </button>
                    {!confirmNotify ? (
                      <button
                        onClick={() => setConfirmNotify(true)}
                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-primary/50 transition-colors"
                      >
                        <Send size={11} />
                        Re-send Telegram notifications
                      </button>
                    ) : (
                      <span className="flex items-center gap-2 text-[11px]">
                        <span className="text-danger">Re-sends every stored review — sure?</span>
                        <button onClick={handleNotifyExisting} disabled={notifying} className="text-danger font-semibold hover:underline">
                          {notifying ? 'Sending…' : 'Yes, send'}
                        </button>
                        <button onClick={() => setConfirmNotify(false)} className="text-muted hover:text-text">Cancel</button>
                      </span>
                    )}
                  </div>
                  {pullReviewsMsg && <p className="text-[10px] text-muted mt-2">{pullReviewsMsg}</p>}
                  {notifyMsg && <p className="text-[10px] text-muted mt-2">{notifyMsg}</p>}
                </section>

                {/* ── Branches ── */}
                <section id="drawer-branches" className="p-5 border-b border-border">
                  <div className="flex items-center justify-between mb-3.5">
                    <h3 className="text-[9px] uppercase tracking-[0.22em] font-semibold text-muted">Branches</h3>
                    <button onClick={() => setAddBranchOpen(true)} className="text-[11px] px-2.5 py-1 rounded-lg border border-border text-muted hover:text-text hover:border-muted transition-colors font-medium flex items-center gap-1">
                      <Plus size={11} />Add Branch
                    </button>
                  </div>
                  {siblingBranches.length > 0 ? (
                    <div className="space-y-1">
                      {siblingBranches.map(b => {
                        const isCurrent = b.id === tenant.id;
                        return (
                          <button
                            key={b.id} type="button" disabled={isCurrent}
                            onClick={() => { const target = tenants.find(t => t.id === b.id); if (target) onSelectBranch(target); }}
                            className={`w-full flex items-center justify-between text-[12px] px-2.5 py-1.5 rounded-lg transition-colors text-left
                              ${isCurrent ? 'bg-primary/10' : 'hover:bg-card-hover cursor-pointer'}`}
                          >
                            <span className={`text-text ${isCurrent ? 'font-semibold' : ''}`}>{b.name}</span>
                            <span className="flex items-center gap-1.5 text-muted font-mono text-[11px]">
                              {b.subdomain}.{DOMAIN}{!isCurrent && <ChevronRight size={11} className="text-muted/50" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted">Single-branch restaurant.</p>
                  )}
                </section>

                {/* ── Floor Plans ── */}
                <section id="drawer-halls" className="p-5 border-b border-border">
                  <div className="flex items-center justify-between mb-3.5">
                    <h3 className="text-[9px] uppercase tracking-[0.22em] font-semibold text-muted">Floor Plans</h3>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          const newPlan: HallPlan & { _isNew: boolean } = {
                            id: crypto.randomUUID(), tenant_id: tenant.id,
                            name: `Hall ${hallPlans.length + 1}`, display_order: hallPlans.length, elements: [], _isNew: true,
                          };
                          setHallPlans(prev => [...prev, newPlan]);
                          onOpenEditor(newPlan, undefined);
                        }}
                        className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-muted hover:text-text hover:border-primary/50 transition-colors flex items-center gap-1.5"
                      >
                        <Plus size={9} />Add Hall
                      </button>
                      {tenant.pos_type !== 'poster' && (
                        <button onClick={() => fetchIikoSections(tenant.id)} disabled={sectionsLoading} className="text-[10px] px-2.5 py-1 rounded-lg border border-border text-muted hover:text-text hover:border-primary/50 transition-colors disabled:opacity-40 flex items-center gap-1.5">
                          <RefreshCw size={9} className={sectionsLoading ? 'animate-spin' : ''} />Sync iiko
                        </button>
                      )}
                    </div>
                  </div>
                  {sectionsErr && <p className="text-danger text-[10px] mb-2">{sectionsErr}</p>}
                  {hallPlansErr && <p className="text-danger text-[10px] mb-2">{hallPlansErr}</p>}
                  {hallActionErr && <p className="text-danger text-[10px] mb-2">{hallActionErr}</p>}
                  {hallPlansLoading ? (
                    <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-10 bg-card-hover rounded animate-pulse" />)}</div>
                  ) : hallPlans.length === 0 ? (
                    <p className="text-[11px] text-muted py-2">
                      {tenant.pos_type === 'poster' ? 'No halls yet — click "Add Hall" to create one.' : 'No halls yet — click "Sync iiko" to import sections.'}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {[...hallPlans].sort((a, b) => a.display_order - b.display_order).map((plan, idx) => {
                        const section = iikoSections.find(s => s.id === plan.iiko_section_id);
                        const hasElements = plan.elements.length > 0;
                        return (
                          <div
                            key={plan.id} draggable
                            onDragStart={() => setDraggedPlanId(plan.id)}
                            onDragOver={e => e.preventDefault()}
                            onDrop={async () => {
                              if (!draggedPlanId || draggedPlanId === plan.id) return;
                              const ordered = [...hallPlans].sort((a, b) => a.display_order - b.display_order);
                              const fromIdx = ordered.findIndex(p => p.id === draggedPlanId);
                              const toIdx = ordered.findIndex(p => p.id === plan.id);
                              if (fromIdx === -1 || toIdx === -1) return;
                              const [moved] = ordered.splice(fromIdx, 1);
                              ordered.splice(toIdx, 0, moved);
                              const reindexed = ordered.map((p, i) => ({ ...p, display_order: i }));
                              setHallPlans(reindexed);
                              setDraggedPlanId(null);
                              try {
                                await Promise.all(
                                  reindexed
                                    .filter((p, i) => !p._isNew && hallPlans.find(hp => hp.id === p.id)?.display_order !== i)
                                    .map(p => traceApi.admin.saveHallPlan(token, tenant.id, p))
                                );
                              } catch (e: any) {
                                setHallActionErr(e.message ?? 'Could not save new order');
                              }
                            }}
                            onDragEnd={() => setDraggedPlanId(null)}
                            className={`flex items-center justify-between py-2 px-3 rounded-xl bg-card-hover border transition-colors ${draggedPlanId === plan.id ? 'border-primary/60 opacity-50' : 'border-border/60'}`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <GripVertical size={12} className="text-muted/50 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                              <span className="text-[9px] text-muted/60 font-mono w-3.5 flex-shrink-0 text-right">{idx + 1}</span>
                              <LayoutGrid size={12} className={`flex-shrink-0 ${hasElements ? 'text-success' : 'text-muted'}`} />
                              <div className="min-w-0 flex-1">
                                <input
                                  value={plan.name}
                                  onFocus={() => { renameOriginalRef.current[plan.id] = plan.name; }}
                                  onChange={e => setHallPlans(prev => prev.map(p => p.id === plan.id ? { ...p, name: e.target.value } : p))}
                                  onBlur={async e => {
                                    // The input is controlled, so `plan.name` is already
                                    // e.target.value by the time blur fires — comparing
                                    // against it here always looked "unchanged" and this
                                    // save never ran. Compare against the value captured
                                    // on focus instead.
                                    const original = renameOriginalRef.current[plan.id];
                                    delete renameOriginalRef.current[plan.id];
                                    if (original === undefined || e.target.value === original || plan._isNew) return;
                                    try {
                                      await traceApi.admin.saveHallPlan(token, tenant.id, { ...plan, name: e.target.value });
                                    } catch (err: any) {
                                      setHallActionErr(err.message ?? 'Could not rename');
                                    }
                                  }}
                                  className="w-full bg-transparent text-[12px] font-medium text-text leading-tight focus:outline-none focus:bg-card focus:px-1 rounded transition-all"
                                />
                                <p className="text-[9px] text-muted">{hasElements ? `${plan.elements.length} elements` : plan._isNew ? 'Not saved yet' : 'Not drawn yet'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 ml-2">
                              <button onClick={() => onOpenEditor(plan, section)} className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-primary/10" title="Draw floor plan">
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => deletePlan(plan)} className="p-1.5 text-muted hover:text-danger transition-colors rounded-lg hover:bg-danger/10" title="Delete">
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* ── Activity ── */}
                <section id="drawer-activity" className="p-5 border-b border-border">
                  <SectionHeading icon={<Activity size={12} />} title="Activity" />
                  {status === undefined ? (
                    <div className="space-y-2.5 mb-5">{[80, 60, 70].map(w => <div key={w} className="h-3 bg-card-hover rounded animate-pulse" style={{ width: `${w}%` }} />)}</div>
                  ) : (
                    <div className="space-y-2.5 mb-5">
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] text-muted uppercase tracking-[0.15em] w-24 flex-shrink-0">Plugin</span>
                        {status.pluginConnected ? (
                          <span className="flex items-center gap-1.5 text-[12px] text-success">
                            <span className="relative flex w-2 h-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                              <span className="relative inline-flex rounded-full w-2 h-2 bg-success" />
                            </span>
                            Connected
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-[12px] text-muted"><span className="w-2 h-2 rounded-full bg-muted/40" />Offline</span>
                        )}
                      </div>
                      {status.pluginConnected && status.connectedSince && (
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] text-muted uppercase tracking-[0.15em] w-24 flex-shrink-0">Since</span>
                          <span className="text-[12px] text-text font-mono">{new Date(status.connectedSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
                        <span className="text-[12px] text-text font-mono tabular-nums">{status.eventsToday.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] text-muted uppercase tracking-[0.15em] w-24 flex-shrink-0">Last event</span>
                        <span className="text-[12px] text-muted">{relativeTime(status.lastEventAt)}</span>
                      </div>
                    </div>
                  )}

                  <SectionHeading icon={<Activity size={12} />} title="Recent Events" />
                  {eventsLoading ? (
                    <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-9 bg-card-hover rounded animate-pulse" />)}</div>
                  ) : events.length === 0 ? (
                    <p className="text-muted text-[12px] text-center py-8">No events yet</p>
                  ) : (
                    <div className="space-y-px">
                      {events.map(ev => {
                        const data = (ev.payload as any)?.data;
                        const subtitle = data?.table?.name ?? data?.cashier ?? null;
                        return (
                          <div key={ev.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[10px] font-semibold font-mono flex-shrink-0 ${EVENT_TYPE_COLORS[ev.type] ?? 'text-muted'}`}>
                                {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                              </span>
                              {subtitle && <span className="text-[10px] text-muted truncate">{subtitle}</span>}
                            </div>
                            <span className="text-[10px] text-muted font-mono flex-shrink-0">
                              {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* ── Danger zone ── */}
                <section id="drawer-danger" className="p-5">
                  <h3 className="text-[9px] uppercase tracking-[0.22em] font-semibold text-danger/80 mb-3.5">Danger Zone</h3>
                  {confirmDelete ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-danger">
                        Type <strong className="font-mono">{tenant.subdomain}</strong> to permanently delete <strong>{tenant.name}</strong>. This cannot be undone.
                      </p>
                      <input
                        value={deleteTypedSubdomain}
                        onChange={e => setDeleteTypedSubdomain(e.target.value)}
                        placeholder={tenant.subdomain}
                        className={`${inputBase} font-mono max-w-[240px]`}
                      />
                      {deleteErr && <p className="text-danger text-[10px]">{deleteErr}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={handleDelete}
                          disabled={deleting || deleteTypedSubdomain !== tenant.subdomain}
                          className="flex items-center gap-1.5 bg-danger/10 hover:bg-danger/20 border border-danger/40 text-danger text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {deleting && <Loader2 size={12} className="animate-spin" />}
                          Yes, delete permanently
                        </button>
                        <button onClick={() => { setConfirmDelete(false); setDeleteTypedSubdomain(''); }} className="text-muted hover:text-text text-[11px] px-3 py-1.5 border border-border rounded-lg transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(true)} className="text-[11px] text-danger/70 hover:text-danger border border-danger/20 hover:border-danger/50 px-3 py-1.5 rounded-lg transition-colors">
                      Delete restaurant
                    </button>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      {addBranchOpen && tenant && (
        <AddBranchModal
          token={token}
          parentId={tenant.id}
          existingSubdomains={tenants.map(t => t.subdomain)}
          onAdded={(newBranch) => { setAddBranchOpen(false); loadBranches(tenant.id); onBranchAdded(newBranch); }}
          onClose={() => setAddBranchOpen(false)}
        />
      )}
    </>
  );
};

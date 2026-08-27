import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Tenant, LiveStatus } from '../../services/traceApi';
import { DOMAIN, relativeTime } from './helpers';
import { computeHealth } from './health';

// Billing badge: only surfaces when something needs attention — trial
// ending soon/expired, or a payment overdue. Silent otherwise so the list
// doesn't get noisy for tenants that are just fine.
const BILLING_WARN_DAYS = 3;

const BillingBadge: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (tenant.billing_status === 'trial' && tenant.trial_ends_at) {
    const daysLeft = Math.ceil((new Date(tenant.trial_ends_at).getTime() - now) / dayMs);
    if (daysLeft < 0) {
      return <span className="text-[9px] font-semibold uppercase tracking-wider text-danger bg-danger/10 rounded-full px-1.5 py-0.5 flex-shrink-0">Trial expired</span>;
    }
    if (daysLeft <= BILLING_WARN_DAYS) {
      return <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-500 bg-amber-500/10 rounded-full px-1.5 py-0.5 flex-shrink-0">Trial: {daysLeft}d left</span>;
    }
    return null;
  }

  if (tenant.billing_status === 'past_due') {
    return <span className="text-[9px] font-semibold uppercase tracking-wider text-danger bg-danger/10 rounded-full px-1.5 py-0.5 flex-shrink-0">Past due</span>;
  }

  if (tenant.billing_status === 'active' && tenant.next_payment_due_at) {
    const daysLeft = Math.ceil((new Date(tenant.next_payment_due_at).getTime() - now) / dayMs);
    if (daysLeft < 0) {
      return <span className="text-[9px] font-semibold uppercase tracking-wider text-danger bg-danger/10 rounded-full px-1.5 py-0.5 flex-shrink-0">Payment overdue</span>;
    }
    if (daysLeft <= BILLING_WARN_DAYS) {
      return <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-500 bg-amber-500/10 rounded-full px-1.5 py-0.5 flex-shrink-0">Due in {daysLeft}d</span>;
    }
  }

  return null;
};

// One health check, rendered as a small dot. Deliberately terse — the
// drawer's HealthPanel gives the full explanation, this just needs to
// distinguish "fine" from "not configured" from "not knowable yet" at a
// glance across a list of many tenants.
const HealthDots: React.FC<{ tenant: Tenant; status: LiveStatus | undefined }> = ({ tenant, status }) => {
  const health = computeHealth(tenant, status);
  const relevant = health.checks.filter(c => ['pos_creds', 'plugin', 'reviews'].includes(c.key));
  return (
    <div className="flex items-center gap-1" title={relevant.map(c => `${c.label}: ${c.state}`).join(' · ')}>
      {relevant.map(c => (
        <span
          key={c.key}
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            c.state === 'ok' ? 'bg-success' : c.state === 'missing' ? 'bg-danger/70' : 'bg-muted/40'
          }`}
        />
      ))}
    </div>
  );
};

// Single responsive row — replaces the old separate TenantRow (desktop
// <tr>) and TenantCard (mobile <button>), which rendered the exact same
// tenant model twice. This is a flex row at every breakpoint so nothing
// needs a table/card fork.
export const TenantItem: React.FC<{
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
      className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-border last:border-0 transition-colors
        ${selected ? 'bg-primary/[0.06]' : 'hover:bg-card-hover'}`}
    >
      <div
        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-[12px] sm:text-[13px] font-bold flex-shrink-0
          ${tenant.enabled ? 'bg-primary/10 text-primary' : 'bg-card-hover text-muted'}`}
      >
        {tenant.name.charAt(0).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-text leading-tight flex items-center gap-1.5 flex-wrap">
          <span className="truncate">{tenant.name}</span>
          {branchCount > 1 && (
            <span className="text-[9px] font-semibold text-muted bg-card-hover rounded-full px-1.5 py-0.5 flex-shrink-0">
              {branchCount} branches
            </span>
          )}
          {!tenant.enabled && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted bg-card-hover rounded-full px-1.5 py-0.5 flex-shrink-0">
              Disabled
            </span>
          )}
          <BillingBadge tenant={tenant} />
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] text-muted font-mono truncate">{tenant.subdomain}.{DOMAIN}</span>
          {status !== undefined && (
            pluginLive ? (
              <span className="flex items-center gap-1 text-[10px] text-success flex-shrink-0">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-success" />
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

      <div className="flex items-center gap-3 flex-shrink-0">
        <HealthDots tenant={tenant} status={status} />
        <ChevronRight size={14} className={selected ? 'text-primary rotate-90 transition-transform' : 'text-muted/40 transition-transform'} />
      </div>
    </button>
  );
};

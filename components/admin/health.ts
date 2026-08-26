import { Tenant, LiveStatus, ConnectionTestResults } from '../../services/traceApi';

export type CheckState = 'ok' | 'missing' | 'unknown';

export interface HealthCheck {
  key: string;
  label: string;
  state: CheckState;
  detail?: string;
}

export interface Health {
  checks: HealthCheck[];
  /** ok checks / total checks that aren't 'unknown' (untested POS doesn't count against the score) */
  score: number;
  scoreTotal: number;
}

function hasPosCreds(t: Tenant): boolean {
  return t.pos_type === 'poster'
    ? !!(t.poster_account_name && t.poster_access_token)
    : !!(t.iiko_login && (t.iiko_password || t.iiko_cloud_api));
}

// Built ONLY from data already on the page (tenant list + live-status) plus,
// optionally, a cached on-demand test-connection result — never triggers a
// network call itself. See admin redesign plan Phase 4.
export function computeHealth(tenant: Tenant, live?: LiveStatus, testResult?: ConnectionTestResults | null): Health {
  const checks: HealthCheck[] = [];

  checks.push(
    hasPosCreds(tenant)
      ? { key: 'pos_creds', label: 'POS credentials', state: 'ok', detail: tenant.pos_type === 'poster' ? 'Poster' : 'iiko' }
      : { key: 'pos_creds', label: 'POS credentials', state: 'missing', detail: 'not configured' }
  );

  // POS reachability is only known once a test has actually been run this
  // session — never inferred, never auto-triggered.
  if (testResult) {
    const relevant = tenant.pos_type === 'poster' ? null : (testResult.server ?? testResult.cloud_api);
    checks.push(
      relevant
        ? { key: 'pos_reachable', label: 'POS reachable', state: relevant.ok ? 'ok' : 'missing', detail: relevant.ok ? 'verified' : relevant.error }
        : { key: 'pos_reachable', label: 'POS reachable', state: 'unknown', detail: 'not tested' }
    );
  } else {
    checks.push({ key: 'pos_reachable', label: 'POS reachable', state: 'unknown', detail: 'not tested' });
  }

  checks.push(
    live === undefined
      ? { key: 'plugin', label: 'Plugin', state: 'unknown', detail: 'loading' }
      : live.pluginConnected
      ? { key: 'plugin', label: 'Plugin', state: 'ok', detail: 'connected' }
      : { key: 'plugin', label: 'Plugin', state: 'missing', detail: 'offline' }
  );

  const hasAnyReviewUrl = !!(tenant.google_maps_url || tenant.yandex_maps_url || tenant.twogis_url || tenant.tripadvisor_url);
  checks.push(
    hasAnyReviewUrl
      ? { key: 'reviews', label: 'Review sources', state: 'ok', detail: [tenant.google_maps_url && 'Google', tenant.yandex_maps_url && 'Yandex', tenant.twogis_url && '2GIS', tenant.tripadvisor_url && 'TripAdvisor'].filter(Boolean).join(', ') }
      : { key: 'reviews', label: 'Review sources', state: 'missing', detail: 'none set' }
  );

  checks.push(
    tenant.telegram_chat_id
      ? { key: 'telegram', label: 'Telegram alerts', state: 'ok' }
      : { key: 'telegram', label: 'Telegram alerts', state: 'missing', detail: 'not set' }
  );

  if (live !== undefined) {
    const fresh = !!live.lastEventAt && (Date.now() - new Date(live.lastEventAt).getTime()) < 86_400_000;
    checks.push(
      !live.lastEventAt
        ? { key: 'activity', label: 'Recent activity', state: 'unknown', detail: 'no events yet' }
        : fresh
        ? { key: 'activity', label: 'Recent activity', state: 'ok', detail: 'within 24h' }
        : { key: 'activity', label: 'Recent activity', state: 'missing', detail: 'stale' }
    );
  }

  const scored = checks.filter(c => c.state !== 'unknown');
  return {
    checks,
    score: scored.filter(c => c.state === 'ok').length,
    scoreTotal: scored.length,
  };
}

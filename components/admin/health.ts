import { Tenant, LiveStatus, ConnectionTestResults } from '../../services/traceApi';

const POSTER_INCIDENT: Record<string, string> = {
  auth: 'token rejected',
  unreachable: 'Poster not answering',
  rate_limit: 'rate limited',
  spot_missing: 'spot not found',
};

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
    const relevant = tenant.pos_type === 'poster' ? testResult.poster : (testResult.server ?? testResult.cloud_api);
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
      : tenant.pos_type === 'poster'
      ? live.poster?.ok === true
        ? { key: 'plugin', label: 'Poster API', state: 'ok', detail: 'answering' }
        : live.poster?.ok === false
        ? { key: 'plugin', label: 'Poster API', state: 'missing', detail: POSTER_INCIDENT[live.poster.incident ?? ''] ?? live.poster.lastError ?? 'failing' }
        : { key: 'plugin', label: 'Poster API', state: 'unknown', detail: 'not checked yet' }
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
    // Poster's live updates are polled, not stored as events — its activity is the last good API call.
    const lastAt = tenant.pos_type === 'poster' ? (live.poster?.lastOkAt ?? live.lastEventAt) : live.lastEventAt;
    const fresh = !!lastAt && (Date.now() - new Date(lastAt).getTime()) < 86_400_000;
    checks.push(
      !lastAt
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

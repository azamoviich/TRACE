export const DOMAIN = 'trace-os.uz';

// Manager portal (shift reports, waiter QR, report.trace-os.uz) is a custom
// feature built for Benedict Cafè only — hide its settings for every other
// tenant/org.
export const BENEDICT_ORG_ID_MANAGER_PORTAL = '0de2aed4-3217-4c01-971b-e8362546253f';

export function tenantUrl(subdomain: string) {
  return `https://${subdomain}.${DOMAIN}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function mask(s: string | null | undefined): string {
  if (!s) return '—';
  if (s.length <= 8) return '••••••••';
  return '••••' + s.slice(-4);
}

export function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(err => console.warn('[admin] clipboard write failed:', err));
}

export function subdomainSlug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

export function isValidSubdomain(s: string): boolean {
  return /^[a-z0-9-]{3,30}$/.test(s);
}

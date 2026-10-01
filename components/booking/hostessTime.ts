// Time helpers for the hostess panel. Everything is shown in the restaurant's
// timezone (booking_settings.timezone), not the device's — the .exe may run on
// a laptop set to another zone.

import { BookingSettings, BookingWeekday } from '../../services/traceApi';

export const MIN = 60_000;

// YYYY-MM-DD of an instant in tz.
export function localDate(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(instant);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function fmtTime(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(typeof iso === 'string' ? new Date(iso) : iso);
}

// Offset of tz from UTC at an instant, in ms (Tashkent = +5h).
function tzOffset(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant));
  const v = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const asUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'), v('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

// Wall-clock date + "HH:MM" in tz → the real instant.
export function zonedToDate(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz);  // second pass settles DST edges
  return new Date(t);
}

const WEEKDAY_KEYS: BookingWeekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function hhmm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Opening hours of a day as minutes from that day's midnight; close past
// midnight comes out > 1440. Not set → 10:00–23:00 (same as the guest page).
// Closed day → null.
export function dayHours(settings: BookingSettings, date: string): { open: number; close: number } | null {
  const wh = settings.working_hours ?? {};
  if (Object.keys(wh).length === 0) return { open: 600, close: 1380 };
  const [y, m, d] = date.split('-').map(Number);
  const v = wh[WEEKDAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]];
  if (!v) return null;
  const open = hhmm(v.open);
  let close = hhmm(v.close);
  if (close <= open) close += 1440;
  return { open, close };
}

// Rounds an instant up to the next slot step (for "new booking" defaults).
export function roundUp(d: Date, stepMin: number): Date {
  const step = stepMin * MIN;
  return new Date(Math.ceil(d.getTime() / step) * step);
}

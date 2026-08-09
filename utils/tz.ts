// Uzbekistan is UTC+5 year-round (no DST), so a fixed offset is safe.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** YYYY-MM-DD date string in Asia/Tashkent, regardless of device timezone. */
export function tashkentDateStr(d: Date = new Date()): string {
  return new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Hour-of-day (0-23.99) in Asia/Tashkent, regardless of device timezone. */
export function tashkentHours(d: Date = new Date()): number {
  const shifted = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return shifted.getUTCHours() + shifted.getUTCMinutes() / 60;
}

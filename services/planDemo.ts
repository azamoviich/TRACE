// План и факт — demo tenant. Runs the real engine (lib/planEngine) on
// deterministic synthetic facts, so a prospect sees the same suggestion,
// progress, forecast and variance logic a real iiko restaurant gets. Plans
// saved in the demo live in memory for the session only.

import { tashkentDateStr, tashkentHours } from '../utils/tz';
import {
  DayFact, CostBaseline, PlanDrivers, DayOverride, Suggestion, ProgressResult, VarianceResult,
  addDays, monthDays, shiftMonth, weekday, weekdayProfile, weekdayWeights, buildSuggestion,
  splitDays, computePL, computeProgress, computeVariance, foodCostByMonth, DEFAULT_GROWTH_PCT,
} from '../lib/planEngine';
import type { SavedPlan, PlanSavePayload, DrillDriver, DrillResult, DrillRow, PlanHistoryRow, PlanSettings } from './traceApi';

// Base revenue by weekday (Sun..Sat), UZS — a mid-size Tashkent restaurant.
const WEEKDAY_BASE = [27e6, 17e6, 18e6, 19e6, 21e6, 31e6, 35e6];
const AVG_CHECK = 165_000;

// Small deterministic noise per date, so reloads show the same numbers.
function noise(date: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 2; // -1..1
}

function demoFact(date: string): DayFact {
  const w = weekday(date);
  const yearsFrom2025 = (Date.parse(date) - Date.parse('2025-01-01')) / (365 * 86400000);
  const growth = 1 + 0.08 * yearsFrom2025;                 // ~8% a year
  const month = Number(date.slice(5, 7));
  const season = [0.92, 0.9, 1.02, 1.0, 1.04, 1.06, 1.05, 1.03, 1.0, 1.02, 0.98, 1.12][month - 1];
  // Recent softness in the current month so the demo shows a real gap to explain.
  const soft = date.slice(0, 7) === tashkentDateStr().slice(0, 7) ? 0.93 : 1;
  const revenue = Math.round(WEEKDAY_BASE[w] * growth * season * soft * (1 + 0.07 * noise(date, 7)));
  const avg = AVG_CHECK * growth * (1 + 0.04 * noise(date, 13)) * (soft < 1 ? 0.97 : 1);
  const checks = Math.round(revenue / avg);
  const fc = 0.315 + 0.012 * noise(date, 29) + (soft < 1 ? 0.012 : 0);
  return { date, revenue, checks, guests: Math.round(checks * 1.9), cogs: Math.round(revenue * fc) };
}

function demoFacts(from: string, to: string): Map<string, DayFact> {
  const today = tashkentDateStr();
  const m = new Map<string, DayFact>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d > today) break;
    const f = demoFact(d);
    if (d === today) {
      // Only part of today has happened yet.
      const share = Math.min(1, Math.max(0, (tashkentHours() - 10) / 13));
      m.set(d, { ...f, revenue: Math.round(f.revenue * share), checks: Math.round(f.checks * share), guests: Math.round(f.guests * share), cogs: Math.round(f.cogs * share) });
    } else {
      m.set(d, f);
    }
  }
  return m;
}

function demoCosts(): CostBaseline {
  const cur = tashkentDateStr().slice(0, 7);
  const months = [shiftMonth(cur, -3), shiftMonth(cur, -2), shiftMonth(cur, -1)];
  const all = months.flatMap(monthDays);
  const facts = demoFacts(all[0], all[all.length - 1]);
  const fc = foodCostByMonth(facts, months).filter(x => x.pct != null) as { month: string; pct: number }[];
  let rev = 0, cogs = 0;
  for (const f of facts.values()) { rev += f.revenue; cogs += f.cogs; }
  const best = fc.reduce((a, b) => (b.pct < a.pct ? b : a), fc[0]);
  return {
    months, labor: 148e6, rent: 45e6, utilities: 14e6, otherOpex: 21e6,
    foodCostPct: Math.round((cogs / rev) * 1000) / 10,
    bestFoodCostPct: best?.pct ?? null, bestFoodCostMonth: best?.month ?? null,
  };
}

function profileFor(month: string) {
  const yesterday = addDays(tashkentDateStr(), -1);
  const beforeMonth = addDays(`${month}-01`, -1);
  const end = beforeMonth < yesterday ? beforeMonth : yesterday;
  return weekdayProfile(demoFacts(addDays(end, -55), end), end);
}

export function demoSuggest(month: string, growthPct = DEFAULT_GROWTH_PCT, method?: 'ly' | 'trend'): Suggestion {
  const days = monthDays(month);
  const facts = demoFacts(addDays(days[0], -364), addDays(days[days.length - 1], -364));
  return buildSuggestion({ month, facts, profile: profileFor(month), costs: demoCosts(), growthPct, method });
}

const store = new Map<string, SavedPlan>();

function toSaved(month: string, p: PlanSavePayload, weights: number[]): SavedPlan {
  const drivers: PlanDrivers = { ...p.drivers };
  const split = splitDays(month, drivers.revenue, drivers.checks, weights, p.overrides ?? []);
  if (split.revenue > drivers.revenue) drivers.revenue = split.revenue;
  if (split.checks > drivers.checks) drivers.checks = split.checks;
  return {
    id: `demo-${month}`, month, status: p.status, method: p.method, growthPct: p.growthPct,
    drivers, baseline: (p.baseline ?? {}) as SavedPlan['baseline'], updatedAt: new Date().toISOString(),
    days: split.days, pl: computePL(drivers, monthDays(month).length),
  };
}

// The current month starts with an accepted plan so the dashboard is the
// first thing a prospect sees; other months open on the suggestion.
function ensureSeeded(month: string) {
  const cur = tashkentDateStr().slice(0, 7);
  if (month !== cur || store.has(month)) return;
  const s = demoSuggest(month);
  store.set(month, toSaved(month, {
    month, status: 'active', method: s.method, growthPct: s.growthPct, baseline: s.baseline, drivers: s.drivers, overrides: [],
  }, weekdayWeights(profileFor(month))));
}

export function demoGetPlan(month: string): SavedPlan | null {
  ensureSeeded(month);
  return store.get(month) ?? null;
}

export function demoSavePlan(p: PlanSavePayload): SavedPlan {
  const existing = store.get(p.month);
  const overrides: DayOverride[] = p.overrides
    ?? (existing?.days ?? []).filter(d => d.isOverride).map(d => ({ date: d.date, revenue: d.revenue, checks: d.checks, note: d.note }));
  const saved = toSaved(p.month, { ...p, overrides }, weekdayWeights(profileFor(p.month)));
  store.set(p.month, saved);
  return saved;
}

export function demoDeletePlan(month: string) {
  store.delete(month);
}

function monthFacts(month: string) {
  const days = monthDays(month);
  return demoFacts(days[0], days[days.length - 1]);
}

export function demoProgress(month: string): { plan: SavedPlan | null; progress: ProgressResult | null } {
  const plan = demoGetPlan(month);
  if (!plan) return { plan: null, progress: null };
  const today = tashkentDateStr();
  const todayShare = today.startsWith(month) ? Math.min(1, Math.max(0, (tashkentHours() - 10) / 13)) : null;
  const actualCosts = monthDays(month).slice(-1)[0] < today ? { labor: 151e6, rent: 45e6, utilities: 15.2e6, otherOpex: 19e6 } : null;
  return {
    plan,
    progress: computeProgress({ month, today, drivers: plan.drivers, planDays: plan.days, facts: monthFacts(month), actualCosts, todayShare }),
  };
}

export function demoVariance(month: string): VarianceResult | null {
  const plan = demoGetPlan(month);
  if (!plan) return null;
  return computeVariance({ month, today: tashkentDateStr(), drivers: plan.drivers, planDays: plan.days, facts: monthFacts(month) });
}

// Hand-shaped breakdown that matches the demo's story (soft month: fewer
// checks on weekdays, drinks attach rate down, grill food cost up). Weekday
// rows are computed from the demo plan vs facts, so they agree with the page.
export function demoDrilldown(month: string, driver: DrillDriver): DrillResult {
  const today = tashkentDateStr();
  const dates = monthDays(month);
  const closed = dates.filter(d => d < today);
  const baseTo = addDays(dates[0], -1);
  const baseline = { from: addDays(baseTo, -27), to: baseTo, days: 28 };
  if (!closed.length) {
    return { driver, period: null, baseline, summary: { now: null, base: null, unit: driver === 'food_cost' ? 'pct' : driver === 'avg_check' ? 'money' : 'count' }, groups: [] };
  }
  const period = { from: closed[0], to: closed[closed.length - 1], days: closed.length };
  const k = closed.length / 30; // scale the canned impacts to the elapsed part of the month
  const row = (name: string, now: number, base: number | null, impact: number, share?: number): DrillRow => ({ name, now, base, impact: Math.round(impact * k), share });

  if (driver === 'food_cost') {
    return {
      driver, period, baseline, summary: { now: 32.9, base: 31.6, unit: 'pct' },
      groups: [
        { key: 'categories', unit: 'pct', rows: [
          row('Гриль', 38.4, 34.9, -5.8e6, 27.1), row('Горячие блюда', 33.2, 32.1, -1.9e6, 21.4),
          row('Салаты', 29.8, 29.1, -0.6e6, 11.2), row('Десерты', 27.5, 28.4, 0.4e6, 6.3), row('Бар', 21.9, 23.0, 1.1e6, 18.6),
        ] },
        { key: 'dishes', unit: 'pct', rows: [
          row('Стейк рибай', 46.1, 37.8, -3.4e6, 6.2), row('Шашлык из баранины', 41.0, 36.5, -1.6e6, 5.4),
          row('Лагман', 31.2, 28.9, -0.7e6, 4.8), row('Плов', 30.4, 29.6, -0.3e6, 7.9), row('Цезарь с курицей', 27.0, 27.9, 0.2e6, 3.1),
        ] },
        { key: 'writeoffs', unit: 'money', rows: [
          row('__total__', Math.round(7.4e6 * k), Math.round(4.6e6 * k), -2.8e6),
          row('Говядина вырезка', Math.round(2.9e6 * k), Math.round(1.1e6 * k), -1.8e6), row('Молоко', Math.round(0.9e6 * k), Math.round(0.6e6 * k), -0.3e6),
          row('Зелень', Math.round(0.7e6 * k), Math.round(0.5e6 * k), -0.2e6),
        ] },
      ],
    };
  }
  if (driver === 'avg_check') {
    return {
      driver, period, baseline, summary: { now: 171_300, base: 178_900, unit: 'money' },
      groups: [
        { key: 'waiters', unit: 'money', rows: [
          row('Азиз', 152_400, 176_800, -4.1e6, 17.8), row('Шахзод', 163_900, 172_100, -1.3e6, 14.2),
          row('Мадина', 169_000, 170_500, -0.2e6, 12.9), row('Дилноза', 188_700, 181_200, 1.2e6, 16.4),
        ] },
        { key: 'categories', unit: 'money', rows: [
          row('Напитки', 21_400, 27_900, -5.2e6, 12.5), row('Десерты', 7_100, 9_300, -1.7e6, 4.1),
          row('Гриль', 46_800, 45_900, 0.7e6, 27.1), row('Горячие блюда', 36_900, 35_800, 0.9e6, 21.4),
        ] },
      ],
    };
  }
  const plan = demoGetPlan(month);
  const facts = monthFacts(month);
  const wk = Array.from({ length: 7 }, () => ({ plan: 0, fact: 0, planRev: 0, days: 0 }));
  const planBy = new Map((plan?.days ?? []).map(d => [d.date, d]));
  for (const d of closed) {
    const w = wk[weekday(d)]; const p = planBy.get(d);
    w.plan += p?.checks ?? 0; w.planRev += p?.revenue ?? 0; w.fact += facts.get(d)?.checks ?? 0; w.days++;
  }
  const weekdays = wk.map((w, i) => ({
    name: String(i), now: w.days ? Math.round(w.fact / w.days) : null, base: w.days ? Math.round(w.plan / w.days) : null,
    impact: w.plan > 0 ? Math.round((w.fact - w.plan) * (w.planRev / w.plan)) : 0,
  })).filter(r => r.now != null).sort((a, b) => a.impact - b.impact);
  const baseFacts = demoFacts(baseline.from, baseline.to);
  const perDay = (m: Map<string, DayFact>, days: number) => Math.round([...m.values()].reduce((s, f) => s + f.checks, 0) / days * 10) / 10;
  const closedFacts = new Map(closed.map(d => [d, facts.get(d)!]).filter(([, f]) => f) as [string, DayFact][]);
  return {
    driver, period, baseline, summary: { now: perDay(closedFacts, closed.length), base: perDay(baseFacts, baseline.days), unit: 'count' },
    groups: [
      { key: 'weekdays', unit: 'count', rows: weekdays },
      { key: 'hours', unit: 'count', rows: [
        row('13', 14.2, 18.9, -9.1e6), row('14', 12.8, 15.6, -5.4e6), row('20', 19.7, 21.0, -2.5e6),
        row('12', 9.9, 10.8, -1.7e6), row('21', 17.4, 16.9, 1.0e6),
      ] },
    ],
  };
}

// Past months get a plan too (LY + 6%), so the history chart has something
// to compare; saved demo plans override them.
export function demoHistory(months = 12): PlanHistoryRow[] {
  const cur = tashkentDateStr().slice(0, 7);
  return Array.from({ length: months }, (_, i) => shiftMonth(cur, i - months + 1)).map(month => {
    const f = monthFacts(month);
    let revenue = 0, checks = 0, cogs = 0;
    for (const x of f.values()) { revenue += x.revenue; checks += x.checks; cogs += x.cogs; }
    const saved = store.get(month) ?? (month === cur ? demoGetPlan(month) : null);
    const planDrivers = saved?.drivers ?? (month >= shiftMonth(cur, -5) ? demoSuggest(month).drivers : null);
    const partial = month === cur;
    const pl = planDrivers ? computePL(planDrivers, monthDays(month).length) : null;
    return {
      month,
      plan: planDrivers && pl ? { revenue: planDrivers.revenue, netProfit: pl.netProfit, status: saved?.status ?? 'active' } : null,
      fact: {
        revenue, checks,
        avgCheck: checks > 0 ? Math.round(revenue / checks) : 0,
        foodCostPct: revenue > 0 ? Math.round((cogs / revenue) * 1000) / 10 : null,
        netProfit: planDrivers && !partial ? Math.round(revenue - cogs - 151e6 - 45e6 - 15.2e6 - 19e6) : null,
      },
      pct: planDrivers && !partial && planDrivers.revenue > 0 ? Math.round((revenue / planDrivers.revenue) * 1000) / 10 : null,
      partial,
    };
  });
}

let demoTelegramDaily = true;
export function demoSettings(): PlanSettings { return { telegramDaily: demoTelegramDaily, telegramConnected: true }; }
export function demoSaveSettings(v: boolean): PlanSettings { demoTelegramDaily = v; return demoSettings(); }

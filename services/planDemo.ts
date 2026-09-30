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
import type { SavedPlan, PlanSavePayload } from './traceApi';

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

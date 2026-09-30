// Mirror of TRACEBACKEND/src/services/planEngine.ts — keep the two identical.
// The editor recalculates P&L / daily split live with it, and the demo tenant
// runs the full suggestion/progress/variance pipeline on synthetic facts.

// План и факт — pure math, no I/O (see TRACE/docs/plan-fact-feature.md §4).
// Every date here is a 'YYYY-MM-DD' business-date string; arithmetic runs on
// UTC midnights so a date never shifts across a timezone boundary.

export interface DayFact {
  date: string;
  revenue: number;
  checks: number;
  guests: number;
  cogs: number;
}

export interface PlanDrivers {
  revenue: number;
  checks: number;
  avgCheck: number;
  guests: number;
  foodCostPct: number; // 0-100
  labor: number;       // monthly
  rent: number;
  utilities: number;
  otherOpex: number;
}

export interface PlanPL {
  revenue: number;
  cogs: number;
  labor: number;
  grossProfit: number;
  rent: number;
  utilities: number;
  otherOpex: number;
  fixedCosts: number;
  netProfit: number;
  netProfitPct: number | null;
  breakEvenMonth: number | null; // null when food cost ≥ 100% makes break-even unreachable
  breakEvenDay: number | null;
}

export interface PlanDay {
  date: string;
  revenue: number;
  checks: number;
  weight: number;
  isOverride: boolean;
  note: string | null;
  holiday: string | null;
}

export interface DayOverride {
  date: string;
  revenue: number;
  checks?: number | null;
  note?: string | null;
}

// ── date helpers ─────────────────────────────────────────────────────────────

const DAY_MS = 86400000;

export function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  return fmt(new Date(parseDate(s).getTime() + n * DAY_MS));
}

export function weekday(s: string): number {
  return parseDate(s).getUTCDay(); // 0 = Sunday
}

export function monthDays(month: string): string[] {
  // month = 'YYYY-MM'
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// ── calendar: Uzbek holidays + Ramadan ───────────────────────────────────────
// Hayit dates are set by decree each year from the lunar calendar; listed
// here for the years we plan against. Ramadan shifts ~11 days earlier each
// year, which is the main reason a raw last-year comparison lies in UZ.

const FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': 'Новый год',
  '03-08': '8 Марта',
  '03-21': 'Навруз',
  '05-09': 'День памяти',
  '09-01': 'День независимости',
  '10-01': 'День учителя',
  '12-08': 'День Конституции',
};

const HAYIT: Record<string, string> = {
  '2025-03-30': 'Рамазан хайит',
  '2025-06-06': 'Курбан хайит',
  '2026-03-20': 'Рамазан хайит',
  '2026-05-27': 'Курбан хайит',
  '2027-03-10': 'Рамазан хайит',
  '2027-05-16': 'Курбан хайит',
};

const RAMADAN: { from: string; to: string }[] = [
  { from: '2025-03-01', to: '2025-03-29' },
  { from: '2026-02-18', to: '2026-03-19' },
  { from: '2027-02-08', to: '2027-03-09' },
];

export function holidayOf(date: string): string | null {
  return HAYIT[date] ?? FIXED_HOLIDAYS[date.slice(5)] ?? null;
}

export function isRamadan(date: string): boolean {
  return RAMADAN.some(r => date >= r.from && date <= r.to);
}

// ── P&L from drivers ─────────────────────────────────────────────────────────

export function computePL(d: PlanDrivers, daysInMonth: number): PlanPL {
  const fc = Math.min(Math.max(d.foodCostPct, 0), 100) / 100;
  const cogs = Math.round(d.revenue * fc);
  const grossProfit = d.revenue - cogs - d.labor;
  const fixedCosts = d.labor + d.rent + d.utilities + d.otherOpex;
  const netProfit = d.revenue - cogs - fixedCosts;
  const breakEvenMonth = fc < 1 ? Math.round(fixedCosts / (1 - fc)) : null;
  return {
    revenue: d.revenue,
    cogs,
    labor: d.labor,
    grossProfit,
    rent: d.rent,
    utilities: d.utilities,
    otherOpex: d.otherOpex,
    fixedCosts,
    netProfit,
    netProfitPct: d.revenue > 0 ? Math.round((netProfit / d.revenue) * 1000) / 10 : null,
    breakEvenMonth,
    breakEvenDay: breakEvenMonth != null && daysInMonth > 0 ? Math.round(breakEvenMonth / daysInMonth) : null,
  };
}

// ── baselines ────────────────────────────────────────────────────────────────

export interface Totals { revenue: number; checks: number; guests: number; }

export interface LYBaseline extends Totals {
  from: string;
  to: string;
  coverage: number;      // share of days with sales, 0-1
  ramadanDays: number;   // Ramadan days inside the LY window
}

// Same month last year, shifted -364 days so every target day is compared
// with the same weekday (Friday vs Friday), not the same calendar date.
export function lyBaseline(facts: Map<string, DayFact>, month: string): LYBaseline {
  const days = monthDays(month);
  let revenue = 0, checks = 0, guests = 0, withSales = 0, ramadanDays = 0;
  for (const d of days) {
    const src = addDays(d, -364);
    const f = facts.get(src);
    if (isRamadan(src)) ramadanDays++;
    if (!f || f.revenue <= 0) continue;
    revenue += f.revenue; checks += f.checks; guests += f.guests; withSales++;
  }
  return {
    revenue, checks, guests,
    from: addDays(days[0], -364),
    to: addDays(days[days.length - 1], -364),
    coverage: days.length ? withSales / days.length : 0,
    ramadanDays,
  };
}

export interface WeekdayProfile {
  revenue: number[]; // avg per weekday, index 0 = Sunday
  checks: number[];
  guests: number[];
  sampledDays: number;
  from: string;
  to: string;
}

// Average per weekday over the `weeks` full weeks ending on `endDate`
// (inclusive). Closed days (no sales) are skipped so one holiday closure
// doesn't drag that weekday's average down.
export function weekdayProfile(facts: Map<string, DayFact>, endDate: string, weeks = 8): WeekdayProfile {
  const sum = { revenue: Array(7).fill(0), checks: Array(7).fill(0), guests: Array(7).fill(0) };
  const cnt = Array(7).fill(0);
  const from = addDays(endDate, -(weeks * 7 - 1));
  let sampledDays = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(from, i);
    const f = facts.get(d);
    if (!f || f.revenue <= 0) continue;
    const w = weekday(d);
    sum.revenue[w] += f.revenue; sum.checks[w] += f.checks; sum.guests[w] += f.guests;
    cnt[w]++; sampledDays++;
  }
  const avg = (arr: number[]) => arr.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
  return { revenue: avg(sum.revenue), checks: avg(sum.checks), guests: avg(sum.guests), sampledDays, from, to: endDate };
}

export function trendBaseline(profile: WeekdayProfile, month: string): Totals {
  let revenue = 0, checks = 0, guests = 0;
  for (const d of monthDays(month)) {
    const w = weekday(d);
    revenue += profile.revenue[w]; checks += profile.checks[w]; guests += profile.guests[w];
  }
  return { revenue: Math.round(revenue), checks: Math.round(checks), guests: Math.round(guests) };
}

// Relative weekday weights (mean = 1). Falls back to flat weights when there
// is no history, and fills a weekday that never traded with the mean.
export function weekdayWeights(profile: WeekdayProfile): number[] {
  const traded = profile.revenue.filter(v => v > 0);
  if (!traded.length) return Array(7).fill(1);
  const mean = traded.reduce((s, v) => s + v, 0) / traded.length;
  return profile.revenue.map(v => (v > 0 ? v / mean : 1));
}

// ── daily split ──────────────────────────────────────────────────────────────

// Pinned (override) days keep their value; the rest of the monthly target is
// spread over the remaining days by weekday weight. If the pinned days alone
// exceed the monthly target, the target grows to match — the owner's
// explicit day numbers win over the total.
export function splitDays(
  month: string,
  totalRevenue: number,
  totalChecks: number,
  weights: number[],
  overrides: DayOverride[] = [],
): { days: PlanDay[]; revenue: number; checks: number } {
  const dates = monthDays(month);
  const ov = new Map(overrides.filter(o => o.date.startsWith(month)).map(o => [o.date, o]));
  const avgCheck = totalChecks > 0 ? totalRevenue / totalChecks : 0;

  let pinnedRevenue = 0, pinnedChecks = 0, freeWeight = 0;
  for (const d of dates) {
    const o = ov.get(d);
    if (o) {
      pinnedRevenue += o.revenue;
      pinnedChecks += o.checks ?? (avgCheck > 0 ? Math.round(o.revenue / avgCheck) : 0);
    } else {
      freeWeight += weights[weekday(d)];
    }
  }
  const freeRevenue = Math.max(0, totalRevenue - pinnedRevenue);
  const freeChecks = Math.max(0, totalChecks - pinnedChecks);

  const days: PlanDay[] = dates.map(d => {
    const o = ov.get(d);
    const w = weights[weekday(d)];
    if (o) {
      return {
        date: d, weight: w, isOverride: true, note: o.note ?? null, holiday: holidayOf(d),
        revenue: Math.round(o.revenue),
        checks: o.checks ?? (avgCheck > 0 ? Math.round(o.revenue / avgCheck) : 0),
      };
    }
    const share = freeWeight > 0 ? w / freeWeight : 0;
    return {
      date: d, weight: w, isOverride: false, note: null, holiday: holidayOf(d),
      revenue: Math.round(freeRevenue * share),
      checks: Math.round(freeChecks * share),
    };
  });

  // Rounding drift goes to the last free day so the days sum to the target exactly.
  const lastFree = [...days].reverse().find(d => !d.isOverride);
  if (lastFree) {
    const free = days.filter(d => !d.isOverride);
    lastFree.revenue = Math.max(0, lastFree.revenue + Math.round(freeRevenue) - free.reduce((s, d) => s + d.revenue, 0));
    lastFree.checks = Math.max(0, lastFree.checks + Math.round(freeChecks) - free.reduce((s, d) => s + d.checks, 0));
  }

  return {
    days,
    revenue: days.reduce((s, d) => s + d.revenue, 0),
    checks: days.reduce((s, d) => s + d.checks, 0),
  };
}

// ── suggestion ───────────────────────────────────────────────────────────────

export interface CostBaseline {
  months: string[];          // full months the averages come from
  labor: number;
  rent: number;
  utilities: number;
  otherOpex: number;
  foodCostPct: number | null;
  bestFoodCostPct: number | null;
  bestFoodCostMonth: string | null;
}

export interface Suggestion {
  month: string;
  method: 'ly' | 'trend';
  growthPct: number;
  drivers: PlanDrivers;
  pl: PlanPL;
  days: PlanDay[];
  baseline: {
    ly: LYBaseline;
    trend: Totals & { from: string; to: string; sampledDays: number };
    costs: CostBaseline;
    ramadanTargetDays: number;
  };
  warnings: string[];
}

export const DEFAULT_GROWTH_PCT = 6;
const LY_MIN_COVERAGE = 0.8;
const BASELINE_DIVERGENCE = 0.15;

export function buildSuggestion(opts: {
  month: string;
  facts: Map<string, DayFact>;
  profile: WeekdayProfile;
  costs: CostBaseline;
  growthPct?: number;
  method?: 'ly' | 'trend';
}): Suggestion {
  const { month, facts, profile, costs } = opts;
  const growthPct = opts.growthPct ?? DEFAULT_GROWTH_PCT;
  const days = monthDays(month);
  const ly = lyBaseline(facts, month);
  const trend = trendBaseline(profile, month);
  const warnings: string[] = [];

  const lyUsable = ly.coverage >= LY_MIN_COVERAGE && ly.revenue > 0;
  let method: 'ly' | 'trend' = opts.method ?? (lyUsable ? 'ly' : 'trend');
  if (method === 'ly' && !lyUsable) {
    method = 'trend';
    warnings.push('ly_insufficient');
  }

  if (lyUsable && trend.revenue > 0) {
    const diff = (trend.revenue - ly.revenue) / ly.revenue;
    if (Math.abs(diff) > BASELINE_DIVERGENCE) warnings.push(diff > 0 ? 'trend_above_ly' : 'trend_below_ly');
  }

  const ramadanTargetDays = days.filter(isRamadan).length;
  if (method === 'ly' && Math.abs(ramadanTargetDays - ly.ramadanDays) >= 5) warnings.push('ramadan_shift');
  if (profile.sampledDays < 14) warnings.push('little_history');
  if (costs.foodCostPct == null) warnings.push('no_cogs');

  const base = method === 'ly' ? ly : trend;
  const k = 1 + growthPct / 100;
  const revenue = Math.round(base.revenue * k);
  const checks = Math.round(base.checks * k);
  const guests = Math.round(base.guests * k);

  const drivers: PlanDrivers = {
    revenue,
    checks,
    avgCheck: checks > 0 ? Math.round(revenue / checks) : 0,
    guests,
    foodCostPct: costs.foodCostPct ?? 0,
    labor: costs.labor,
    rent: costs.rent,
    utilities: costs.utilities,
    otherOpex: costs.otherOpex,
  };

  const split = splitDays(month, revenue, checks, weekdayWeights(profile));

  return {
    month,
    method,
    growthPct,
    drivers,
    pl: computePL(drivers, days.length),
    days: split.days,
    baseline: {
      ly,
      trend: { ...trend, from: profile.from, to: profile.to, sampledDays: profile.sampledDays },
      costs,
      ramadanTargetDays,
    },
    warnings,
  };
}

// Food cost % from cached daily facts over a set of months.
export function foodCostByMonth(facts: Map<string, DayFact>, months: string[]): { month: string; pct: number | null }[] {
  return months.map(month => {
    let rev = 0, cogs = 0;
    for (const d of monthDays(month)) {
      const f = facts.get(d);
      if (f) { rev += f.revenue; cogs += f.cogs; }
    }
    return { month, pct: rev > 0 && cogs > 0 ? Math.round((cogs / rev) * 1000) / 10 : null };
  });
}

// ── progress (plan vs fact, forecast, needed per day) ────────────────────────

export interface FixedCosts { labor: number; rent: number; utilities: number; otherOpex: number; }

export interface MetricProgress {
  plan: number;          // full month
  planMtd: number;       // closed days only
  factMtd: number;
  pct: number | null;    // factMtd / planMtd
  forecast: number;
  forecastPct: number | null; // forecast / plan
  gap: number;           // factMtd - planMtd
}

export interface ProgressResult {
  state: 'future' | 'current' | 'past';
  today: string;
  daysInMonth: number;
  closedDays: number;
  remainingDays: number; // incl. today
  status: 'ahead' | 'on_track' | 'behind' | null;
  paceRatio: number;     // recent fact/plan used for the forecast
  revenue: MetricProgress;
  checks: MetricProgress;
  avgCheck: { plan: number; planMtd: number; factMtd: number; pct: number | null };
  guests: { plan: number; factMtd: number };
  foodCost: { known: boolean; planPct: number; factPct: number | null; planCogsMtd: number; factCogsMtd: number };
  costs: { source: 'accrued' | 'gl'; month: FixedCosts & { total: number }; mtd: number };
  profit: { plan: number; planMtd: number; factMtd: number; forecast: number; pct: number | null };
  todayLive: { date: string; plan: number; fact: number; checks: number; expectedByNow: number | null; pct: number | null } | null;
  breakEven: { monthRevenue: number | null; dayRevenue: number | null; reachedOn: string | null; projectedOn: string | null };
  needed: { perDayAvg: number; gap: number; days: { date: string; plan: number; needed: number }[] };
  series: { date: string; plan: number; fact: number | null; cumPlan: number; cumFact: number | null; holiday: string | null }[];
}

const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fixedTotal = (c: FixedCosts) => c.labor + c.rent + c.utilities + c.otherOpex;

export function computeProgress(opts: {
  month: string;
  today: string;
  drivers: PlanDrivers;
  planDays: { date: string; revenue: number; checks: number }[];
  facts: Map<string, DayFact>;
  actualCosts?: FixedCosts | null; // real GL totals, only for a closed month
  todayShare?: number | null;      // typical cumulative share of the day's revenue by this hour
}): ProgressResult {
  const { month, today, drivers, planDays, facts } = opts;
  const dates = monthDays(month);
  const dim = dates.length;
  const first = dates[0], last = dates[dim - 1];
  const state: ProgressResult['state'] = today > last ? 'past' : today < first ? 'future' : 'current';

  const planByDate = new Map(planDays.map(d => [d.date, d]));
  const closed = dates.filter(d => d < today);
  const remaining = dates.filter(d => d >= today);
  const planFc = clamp(drivers.foodCostPct, 0, 100) / 100;

  const sumPlan = (ds: string[], k: 'revenue' | 'checks') => ds.reduce((s, d) => s + (planByDate.get(d)?.[k] ?? 0), 0);
  const sumFact = (ds: string[], k: keyof Omit<DayFact, 'date'>) => ds.reduce((s, d) => s + (facts.get(d)?.[k] ?? 0), 0);

  const planRevMtd = sumPlan(closed, 'revenue');
  const planChecksMtd = sumPlan(closed, 'checks');
  const factRevMtd = sumFact(closed, 'revenue');
  const factChecksMtd = sumFact(closed, 'checks');
  const factGuestsMtd = sumFact(closed, 'guests');
  const rawCogsMtd = sumFact(closed, 'cogs');
  const fcKnown = rawCogsMtd > 0 && factRevMtd > 0;
  const factFc = fcKnown ? rawCogsMtd / factRevMtd : null;
  const factCogsMtd = fcKnown ? rawCogsMtd : Math.round(factRevMtd * planFc);

  // Pace: fact/plan over the last ≤7 closed days of the month.
  const recent = closed.slice(-7);
  const recentPlan = sumPlan(recent, 'revenue');
  const paceRatio = recentPlan > 0 ? clamp(sumFact(recent, 'revenue') / recentPlan, 0.5, 1.5) : 1;
  const recentChecksPlan = sumPlan(recent, 'checks');
  const checksRatio = recentChecksPlan > 0 ? clamp(sumFact(recent, 'checks') / recentChecksPlan, 0.5, 1.5) : 1;

  const todayFact = state === 'current' ? facts.get(today) : undefined;
  const todayPlan = planByDate.get(today);
  const afterToday = dates.filter(d => d > today);
  const forecastToday = state === 'current'
    ? Math.max(todayFact?.revenue ?? 0, Math.round((todayPlan?.revenue ?? 0) * paceRatio)) : 0;
  const forecastTodayChecks = state === 'current'
    ? Math.max(todayFact?.checks ?? 0, Math.round((todayPlan?.checks ?? 0) * checksRatio)) : 0;
  const forecastRev = state === 'past' ? factRevMtd
    : factRevMtd + forecastToday + Math.round(sumPlan(afterToday, 'revenue') * paceRatio);
  const forecastChecks = state === 'past' ? factChecksMtd
    : factChecksMtd + forecastTodayChecks + Math.round(sumPlan(afterToday, 'checks') * checksRatio);

  const metric = (plan: number, planMtd: number, factMtd: number, forecast: number): MetricProgress => ({
    plan, planMtd, factMtd, pct: pctOf(factMtd, planMtd), forecast, forecastPct: pctOf(forecast, plan), gap: factMtd - planMtd,
  });

  // Fixed costs: real GL once the month is closed, otherwise the plan accrued by elapsed days.
  const planFixed: FixedCosts = { labor: drivers.labor, rent: drivers.rent, utilities: drivers.utilities, otherOpex: drivers.otherOpex };
  const useGl = state === 'past' && !!opts.actualCosts;
  const monthFixed = useGl ? opts.actualCosts! : planFixed;
  const monthFixedTotal = fixedTotal(monthFixed);
  const fixedMtd = useGl ? monthFixedTotal : Math.round(fixedTotal(planFixed) * closed.length / dim);
  const planFixedMtd = Math.round(fixedTotal(planFixed) * closed.length / dim);

  const planProfit = computePL(drivers, dim).netProfit;
  const planProfitMtd = Math.round(planRevMtd * (1 - planFc)) - planFixedMtd;
  const factProfitMtd = factRevMtd - factCogsMtd - fixedMtd;
  const fcForForecast = factFc ?? planFc;
  const forecastProfit = Math.round(forecastRev * (1 - fcForForecast)) - monthFixedTotal;

  const pctRev = pctOf(factRevMtd, planRevMtd);
  const status = pctRev == null ? null : pctRev >= 100 ? 'ahead' : pctRev >= 95 ? 'on_track' : 'behind';

  // Break-even: first day the month's cumulative contribution covers the month's fixed costs.
  const breakEvenMonth = fcForForecast < 1 ? Math.round(monthFixedTotal / (1 - fcForForecast)) : null;
  let cum = 0, reachedOn: string | null = null, projectedOn: string | null = null;
  for (const d of dates) {
    const isClosed = d < today;
    const rev = isClosed ? (facts.get(d)?.revenue ?? 0)
      : d === today && state === 'current' ? forecastToday
      : Math.round((planByDate.get(d)?.revenue ?? 0) * paceRatio);
    cum += rev * (1 - fcForForecast);
    if (cum >= monthFixedTotal && monthFixedTotal > 0) {
      if (isClosed) reachedOn = d; else projectedOn = d;
      break;
    }
  }

  // Needed: what's left of the monthly target, spread over the remaining days by their plan weight.
  const gapLeft = Math.max(0, drivers.revenue - factRevMtd);
  const remainingPlan = sumPlan(remaining, 'revenue');
  const neededDays = state === 'past' ? [] : remaining.map(d => {
    const p = planByDate.get(d)?.revenue ?? 0;
    return { date: d, plan: p, needed: remainingPlan > 0 ? Math.round(gapLeft * p / remainingPlan) : Math.round(gapLeft / remaining.length) };
  });

  let cumPlan = 0, cumFact = 0;
  const series = dates.map(d => {
    const p = planByDate.get(d)?.revenue ?? 0;
    cumPlan += p;
    const hasFact = d < today || (d === today && state === 'current');
    const f = hasFact ? (facts.get(d)?.revenue ?? 0) : null;
    if (f != null) cumFact += f;
    return { date: d, plan: p, fact: f, cumPlan, cumFact: f != null ? cumFact : null, holiday: holidayOf(d) };
  });

  const planAvg = drivers.checks > 0 ? Math.round(drivers.revenue / drivers.checks) : drivers.avgCheck;
  const planAvgMtd = planChecksMtd > 0 ? Math.round(planRevMtd / planChecksMtd) : planAvg;
  const factAvgMtd = factChecksMtd > 0 ? Math.round(factRevMtd / factChecksMtd) : 0;

  return {
    state, today, daysInMonth: dim, closedDays: closed.length, remainingDays: state === 'past' ? 0 : remaining.length,
    status, paceRatio: Math.round(paceRatio * 1000) / 1000,
    revenue: metric(drivers.revenue, planRevMtd, factRevMtd, forecastRev),
    checks: metric(drivers.checks, planChecksMtd, factChecksMtd, forecastChecks),
    avgCheck: { plan: planAvg, planMtd: planAvgMtd, factMtd: factAvgMtd, pct: pctOf(factAvgMtd, planAvgMtd) },
    guests: { plan: drivers.guests, factMtd: factGuestsMtd },
    foodCost: {
      known: fcKnown, planPct: drivers.foodCostPct,
      factPct: factFc != null ? Math.round(factFc * 1000) / 10 : null,
      planCogsMtd: Math.round(planRevMtd * planFc), factCogsMtd,
    },
    costs: { source: useGl ? 'gl' : 'accrued', month: { ...monthFixed, total: monthFixedTotal }, mtd: fixedMtd },
    profit: { plan: planProfit, planMtd: planProfitMtd, factMtd: factProfitMtd, forecast: forecastProfit, pct: planProfitMtd > 0 ? pctOf(factProfitMtd, planProfitMtd) : null },
    todayLive: state === 'current' ? {
      date: today,
      plan: todayPlan?.revenue ?? 0,
      fact: todayFact?.revenue ?? 0,
      checks: todayFact?.checks ?? 0,
      expectedByNow: opts.todayShare != null ? Math.round((todayPlan?.revenue ?? 0) * opts.todayShare) : null,
      pct: opts.todayShare != null ? pctOf(todayFact?.revenue ?? 0, Math.round((todayPlan?.revenue ?? 0) * opts.todayShare)) : pctOf(todayFact?.revenue ?? 0, todayPlan?.revenue ?? 0),
    } : null,
    breakEven: { monthRevenue: breakEvenMonth, dayRevenue: breakEvenMonth != null ? Math.round(breakEvenMonth / dim) : null, reachedOn, projectedOn },
    needed: {
      perDayAvg: neededDays.length ? Math.round(gapLeft / neededDays.length) : 0,
      gap: gapLeft,
      days: neededDays,
    },
    series,
  };
}

// ── variance (factor analysis, closed days only) ─────────────────────────────
// Revenue Δ = checks effect + avg-check effect; profit Δ = volume + food cost
// + labor + opex. Each decomposition sums exactly to fact − plan.

export interface VarianceResult {
  period: { from: string | null; to: string | null; days: number };
  revenue: { plan: number; fact: number; items: { key: 'checks' | 'avg_check'; value: number }[] };
  profit: { plan: number; fact: number; items: { key: 'volume' | 'food_cost' | 'labor' | 'opex'; value: number }[] };
  drivers: {
    planChecks: number; factChecks: number; planAvgCheck: number; factAvgCheck: number;
    planFoodCostPct: number; factFoodCostPct: number | null;
  };
  foodCostKnown: boolean;
}

export function computeVariance(opts: {
  month: string;
  today: string;
  drivers: PlanDrivers;
  planDays: { date: string; revenue: number; checks: number }[];
  facts: Map<string, DayFact>;
  actualCosts?: FixedCosts | null;
}): VarianceResult {
  const { month, today, drivers, planDays, facts } = opts;
  const dates = monthDays(month);
  const closed = dates.filter(d => d < today);
  const planByDate = new Map(planDays.map(d => [d.date, d]));
  const planFc = clamp(drivers.foodCostPct, 0, 100) / 100;

  let pR = 0, pC = 0, fR = 0, fC = 0, fCogs = 0;
  for (const d of closed) {
    pR += planByDate.get(d)?.revenue ?? 0; pC += planByDate.get(d)?.checks ?? 0;
    const f = facts.get(d);
    if (f) { fR += f.revenue; fC += f.checks; fCogs += f.cogs; }
  }
  const pAC = pC > 0 ? pR / pC : 0;
  const fAC = fC > 0 ? fR / fC : 0;
  const checksEffect = Math.round((fC - pC) * pAC);
  const avgEffect = (fR - pR) - checksEffect; // == fC × (fAC − pAC), taken as the remainder so rounding never leaks

  const fcKnown = fCogs > 0 && fR > 0;
  const factCogs = fcKnown ? fCogs : Math.round(fR * planFc);

  const share = dates.length ? closed.length / dates.length : 0;
  const planLabor = Math.round(drivers.labor * share);
  const planOpex = Math.round((drivers.rent + drivers.utilities + drivers.otherOpex) * share);
  const isPast = today > dates[dates.length - 1];
  const act = isPast && opts.actualCosts ? opts.actualCosts : null;
  const factLabor = act ? act.labor : planLabor;
  const factOpex = act ? act.rent + act.utilities + act.otherOpex : planOpex;

  const planProfit = Math.round(pR * (1 - planFc)) - planLabor - planOpex;
  const factProfit = fR - factCogs - factLabor - factOpex;
  const volume = Math.round((fR - pR) * (1 - planFc));
  const labor = planLabor - factLabor;
  const opex = planOpex - factOpex;
  const foodCost = factProfit - planProfit - volume - labor - opex; // == −(fCogs − fR × planFc)

  return {
    period: { from: closed[0] ?? null, to: closed[closed.length - 1] ?? null, days: closed.length },
    revenue: { plan: pR, fact: fR, items: [{ key: 'checks', value: checksEffect }, { key: 'avg_check', value: avgEffect }] },
    profit: {
      plan: planProfit, fact: factProfit,
      items: [
        { key: 'volume', value: volume },
        { key: 'food_cost', value: foodCost },
        { key: 'labor', value: labor },
        { key: 'opex', value: opex },
      ],
    },
    drivers: {
      planChecks: pC, factChecks: fC, planAvgCheck: Math.round(pAC), factAvgCheck: Math.round(fAC),
      planFoodCostPct: drivers.foodCostPct, factFoodCostPct: fcKnown ? Math.round((fCogs / fR) * 1000) / 10 : null,
    },
    foodCostKnown: fcKnown,
  };
}

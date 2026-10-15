// Главная — redesigned per TRACE-mockups/dashboard-v2.html (Oct 2026).
// One row of headline numbers, plan line, on-demand briefing, hourly chart
// against a baseline, live hall, then what sells and the till feed.
// Styles: styles/rd/dash.css (scoped .rd-dash).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeData, RealtimeEvent, RealtimeOrderData } from '../../hooks/useRealtimeData';
import { tr } from '../../constants';
import { Language, ComparisonPeriod, ViewState } from '../../types';
import {
  traceApi, isDemoTenant, demoLiveOrderFeed, branchHeaders, RevenueRow, DishRow, IntegrationStatus,
  AIDailyBriefing, HourlyRow, RevenueType, ActiveOrderRow, HallPlan,
} from '../../services/traceApi';
import type { ProgressResult } from '../../lib/planEngine';
import { tashkentDateStr, tashkentHours } from '../../utils/tz';
import {
  fmt, mln, sum, money, pctChange, Delta, Pop, Opt, PeriodSeg, PeriodValue, AiMeta, Skel, LineChart, Legend,
  weekday, dayLabel, rangeLabel, isoShift, nowHM, periodDates, wdShort, MONTHS_NOM,
} from '../rd/ui';

interface DashboardProps {
  lang: Language;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  branch?: string | null;
  onContextReady?: (ctx: string) => void;
  onOpenPlan?: () => void;
  onNavigate?: (v: ViewState) => void;
}

// iiko surfaces ~10 disagreeing "revenue" totals; the owner picks which one
// drives the headline. See RevenueType in traceApi.ts.
const REV: Record<RevenueType, [string, string, string, string?, string?, string?]> = {
  net: ['Со скидками', 'After discounts', 'Chegirmalar bilan', 'Сколько реально заплатили гости', 'What guests actually paid', "Mehmonlar to'lagan summa"],
  gross: ['Без скидок', 'Before discounts', 'Chegirmasiz', 'По ценам в меню, без учёта скидок', 'At menu price, ignoring discounts', "Menyudagi narx bo'yicha"],
  food_only: ['Только еда и напитки', 'Food & drinks only', 'Faqat taom va ichimlik', 'Без сервисного сбора, чаевых, модификаторов', 'Excludes service charge, tips, modifiers', 'Xizmat haqi va choy pulisiz'],
  excl_comp: ['Без комплиментов', 'Excl. comps', 'Bepul buyurtmalarsiz', 'Без бесплатных и блогерских заказов', 'Excludes unpaid and blogger orders', 'Bepul va blogger buyurtmalarisiz'],
  cash: ['Наличными', 'Cash', 'Naqd'],
  card: ['По картам', 'Card', 'Karta'],
  gl_kitchen: ['Выручка Кухня', 'Kitchen revenue', 'Oshxona tushumi'],
  gl_bar: ['Выручка Бар', 'Bar revenue', 'Bar tushumi'],
  gl_pastry: ['Выручка Кондитерка', 'Pastry revenue', 'Konditer tushumi'],
  gl_service_charge: ['Надбавка за обслуживание', 'Service charge', 'Xizmat haqi'],
  gl_transfers: ['От перемещения между филиалами', 'Inter-branch transfers', "Filiallararo ko'chirish"],
  gl_other_income: ['Прочие доходы', 'Other income', 'Boshqa daromadlar'],
  gl_no_discount: ['Без скидочных позиций', 'Non-discountable items', 'Chegirmasiz pozitsiyalar'],
};
const REV_GROUPS: { title?: [string, string, string]; keys: RevenueType[] }[] = [
  { keys: ['net', 'gross', 'food_only', 'excl_comp'] },
  { title: ['По оплате', 'By payment', "To'lov bo'yicha"], keys: ['cash', 'card'] },
  { title: ['Из бухучёта iiko', 'From iiko accounting', 'iiko hisobidan'], keys: ['gl_kitchen', 'gl_bar', 'gl_pastry', 'gl_service_charge', 'gl_transfers', 'gl_other_income', 'gl_no_discount'] },
];
const rl = (lang: Language, k: RevenueType) => tr(lang, REV[k][0], REV[k][1], REV[k][2]);

// Comparison shift in days per option (matches the old ComparisonSelector).
const SHIFT: Record<ComparisonPeriod, number> = { yesterday: 1, last_week: 7, last_month: 30, last_year: 365 };
const CMP_OPTIONS: Record<'today' | '7days' | '30days', ComparisonPeriod[]> = {
  today: ['yesterday', 'last_week', 'last_month', 'last_year'],
  '7days': ['last_week', 'last_month', 'last_year'],
  '30days': ['last_month', 'last_year'],
};
const DEFAULT_CMP: Record<'today' | '7days' | '30days', ComparisonPeriod> = { today: 'last_week', '7days': 'last_week', '30days': 'last_month' };

const FEED_TYPES = new Set([
  'order_opened', 'order_bill_printed', 'order_closed', 'order_removed', 'order_bill_cancelled',
  'order_printed_items_deleted', 'cashier_session_opened', 'cashier_session_closed',
]);
const TABLE_TYPES = new Set(['rect_table', 'round_table', 'stool']);
const LONG_MIN = 90;

// Daily briefing is generated on request and kept for the day.
const BRIEF_KEY = 'trace_ai_briefing';
const todayKey = () => tashkentDateStr();
function loadBrief(): { data: AIDailyBriefing; at?: string } | null {
  try {
    const raw = localStorage.getItem(BRIEF_KEY); if (!raw) return null;
    const j = JSON.parse(raw);
    return j.date === todayKey() ? { data: j.data, at: j.at } : null;
  } catch { return null; }
}
function saveBrief(b: AIDailyBriefing, at: string) {
  try { localStorage.setItem(BRIEF_KEY, JSON.stringify({ data: b, date: todayKey(), at })); } catch {}
}
const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && !t.startsWith('{') && !t.startsWith('[') ? t : null;
};

export const Dashboard: React.FC<DashboardProps> = ({ lang, branch, onContextReady, onOpenPlan, onNavigate }) => {
  const demo = isDemoTenant();
  const [period, setPeriod] = useState<PeriodValue>({ range: 'today', custom: null });
  const cmpKey = (period.range === 'custom' ? '7days' : period.range) as 'today' | '7days' | '30days';
  const [comparison, setComparison] = useState<ComparisonPeriod>('last_week');
  useEffect(() => { if (!CMP_OPTIONS[cmpKey].includes(comparison)) setComparison(DEFAULT_CMP[cmpKey]); }, [cmpKey]);

  const [revenueType, setRevenueType] = useState<RevenueType>(() => (localStorage.getItem('trace_revenue_type') as RevenueType) || 'net');
  useEffect(() => { localStorage.setItem('trace_revenue_type', revenueType); }, [revenueType]);

  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [compRows, setCompRows] = useState<RevenueRow[]>([]);
  const [hourly, setHourly] = useState<HourlyRow[]>([]);
  const [compHourly, setCompHourly] = useState<HourlyRow[]>([]);
  const [dishes, setDishes] = useState<DishRow[]>([]);
  const [status, setStatus] = useState<IntegrationStatus>({});
  const [rg, setRg] = useState<{ available: boolean; revenue?: number; orders?: number; guests?: number } | null>(null);
  const [compRg, setCompRg] = useState<{ available: boolean; revenue?: number; orders?: number; guests?: number } | null>(null);
  const [rgKey, setRgKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hoursCfg, setHoursCfg] = useState({ openHour: 9, closeHour: 23 });
  const poster = !!status.poster;
  useEffect(() => { if (poster && revenueType !== 'net') setRevenueType('net'); }, [poster]);
  useEffect(() => {
    if (demo) return;
    traceApi.settings.businessHours().then(h => setHoursCfg({ openHour: h.openHour ?? 9, closeHour: h.closeHour ?? 23 })).catch(() => {});
  }, []);

  const { from, to } = periodDates(period.range, period.custom);
  const today = tashkentDateStr();
  const isToday = period.range === 'today';
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1;

  // Current period
  const [loadErr, setLoadErr] = useState(false);
  useEffect(() => {
    // `alive`: a slow answer for the previous period must not land under the new one.
    let alive = true;
    setLoading(true); setLoadErr(false);
    const custom = period.range === 'custom' && period.custom;
    const dishRange = custom ? 'custom' : period.range as 'today' | '7days' | '30days';
    Promise.all([
      custom ? traceApi.sales.revenue('custom', from, to, revenueType)
        : isToday ? traceApi.sales.revenue('custom', today, today, revenueType)
        : traceApi.sales.revenue(period.range as any, undefined, undefined, revenueType),
      custom ? traceApi.sales.topDishes('custom', 7, from, to) : traceApi.sales.topDishes(dishRange, 7),
      traceApi.sales.status(),
      custom ? traceApi.sales.realGuestRevenue('custom', from, to) : traceApi.sales.realGuestRevenue(dishRange as any),
      isToday ? traceApi.sales.hourly() : Promise.resolve([] as HourlyRow[]),
    ]).then(([r, d, s, g, h]) => {
      if (!alive) return;
      setRows(isToday ? r.filter(x => x.date === today) : r);
      setDishes(d); setStatus(s); setRg(g); setHourly(h);
    }).catch(() => { if (alive) { setRows([]); setDishes([]); setHourly([]); setLoadErr(true); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period, branch, revenueType, rgKey]);

  // Comparison period: same length, shifted back
  const shift = period.range === 'custom' ? days : SHIFT[comparison];
  const cFrom = isoShift(from, -shift), cTo = isoShift(to, -shift);
  useEffect(() => {
    let alive = true;
    const keep = <T,>(set: (v: T) => void) => (v: T) => { if (alive) set(v); };
    traceApi.sales.revenue('custom', cFrom, cTo, revenueType).then(keep(setCompRows)).catch(() => keep(setCompRows)([]));
    traceApi.sales.realGuestRevenue('custom', cFrom, cTo).then(keep(setCompRg)).catch(() => keep(setCompRg)(null));
    if (isToday) traceApi.sales.hourly(cFrom).then(keep(setCompHourly)).catch(() => keep(setCompHourly)([]));
    else setCompHourly([]);
    return () => { alive = false; };
  }, [cFrom, cTo, branch, revenueType, rgKey]);

  // ── Totals ──
  const tot = (rs: RevenueRow[]) => rs.reduce((a, r) => ({ rev: a.rev + r.revenue, ord: a.ord + r.orders, gst: a.gst + (r.guests ?? 0) }), { rev: 0, ord: 0, gst: 0 });
  const cur = tot(rows);
  const rgOn = !demo && !!rg?.available;
  const revenue = rgOn ? rg!.revenue ?? 0 : cur.rev;
  const orders = rgOn ? rg!.orders ?? 0 : cur.ord;
  const guests = rgOn ? rg!.guests ?? 0 : cur.gst;
  const avg = orders ? revenue / orders : 0;
  const perGuest = guests ? revenue / guests : 0;

  // Today compares to the same time of day: comparison hours up to now.
  const nowH = tashkentHours();
  const compSoFar = useMemo(() => {
    if (!isToday || !compHourly.length) return null;
    const fl = Math.floor(nowH), fr = nowH - fl;
    let rev = 0, ord = 0;
    for (const r of compHourly) { if (r.hour < fl) { rev += r.revenue; ord += r.orders; } else if (r.hour === fl) { rev += r.revenue * fr; ord += r.orders * fr; } }
    return { rev, ord };
  }, [isToday, compHourly, nowH]);
  const scale = useMemo(() => {
    if (!isToday || demo) return 1;
    const open = hoursCfg.openHour, close = hoursCfg.closeHour <= open ? hoursCfg.closeHour + 24 : hoursCfg.closeHour;
    let c = nowH; if (c < open) c += 24;
    return Math.min(1, Math.max(0, Math.min(c, close) - open) / Math.max(1, close - open));
  }, [isToday, demo, hoursCfg, nowH]);
  const cTot = tot(compRows);
  const cRgOn = rgOn && !!compRg?.available;
  const cRevFull = cRgOn ? compRg!.revenue ?? 0 : cTot.rev;
  const cRev = compSoFar && !cRgOn ? compSoFar.rev : cRevFull * scale;
  const cOrd = compSoFar && !cRgOn ? compSoFar.ord : (cRgOn ? compRg!.orders ?? 0 : cTot.ord) * scale;
  const cGst = (cRgOn ? compRg!.guests ?? 0 : cTot.gst) * scale;
  const dRev = pctChange(revenue, cRev), dOrd = pctChange(orders, cOrd), dGst = pctChange(guests, cGst);
  const dAvg = cOrd ? pctChange(avg, cRev / cOrd) : null, dPg = cGst ? pctChange(perGuest, cRev / cGst) : null;

  // Forecast to close (today): comparison day's full total scaled by today's pace.
  const forecast = isToday && cRev > 0 && revenue > 0 && cRevFull > 0 ? cRevFull * (revenue / cRev) : null;
  const best = !isToday && rows.length > 1 ? rows.reduce((a, b) => (b.revenue > a.revenue ? b : a)) : null;

  // ── AI context ──
  useEffect(() => {
    if (!onContextReady || loading) return;
    const f = (n: number) => Math.round(n).toLocaleString('ru-RU');
    onContextReady(
      `Раздел: Главная\nПериод: ${from} — ${to}\nВыручка: ${f(revenue)} UZS | Заказов: ${orders} | Гостей: ${guests} | Средний чек: ${f(avg)} UZS\n` +
      `Изменение к сравнению: ${dRev == null ? 'нет данных' : dRev.toFixed(1) + '%'}\n` +
      `\nВыручка по дням:\n${rows.map(r => `  ${r.date}: ${f(r.revenue)} UZS, ${r.orders} заказов`).join('\n')}\n` +
      `\nТоп блюд:\n${dishes.map((d, i) => `  ${i + 1}. ${d.name} [${d.category}] — ${d.quantity} шт., ${f(d.revenue)} UZS`).join('\n') || '  нет данных'}`
    );
  }, [loading, rows, dishes, revenue]);

  // ── Plan line ──
  const month = today.slice(0, 7);
  const [plan, setPlan] = useState<ProgressResult | null>(null);
  useEffect(() => {
    if (!onOpenPlan) return;
    let alive = true;
    traceApi.plan.meta().then(m => (m.supported ? traceApi.plan.progress(month) : null))
      .then(r => { if (alive && r?.progress) setPlan(r.progress); }).catch(() => {});
    return () => { alive = false; };
  }, [month, branch, !!onOpenPlan]);

  // ── Briefing ──
  const cached = useMemo(loadBrief, []);
  const [brief, setBrief] = useState<AIDailyBriefing | null>(cached?.data ?? null);
  const [briefAt, setBriefAt] = useState<string | null>(cached?.at ?? null);
  const [briefLoading, setBriefLoading] = useState(false);
  const runBrief = (force = false) => {
    if (briefLoading) return;
    setBriefLoading(true);
    traceApi.ai.briefing(lang, force)
      .then(b => { const at = nowHM(); setBrief(b); setBriefAt(at); if (b.fromAI) saveBrief(b, at); })
      .catch(() => setBrief({ fromAI: false }))
      .finally(() => setBriefLoading(false));
  };
  const briefState = briefLoading ? 'loading' : brief?.fromAI ? 'done' : 'empty';

  // ── Hall + feed (iikoFront plugin) ──
  const wsUrl = import.meta.env.VITE_BACKEND_WS_URL as string | undefined;
  const [feed, setFeed] = useState<(RealtimeEvent & { id: string })[]>(() => demo ? demoLiveOrderFeed() as unknown as (RealtimeEvent & { id: string })[] : []);
  const [feedOpen, setFeedOpen] = useState(false);
  const { connected } = useRealtimeData({
    backendWsUrl: wsUrl ?? '',
    // No `!!wsUrl` gate: useRealtimeData falls back to the page's own host.
    enabled: !demo,
    onEvent: useCallback((e: RealtimeEvent) => {
      if (FEED_TYPES.has(e.type)) setFeed(p => [{ ...e, id: `${Date.now()}-${Math.random()}` }, ...p].slice(0, 300));
    }, []),
  });
  const plugin = !poster && (demo || connected);
  useEffect(() => {
    if (demo) return;
    const base = import.meta.env.VITE_API_URL || '/api';
    fetch(`${base}/realtime/events?limit=300&from=${from}&to=${to}`, { headers: branchHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((evs: { type: string; payload?: any; created_at: string }[]) => setFeed(evs.filter(e => FEED_TYPES.has(e.type)).map(e => ({
        type: e.type, timestamp: e.payload?.timestamp ?? e.created_at, data: e.payload?.data ?? {}, id: `h-${e.created_at}-${Math.random()}`,
      } as any))))
      .catch(() => {});
  }, [from, to, branch]);

  const [active, setActive] = useState<ActiveOrderRow[]>([]);
  const [plans, setPlans] = useState<HallPlan[]>([]);
  useEffect(() => {
    if (poster) return;
    traceApi.halls.list().then(setPlans).catch(() => {});
    const load = () => traceApi.operations.activeOrders().then(setActive).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [poster, branch]);

  const hall = useMemo(() => {
    const byNum = new Map<number, ActiveOrderRow>();
    for (const o of active) if (o.tableNum != null) {
      const prev = byNum.get(o.tableNum);
      if (!prev || Date.parse(o.openTime) > Date.parse(prev.openTime)) byNum.set(o.tableNum, o);
    }
    const mins = (o: ActiveOrderRow) => Math.max(0, Math.floor((Date.now() - Date.parse(o.openTime)) / 60000));
    let tiles: { key: string; label: string; title: string; state: '' | 'busy' | 'bill' | 'long' }[] = [];
    const stateOf = (o?: ActiveOrderRow) => !o ? '' : mins(o) >= LONG_MIN ? 'long' : o.status === 'Bill' ? 'bill' : 'busy';
    for (const p of plans) for (const el of p.elements ?? []) {
      if (!TABLE_TYPES.has(el.type)) continue;
      const num = el.iiko_table_number ?? (Number(el.label) || undefined);
      const o = num != null ? byNum.get(num) : undefined;
      tiles.push({ key: `${p.id}-${el.id}`, label: el.label, title: `${p.name}, ${el.label}`, state: stateOf(o) as any });
    }
    if (!tiles.length) tiles = [...byNum.entries()].sort((a, b) => a[0] - b[0]).map(([n, o]) => ({ key: String(n), label: String(n), title: o.table, state: stateOf(o) as any }));
    const busy = [...byNum.values()];
    const long = busy.filter(o => mins(o) >= LONG_MIN).sort((a, b) => mins(b) - mins(a));
    const bill = busy.filter(o => o.status === 'Bill' && mins(o) < LONG_MIN).length;
    const g = busy.reduce((a, o) => a + (o.guests ?? 0), 0);
    const avgMin = busy.length ? Math.round(busy.reduce((a, o) => a + mins(o), 0) / busy.length) : 0;
    const total = plans.length ? tiles.length : (demo ? 22 : 0);
    return { tiles, occupied: busy.length, total, long, bill, eating: busy.length - bill - long.length, guests: g, avgMin, mins };
  }, [active, plans]);

  // ── Chart series ──
  const chart = useMemo(() => {
    if (isToday) {
      const hs = [...new Set([...hourly, ...compHourly].map(r => r.hour))].sort((a, b) => a - b);
      const lo = Math.min(hoursCfg.openHour, ...hs), hi = Math.max(...hs, Math.min(23, (hoursCfg.closeHour || 24) - 1));
      const range = hs.length ? Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i) : [];
      const nowFl = Math.floor(nowH);
      return {
        labels: range.map(h => `${h}:00`),
        cur: range.map(h => h > nowFl ? null : (hourly.find(r => r.hour === h)?.revenue ?? 0) / 1e6),
        base: range.map(h => (compHourly.find(r => r.hour === h)?.revenue ?? 0) / 1e6),
      };
    }
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const cSorted = [...compRows].sort((a, b) => a.date.localeCompare(b.date));
    const dates = Array.from({ length: days }, (_, i) => isoShift(from, i));
    const byDate = new Map(sorted.map(r => [r.date, r.revenue]));
    const cByDate = new Map(cSorted.map(r => [r.date, r.revenue]));
    if (days > 31) {
      // weeks
      const weeks: { label: string; cur: number; base: number }[] = [];
      for (let i = 0; i < dates.length; i += 7) {
        const chunk = dates.slice(i, i + 7);
        weeks.push({
          label: rangeLabel(chunk[0], chunk[chunk.length - 1], lang),
          cur: chunk.reduce((a, d) => a + (byDate.get(d) ?? 0), 0) / 1e6,
          base: chunk.reduce((a, d) => a + (cByDate.get(isoShift(d, -shift)) ?? 0), 0) / 1e6,
        });
      }
      return { labels: weeks.map(w => w.label), cur: weeks.map(w => w.cur), base: weeks.map(w => w.base) };
    }
    return {
      labels: dates.map(d => days <= 7 ? wdShort(d, lang) : String(+d.slice(8))),
      cur: dates.map(d => d > today ? null : (byDate.get(d) ?? 0) / 1e6),
      base: dates.map(d => (cByDate.get(isoShift(d, -shift)) ?? 0) / 1e6),
    };
  }, [isToday, hourly, compHourly, rows, compRows, from, days, shift, lang]);

  // ── Labels ──
  const title = isToday ? `${weekday(today, lang)}, ${dayLabel(today, lang)}` : rangeLabel(from, to, lang);
  const sub = isToday
    ? tr(lang, `Данные на ${nowHM()} · сравнение на то же время дня`, `As of ${nowHM()} · compared at the same time of day`, `${nowHM()} holatiga · kunning shu vaqtiga nisbatan`)
    : period.range === 'custom' ? tr(lang, 'Свой период', 'Custom range', 'Boshqa davr')
    : period.range === '7days' ? tr(lang, 'Неделя · сегодняшний день ещё идёт', 'Week · today is still running', 'Hafta · bugun hali davom etmoqda')
    : tr(lang, '30 дней', '30 days', '30 kun');
  const heroLabel = isToday ? tr(lang, 'Выручка сегодня', 'Revenue today', 'Bugungi tushum')
    : period.range === '7days' ? tr(lang, 'Выручка за 7 дней', 'Revenue, 7 days', '7 kunlik tushum')
    : period.range === '30days' ? tr(lang, 'Выручка за 30 дней', 'Revenue, 30 days', '30 kunlik tushum')
    : tr(lang, 'Выручка за период', 'Revenue for the period', 'Davr tushumi');
  const cmpLabel = (c: ComparisonPeriod) => {
    if (cmpKey === 'today') {
      const d = isoShift(today, -SHIFT[c]);
      if (c === 'yesterday') return tr(lang, 'вчера', 'yesterday', 'kecha');
      if (c === 'last_week') {
        const RU_INS = ['прошлым воскресеньем', 'прошлым понедельником', 'прошлым вторником', 'прошлой средой', 'прошлым четвергом', 'прошлой пятницей', 'прошлой субботой'];
        const dow = new Date(d + 'T00:00:00Z').getUTCDay();
        return tr(lang, RU_INS[dow], `last ${weekday(d, 'en')}`, `o'tgan ${weekday(d, 'uz').toLowerCase()}`);
      }
      return c === 'last_year' ? `${dayLabel(d, lang)} ${d.slice(0, 4)}` : dayLabel(d, lang);
    }
    if (cmpKey === '7days') return c === 'last_week' ? tr(lang, 'прошлой неделей', 'the previous week', "o'tgan hafta") : c === 'last_month' ? tr(lang, 'неделей месяц назад', 'the same week a month ago', 'bir oy oldingi hafta') : tr(lang, `той же неделей в ${+today.slice(0, 4) - 1}`, `the same week in ${+today.slice(0, 4) - 1}`, `${+today.slice(0, 4) - 1} yilning shu haftasi`);
    return c === 'last_month' ? tr(lang, 'предыдущими 30 днями', 'the previous 30 days', 'oldingi 30 kun') : tr(lang, `теми же днями в ${+today.slice(0, 4) - 1}`, `the same days in ${+today.slice(0, 4) - 1}`, `${+today.slice(0, 4) - 1} yilning shu kunlari`);
  };
  const chartTitle = isToday ? tr(lang, 'Выручка по часам', 'Revenue by hour', "Soatlar bo'yicha tushum")
    : days > 31 ? tr(lang, 'Выручка по неделям', 'Revenue by week', "Haftalar bo'yicha tushum")
    : tr(lang, 'Выручка по дням', 'Revenue by day', "Kunlar bo'yicha tushum");
  const lgCur = isToday ? tr(lang, 'Сегодня', 'Today', 'Bugun') : period.range === 'custom' ? tr(lang, 'Этот период', 'This period', 'Shu davr') : period.range === '7days' ? tr(lang, 'Эта неделя', 'This week', 'Shu hafta') : tr(lang, 'Эти 30 дней', 'These 30 days', 'Shu 30 kun');
  const lgBase = period.range === 'custom' ? tr(lang, 'Предыдущий период', 'Previous period', 'Oldingi davr') : cmpLabel(comparison).replace(/^./, s => s.toUpperCase());

  // ── Guest-section filter ──
  const [sections, setSections] = useState<{ name: string; tableCount: number; excluded: boolean }[] | null>(null);
  const [sectionsPlugin, setSectionsPlugin] = useState(true);
  // `sections` is the popover's draft; `savedSections` is what the server has.
  // The chip reads the saved list, so ticks dropped by closing the popover
  // without "Готово" never look applied.
  const [savedSections, setSavedSections] = useState<typeof sections>(null);
  const loadSections = () => traceApi.settings.listRealGuestSections()
    .then(r => { setSections(r.sections); setSavedSections(r.sections); setSectionsPlugin(r.hasPluginData); }).catch(() => setSections([]));
  const saveSections = (list: typeof sections) => traceApi.settings.saveRealGuestSections((list ?? []).filter(s => s.excluded).map(s => s.name))
    .then(() => { setSavedSections(list); setRgKey(k => k + 1); }).catch(() => {});
  const excluded = (savedSections ?? []).filter(s => s.excluded);
  useEffect(() => { if (!demo && !poster) loadSections(); }, [poster]);

  const feedRow = (ev: RealtimeEvent & { id: string }) => {
    const d = ev.data as RealtimeOrderData;
    const t = d.table?.number ?? d.tableNumber;
    const tbl = t != null ? tr(lang, `Стол ${t}`, `Table ${t}`, `Stol ${t}`) : '';
    const L: Record<string, [string, string, string]> = {
      order_opened: ['открыт', 'opened', 'ochildi'], order_closed: ['закрыт', 'closed', 'yopildi'],
      order_bill_printed: ['пречек', 'pre-bill', 'pre-chek'], order_removed: ['заказ удалён', 'order deleted', "buyurtma o'chirildi"],
      order_bill_cancelled: ['пречек отменён', 'pre-bill cancelled', 'pre-chek bekor'], order_printed_items_deleted: ['удалена позиция', 'item voided', "pozitsiya o'chirildi"],
      cashier_session_opened: ['Смена открыта', 'Shift opened', 'Smena ochildi'], cashier_session_closed: ['Смена закрыта', 'Shift closed', 'Smena yopildi'],
    };
    const l = L[ev.type] ?? [ev.type, ev.type, ev.type];
    const isVoid = ev.type === 'order_removed' || ev.type === 'order_printed_items_deleted' || ev.type === 'order_bill_cancelled';
    const verb = tr(lang, l[0], l[1], l[2]);
    const what = tbl ? (ev.type === 'order_opened' || ev.type === 'order_closed' ? `${tbl} ${verb}` : `${tbl}, ${verb}`) : verb;
    const time = new Date(ev.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
    const amt = d.sum != null && d.sum > 0 ? (isVoid ? `−${fmt(d.sum)}` : fmt(d.sum)) : '';
    return (
      <li key={ev.id}>
        <span className="when mono">{time}</span>
        <span className={`what${isVoid ? ' void' : ''}`}>{what}{d.waiter && <span className="who">{d.waiter}</span>}</span>
        <span className={`amt${isVoid ? ' void' : ev.type === 'order_bill_printed' ? ' faint' : ''}`}>{amt}</span>
      </li>
    );
  };

  const kpis: [string, string, number | null][] = [
    [tr(lang, 'Заказы', 'Orders', 'Buyurtmalar'), fmt(orders), dOrd],
    [tr(lang, 'Гости', 'Guests', 'Mehmonlar'), fmt(guests), dGst],
    [tr(lang, 'Средний чек', 'Average check', "O'rtacha chek"), fmt(avg), dAvg],
    [tr(lang, 'Чек на гостя', 'Per guest', 'Mehmonga chek'), fmt(perGuest), dPg],
  ];
  const showHall = !poster && (plugin || hall.occupied > 0 || plans.length > 0);
  const showFeed = !poster && (demo || !!wsUrl || feed.length > 0);
  const dimNums = loading ? { opacity: .45, transition: 'opacity .2s' } : { transition: 'opacity .2s' };

  return (
    <>
      {loadErr && <p className="rd-err" role="alert" style={{ margin: '0 0 14px' }}>{tr(lang, 'Не удалось загрузить данные. Показанные цифры могут быть неполными — обновите страницу.', "Couldn't load the data. Numbers shown may be incomplete — reload the page.", "Ma'lumotlarni yuklab bo'lmadi. Sahifani yangilang.")}</p>}
      <div className="page-head rise">
        <div>
          <h1>{title}</h1>
          <div className="sub">{sub}</div>
        </div>
        <PeriodSeg lang={lang} value={period} onChange={setPeriod} />
      </div>

      {/* 1. How is the period going */}
      <section className="hero rise" style={{ animationDelay: '.05s' }} aria-label={tr(lang, 'Итоги периода', 'Period totals', 'Davr yakunlari')}>
        <div>
          <div className="hero-label">
            <span className="label">{heroLabel}</span>
            {!poster && (
              <Pop label={<span>{rl(lang, revenueType)}</span>} on={revenueType !== 'net'}>
                {close => <>
                  {REV_GROUPS.map((g, gi) => (
                    <React.Fragment key={gi}>
                      {gi > 0 && <hr />}
                      <div className="pop-title">{g.title ? tr(lang, ...g.title) : tr(lang, 'Какую выручку показывать', 'Which revenue to show', "Qaysi tushumni ko'rsatish")}</div>
                      {g.keys.map(k => (
                        <Opt key={k} checked={revenueType === k} onClick={() => { setRevenueType(k); close(); }}
                          hint={REV[k][3] ? tr(lang, REV[k][3]!, REV[k][4]!, REV[k][5]!) : undefined}>{rl(lang, k)}</Opt>
                      ))}
                    </React.Fragment>
                  ))}
                </>}
              </Pop>
            )}
            {!demo && !poster && (
              <Pop label={<span>{excluded.length === 0 ? tr(lang, 'Все гости', 'All guests', 'Barcha mehmonlar')
                  : excluded.length <= 2 ? `${tr(lang, 'Без', 'Excl.', 'Siz')}: ${excluded.map(s => s.name.toLowerCase()).join(', ')}`
                  : tr(lang, `Без ${excluded.length} разделов`, `${excluded.length} sections excluded`, `${excluded.length} bo'limsiz`)}</span>}
                title={excluded.length ? excluded.map(s => s.name).join(', ') : undefined}
                on={excluded.length > 0} onOpen={loadSections}>
                {close => <>
                  <div className="pop-title">{tr(lang, 'Реальные гости', 'Real guests', 'Haqiqiy mehmonlar')}</div>
                  <div className="pop-desc">{tr(lang, 'Отметьте разделы, которые не надо считать гостями: персонал, доставку. Разделы приходят с кассы iikoFront.', "Tick sections that shouldn't count as guests: staff, delivery. Sections come from the iikoFront till.", "Mehmon hisoblanmaydigan bo'limlarni belgilang: xodimlar, yetkazib berish. Bo'limlar iikoFront kassasidan keladi.")}</div>
                  {sections == null ? <div style={{ padding: '4px 10px 10px' }}><Skel lines={['w7', 'w5', 'w7']} /></div>
                    : !sectionsPlugin ? <div className="pop-desc">{tr(lang, 'Нет данных: нужен плагин iikoFront', 'No data yet: needs the iikoFront plugin', "Ma'lumot yo'q: iikoFront plagini kerak")}</div>
                    : sections.length === 0 ? <div className="pop-desc">{tr(lang, 'Разделы не найдены', 'No sections found', "Bo'limlar topilmadi")}</div>
                    : sections.map(s => (
                      <Opt key={s.name} cb checked={s.excluded} count={s.tableCount}
                        onClick={() => setSections(p => p!.map(x => x.name === s.name ? { ...x, excluded: !x.excluded } : x))}>{s.name}</Opt>
                    ))}
                  <div className="pop-foot">
                    <button className="btn" onClick={() => { const r = (sections ?? []).map(s => ({ ...s, excluded: false })); setSections(r); saveSections(r); close(); }}>{tr(lang, 'Считать всех', 'Count everyone', 'Hammasini sanash')}</button>
                    <button className="btn solid" onClick={() => { saveSections(sections); close(); }}>{tr(lang, 'Готово', 'Done', 'Tayyor')}</button>
                  </div>
                </>}
              </Pop>
            )}
          </div>
          <div className="big" style={dimNums}>{fmt(revenue)}<small>{sum(lang)}</small></div>
          <div className="cmp-line">
            <Delta v={dRev} className="delta-v" />
            <span className="muted">{tr(lang, 'по сравнению с', 'compared with', 'bilan solishtirganda')}</span>
            {period.range === 'custom'
              ? <b>{rangeLabel(cFrom, cTo, lang)}</b>
              : (
                <label className="cmp">
                  <select value={comparison} onChange={e => setComparison(e.target.value as ComparisonPeriod)} aria-label={tr(lang, 'Сравнить с', 'Compare with', 'Solishtirish')}>
                    {CMP_OPTIONS[cmpKey].map(c => <option key={c} value={c}>{cmpLabel(c)}</option>)}
                  </select>
                  <i className="ph ph-caret-down cmp-caret" aria-hidden="true" />
                </label>
              )}
          </div>
          {forecast != null && (
            <div className="forecast">{tr(lang, 'Прогноз к закрытию: около ', 'Forecast at close: about ', "Yopilishgacha prognoz: taxminan ")}<b>{money(forecast, lang)}</b></div>
          )}
          {best && (
            <div className="forecast">{tr(lang, 'Лучший день: ', 'Best day: ', 'Eng yaxshi kun: ')}{period.range === '7days' ? weekday(best.date, lang).toLowerCase() : dayLabel(best.date, lang)}, <b>{money(best.revenue, lang)}</b></div>
          )}
          {forecast != null && <div className="fc-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, revenue / forecast * 100)}%` }} /></div>}
        </div>
        <div className="kpis kpis-4" style={dimNums}>
          {kpis.map(([l, v, d]) => (
            <div className="kpi" key={l}><div className="label">{l}</div><div className="v">{v}</div><div className="d"><Delta v={d} /></div></div>
          ))}
        </div>
      </section>

      {/* Plan for the month */}
      {plan && onOpenPlan && (() => {
        const r = plan.revenue;
        const done = r.plan > 0 ? r.factMtd / r.plan * 100 : 0;
        const elapsed = plan.daysInMonth ? (plan.closedDays / plan.daysInMonth) * 100 : 0;
        return (
          <section className="plan rise" style={{ animationDelay: '.08s' }} aria-label={tr(lang, 'План месяца', 'Monthly plan', 'Oylik reja')}>
            <div className="plan-l"><span className="label">{tr(lang, `План на ${MONTHS_NOM.ru[+month.slice(5) - 1].toLowerCase()}`, `Plan for ${MONTHS_NOM.en[+month.slice(5) - 1]}`, `${MONTHS_NOM.uz[+month.slice(5) - 1]} rejasi`)}</span> <b>{money(r.plan, lang)}</b></div>
            <div className="plan-bar" title={tr(lang, `Выполнено ${done.toFixed(1)}%, прошло ${elapsed.toFixed(1)}% месяца`, `Done ${done.toFixed(1)}%, ${elapsed.toFixed(1)}% of month passed`, `Bajarildi ${done.toFixed(1)}%, oyning ${elapsed.toFixed(1)}% o'tdi`)}>
              <span style={{ width: `${Math.min(100, done)}%` }} /><i style={{ left: `${Math.min(100, elapsed)}%` }} />
            </div>
            <div className="plan-facts">
              <span>{tr(lang, 'Выполнено', 'Done', 'Bajarildi')} <b>{Math.round(done)}%</b></span>
              {r.forecastPct != null && <span>{tr(lang, 'Прогноз', 'Forecast', 'Prognoz')} <b>{Math.round(r.forecastPct)}% {tr(lang, 'плана', 'of plan', 'reja')}</b></span>}
              {plan.remainingDays > 0 && <span>{tr(lang, 'Нужно в день', 'Needed a day', 'Kuniga kerak')} <b>{money(plan.needed.perDayAvg, lang)}</b></span>}
              <a className="link" href="?view=plan" onClick={e => { e.preventDefault(); onOpenPlan(); }}>{tr(lang, 'План и факт', 'Plan vs actual', 'Reja va fakt')}</a>
            </div>
          </section>
        );
      })()}

      {/* 2. Daily briefing: generated on request, cached for the day */}
      <section className="brief rise" data-state={briefState} style={{ animationDelay: '.1s' }} aria-labelledby="h-brief">
        <div className="brief-head">
          <h2 id="h-brief">{tr(lang, 'Брифинг дня', 'Daily briefing', 'Kunlik brifing')}</h2>
          {briefState === 'done' && <AiMeta lang={lang} when={briefAt ? tr(lang, `сегодня в ${briefAt}`, `today at ${briefAt}`, `bugun ${briefAt} da`) : null} onRerun={() => runBrief(true)} />}
        </div>
        {briefState === 'empty' && (
          <div className="st-empty">
            <p className="ai-desc">
              {tr(lang, 'Разбор сегодняшнего дня: что идёт не так, что сделать до вечера и кого из персонала проверить. Сравнивает с обычным днём недели и не путает банкеты с обычными днями.',
                "A read of today: what's off, what to do before the evening and which staff to check. Compares with a normal day of the week and doesn't confuse banquets with regular days.",
                "Bugungi kun tahlili: nima noto'g'ri, kechgacha nima qilish kerak va qaysi xodimni tekshirish kerak.")}
              <span className="ai-cost">{tr(lang, 'Готовится 15-25 секунд, сохраняется на весь день.', 'Takes 15-25 seconds, kept for the whole day.', '15-25 soniya tayyorlanadi, kun davomida saqlanadi.')}</span>
              {brief && !brief.fromAI && <span className="rd-err">{tr(lang, 'Не получилось подготовить брифинг. Попробуйте ещё раз.', "Couldn't prepare the briefing. Try again.", "Brifingni tayyorlab bo'lmadi. Qayta urinib ko'ring.")}</span>}
            </p>
            <button className="btn solid" onClick={() => runBrief()} disabled={loading}>{tr(lang, 'Подготовить брифинг', 'Prepare briefing', 'Brifing tayyorlash')}</button>
          </div>
        )}
        {briefState === 'loading' && (
          <div className="st-loading" aria-live="polite">
            <p className="ai-wait">{tr(lang, 'Смотрим продажи за 8 недель, смены и стоп-лист…', 'Reading 8 weeks of sales, shifts and the stop list…', "8 haftalik savdo, smenalar va stop-listni ko'rib chiqyapmiz…")}</p>
            <Skel />
          </div>
        )}
        {briefState === 'done' && brief && (
          <div className="st-done">
            <div className="brief-grid">
              <div>
                <h3>{tr(lang, 'Итог дня', 'The day so far', 'Kun yakuni')}</h3>
                <p className="lead">{clean(brief.summary) ?? '—'}</p>
                {Array.isArray(brief.actions) && brief.actions.length > 0 && <>
                  <h3>{tr(lang, 'Что сделать сегодня', 'What to do today', 'Bugun nima qilish kerak')}</h3>
                  <ol className="acts">
                    {brief.actions.map((a, i) => <li key={i}><span className="n">{i + 1}</span><span>{a}</span></li>)}
                  </ol>
                </>}
              </div>
              <div className="brief-side">
                {([['staff', 'Персонал', 'Staff', 'Xodimlar'], ['forecast', 'Прогноз', 'Forecast', 'Prognoz'], ['risk', 'Риск и шанс', 'Risk and opportunity', 'Xavf va imkoniyat']] as const).map(([k, ru, en, uz]) => {
                  const v = clean(brief[k]);
                  return v ? <div key={k}><h3>{tr(lang, ru, en, uz)}</h3><p>{v}</p></div> : null;
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. What is happening */}
      <div className="grid" style={showHall ? undefined : { gridTemplateColumns: '1fr' }}>
        <section className="rise" style={{ animationDelay: '.14s' }} aria-labelledby="h-chart">
          <div className="sec-head">
            <h2><span id="h-chart">{chartTitle}</span><span className="faint unit">, {tr(lang, 'млн сум', 'M UZS', "mln so'm")}</span></h2>
            <Legend cur={lgCur} base={lgBase} />
          </div>
          <LineChart labels={chart.labels} cur={chart.cur} base={chart.base} curName={lgCur} baseName={lgBase}
            tip={v => `${fmt(v * 1e6)} ${sum(lang)}`} />
        </section>

        {showHall && (
          <aside className="rise" style={{ animationDelay: '.18s' }} aria-labelledby="h-hall">
            <div className="sec-head"><h2 id="h-hall">{tr(lang, 'Зал сейчас', 'Floor now', 'Zal hozir')}</h2></div>
            <div className="hall-num"><span className="v">{hall.occupied}</span>{hall.total > 0 && <span className="muted">{tr(lang, `из ${hall.total} столов`, `of ${hall.total} tables`, `${hall.total} ta stoldan`)}</span>}</div>
            <div className="hall-line muted">
              {[hall.guests > 0 ? tr(lang, `${hall.guests} гостей`, `${hall.guests} guests`, `${hall.guests} mehmon`) : null,
                hall.occupied > 0 ? tr(lang, `стол в среднем ${hall.avgMin} мин`, `avg table ${hall.avgMin} min`, `stol o'rtacha ${hall.avgMin} daq`) : tr(lang, 'Свободно', 'All free', "Bo'sh")].filter(Boolean).join(' · ')}
            </div>
            <div className="hall-ph">
              {hall.total > 0 && (
                <div className="hall-bar" aria-hidden="true">
                  <span className="hb-busy" style={{ flex: hall.eating }} /><span className="hb-bill" style={{ flex: hall.bill }} />
                  <span className="hb-long" style={{ flex: hall.long.length }} /><span className="hb-free" style={{ flex: Math.max(0, hall.total - hall.occupied) }} />
                </div>
              )}
              <div className="key">
                <span className="k-busy">{tr(lang, 'Едят', 'Eating', 'Ovqatlanmoqda')} {hall.eating}</span>
                <span className="k-bill">{tr(lang, 'Пречек', 'Pre-bill', 'Pre-chek')} {hall.bill}</span>
                <span className="k-long">{tr(lang, `Дольше ${LONG_MIN} мин`, `Over ${LONG_MIN} min`, `${LONG_MIN} daqiqadan ko'p`)}: {hall.long.length}</span>
              </div>
              {hall.long.length > 0 && (
                <ul className="hall-alerts" aria-label={tr(lang, 'Требуют внимания', 'Need attention', "E'tibor talab qiladi")}>
                  {hall.long.slice(0, 3).map(o => {
                    const m = hall.mins(o);
                    return <li key={o.id}><span className="ha-t">{o.table}</span><span className="muted">{o.waiter}</span><span className="ha-m">{Math.floor(m / 60)} {tr(lang, 'ч', 'h', 'soat')} {m % 60} {tr(lang, 'мин', 'min', 'daq')}</span></li>;
                  })}
                </ul>
              )}
            </div>
            {hall.tiles.length > 0 && (
              <details className="hall-map" open={typeof window !== 'undefined' && window.innerWidth > 640}>
                <summary>{tr(lang, 'Схема зала', 'Floor plan', 'Zal sxemasi')}<i className="ph ph-caret-down chev" aria-hidden="true" /></summary>
                <div className="tables tables-all">
                  {hall.tiles.map(t => <div key={t.key} className={`t ${t.state}`} title={t.title}>{t.label}</div>)}
                </div>
                <div className="key">
                  <span className="k-busy">{tr(lang, 'Заняты', 'Busy', 'Band')}</span>
                  <span className="k-bill">{tr(lang, 'Пречек', 'Pre-bill', 'Pre-chek')}</span>
                  <span className="k-long">{tr(lang, `Дольше ${LONG_MIN} мин`, `Over ${LONG_MIN} min`, `${LONG_MIN} daqiqadan ko'p`)}</span>
                </div>
              </details>
            )}
          </aside>
        )}
      </div>

      {/* Details: quieter, below the fold */}
      <div className="details" style={showFeed ? undefined : { gridTemplateColumns: '1fr' }}>
        <section aria-labelledby="h-top">
          <div className="sec-head">
            <h3 id="h-top">{tr(lang, 'Что продаётся', 'What sells', 'Nima sotilmoqda')}</h3>
            {onNavigate && <a className="link meta-link" href="?view=sales" onClick={e => { e.preventDefault(); onNavigate('sales'); }}>{tr(lang, 'Все позиции', 'All items', 'Barcha pozitsiyalar')}</a>}
          </div>
          {dishes.length === 0
            ? <p className="rd-empty">{loading ? tr(lang, 'Загружаем…', 'Loading…', 'Yuklanmoqda…') : tr(lang, 'За этот период продаж нет', 'No sales in this period', "Bu davrda savdo yo'q")}</p>
            : <table><tbody>
              {dishes.slice(0, 5).map(d => (
                <tr key={d.name}><td>{d.name}</td><td className="r muted">{fmt(d.quantity)} {tr(lang, 'шт', 'pcs', 'dona')}</td><td className="r">{fmt(d.revenue)}</td></tr>
              ))}
            </tbody></table>}
        </section>
        {showFeed && (
          <section aria-labelledby="h-feed">
            <div className="sec-head">
              <h3 id="h-feed">{tr(lang, 'Касса', 'Till', 'Kassa')}</h3>
              {feed.length > 5 && <button className="link meta-link" onClick={() => setFeedOpen(o => !o)}>{feedOpen ? tr(lang, 'Свернуть', 'Collapse', "Yig'ish") : tr(lang, 'Вся лента', 'Whole feed', "Butun lenta")}</button>}
            </div>
            {feed.length === 0
              ? <p className="rd-empty">{plugin ? tr(lang, 'Ждём событий от кассы…', 'Waiting for till events…', 'Kassadan hodisalar kutilmoqda…') : tr(lang, 'Касса не подключена', 'Till not connected', 'Kassa ulanmagan')}</p>
              : <ul className="feed">{feed.slice(0, feedOpen ? 60 : 5).map(feedRow)}</ul>}
          </section>
        )}
      </div>
    </>
  );
};

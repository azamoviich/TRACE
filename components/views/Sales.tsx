// Продажи — redesigned per TRACE-mockups/sales.html (Oct 2026).
// Totals double as the chart switch; categories + weekday×hour heatmap;
// one menu table with four plain-language groups, ABC by qty/revenue/profit,
// column picker and Excel/PDF; three on-demand AI tools.
// Styles: styles/rd/sales.css (scoped .rd-sales).
import React, { useEffect, useMemo, useState } from 'react';
import { tr } from '../../constants';
import { Language, ComparisonPeriod } from '../../types';
import {
  traceApi, getTenantPlan, RevenueRow, HourlyRow, CategoryPerfRow, AbcRow, HeatmapResult, GoodsAbcRow,
} from '../../services/traceApi';
import { tashkentDateStr, tashkentHours } from '../../utils/tz';
import {
  fmt, mln, sum, pctChange, pctStr, Delta, Pop, Opt, PeriodSeg, PeriodValue, Skel, LineChart, Legend,
  rangeLabel, dayLabel, isoShift, nowHM, periodDates, wdShort, WD_SHORT, AiMeta, AiState, ruPl,
} from '../rd/ui';
import { Trio, TrioTile } from '../rd/Trio';
import { DishDetailModal } from './sales/DishDetailModal';
import { makeAbcExport } from './sales/abcExport';

type Metric = 'rev' | 'ord' | 'chk' | 'prof';
type Quad = 'star' | 'horse' | 'puzzle' | 'dog';
type SortKey = 'name' | 'price' | 'qty' | 'vel' | 'rev' | 'cost' | 'rcost' | 'drift' | 'fc' | 'profit' | 'cheq' | 'xyz';
type Col = 'cat' | 'qty' | 'rev' | 'cost' | 'rcost' | 'drift' | 'fc' | 'profit' | 'abc' | 'xyz' | 'cheq' | 'cls' | 'price' | 'vel';
const COL_DEFAULT: Record<Col, boolean> = { cat: true, qty: true, rev: true, cost: true, rcost: false, drift: true, fc: true, profit: true, abc: true, xyz: true, cheq: false, cls: true, price: false, vel: false };

const SHIFT: Record<ComparisonPeriod, number> = { yesterday: 1, last_week: 7, last_month: 30, last_year: 365 };
const CMP_OPTIONS: Record<'today' | '7days' | '30days', ComparisonPeriod[]> = {
  today: ['last_week', 'yesterday', 'last_month', 'last_year'],
  '7days': ['last_week', 'last_month', 'last_year'],
  '30days': ['last_month', 'last_year'],
};

interface Item extends AbcRow { unitCost: number | null; unitProfit: number; profit: number; fc: number | null; q: Quad; sec: string | null }

export const Sales: React.FC<{ lang: Language; onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void; branch?: string | null; onContextReady?: (ctx: string) => void }> = ({ lang, branch, onContextReady }) => {
  const isBasePlan = getTenantPlan() === 'base';
  const [poster, setPoster] = useState(false);
  useEffect(() => { traceApi.sales.status().then(s => setPoster(!!s.poster)).catch(() => {}); }, []);

  const [period, setPeriod] = useState<PeriodValue>({ range: '7days', custom: null });
  const cmpKey = (period.range === 'custom' ? '7days' : period.range) as 'today' | '7days' | '30days';
  const [comparison, setComparison] = useState<ComparisonPeriod>('last_week');
  useEffect(() => { if (!CMP_OPTIONS[cmpKey].includes(comparison)) setComparison(CMP_OPTIONS[cmpKey][0]); }, [cmpKey]);
  const today = tashkentDateStr();
  const isToday = period.range === 'today';
  const { from, to } = periodDates(period.range, period.custom);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1;
  const shift = period.range === 'custom' ? days : SHIFT[comparison];
  const cFrom = isoShift(from, -shift), cTo = isoShift(to, -shift);

  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [cRows, setCRows] = useState<RevenueRow[]>([]);
  const [hourly, setHourly] = useState<HourlyRow[]>([]);
  const [cHourly, setCHourly] = useState<HourlyRow[]>([]);
  const [cats, setCats] = useState<CategoryPerfRow[]>([]);
  const [cCats, setCCats] = useState<CategoryPerfRow[]>([]);
  const [abc, setAbc] = useState<AbcRow[]>([]);
  const [cAbc, setCAbc] = useState<AbcRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [loadErr, setLoadErr] = useState(false);
  useEffect(() => {
    // `alive`: a slow answer for the previous period must not land under the new one.
    let alive = true;
    setLoading(true); setLoadErr(false);
    Promise.all([
      traceApi.sales.revenue('custom', from, to),
      isToday ? traceApi.sales.hourly() : Promise.resolve([] as HourlyRow[]),
      traceApi.sales.categoryPerf('custom', from, to),
      traceApi.sales.abc('custom', from, to),
    ]).then(([r, h, c, a]) => { if (alive) { setRows(r); setHourly(h); setCats(c); setAbc(a); } })
      .catch(err => { console.error('[sales] fetch failed', err); if (alive) { setRows([]); setHourly([]); setCats([]); setAbc([]); setLoadErr(true); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [from, to, branch]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      traceApi.sales.revenue('custom', cFrom, cTo).catch(() => [] as RevenueRow[]),
      isToday ? traceApi.sales.hourly(cFrom).catch(() => [] as HourlyRow[]) : Promise.resolve([] as HourlyRow[]),
      traceApi.sales.categoryPerf('custom', cFrom, cTo).catch(() => [] as CategoryPerfRow[]),
      traceApi.sales.abc('custom', cFrom, cTo).catch(() => [] as AbcRow[]),
    ]).then(([r, h, c, a]) => { if (alive) { setCRows(r); setCHourly(h); setCCats(c); setCAbc(a); } });
    return () => { alive = false; };
  }, [cFrom, cTo, branch]);
  // Refresh today's hours every 5 minutes
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => traceApi.sales.hourly().then(setHourly).catch(() => {}), 300_000);
    return () => clearInterval(id);
  }, [isToday]);

  // ── Totals ──
  const tRows = isToday ? rows.filter(r => r.date === today) : rows;
  const rev = tRows.reduce((a, r) => a + r.revenue, 0);
  const ord = tRows.reduce((a, r) => a + r.orders, 0);
  const chk = ord ? rev / ord : 0;
  const costTotal = abc.reduce((a, i) => a + (i.cost ?? 0), 0);
  const hasCost = abc.some(i => (i.cost ?? 0) > 0);
  const abcRev = abc.reduce((a, i) => a + i.revenue, 0);
  const fcPct = hasCost && abcRev ? costTotal / abcRev * 100 : null;
  const prof = fcPct != null ? rev * (1 - fcPct / 100) : null;
  // Comparison at the same time of day for "today"
  const nowH = tashkentHours();
  const cSoFar = (() => {
    if (!isToday || !cHourly.length) return null;
    const fl = Math.floor(nowH), fr = nowH - fl; let r = 0, o = 0;
    for (const x of cHourly) { if (x.hour < fl) { r += x.revenue; o += x.orders; } else if (x.hour === fl) { r += x.revenue * fr; o += x.orders * fr; } }
    return { r, o };
  })();
  const cRev = cSoFar ? cSoFar.r : cRows.reduce((a, r) => a + r.revenue, 0);
  const cOrd = cSoFar ? cSoFar.o : cRows.reduce((a, r) => a + r.orders, 0);
  const cAbcRev = cAbc.reduce((a, i) => a + i.revenue, 0);
  const cFc = cAbc.some(i => (i.cost ?? 0) > 0) && cAbcRev ? cAbc.reduce((a, i) => a + (i.cost ?? 0), 0) / cAbcRev * 100 : null;
  const cProf = cFc != null ? cRev * (1 - cFc / 100) : null;

  const [metric, setMetric] = useState<Metric>('rev');
  const METRICS: { k: Metric; label: string; v: number | null; unit: string; d: number | null; chartUnit: string }[] = [
    { k: 'rev', label: tr(lang, 'Выручка', 'Revenue', 'Tushum'), v: rev, unit: sum(lang), d: pctChange(rev, cRev), chartUnit: tr(lang, 'млн сум', 'M UZS', "mln so'm") },
    { k: 'ord', label: tr(lang, 'Заказы', 'Orders', 'Buyurtmalar'), v: ord, unit: '', d: pctChange(ord, cOrd), chartUnit: tr(lang, 'заказов', 'orders', 'buyurtma') },
    { k: 'chk', label: tr(lang, 'Средний чек', 'Average check', "O'rtacha chek"), v: chk, unit: sum(lang), d: cOrd ? pctChange(chk, cRev / cOrd) : null, chartUnit: sum(lang) },
    ...(prof != null ? [{ k: 'prof' as Metric, label: tr(lang, 'Валовая прибыль', 'Gross profit', 'Yalpi foyda'), v: prof, unit: sum(lang), d: pctChange(prof, cProf), chartUnit: tr(lang, 'млн сум', 'M UZS', "mln so'm") }] : []),
  ];
  const m = METRICS.find(x => x.k === metric) ?? METRICS[0];
  // Gross profit drops out when the period has no cost data — fall back to revenue.
  useEffect(() => { if (metric !== m.k) setMetric(m.k); }, [metric, m.k]);

  // ── Chart series ──
  const lgCur = isToday ? tr(lang, 'Сегодня', 'Today', 'Bugun') : period.range === '7days' ? tr(lang, 'Эти 7 дней', 'These 7 days', 'Shu 7 kun') : period.range === '30days' ? tr(lang, 'Эти 30 дней', 'These 30 days', 'Shu 30 kun') : tr(lang, 'Этот период', 'This period', 'Shu davr');
  const lgBase = period.range === 'custom' ? tr(lang, 'Предыдущий период', 'Previous period', 'Oldingi davr')
    : comparison === 'yesterday' ? tr(lang, 'Вчера', 'Yesterday', 'Kecha')
    : comparison === 'last_week' ? (isToday ? tr(lang, 'Неделю назад', 'A week ago', 'Bir hafta oldin') : tr(lang, 'Прошлая неделя', 'Previous week', "O'tgan hafta"))
    : comparison === 'last_month' ? (period.range === '30days' ? tr(lang, 'Предыдущие 30', 'Previous 30', 'Oldingi 30') : tr(lang, 'Месяц назад', 'A month ago', 'Bir oy oldin'))
    : tr(lang, 'Год назад', 'A year ago', 'Bir yil oldin');
  const pick = (r: { revenue: number; orders: number } | undefined, mm: Metric): number | null => {
    if (!r) return 0;
    if (mm === 'rev') return r.revenue / 1e6;
    if (mm === 'ord') return r.orders;
    if (mm === 'chk') return r.orders ? r.revenue / r.orders : null;
    return fcPct != null ? r.revenue * (1 - fcPct / 100) / 1e6 : null;
  };
  const chart = useMemo(() => {
    if (isToday) {
      const hs = [...hourly, ...cHourly].filter(h => h.revenue > 0).map(h => h.hour);
      const lo = hs.length ? Math.min(...hs) : 9, hi = hs.length ? Math.max(...hs) : 22;
      const range = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      return { labels: range.map(h => `${h}:00`), cur: range.map(h => h > Math.floor(nowH) ? null : pick(hourly.find(x => x.hour === h), metric)), base: range.map(h => pick(cHourly.find(x => x.hour === h), metric)), title: tr(lang, 'по часам', 'by hour', "soatlar bo'yicha") };
    }
    const dates = Array.from({ length: days }, (_, i) => isoShift(from, i));
    const by = new Map(rows.map(r => [r.date, r])), cby = new Map(cRows.map(r => [r.date, r]));
    if (days > 31) {
      const w: { l: string; c: number | null; b: number | null }[] = [];
      for (let i = 0; i < dates.length; i += 7) {
        const ch = dates.slice(i, i + 7);
        const agg = (src: Map<string, RevenueRow>, s: number) => ch.reduce((a, d) => { const r = src.get(isoShift(d, s)); return { revenue: a.revenue + (r?.revenue ?? 0), orders: a.orders + (r?.orders ?? 0) }; }, { revenue: 0, orders: 0 });
        w.push({ l: rangeLabel(ch[0], ch[ch.length - 1], lang), c: pick(agg(by, 0), metric), b: pick(agg(cby, -shift), metric) });
      }
      return { labels: w.map(x => x.l), cur: w.map(x => x.c), base: w.map(x => x.b), title: tr(lang, 'по неделям', 'by week', "haftalar bo'yicha") };
    }
    return {
      labels: dates.map(d => days <= 7 ? `${wdShort(d, lang)} ${+d.slice(8)}` : String(+d.slice(8))),
      cur: dates.map(d => d > today ? null : pick(by.get(d), metric)),
      base: dates.map(d => pick(cby.get(isoShift(d, -shift)), metric)),
      title: tr(lang, 'по дням', 'by day', "kunlar bo'yicha"),
    };
  }, [isToday, hourly, cHourly, rows, cRows, metric, from, days, shift, lang, fcPct]);
  const isMoney = metric === 'rev' || metric === 'prof';

  // ── Heatmap ──
  const [heat, setHeat] = useState<HeatmapResult | null>(null);
  const [heatFailed, setHeatFailed] = useState(false);
  useEffect(() => { traceApi.sales.heatmap(28).then(setHeat).catch(() => setHeatFailed(true)); }, [branch]);
  const heatView = useMemo(() => {
    if (!heat || !heat.cells.length) return null;
    const hrs = heat.cells.filter(c => c.revenue > 0).map(c => c.hour);
    if (!hrs.length) return null;
    const lo = Math.min(...hrs), hi = Math.max(...hrs);
    const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const val = (d: number, h: number) => heat.cells.find(c => c.dow === d && c.hour === h)?.revenue ?? 0;
    const all = heat.cells.map(c => c.revenue).filter(v => v > 0);
    const max = Math.max(...all), min = Math.min(...all);
    const top = [...heat.cells].sort((a, b) => b.revenue - a.revenue)[0];
    // quietest open hour on weekdays
    const wk = heat.cells.filter(c => c.dow < 5 && c.revenue > 0 && c.hour > lo && c.hour < hi);
    const quiet = wk.sort((a, b) => a.revenue - b.revenue)[0];
    return { hours, val, op: (v: number) => v <= 0 ? 0.04 : 0.08 + 0.92 * (v - min) / Math.max(1, max - min), top, quiet };
  }, [heat]);
  const WD = WD_SHORT[lang].slice(1).concat(WD_SHORT[lang][0]); // Mon..Sun
  const WD_FULL = (d: number) => [tr(lang, 'понедельник', 'Monday', 'dushanba'), tr(lang, 'вторник', 'Tuesday', 'seshanba'), tr(lang, 'среда', 'Wednesday', 'chorshanba'), tr(lang, 'четверг', 'Thursday', 'payshanba'), tr(lang, 'пятница', 'Friday', 'juma'), tr(lang, 'суббота', 'Saturday', 'shanba'), tr(lang, 'воскресенье', 'Sunday', 'yakshanba')][d];

  // ── Menu ──
  const items: Item[] = useMemo(() => {
    const withUnit = abc.map(i => {
      const unitCost = i.costPerUnit ?? ((i.cost ?? 0) > 0 && i.qty ? (i.cost ?? 0) / i.qty : null);
      const unitProfit = unitCost != null ? i.avgPrice - unitCost : i.avgPrice;
      return { ...i, unitCost, unitProfit, profit: unitProfit * i.qty, fc: i.foodCostPct ?? (unitCost != null && i.avgPrice ? unitCost / i.avgPrice * 100 : null) };
    });
    const n = withUnit.length || 1;
    const avgQty = withUnit.reduce((a, i) => a + i.qty, 0) / n;
    const qtyTot = withUnit.reduce((a, i) => a + i.qty, 0) || 1;
    const avgUP = withUnit.reduce((a, i) => a + i.unitProfit * i.qty, 0) / qtyTot;
    const ex = makeAbcExport([], lang, '');
    return withUnit.map(i => {
      const pop = i.qty >= avgQty * 0.7, pr = i.unitProfit >= avgUP;
      return { ...i, q: (pop && pr ? 'star' : pop ? 'horse' : pr ? 'puzzle' : 'dog') as Quad, sec: ex.sectionOf(i.cat)?.id ?? null };
    });
  }, [abc, lang]);
  const QUADS: Record<Quad, { name: string; what: string; do: string; short: string }> = {
    star: { name: tr(lang, 'Хиты', 'Hits', 'Hitlar'), short: tr(lang, 'Хит', 'Hit', 'Hit'), what: tr(lang, 'Продаются много и приносят много', 'Sell a lot and earn a lot', "Ko'p sotiladi va ko'p foyda beradi"), do: tr(lang, 'Не трогать цену и место в меню', "Don't touch price or menu spot", "Narx va menyudagi joyiga tegmang") },
    horse: { name: tr(lang, 'Ходовые', 'Workhorses', 'Yurgizuvchilar'), short: tr(lang, 'Ходовое', 'Workhorse', 'Yurgizuvchi'), what: tr(lang, 'Продаются много, прибыль с порции низкая', 'Sell a lot, low profit per portion', "Ko'p sotiladi, porsiyadan foyda past"), do: tr(lang, 'Поднять цену или удешевить рецепт', 'Raise price or cheapen the recipe', "Narxni oshiring yoki retseptni arzonlashtiring") },
    puzzle: { name: tr(lang, 'Прибыльные, редкие', 'Profitable, rare', 'Foydali, kam'), short: tr(lang, 'Редкое', 'Rare', 'Kam'), what: tr(lang, 'Прибыль с порции высокая, заказывают редко', 'High profit per portion, rarely ordered', "Porsiyadan foyda yuqori, kam buyurtma qilinadi"), do: tr(lang, 'Чаще предлагать гостям', 'Offer to guests more often', "Mehmonlarga tez-tez taklif qiling") },
    dog: { name: tr(lang, 'Слабые', 'Weak', 'Zaif'), short: tr(lang, 'Слабое', 'Weak', 'Zaif'), what: tr(lang, 'Мало продаж и мало прибыли', 'Few sales and little profit', "Kam sotuv va kam foyda"), do: tr(lang, 'Переделать или убрать', 'Rework or remove', "Qayta ishlang yoki olib tashlang") },
  };
  const [quad, setQuad] = useState<Quad | null>(null);
  const [cat, setCat] = useState('all');
  const [section, setSection] = useState('all');
  const [query, setQuery] = useState('');
  const [abcMetric, setAbcMetric] = useState<'abcRevenue' | 'abcQty' | 'abcProfit'>('abcRevenue');
  const [abcGrade, setAbcGrade] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'profit', dir: -1 });
  const [showAll, setShowAll] = useState(false);
  const [cols, setCols] = useState<Record<Col, boolean>>(() => { try { return { ...COL_DEFAULT, ...JSON.parse(localStorage.getItem('trace_menu_cols') || '{}') }; } catch { return COL_DEFAULT; } });
  useEffect(() => { try { localStorage.setItem('trace_menu_cols', JSON.stringify(cols)); } catch {} }, [cols]);
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem('trace_abc_hidden_cats') || '[]')); } catch { return new Set(); } });
  useEffect(() => { try { localStorage.setItem('trace_abc_hidden_cats', JSON.stringify([...hiddenCats])); } catch {} }, [hiddenCats]);
  const [detail, setDetail] = useState<AbcRow | null>(null);
  const catNames = useMemo(() => [...new Set(items.map(i => i.cat))].sort(), [items]);
  // Recipe cost, checks and XYZ come from iiko only (recipe cost via iikoOffice).
  const hasRecipe = items.some(i => i.recipeCostPerUnit != null);
  const hasCheq = items.some(i => i.cheques != null);
  const hasXyz = items.some(i => i.xyz != null);
  const abcSource = items[0]?.source;
  const iikoAbc = abcSource === 'iiko' || abcSource === 'olap';
  // Dishes, or products by what they cost in the dishes sold (iiko only).
  const [abcView, setAbcView] = useState<'dishes' | 'products'>('dishes');
  const sectionsPresent = useMemo(() => makeAbcExport([], lang, '').ABC_SECTIONS.filter(s => items.some(i => i.sec === s.id)), [items, lang]);

  const visibleItems = items.filter(i => !hiddenCats.has(i.cat));
  const filtered = useMemo(() => {
    let r = visibleItems;
    if (quad) r = r.filter(i => i.q === quad);
    if (cat !== 'all') r = r.filter(i => i.cat === cat);
    if (section !== 'all') r = r.filter(i => i.sec === section);
    if (abcGrade !== 'all') r = r.filter(i => i[abcMetric] === abcGrade);
    const q = query.trim().toLowerCase();
    if (q) r = r.filter(i => i.name.toLowerCase().includes(q));
    const key: Record<SortKey, (i: Item) => number | string> = {
      name: i => i.name, price: i => i.avgPrice, qty: i => i.qty, vel: i => i.velocity, rev: i => i.revenue,
      cost: i => i.unitCost ?? -1, rcost: i => i.recipeCostPerUnit ?? -1, drift: i => i.costGapPct ?? -1e9,
      fc: i => i.fc ?? -1, profit: i => i.profit, cheq: i => i.cheques ?? -1, xyz: i => i.xyzCv ?? 1e9,
    };
    return [...r].sort((a, b) => {
      const A = key[sort.k](a), B = key[sort.k](b);
      return (typeof A === 'string' ? A.localeCompare(B as string, 'ru') : (A as number) - (B as number)) * sort.dir;
    });
  }, [visibleItems, quad, cat, section, abcGrade, abcMetric, query, sort]);
  const shown = showAll ? filtered : filtered.slice(0, 10);
  const totalProfit = visibleItems.reduce((a, i) => a + Math.max(0, i.profit), 0) || 1;
  const sortBtn = (k: SortKey, label: string, cls = '') => (
    <th className={`${cls}`} aria-sort={sort.k === k ? (sort.dir < 0 ? 'descending' : 'ascending') : undefined}>
      <button onClick={() => setSort(s => s.k === k ? { k, dir: (-s.dir) as 1 | -1 } : { k, dir: k === 'name' ? 1 : -1 })}>{label}<i className="ph ph-caret-down chev" aria-hidden="true" /></button>
    </th>
  );
  const plural = (n: number) => lang === 'ru' ? (n % 10 === 1 && n % 100 !== 11 ? 'позиция' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'позиции' : 'позиций') : lang === 'uz' ? 'pozitsiya' : n === 1 ? 'item' : 'items';
  const periodText = isToday ? `${tr(lang, 'Сегодня', 'Today', 'Bugun')}, ${dayLabel(today, lang)} · ${tr(lang, 'на', 'as of', '')} ${nowHM()}` : rangeLabel(from, to, lang);
  const exportLabel = rangeLabel(from, to, lang);
  const doExport = (kind: 'xlsx' | 'pdf') => {
    const ex = makeAbcExport(filtered, lang, exportLabel);
    (kind === 'xlsx' ? ex.handleExcel() : ex.handlePdf()).catch(e => console.error('[sales] export failed', e));
  };

  // ── Menu AI ──
  const [menuAi, setMenuAi] = useState<{ state: AiState; text: string; at: string | null; err: boolean }>({ state: 'empty', text: '', at: null, err: false });
  const runMenuAi = () => {
    if (menuAi.state === 'loading') return;
    setMenuAi(s => ({ ...s, state: 'loading', err: false }));
    const f = (n: number) => Math.round(n).toLocaleString('ru-RU');
    const byCat = new Map<string, number>();
    for (const it of filtered) byCat.set(it.cat, (byCat.get(it.cat) ?? 0) + it.revenue);
    const catLines = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, r]) => `  ${c}: ${f(r)} UZS`).join('\n');
    const itemLines = [...filtered].sort((a, b) => b.revenue - a.revenue).slice(0, 40)
      .map(it => `  "${it.name}" [${it.cat}] — выручка ${f(it.revenue)} UZS, ${it.qty} шт., ${it.velocity}/день, фудкост ${it.fc != null ? Math.round(it.fc) + '%' : 'н/д'}, прибыль ${f(it.profit)} UZS, группа ${QUADS[it.q].name}, ABC (кол-во/выручка/прибыль): ${it.abcQty}${it.abcRevenue}${it.abcProfit}`).join('\n');
    const ctx = `Ты аналитик меню ресторана. Модификаторы, сервисный сбор и чаевые уже исключены. Период: ${exportLabel}${to >= tashkentDateStr() ? ' (день ещё не закончился — данные за сегодня неполные, выводы о спросе делай осторожно)' : ''}. Позиций: ${filtered.length}.\n\nВыручка по категориям:\n${catLines}\n\nТоп-40 позиций по выручке:\n${itemLines}`;
    const prompt = tr(lang,
      'Что делать с меню по этим цифрам: какие позиции держать, какие переделать, где теряется прибыль. 4 коротких абзаца, каждый начинается с вывода жирным (**так**), с конкретными цифрами и эффектом в сумах. Без заголовков и списков.',
      'What to do with the menu based on these numbers: what to keep, what to rework, where profit leaks. 4 short paragraphs, each starting with the takeaway in bold (**like this**), with concrete numbers and effect in UZS. No headings or lists.',
      "Shu raqamlar bo'yicha menyu bilan nima qilish kerak: nimani saqlash, nimani qayta ishlash, foyda qayerda yo'qoladi. 4 ta qisqa xatboshi, har biri qalin xulosa bilan (**shunday**), aniq raqamlar bilan.");
    traceApi.ai.chat(ctx, [{ role: 'user', text: prompt }], lang)
      .then(({ text }) => setMenuAi({ state: 'done', text, at: nowHM(), err: false }))
      .catch(() => setMenuAi(s => ({ ...s, state: 'empty', err: true })));
  };
  const richParas = (text: string) => text.split(/\n{1,}/).map(p => p.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).map((p, i) => (
    <p key={i}>{p.split(/\*\*(.+?)\*\*/g).map((s, j) => j % 2 ? <b key={j}>{s}</b> : s)}</p>
  ));

  // ── AI tools ──
  const [price, setPrice] = useState<{ state: AiState; hints: { name: string; currentPrice: number; suggestedPrice: number; reasoning: string; promo?: string; action?: string; impact?: string }[]; at: string | null; err?: string | null }>({ state: 'empty', hints: [], at: null });
  const runPrice = (force = false) => {
    setPrice(s => ({ ...s, state: 'loading', err: null }));
    traceApi.ai.priceElasticity(lang, force)
      .then(r => setPrice(r.fromAI && r.hints?.length ? { state: 'done', hints: r.hints as any, at: nowHM() } : { state: 'empty', hints: [], at: null, err: tr(lang, 'Недостаточно данных для ревизии цен.', 'Not enough data for a price review.', "Narxlarni ko'rib chiqish uchun ma'lumot yetarli emas.") }))
      .catch(() => setPrice({ state: 'empty', hints: [], at: null, err: tr(lang, 'Не получилось. Попробуйте ещё раз.', "Didn't work. Try again.", "Bo'lmadi. Qayta urinib ko'ring.") }));
  };
  const [combo, setCombo] = useState<{ state: AiState; combos: { items: string[]; reason: string; mechanic: string }[]; at: string | null; err?: string | null }>({ state: 'empty', combos: [], at: null });
  const runCombo = (force = false) => {
    setCombo(s => ({ ...s, state: 'loading', err: null }));
    traceApi.ai.comboSuggestions(lang, force)
      .then(r => setCombo(r.fromAI && r.combos?.length ? { state: 'done', combos: r.combos, at: nowHM() } : { state: 'empty', combos: [], at: null, err: tr(lang, 'Связок пока не нашлось: мало заказов с несколькими позициями.', 'No pairings yet: too few multi-item orders.', "Hozircha bog'lanish topilmadi.") }))
      .catch(() => setCombo({ state: 'empty', combos: [], at: null, err: tr(lang, 'Не получилось. Попробуйте ещё раз.', "Didn't work. Try again.", "Bo'lmadi. Qayta urinib ko'ring.") }));
  };
  const [ret, setRet] = useState<{ state: AiState; data: any; at: string | null; err?: string | null }>({ state: 'empty', data: null, at: null });
  const runRet = () => {
    if (isBasePlan) return;
    setRet(s => ({ ...s, state: 'loading', err: null }));
    traceApi.ai.guestReturn(lang)
      .then(r => setRet(r.fromAI ? { state: 'done', data: r, at: nowHM() } : { state: 'empty', data: null, at: null, err: tr(lang, 'Недостаточно данных о гостях.', 'Not enough guest data.', "Mehmonlar haqida ma'lumot yetarli emas.") }))
      .catch(() => setRet({ state: 'empty', data: null, at: null, err: tr(lang, 'Не получилось. Попробуйте ещё раз.', "Didn't work. Try again.", "Bo'lmadi. Qayta urinib ko'ring.") }));
  };
  const priceGain = price.hints.length;
  const tiles: TrioTile[] = [
    {
      key: 'price', icon: 'ph-tag', short: tr(lang, 'Цены', 'Prices', 'Narxlar'), title: tr(lang, 'Ревизия цен', 'Price review', "Narxlarni ko'rib chiqish"),
      desc: tr(lang, 'Какие цены поднять, какие снизить и где дешевле поменять рецепт. По продажам за 8 недель и себестоимости из техкарт.', 'Which prices to raise, which to lower and where changing the recipe is cheaper. From 8 weeks of sales and recipe costs.', "Qaysi narxlarni oshirish, qaysilarini tushirish va qayerda retseptni o'zgartirish arzonroq."),
      runLabel: tr(lang, 'Проверить цены', 'Check prices', 'Narxlarni tekshirish'), wait: tr(lang, 'Считаем прибыль с порции и как менялся спрос после прошлых изменений цен…', 'Working out profit per portion and how demand moved after past price changes…', "Porsiyadan foyda va oldingi narx o'zgarishlaridan keyingi talabni hisoblayapmiz…"),
      state: price.state, when: price.at, error: price.err, onRun: runPrice,
      summary: <><b>{priceGain} {tr(lang, ruPl(priceGain, 'изменение', 'изменения', 'изменений'), priceGain === 1 ? 'change' : 'changes', "o'zgarish")}</b></>,
      body: (
        <ol className="rec-list">
          {price.hints.map(h => {
            const act = h.action ?? (h.suggestedPrice > h.currentPrice ? 'raise' : h.suggestedPrice < h.currentPrice ? 'lower' : 'recipe');
            return (
              <li className="rec" key={h.name}>
                <div className="rec-h"><span className="rec-name">{h.name}</span>
                  <span className={`act ${act === 'raise' ? 'raise' : act === 'lower' ? 'lower' : ''}`}>{act === 'raise' ? tr(lang, 'Поднять цену', 'Raise price', 'Narxni oshirish') : act === 'lower' ? tr(lang, 'Снизить цену', 'Lower price', 'Narxni tushirish') : tr(lang, 'Пересмотреть рецепт', 'Rework recipe', "Retseptni qayta ko'rish")}</span></div>
                <div className="rec-price">{h.suggestedPrice !== h.currentPrice && <s>{fmt(h.currentPrice)}</s>}<b>{fmt(h.suggestedPrice)}</b></div>
                <p>{h.reasoning}{h.promo ? ` ${h.promo}` : ''}</p>
                {h.impact && <div className="rec-impact">{h.impact}</div>}
              </li>
            );
          })}
        </ol>
      ),
    },
    {
      key: 'combo', icon: 'ph-intersect', short: tr(lang, 'Связки', 'Pairings', "Bog'lanishlar"), title: tr(lang, 'Что предлагать к заказу', 'What to suggest with an order', 'Buyurtmaga nima taklif qilish'),
      desc: tr(lang, 'Какие позиции гости берут вместе и что официантам предлагать к заказу, с готовой фразой.', 'Which items guests order together and what waiters should suggest, with a ready-made line.', "Mehmonlar qaysi pozitsiyalarni birga oladi va ofitsiantlar nima taklif qilishi kerak."),
      runLabel: tr(lang, 'Найти связки', 'Find pairings', "Bog'lanishlarni topish"), wait: tr(lang, 'Смотрим, что берут в одном чеке…', 'Looking at what goes on the same check…', 'Bir chekda nima olinishini ko‘ryapmiz…'),
      state: combo.state, when: combo.at, error: combo.err, onRun: runCombo,
      summary: combo.combos[0] ? <><b>{combo.combos.length} {tr(lang, ruPl(combo.combos.length, 'связка', 'связки', 'связок'), combo.combos.length === 1 ? 'pairing' : 'pairings', "bog'lanish")}</b>. {tr(lang, 'Лучшая', 'Best', 'Eng yaxshi')}: {combo.combos[0].items.join(' → ')}</> : null,
      body: <>{combo.combos.map((c, i) => (
        <div className="combo" key={i}>
          <div className="combo-h"><span>{c.items.join(' → ')}</span></div>
          <p>{c.reason}</p>
          {c.mechanic && <p>{tr(lang, 'Официанту', 'For the waiter', 'Ofitsiantga')}: <span className="say">{c.mechanic}</span></p>}
        </div>
      ))}</>,
    },
    {
      key: 'ret', icon: 'ph-arrow-counter-clockwise', short: tr(lang, 'Возврат', 'Return', 'Qaytish'), title: tr(lang, 'Возвращаются ли гости', 'Do guests come back', 'Mehmonlar qaytadimi'),
      desc: tr(lang, 'Сколько гостей возвращается и что сделать, чтобы возвращались чаще. Точнее, если гости пользуются картой лояльности.', 'How many guests come back and what to do so they return more often. More precise when guests use a loyalty card.', "Qancha mehmon qaytadi va tez-tez qaytishlari uchun nima qilish kerak."),
      runLabel: tr(lang, 'Посчитать возврат', 'Work out returns', 'Qaytishni hisoblash'), wait: tr(lang, 'Считаем повторные визиты по картам гостей…', 'Counting repeat visits from guest cards…', 'Mehmon kartalari bo‘yicha takroriy tashriflarni hisoblayapmiz…'),
      state: ret.state, when: ret.at, error: ret.err, onRun: runRet,
      locked: isBasePlan ? tr(lang, 'Доступно в тарифе Pro', 'Available on the Pro plan', 'Pro tarifida mavjud') : null,
      summary: ret.data ? <><b>{ret.data.weeklyRetentionPct ?? '—'}%</b> {tr(lang, 'гостей возвращаются в течение недели', 'of guests return within a week', 'mehmonlar bir hafta ichida qaytadi')}</> : null,
      body: ret.data && <>
        <div className="ret-nums">
          {ret.data.returnProbability7d != null && <div><div className="l">{tr(lang, 'Вернутся за 7 дней', 'Return within 7 days', '7 kunda qaytadi')}</div><div className="v">{Math.round(ret.data.returnProbability7d * 100)}%</div></div>}
          {ret.data.weeklyRetentionPct != null && <div><div className="l">{tr(lang, 'Удержание за неделю', 'Weekly retention', 'Haftalik ushlab qolish')}</div><div className="v">{ret.data.weeklyRetentionPct}%</div></div>}
          {ret.data.avgGuestsPerDay != null && <div><div className="l">{tr(lang, 'Гостей в день', 'Guests a day', 'Kuniga mehmon')}</div><div className="v">{fmt(ret.data.avgGuestsPerDay)}</div></div>}
        </div>
        {ret.data.insight && <p className="ret-text">{ret.data.insight}{ret.data.audienceType ? ` (${ret.data.audienceType})` : ''}</p>}
        {!ret.data.isRealRetentionData && <p className="sec-note">{tr(lang, 'Оценка по количеству гостей: точные цифры появятся с картами лояльности.', 'Estimated from guest counts: exact numbers come with loyalty cards.', "Mehmonlar soni bo'yicha baholash.")}</p>}
      </>,
    },
  ];

  // ── AI chat context ──
  useEffect(() => {
    if (!onContextReady || loading) return;
    const f = (n: number) => Math.round(n).toLocaleString('ru-RU');
    onContextReady(
      `Раздел: Продажи\nПериод: ${from} — ${to}\nВыручка: ${f(rev)} UZS | Заказов: ${ord} | Средний чек: ${f(chk)} UZS${fcPct != null ? ` | Фудкост ${fcPct.toFixed(1)}%` : ''}\n` +
      `\nВыручка по дням:\n${rows.map(r => `  ${r.date}: ${f(r.revenue)} UZS, ${r.orders} заказов`).join('\n')}\n` +
      `\nКатегории:\n${cats.map(c => `  ${c.name}: ${f(c.revenue)} UZS (${c.pct.toFixed(1)}%), ср.чек ${f(c.avgCheck)} UZS`).join('\n') || '  нет данных'}\n` +
      `\nМеню (группа, фудкост, прибыль):\n${items.slice(0, 40).map(i => `  ${i.name} [${i.cat}]: ${i.qty} шт, ${f(i.revenue)} UZS, фудкост ${i.fc != null ? Math.round(i.fc) + '%' : 'н/д'}, ${QUADS[i.q].name}, ABC ${i.abcQty}${i.abcRevenue}${i.abcProfit}`).join('\n')}`
    );
  }, [loading, rows, cats, items]);

  const cmpText = (c: ComparisonPeriod) => {
    if (cmpKey === 'today') return c === 'yesterday' ? tr(lang, 'вчера', 'yesterday', 'kecha') : c === 'last_week' ? tr(lang, 'неделей раньше', 'a week earlier', 'bir hafta oldin') : c === 'last_month' ? dayLabel(isoShift(today, -30), lang) : `${dayLabel(isoShift(today, -365), lang)} ${+today.slice(0, 4) - 1}`;
    if (cmpKey === '7days') return c === 'last_week' ? tr(lang, 'прошлой неделей', 'the previous week', "o'tgan hafta") : c === 'last_month' ? tr(lang, 'неделей месяц назад', 'the week a month ago', 'bir oy oldingi hafta') : tr(lang, `той же неделей в ${+today.slice(0, 4) - 1}`, `the same week in ${+today.slice(0, 4) - 1}`, `${+today.slice(0, 4) - 1} yilning shu haftasi`);
    return c === 'last_month' ? tr(lang, 'предыдущими 30 днями', 'the previous 30 days', 'oldingi 30 kun') : tr(lang, `теми же днями в ${+today.slice(0, 4) - 1}`, `the same days in ${+today.slice(0, 4) - 1}`, `${+today.slice(0, 4) - 1} yilning shu kunlari`);
  };
  const maxCatShare = Math.max(1, ...cats.map(c => c.pct));
  const COLS: [Col, string][] = [
    ['cat', tr(lang, 'Категория', 'Category', 'Kategoriya')], ['qty', tr(lang, 'Продано', 'Sold', 'Sotildi')], ['rev', tr(lang, 'Выручка', 'Revenue', 'Tushum')],
    ['cost', tr(lang, 'Себестоимость', 'Cost', 'Tannarx')],
    ...(hasRecipe ? [['rcost', tr(lang, 'По техкарте', 'Recipe cost', "Texkarta bo'yicha")], ['drift', tr(lang, 'Отклонение от техкарты', 'Drift from recipe', 'Texkartadan farq')]] as [Col, string][] : []),
    ['fc', tr(lang, 'Фудкост', 'Food cost', 'Fudkost')], ['profit', tr(lang, 'Прибыль', 'Profit', 'Foyda')],
    ['abc', 'ABC'], ...(hasXyz ? [['xyz', tr(lang, 'XYZ — стабильность продаж', 'XYZ — sales stability', 'XYZ — savdo barqarorligi')]] as [Col, string][] : []),
    ...(hasCheq ? [['cheq', tr(lang, 'Чеков', 'Checks', 'Cheklar')]] as [Col, string][] : []),
    ['cls', tr(lang, 'Группа', 'Group', 'Guruh')], ['price', tr(lang, 'Цена', 'Price', 'Narx')], ['vel', tr(lang, 'В день', 'Per day', 'Kuniga')],
  ];
  const off = (c: Col) => !cols[c] || (c === 'rcost' || c === 'drift' ? !hasRecipe : c === 'xyz' ? !hasXyz : c === 'cheq' ? !hasCheq : false);
  const tableCls = 'menu ' + (Object.keys(cols) as Col[]).filter(off).map(c => `hide-${c}`).join(' ');

  return (
    <>
      {detail && <DishDetailModal item={detail} allItems={abc} lang={lang} timeRange={period.range === 'custom' ? '7days' : period.range} isBasePlan={isBasePlan} onClose={() => setDetail(null)} />}
      {loadErr && <p className="rd-err" role="alert" style={{ margin: '0 0 14px' }}>{tr(lang, 'Не удалось загрузить данные. Показанные цифры могут быть неполными — обновите страницу.', "Couldn't load the data. Numbers shown may be incomplete — reload the page.", "Ma'lumotlarni yuklab bo'lmadi. Sahifani yangilang.")}</p>}
      <div className="page-head rise">
        <div>
          <h1>{tr(lang, 'Продажи', 'Sales', 'Savdo')}</h1>
          <div className="sub">
            <span>{periodText}</span><span className="faint">·</span><span className="cmp-lbl">{tr(lang, 'по сравнению с', 'compared with', 'bilan solishtirganda')}</span>
            {period.range === 'custom' ? <b>{rangeLabel(cFrom, cTo, lang)}</b> : (
              <label className="cmp">
                <select value={comparison} onChange={e => setComparison(e.target.value as ComparisonPeriod)} aria-label={tr(lang, 'Сравнить с', 'Compare with', 'Solishtirish')}>
                  {CMP_OPTIONS[cmpKey].map(c => <option key={c} value={c}>{cmpText(c)}</option>)}
                </select>
                <i className="ph ph-caret-down chev" aria-hidden="true" />
              </label>
            )}
          </div>
        </div>
        <PeriodSeg lang={lang} value={period} onChange={setPeriod} />
      </div>

      {/* 1. Totals double as the chart switch */}
      <section className="rise" style={{ animationDelay: '.05s' }} aria-label={tr(lang, 'Итоги периода', 'Period totals', 'Davr yakunlari')}>
        <div className="kpis" role="group" aria-label={tr(lang, 'Показатель на графике', 'Metric on the chart', "Grafikdagi ko'rsatkich")} style={loading ? { opacity: .5 } : undefined}>
          {METRICS.map(x => (
            <button key={x.k} className="kpi" aria-pressed={metric === x.k} onClick={() => setMetric(x.k)}>
              <div className="k-l">{x.label}</div>
              <div className="k-v">{fmt(x.v)}{x.unit && <small>{x.unit}</small>}</div>
              <div className="k-d"><Delta v={x.d} />{x.k === 'prof' && fcPct != null && <span className="faint">{tr(lang, 'фудкост', 'food cost', 'fudkost')} {fcPct.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</span>}</div>
            </button>
          ))}
        </div>
        <div className="trend card-ph">
          <div className="sec-head">
            <h2>{m.label} {chart.title}<span className="faint" style={{ fontWeight: 400 }}>, {m.chartUnit}</span></h2>
            <Legend cur={lgCur} base={lgBase} />
          </div>
          <LineChart labels={chart.labels} cur={chart.cur} base={chart.base} curName={lgCur} baseName={lgBase} height={260}
            axis={v => metric === 'chk' ? `${Math.round(v / 1000)} ${tr(lang, 'тыс', 'K', 'ming')}` : isMoney ? (Math.round(v * 10) / 10).toLocaleString('ru-RU') : fmt(v)}
            tip={v => isMoney ? `${fmt(v * 1e6)} ${sum(lang)}` : metric === 'chk' ? `${fmt(v)} ${sum(lang)}` : fmt(v)} />
          {metric === 'prof' && <p className="sec-note" style={{ marginTop: 8 }}>{tr(lang, 'По дням прибыль считается от выручки с фудкостом периода.', 'Daily profit uses the period food-cost rate.', "Kunlik foyda davr fudkosti bilan hisoblanadi.")}</p>}
        </div>
      </section>

      {/* 2. What and when */}
      <div className="two band rise" style={{ animationDelay: '.1s' }}>
        <section className="card-ph" aria-labelledby="h-cats">
          <div className="sec-head"><h2 id="h-cats">{tr(lang, 'Категории', 'Categories', 'Kategoriyalar')}</h2></div>
          {cats.length === 0 ? <div className="rd-empty">{loading ? <Skel lines={['w9', 'w7', 'w9']} /> : tr(lang, 'Нет данных за период', 'No data for the period', "Davr uchun ma'lumot yo'q")}</div> : (
            <table className="cats">
              <thead><tr><th>{tr(lang, 'Категория', 'Category', 'Kategoriya')}</th><th className="r">{tr(lang, 'Выручка', 'Revenue', 'Tushum')}</th><th className="r c-avg" title={tr(lang, 'Средний чек заказов, в которых есть эта категория', 'Average check of orders that include this category', 'Shu kategoriya bor buyurtmalarning o‘rtacha cheki')}>{tr(lang, 'Средний чек', 'Avg check', "O'rt. chek")}</th><th className="r">{tr(lang, 'Изм.', 'Chg.', "O'zg.")}</th></tr></thead>
              <tbody>
                {cats.map(c => {
                  const prev = cCats.find(x => x.name === c.name);
                  return (
                    <tr key={c.name}>
                      <td>{c.name}<span className="bar"><span style={{ width: `${c.pct / maxCatShare * 100}%` }} /></span></td>
                      <td className="r">{fmt(c.revenue / 1000)} {tr(lang, 'тыс', 'K', 'ming')}<div className="faint" style={{ fontSize: 12.5 }}>{c.pct.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</div></td>
                      <td className="r c-avg">{fmt(c.avgCheck)}</td>
                      <td className="r"><Delta v={prev ? pctChange(c.revenue, prev.revenue) : null} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
        {!heatFailed && (
          <section className="card-ph" aria-labelledby="h-heat">
            <div className="sec-head"><h2 id="h-heat">{tr(lang, 'Когда продаём', 'When we sell', 'Qachon sotamiz')}</h2><span className="sec-note">{tr(lang, 'за 4 недели', 'last 4 weeks', 'oxirgi 4 hafta')}</span></div>
            {!heatView ? (heat ? <p className="rd-empty">{tr(lang, 'За последние 4 недели продаж нет — карте нечего показать.', 'No sales in the last 4 weeks — nothing to map.', "So'nggi 4 haftada savdo yo'q.")}</p> : <Skel lines={['w9', 'w9', 'w9', 'w9', 'w9', 'w9', 'w9']} />) : <>
              <div className="heat" style={{ gridTemplateColumns: `28px repeat(${heatView.hours.length}, 1fr)` }}>
                {WD.map((d, di) => (
                  <React.Fragment key={d}>
                    <span className="h-lbl">{d}</span>
                    {heatView.hours.map(h => { const v = heatView.val(di, h); return <span key={h} className="cell" style={{ opacity: heatView.op(v) }} title={`${d}, ${h}:00: ${mln(v)} ${tr(lang, 'млн', 'M', 'mln')}`} />; })}
                  </React.Fragment>
                ))}
                <span />
                {heatView.hours.map(h => <span key={h} className="h-hr">{h % 3 === 2 ? h : ''}</span>)}
              </div>
              <div className="heat-key"><span>{tr(lang, 'Средняя выручка за час:', 'Average revenue per hour:', "Soatlik o'rtacha tushum:")}</span><span>{tr(lang, 'меньше', 'less', 'kam')}</span><span className="ramp">{[.1, .3, .55, .8, 1].map(o => <span key={o} style={{ opacity: o }} />)}</span><span>{tr(lang, 'больше', 'more', "ko'p")}</span></div>
              <p className="heat-note">
                {tr(lang, 'Пик', 'Peak', 'Eng yuqori')}: <b>{WD_FULL(heatView.top.dow)}, {heatView.top.hour}:00-{heatView.top.hour + 1}:00</b>, {tr(lang, 'в среднем', 'on average', "o'rtacha")} {mln(heatView.top.revenue)} {tr(lang, 'млн в час', 'M an hour', 'mln soatiga')}.
                {heatView.quiet && <> {tr(lang, 'Тише всего', 'Quietest', 'Eng tinch')} <b>{tr(lang, 'в будни', 'on weekdays', 'ish kunlari')} {tr(lang, 'с', 'at', '')} {heatView.quiet.hour}:00</b>: {mln(heatView.quiet.revenue)} {tr(lang, 'млн в час', 'M an hour', 'mln soatiga')}.</>}
              </p>
            </>}
          </section>
        )}
      </div>

      {/* 3. Menu: one table, four plain-language groups as filters */}
      <section className="band rise card-ph" style={{ animationDelay: '.14s' }} aria-labelledby="h-menu">
        <div className="sec-head"><h2 id="h-menu">{tr(lang, 'Меню и ABC-анализ', 'Menu and ABC analysis', 'Menyu va ABC tahlili')}</h2>
          {iikoAbc && (
            <span className="seg small" role="group" aria-label={tr(lang, 'Что анализировать', 'What to analyse', 'Nimani tahlil qilish')}>
              <button aria-pressed={abcView === 'dishes'} onClick={() => setAbcView('dishes')}>{tr(lang, 'Блюда', 'Dishes', 'Taomlar')}</button>
              <button aria-pressed={abcView === 'products'} onClick={() => setAbcView('products')}>{tr(lang, 'Продукты', 'Products', 'Mahsulotlar')}</button>
            </span>
          )}
        </div>
        {abcView === 'products' && iikoAbc ? <GoodsAbc lang={lang} from={from} to={to} /> : <>
        <div className="quads">
          {(Object.keys(QUADS) as Quad[]).map(k => {
            const inQ = visibleItems.filter(i => i.q === k);
            const sh = inQ.reduce((a, i) => a + Math.max(0, i.profit), 0) / totalProfit * 100;
            return (
              <button key={k} className="quad" aria-pressed={quad === k} onClick={() => { setQuad(q => q === k ? null : k); setShowAll(false); }}>
                <div className="q-top"><span className="q-name"><span className={`cls ${k}`} style={{ minWidth: 0 }} />{QUADS[k].name}</span><span className="q-n">{inQ.length}</span></div>
                <div className="q-what">{QUADS[k].what}</div>
                <div className="q-share">{Math.round(sh)}% {tr(lang, 'прибыли', 'of profit', 'foydadan')}</div>
                <div className="q-do">{QUADS[k].do}</div>
              </button>
            );
          })}
        </div>
        <div className="tools">
          <label className="search"><i className="ph ph-magnifying-glass" aria-hidden="true" /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={tr(lang, 'Найти блюдо', 'Find a dish', 'Taom topish')} aria-label={tr(lang, 'Найти блюдо', 'Find a dish', 'Taom topish')} /></label>
          <label className="sel"><select value={cat} onChange={e => setCat(e.target.value)} aria-label={tr(lang, 'Категория', 'Category', 'Kategoriya')}>
            <option value="all">{tr(lang, 'Все категории', 'All categories', 'Barcha kategoriyalar')}</option>
            {catNames.filter(c => !hiddenCats.has(c)).map(c => <option key={c} value={c}>{c}</option>)}
          </select><i className="ph ph-caret-down chev" aria-hidden="true" /></label>
          {sectionsPresent.length > 1 && (
            <label className="sel"><select value={section} onChange={e => setSection(e.target.value)} aria-label={tr(lang, 'Раздел', 'Section', "Bo'lim")}>
              <option value="all">{tr(lang, 'Все разделы', 'All sections', "Barcha bo'limlar")}</option>
              {sectionsPresent.map(s => <option key={s.id} value={s.id}>{tr(lang, s.label.ru, s.label.en, s.label.uz)}</option>)}
            </select><i className="ph ph-caret-down chev" aria-hidden="true" /></label>
          )}
          <span className="abc-ctl">
            <label className="sel"><select value={abcMetric} onChange={e => setAbcMetric(e.target.value as any)} aria-label="ABC">
              <option value="abcRevenue">{tr(lang, 'ABC по выручке', 'ABC by revenue', "ABC tushum bo'yicha")}</option>
              <option value="abcQty">{tr(lang, 'ABC по количеству', 'ABC by quantity', "ABC soni bo'yicha")}</option>
              <option value="abcProfit">{tr(lang, 'ABC по прибыли', 'ABC by profit', "ABC foyda bo'yicha")}</option>
            </select><i className="ph ph-caret-down chev" aria-hidden="true" /></label>
            <span className="seg small" role="group" aria-label={tr(lang, 'Класс ABC', 'ABC class', 'ABC sinfi')}>
              {(['all', 'A', 'B', 'C'] as const).map(g => <button key={g} aria-pressed={abcGrade === g} onClick={() => setAbcGrade(g)}>{g === 'all' ? tr(lang, 'Все', 'All', 'Hammasi') : g}</button>)}
            </span>
          </span>
          {quad && <span className="filter-chip">{QUADS[quad].name}<button aria-label={tr(lang, 'Снять фильтр', 'Clear filter', 'Filtrni olib tashlash')} onClick={() => setQuad(null)}>✕</button></span>}
          <span className="spacer" />
          <Pop right btnClass="btn" label={<><i className="ph ph-columns" aria-hidden="true" />{tr(lang, 'Столбцы', 'Columns', 'Ustunlar')}</>}>
            {() => <>
              <div className="pop-title">{tr(lang, 'Столбцы', 'Columns', 'Ustunlar')}</div>
              {COLS.map(([c, l]) => <Opt key={c} cb checked={cols[c]} onClick={() => setCols(v => ({ ...v, [c]: !v[c] }))}>{l}</Opt>)}
              {catNames.length > 1 && <>
                <hr /><div className="pop-title">{tr(lang, 'Показывать категории', 'Show categories', "Kategoriyalarni ko'rsatish")}</div>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {catNames.map(c => <Opt key={c} cb checked={!hiddenCats.has(c)} onClick={() => setHiddenCats(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; })}>{c}</Opt>)}
                </div>
              </>}
            </>}
          </Pop>
          <Pop right btnClass="btn" label={<><i className="ph ph-download-simple" aria-hidden="true" />{tr(lang, 'Скачать', 'Download', 'Yuklab olish')}</>}>
            {close => <>
              <div className="pop-title">{tr(lang, 'Текущий список с фильтрами и выводами', 'Current list with filters and takeaways', "Joriy ro'yxat filtrlar va xulosalar bilan")}</div>
              <button className="opt" style={{ gridTemplateColumns: '1fr' }} onClick={() => { close(); doExport('xlsx'); }}><span>Excel (.xlsx)</span><span className="hint" style={{ gridColumn: 1 }}>{tr(lang, 'Таблица + лист по каждому разделу', 'Table + a sheet per section', "Jadval + har bo'lim uchun varaq")}</span></button>
              <button className="opt" style={{ gridTemplateColumns: '1fr' }} onClick={() => { close(); doExport('pdf'); }}><span>PDF</span><span className="hint" style={{ gridColumn: 1 }}>{tr(lang, 'Для печати и отправки владельцу', 'To print or send to the owner', 'Chop etish yoki egasiga yuborish uchun')}</span></button>
            </>}
          </Pop>
        </div>
        <table className={tableCls}>
          <thead><tr>
            {sortBtn('name', tr(lang, 'Позиция', 'Item', 'Pozitsiya'))}
            <th className="c-cat">{tr(lang, 'Категория', 'Category', 'Kategoriya')}</th>
            {sortBtn('price', tr(lang, 'Цена', 'Price', 'Narx'), 'r c-price')}
            {sortBtn('qty', tr(lang, 'Продано', 'Sold', 'Sotildi'), 'r c-qty')}
            {sortBtn('vel', tr(lang, 'В день', 'Per day', 'Kuniga'), 'r c-vel')}
            {sortBtn('rev', tr(lang, 'Выручка', 'Revenue', 'Tushum'), 'r c-rev')}
            {sortBtn('cost', tr(lang, 'Себест.', 'Cost', 'Tannarx'), 'r c-cost')}
            {sortBtn('rcost', tr(lang, 'По техкарте', 'Recipe', 'Texkarta'), 'r c-rcost')}
            {sortBtn('drift', tr(lang, 'Откл.', 'Drift', 'Farq'), 'r c-drift')}
            {sortBtn('fc', tr(lang, 'Фудкост', 'Food cost', 'Fudkost'), 'r c-fc')}
            {sortBtn('profit', tr(lang, 'Прибыль', 'Profit', 'Foyda'), 'r c-profit')}
            <th className="c-abc" title={tr(lang, 'Класс по количеству, выручке и прибыли', 'Class by quantity, revenue and profit', "Soni, tushum va foyda bo'yicha sinf")}>ABC <span className="faint" style={{ fontWeight: 400 }}>{tr(lang, 'К/В/П', 'Q/R/P', 'S/T/F')}</span></th>
            {sortBtn('xyz', 'XYZ', 'c-xyz')}
            {sortBtn('cheq', tr(lang, 'Чеков', 'Checks', 'Cheklar'), 'r c-cheq')}
            <th className="c-cls">{tr(lang, 'Группа', 'Group', 'Guruh')}</th>
          </tr></thead>
          <tbody>
            {loading && !items.length ? <tr><td colSpan={15}><Skel lines={['w9', 'w9', 'w9', 'w9', 'w7']} /></td></tr>
              : shown.length ? shown.map(r => (
                <tr key={r.name + r.cat} tabIndex={0} onClick={() => setDetail(r)} onKeyDown={e => { if (e.key === 'Enter') setDetail(r); }}>
                  <td className="name">{r.name}<span className="sub">{r.cat} · {fmt(r.qty)} {tr(lang, 'шт', 'pcs', 'dona')}{r.fc != null ? `, ${tr(lang, 'фудкост', 'food cost', 'fudkost')} ${Math.round(r.fc)}%` : ''}</span></td>
                  <td className="c-cat cat">{r.cat}</td>
                  <td className="r c-price">{fmt(r.avgPrice)}</td>
                  <td className="r c-qty">{fmt(r.qty)}</td>
                  <td className="r c-vel muted">{r.velocity.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}</td>
                  <td className="r c-rev">{fmt(r.revenue)}</td>
                  <td className="r c-cost muted">{r.unitCost != null ? fmt(r.unitCost) : '—'}</td>
                  <td className="r c-rcost muted">{r.recipeCostPerUnit != null ? fmt(r.recipeCostPerUnit) : '—'}</td>
                  <td className={`r c-drift ${r.costGapPct != null && r.costGapPct >= 5 ? 'neg' : r.costGapPct != null && r.costGapPct <= -5 ? 'pos' : 'muted'}`}>{r.costGapPct != null ? pctStr(r.costGapPct) : '—'}</td>
                  <td className={`r c-fc ${r.fc != null && r.fc >= 40 ? 'fc-hi' : ''}`}>{r.fc != null ? `${Math.round(r.fc)}%` : '—'}</td>
                  <td className="r c-profit"><span className="m-lbl">{tr(lang, 'приб. ', 'profit ', 'foyda ')}</span>{r.unitCost != null ? fmt(r.profit) : '—'}</td>
                  <td className="c-abc"><span className="abc" title={`${tr(lang, 'Количество', 'Quantity', 'Soni')} ${r.abcQty}, ${tr(lang, 'выручка', 'revenue', 'tushum')} ${r.abcRevenue}, ${tr(lang, 'прибыль', 'profit', 'foyda')} ${r.abcProfit}`}>
                    {(['abcQty', 'abcRevenue', 'abcProfit'] as const).map(k => <b key={k} className={`g${r[k]}${k === abcMetric ? ' cur' : ''}`}>{r[k]}</b>)}
                  </span></td>
                  <td className="c-xyz"><span className={`xyz x${r.xyz ?? ''}`} title={r.xyzCv != null ? `${tr(lang, 'Колебание продаж', 'Sales variation', "Savdo o'zgarishi")} ${r.xyzCv}%` : undefined}>{r.xyz ?? '—'}</span></td>
                  <td className="r c-cheq muted">{r.cheques != null ? fmt(r.cheques) : '—'}</td>
                  <td className="c-cls"><span className={`cls ${r.q}`}>{QUADS[r.q].short}</span></td>
                </tr>
              )) : <tr><td colSpan={15} className="empty">{tr(lang, 'Ничего не нашлось', 'Nothing found', 'Hech narsa topilmadi')}{query ? ` «${query}»` : ''}</td></tr>}
          </tbody>
        </table>
        <div className="table-foot">
          <span><span>{filtered.length > shown.length ? tr(lang, `${shown.length} из ${filtered.length} позиций`, `${shown.length} of ${filtered.length} items`, `${filtered.length} tadan ${shown.length}`) : `${filtered.length} ${plural(filtered.length)}`}</span>
            <span className="foot-note">{tr(lang, 'Прибыль считается как выручка минус себестоимость по техкартам iiko.', 'Profit is revenue minus cost from iiko recipe cards.', "Foyda = tushum minus iiko texkartalari bo'yicha tannarx.")}
              {iikoAbc && <> {tr(lang, 'ABC: выручка без НДС после скидок, пороги A 80% · B 15% · C 5%, как в отчёте iiko «ABC/XYZ анализ блюд».', 'ABC: revenue without VAT after discounts, A 80% · B 15% · C 5%, as in iiko\'s “ABC/XYZ dish analysis”.', "ABC: QQSsiz tushum chegirmadan keyin, A 80% · B 15% · C 5%, iiko hisobotidagi kabi.")}
                {abcSource === 'olap' && <> {tr(lang, 'Отчёт iiko сейчас недоступен — пересчитано из OLAP, может немного отличаться.', 'iiko\'s report is unavailable right now — rebuilt from OLAP, may differ slightly.', "iiko hisoboti hozir mavjud emas — OLAP'dan qayta hisoblandi.")}</>}</>}
              {hasRecipe && cols.drift && <> {tr(lang, 'Отклонение: насколько фактическая себестоимость выше (+) или ниже техкарты.', 'Drift: how far actual cost is above (+) or below the recipe.', "Farq: haqiqiy tannarx texkartadan qanchalik yuqori (+) yoki past.")}</>}
            </span></span>
          {filtered.length > 10 && <button className="link" type="button" onClick={() => setShowAll(s => !s)}>{showAll ? tr(lang, 'Свернуть', 'Collapse', "Yig'ish") : tr(lang, 'Показать все', 'Show all', "Hammasini ko'rsatish")}</button>}
        </div>

        <div className="menu-ai" data-state={menuAi.state}>
          <div className="menu-ai-head"><h3>{tr(lang, 'Разбор меню', 'Menu review', 'Menyu tahlili')}</h3>{menuAi.state === 'done' && <AiMeta lang={lang} when={menuAi.at} onRerun={runMenuAi} />}</div>
          {menuAi.state === 'empty' && (
            <div className="st-empty">
              <p className="ai-desc">{tr(lang, 'Что делать с меню по этим цифрам: какие позиции держать, какие переделать, где теряется прибыль. Учитывает текущие фильтры.', 'What to do with the menu: what to keep, what to rework, where profit leaks. Uses the current filters.', "Menyu bilan nima qilish kerak: nimani saqlash, nimani qayta ishlash, foyda qayerda yo'qoladi. Joriy filtrlarni hisobga oladi.")}
                {menuAi.err && <span className="rd-err" style={{ display: 'block' }}>{tr(lang, 'Не получилось. Попробуйте ещё раз.', "Didn't work. Try again.", "Bo'lmadi. Qayta urinib ko'ring.")}</span>}</p>
              <button className="btn solid" disabled={!filtered.length} onClick={runMenuAi}>{tr(lang, 'Разобрать меню', 'Review the menu', 'Menyuni tahlil qilish')}</button>
            </div>
          )}
          {menuAi.state === 'loading' && <div className="st-loading" aria-live="polite"><p className="ai-wait">{tr(lang, 'Сравниваем позиции по продажам, себестоимости и прибыли…', 'Comparing items by sales, cost and profit…', 'Pozitsiyalarni savdo, tannarx va foyda bo‘yicha solishtiryapmiz…')}</p><Skel lines={['w9', 'w7', 'w9', 'w5']} /></div>}
          {menuAi.state === 'done' && <div className="st-done menu-ai-body">{richParas(menuAi.text)}</div>}
        </div>
        </>}
      </section>

      {/* 4. Recommendations */}
      {!poster && <Trio lang={lang} tiles={tiles} />}
    </>
  );
};

// ── Ingredient ABC (iiko "Фудкост → ABC/XYZ анализ товаров") ───────────────
// Which products eat the food-cost budget: what each cost in the dishes sold.
const GoodsAbc: React.FC<{ lang: Language; from: string; to: string }> = ({ lang, from, to }) => {
  const [rows, setRows] = useState<GoodsAbcRow[] | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [all, setAll] = useState(false);
  useEffect(() => {
    let alive = true;
    setRows(undefined);
    traceApi.sales.abcGoods('custom', from, to).then(d => { if (alive) setRows(d); }).catch(() => { if (alive) setRows(null); });
    return () => { alive = false; };
  }, [from, to]);
  const list = useMemo(() => {
    let l = rows ?? [];
    if (grade !== 'all') l = l.filter(r => r.abcCost === grade);
    const q = query.trim().toLowerCase();
    if (q) l = l.filter(r => r.name.toLowerCase().includes(q));
    return l;
  }, [rows, grade, query]);
  const shown = all ? list : list.slice(0, 15);
  const aRows = (rows ?? []).filter(r => r.abcCost === 'A');
  const aShare = aRows.reduce((s, r) => s + r.salesCostShare, 0);
  const amt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  if (rows === null) return <p className="rd-empty">{tr(lang, 'Отчёт по продуктам из iiko сейчас недоступен.', "iiko's product report is unavailable right now.", 'iiko mahsulot hisoboti hozir mavjud emas.')}</p>;
  return (
    <>
      <p className="goods-lead">
        {tr(lang, 'Сколько каждый продукт стоил в проданных блюдах, как в отчёте iiko «ABC/XYZ анализ товаров».', 'What each product cost in the dishes sold, as in iiko’s “ABC/XYZ goods analysis”.', 'Har bir mahsulot sotilgan taomlarda qancha turdi, iiko hisobotidagi kabi.')}
        {aRows.length > 0 && <> <b>{tr(lang, `${aRows.length} ${ruPl(aRows.length, 'продукт', 'продукта', 'продуктов')} группы A — ${Math.round(aShare)}% затрат.`, `${aRows.length} group A products are ${Math.round(aShare)}% of cost.`, `A guruhidagi ${aRows.length} mahsulot — xarajatlarning ${Math.round(aShare)}%.`)}</b></>}
      </p>
      <div className="tools">
        <label className="search"><i className="ph ph-magnifying-glass" aria-hidden="true" /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={tr(lang, 'Найти продукт', 'Find a product', 'Mahsulot topish')} aria-label={tr(lang, 'Найти продукт', 'Find a product', 'Mahsulot topish')} /></label>
        <span className="seg small" role="group" aria-label={tr(lang, 'Класс ABC по затратам', 'ABC class by cost', "Xarajat bo'yicha ABC sinfi")}>
          {(['all', 'A', 'B', 'C'] as const).map(g => <button key={g} aria-pressed={grade === g} onClick={() => { setGrade(g); setAll(false); }}>{g === 'all' ? tr(lang, 'Все', 'All', 'Hammasi') : g}</button>)}
        </span>
      </div>
      <table className="menu goods">
        <thead><tr>
          <th>{tr(lang, 'Продукт', 'Product', 'Mahsulot')}</th>
          <th className="r">{tr(lang, 'Затраты', 'Cost', 'Xarajat')}</th>
          <th className="r">{tr(lang, 'Доля', 'Share', 'Ulush')}</th>
          <th className="r c-used">{tr(lang, 'Расход', 'Used', 'Sarf')}</th>
          <th className="r c-dishes" title={tr(lang, 'В скольких проданных блюдах используется', 'How many sold dishes use it', 'Nechta sotilgan taomda ishlatiladi')}>{tr(lang, 'Блюд', 'Dishes', 'Taom')}</th>
          <th title={tr(lang, 'Класс по затратам и по расходу', 'Class by cost and by amount used', "Xarajat va sarf bo'yicha sinf")}>ABC <span className="faint" style={{ fontWeight: 400 }}>{tr(lang, 'З/Р', 'C/U', 'X/S')}</span></th>
          <th>XYZ</th>
        </tr></thead>
        <tbody>
          {rows === undefined ? <tr><td colSpan={7}><Skel lines={['w9', 'w9', 'w9', 'w9', 'w7']} /></td></tr>
            : shown.length ? shown.map(r => (
              <tr key={r.id}>
                <td className="name">{r.name}<span className="sub">{amt(r.amount)} {r.unit}</span></td>
                <td className="r">{fmt(r.salesCost)}</td>
                <td className="r muted">{r.salesCostShare.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</td>
                <td className="r c-used muted">{amt(r.amount)} {r.unit}</td>
                <td className="r c-dishes muted">{r.dishes}</td>
                <td><span className="abc">{[r.abcCost, r.abcAmount].map((g, k) => <b key={k} className={`g${g ?? ''}${k === 0 ? ' cur' : ''}`}>{g ?? '—'}</b>)}</span></td>
                <td><span className={`xyz x${r.xyz ?? ''}`} title={r.xyzCv != null ? `${tr(lang, 'Колебание расхода', 'Usage variation', "Sarf o'zgarishi")} ${r.xyzCv}%` : undefined}>{r.xyz ?? '—'}</span></td>
              </tr>
            )) : <tr><td colSpan={7} className="empty">{tr(lang, 'Ничего не нашлось', 'Nothing found', 'Hech narsa topilmadi')}{query ? ` «${query}»` : ''}</td></tr>}
        </tbody>
      </table>
      <div className="table-foot">
        <span><span>{list.length > shown.length ? tr(lang, `${shown.length} из ${list.length} ${ruPl(list.length, 'продукта', 'продуктов', 'продуктов')}`, `${shown.length} of ${list.length} products`, `${list.length} tadan ${shown.length}`) : `${list.length} ${tr(lang, ruPl(list.length, 'продукт', 'продукта', 'продуктов'), list.length === 1 ? 'product' : 'products', 'mahsulot')}`}</span>
          <span className="foot-note">{tr(lang, 'XYZ: X — расход ровный, Y — колеблется, Z — нерегулярный.', 'XYZ: X steady use, Y uneven, Z irregular.', "XYZ: X — bir tekis, Y — o'zgaruvchan, Z — notekis.")}</span></span>
        {list.length > 15 && <button className="link" type="button" onClick={() => setAll(s => !s)}>{all ? tr(lang, 'Свернуть', 'Collapse', "Yig'ish") : tr(lang, 'Показать все', 'Show all', "Hammasini ko'rsatish")}</button>}
      </div>
    </>
  );
};

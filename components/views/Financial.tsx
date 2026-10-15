// Финансы — redesigned per TRACE-mockups/finance.html (Oct 2026): one period
// control, quiet tabs, P&L as "where revenue goes", strips instead of cards.
// Styles: styles/rd/fin.css (scoped .rd-fin).
import React, { useState, useEffect } from 'react';
import { Language, ViewState } from '../../types';
import { TRANSLATIONS, tr } from '../../constants';
import {
  traceApi,
  FinancialWriteoffRow,
  FinancialInvoiceRow,
  FinancialInventoryDoc,
  PosterInventoryItem,
  PosterInventoryDoc,
  PosterGLCategory,
  FinancialPL,
  GLSummary,
  CashShiftDoc,
  MenuAnalysisRow,
} from '../../services/traceApi';
import { StocktakeList, StocktakeDrawer } from './InventoryStocktake';
import { IikoStock } from './IikoStock';
import { mln, mlnUnit, sum, PeriodSeg, PeriodValue, periodDates, rangeLabel, dayLabel, Skel, AiMeta, AiState, LineChart, nowHM } from '../rd/ui';

const WASTE_BENCHMARK = 3.0; // industry standard %

const MONTH_NAMES_RU = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const MONTH_NAMES_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_UZ = ['Yan','Fev','Mar','Apr','May','Iyun','Iyul','Avg','Sen','Okt','Noy','Dek'];
function MONTH_LABEL(key: string, lang: Language): string {
  const [y, m] = key.split('-').map(Number);
  const names = lang === 'ru' ? MONTH_NAMES_RU : lang === 'uz' ? MONTH_NAMES_UZ : MONTH_NAMES_EN;
  return `${names[m - 1]} ${y}`;
}

// `isFood` is computed backend-side from iiko's own GL account classification
// (accountId → "Списание Кухни" vs "Амортизация" vs "Бесплатная еда
// сотрудников" etc.) — far more reliable than guessing from names here.
// `undefined` (older cached data / demo) is treated as real food waste.
const isRealFoodWaste = (w: { isFood?: boolean }) => w.isFood !== false;
const FOOD_FILTER = '__food__';

type Tab = 'pl' | 'invoices' | 'writeoffs' | 'inventory' | 'cashshifts' | 'menu' | 'gl';
type Range = 'today' | '7days' | '30days';
type PLRange = Range | 'custom';

const isPosterInventoryItem = (row: FinancialInventoryDoc | PosterInventoryItem): row is PosterInventoryItem =>
  'unit' in row;

function statusColor(status: string) {
  const s = status.toUpperCase();
  if (s === 'ACCEPTED' || s === 'POSTED') return 'text-success bg-success/10';
  if (s === 'CREATED' || s === 'NEW')     return 'text-amber-400 bg-amber-400/10';
  return 'text-muted bg-muted/10';
}

function statusLabel(status: string, lang: Language) {
  const s = status.toUpperCase();
  if (s === 'ACCEPTED' || s === 'POSTED') return tr(lang, 'Проведено', 'Posted', "O'tkazilgan");
  if (s === 'CREATED' || s === 'NEW')     return tr(lang, 'Черновик', 'Draft', 'Qoralama');
  return status;
}

export const Financial: React.FC<{
  lang: Language;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  branch?: string | null;
  onContextReady?: (ctx: string) => void;
  onNavigate?: (v: ViewState) => void;
}> = ({ lang, onShowToast, branch, onContextReady, onNavigate }) => {
  const t = TRANSLATIONS[lang];
  const [tab, setTab] = useState<Tab>('pl');

  // POS type — Poster tenants get different (or currently unsupported) data
  // for several tabs below. `isPoster` starts false (unknown) and only
  // resolves after this async call — defaulting `tab` to 'pl' before that
  // resolves meant every Poster tenant saw the P&L tab render for one
  // frame, then get yanked to Accounting the instant the real answer came
  // back. `posKnown` gates the tab bar/content so nothing renders (a brief
  // skeleton instead) until the POS type is actually known — no flash.
  const [isPoster, setIsPoster] = useState(false);
  const [posKnown, setPosKnown] = useState(false);
  useEffect(() => {
    traceApi.sales.status().then(s => setIsPoster(!!s.poster)).catch(() => {}).finally(() => setPosKnown(true));
  }, []);

  // P&L has no Poster data source — GET /financial/pl is 100% iiko OLAP with
  // no posterAdapter branch (unlike every other tab here), so it was
  // rendering permanent dashes and a "demo data · loading from iiko" fallback
  // for Poster tenants instead of either real data or being hidden. Hide the
  // tab entirely until a real Poster-backed P&L exists — the "Учёт"/
  // Accounting tab already covers GL categories for Poster.
  const ALL_TABS: { key: Tab; label: string }[] = [
    { key: 'pl',         label: 'P&L' },
    { key: 'menu',       label: tr(lang, 'Анализ меню', 'Menu Analysis', 'Menyu tahlili') },
    { key: 'invoices',   label: t.invoices },
    { key: 'writeoffs',  label: t.writeoffs },
    { key: 'inventory',  label: tr(lang, 'Склад', 'Stock', 'Ombor') },
    { key: 'cashshifts', label: tr(lang, 'Кассовые смены', 'Cash Shifts', 'Kassa smenalari') },
    { key: 'gl',         label: tr(lang, 'Учёт', 'Accounting', 'Hisob') },
  ];
  // Hide 'pl' until posKnown resolves, not just when isPoster is true —
  // isPoster *starts* false (unknown), so gating on isPoster alone let the
  // P&L tab render as active for one frame on every Poster tenant's load,
  // then get yanked to Accounting the instant the real answer arrived.
  // Withholding it until posKnown means iiko tenants see it appear once
  // (a one-directional reveal, not a flash-then-switch), and Poster
  // tenants never see it at all.
  const TABS = (!posKnown || isPoster) ? ALL_TABS.filter(x => x.key !== 'pl') : ALL_TABS;
  // Land on the first available tab (Menu Analysis), not a specific
  // arbitrary one — jumping straight to Accounting read as broken/random.
  useEffect(() => { if (posKnown && isPoster && tab === 'pl') setTab(TABS[0]?.key ?? 'menu'); }, [posKnown, isPoster, tab]);


  // One period for every tab. Invoices/inventory/menu only take presets on
  // the backend, so a custom range falls back to 30 days there.
  const [period, setPeriod] = useState<PeriodValue>({ range: '7days', custom: null });
  const range: Range = period.range === 'today' || period.range === '7days' || period.range === '30days' ? period.range : '30days';
  const plRange: PLRange = period.range === 'custom' && period.custom ? 'custom' : range;
  const plCustomRange = period.range === 'custom' ? period.custom : null;

  // P&L
  const [pl, setPl]           = useState<FinancialPL | null>(null);
  const [plLoading, setPlLoading] = useState(false);

  // AI profit forecast — user-triggered, not auto
  const [forecast, setForecast] = useState<{ fromAI: boolean; nextMonth?: string; nextMonthKey?: string; forecastRevenue?: number; forecastProfit?: number; forecastProfitPct?: number | null; reasoning?: string; risks?: string; trend?: 'up'|'flat'|'down' } | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastAt, setForecastAt] = useState<string | null>(null);
  const [forecastMonth, setForecastMonth] = useState<string | null>(null); // "YYYY-MM", null = default (next month after last full month)

  // Last FULL month in the data (mirrors backend logic) — used as the anchor
  // for the month picker so "next" can't go before the data actually ends.
  const lastFullMonthKey = (() => {
    if (!pl?.monthly || pl.monthly.length === 0) return null;
    const sorted = [...pl.monthly].sort((a, b) => a.month.localeCompare(b.month));
    const nowKey = new Date().toISOString().slice(0, 7);
    const full = sorted.filter(m => m.month !== nowKey);
    return (full.length > 0 ? full[full.length - 1] : sorted[sorted.length - 1]).month;
  })();

  const shiftMonth = (key: string, delta: number) => {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const defaultTargetMonth = lastFullMonthKey ? shiftMonth(lastFullMonthKey, 1) : null;
  const activeTargetMonth = forecastMonth ?? defaultTargetMonth;

  const runForecast = (month?: string) => {
    if (!pl?.monthly || pl.monthly.length < 2 || forecastLoading) return;
    setForecastLoading(true);
    setForecast(null);
    traceApi.ai.profitForecast({
      monthly: pl.monthly,
      foodCostPct: pl.foodCostPct,
      laborCostPct: pl.laborCostPct,
      profitPct: pl.profitPct,
      lang,
      targetMonth: (month ?? activeTargetMonth) ?? undefined,
    }).then(f => { setForecast(f); setForecastAt(nowHM()); }).catch(() => setForecast(null)).finally(() => setForecastLoading(false));
  };

  // Invoices
  const [invoices, setInvoices]             = useState<FinancialInvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Write-offs
  const [writeoffs, setWriteoffs]               = useState<FinancialWriteoffRow[]>([]);
  const [writeoffsLoading, setWriteoffsLoading] = useState(false);
  const [writeoffRevenue, setWriteoffRevenue]   = useState(0);
  const [writeoffDept, setWriteoffDept]         = useState<string>(FOOD_FILTER);
  const woRange = plRange;
  const woCustomRange = plCustomRange;

  // Inventory
  const [inventory, setInventory]               = useState<(FinancialInventoryDoc | PosterInventoryItem)[] | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryDoc, setInventoryDoc]         = useState<FinancialInventoryDoc | null>(null);
  // Poster only — storage.getStorageInventories, a second (doc-based) view
  // alongside the live-balance one above; toggled, not merged, since the
  // two shapes represent genuinely different things (current stock vs. past count events).
  const [inventoryView, setInventoryView] = useState<'live' | 'docs'>('live');
  const [inventoryDocs, setInventoryDocs] = useState<PosterInventoryDoc[]>([]);
  const [inventoryDocsLoading, setInventoryDocsLoading] = useState(false);

  // Cash shifts
  const [cashshifts, setCashshifts]           = useState<CashShiftDoc[]>([]);
  const [cashshiftsLoading, setCashshiftsLoading] = useState(false);

  // GL summary (Учёт tab)
  const [glSummary, setGlSummary]             = useState<GLSummary | null>(null);
  const [glLoading, setGlLoading]             = useState(false);
  // Poster only — own shape, see PosterGLCategory.
  const [glCategories, setGlCategories]       = useState<PosterGLCategory[]>([]);
  const [glCategoriesLoading, setGlCategoriesLoading] = useState(false);

  // Menu analysis
  const [menuRows, setMenuRows]               = useState<MenuAnalysisRow[]>([]);
  const [menuLoading, setMenuLoading]         = useState(false);
  type MenuSortKey = 'revenue' | 'qty' | 'cost' | 'grossProfit' | 'marginPct' | 'foodCostPct';
  const [menuSort, setMenuSort]               = useState<MenuSortKey>('revenue');
  const [menuSortDir, setMenuSortDir]         = useState<'asc' | 'desc'>('desc');
  const [menuCatFilter, setMenuCatFilter]     = useState<string>('all');


  useEffect(() => {
    if (tab === 'pl' && posKnown) {
      if (plRange === 'custom' && !plCustomRange) return;
      setPlLoading(true);
      traceApi.financial.pl(plRange, plCustomRange?.from, plCustomRange?.to)
        .then(data => {
          setPl(data);
          if (onContextReady && data) {
            const fmt = (n: number) => n.toLocaleString('ru-RU');
            const catLines = data.categories?.length
              ? data.categories.map((c: any) => `  ${c.name}: выручка ${fmt(c.revenue)} UZS, себест. ${fmt(c.cogs)} UZS${c.foodCostPct != null ? `, food cost ${c.foodCostPct.toFixed(1)}%` : ''}`).join('\n')
              : '';
            onContextReady(
              `Раздел: Финансы (P&L)\n` +
              `Период: ${plRange}\n` +
              `Выручка: ${fmt(data.revenue)} UZS\n` +
              `Себестоимость (COGS): ${fmt(data.cogs)} UZS\n` +
              `ФОТ: ${data.laborCost > 0 ? fmt(data.laborCost) + ' UZS' : 'н/д'}\n` +
              `Валовая прибыль: ${fmt(data.grossProfit)} UZS\n` +
              `Food cost: ${data.foodCostPct != null ? data.foodCostPct.toFixed(1) + '%' : 'н/д'}\n` +
              `Labor cost: ${data.laborCostPct != null ? data.laborCostPct.toFixed(1) + '%' : 'н/д'}\n` +
              `Рентабельность: ${data.profitPct != null ? data.profitPct.toFixed(1) + '%' : 'н/д'}` +
              (catLines ? `\n\nКатегории:\n${catLines}` : '')
            );
          }
        }).catch(() => setPl(null))
        .finally(() => setPlLoading(false));
    }
  }, [tab, posKnown, plRange, plCustomRange, onContextReady]);

  useEffect(() => {
    if (tab === 'invoices') {
      setInvoicesLoading(true);
      traceApi.financial.invoices(range)
        .then(data => {
          setInvoices(data);
          if (onContextReady && data.length > 0) {
            const fmt = (n: number) => n.toLocaleString('ru-RU');
            const lines = data.slice(0, 15).map(inv => `  ${inv.date} | ${inv.supplier} | ${fmt(inv.amount)} UZS | ${inv.status}`).join('\n');
            const total = data.reduce((s, inv) => s + inv.amount, 0);
            onContextReady(
              `Раздел: Финансы (Поставки)\nПериод: ${range}\nВсего поставок: ${data.length} на сумму ${fmt(total)} UZS\n\nПоследние поставки:\n${lines}`
            );
          }
        }).catch(() => setInvoices([]))
        .finally(() => setInvoicesLoading(false));
    }
  }, [tab, range, onContextReady]);

  useEffect(() => {
    if (tab === 'writeoffs') {
      if (woRange === 'custom' && !woCustomRange) return;
      setWriteoffsLoading(true);
      Promise.all([
        traceApi.financial.writeoffs(woRange, woCustomRange?.from, woCustomRange?.to),
        traceApi.sales.revenue(woRange, woCustomRange?.from, woCustomRange?.to),
      ])
        .then(([wo, rev]) => {
          setWriteoffs(wo);
          setWriteoffDept(FOOD_FILTER);
          const totalRev = rev.reduce((s, r) => s + r.revenue, 0);
          setWriteoffRevenue(totalRev);
          if (onContextReady && wo.length > 0) {
            const fmt = (n: number) => n.toLocaleString('ru-RU');
            const totalWo = wo.reduce((s, r) => s + r.cost, 0);
            const foodWo = wo.filter(isRealFoodWaste).reduce((s, r) => s + r.cost, 0);
            const byDept = new Map<string, { sum: number; isFood: boolean }>();
            for (const w of wo) {
              const e = byDept.get(w.category) ?? { sum: 0, isFood: isRealFoodWaste(w) };
              e.sum += w.cost;
              byDept.set(w.category, e);
            }
            const deptLines = [...byDept.entries()].sort((a, b) => b[1].sum - a[1].sum)
              .map(([dept, { sum, isFood }]) => `  ${dept}${isFood ? '' : ' (не еда)'}: ${fmt(sum)} UZS`).join('\n');
            const woByItem = [...wo].sort((a, b) => b.cost - a.cost).slice(0, 10)
              .map(w => `  ${w.name} [${w.category}]: ${w.qty} ед., ${fmt(w.cost)} UZS (${w.date})`).join('\n');
            onContextReady(
              `Раздел: Финансы (Списания)\nПериод: ${woRange === 'custom' && woCustomRange ? `${woCustomRange.from} – ${woCustomRange.to}` : woRange}\n` +
              `Реальные списания еды: ${fmt(foodWo)} UZS${totalRev > 0 ? ` (${(foodWo / totalRev * 100).toFixed(1)}% от выручки)` : ''}\n` +
              `Всего списаний включая технику/расходники/персонал: ${fmt(totalWo)} UZS\n` +
              `\nПо подразделениям:\n${deptLines}\n` +
              `\nТоп списаний:\n${woByItem}`
            );
          }
        })
        .catch(() => { setWriteoffs([]); setWriteoffRevenue(0); })
        .finally(() => setWriteoffsLoading(false));
    }
  }, [tab, woRange, woCustomRange, onContextReady]);

  useEffect(() => {
    if (tab === 'inventory') {
      setInventoryLoading(true);
      traceApi.financial.inventory(range)
        .then(setInventory).catch(() => setInventory(null))
        .finally(() => setInventoryLoading(false));
    }
  }, [tab, range]);

  useEffect(() => {
    if (tab === 'inventory' && isPoster && inventoryView === 'docs') {
      setInventoryDocsLoading(true);
      traceApi.financial.inventoryDocs()
        .then(setInventoryDocs).catch(() => setInventoryDocs([]))
        .finally(() => setInventoryDocsLoading(false));
    }
  }, [tab, isPoster, inventoryView]);

  useEffect(() => {
    if (tab === 'cashshifts') {
      setCashshiftsLoading(true);
      traceApi.financial.cashshifts(range)
        .then(setCashshifts).catch(() => setCashshifts([]))
        .finally(() => setCashshiftsLoading(false));
    }
    if (tab === 'gl' && isPoster) {
      setGlCategoriesLoading(true);
      traceApi.financial.glCategories(range)
        .then(setGlCategories).catch(() => setGlCategories([]))
        .finally(() => setGlCategoriesLoading(false));
    } else if (tab === 'gl') {
      setGlLoading(true);
      traceApi.financial.glSummary(range)
        .then(setGlSummary).catch(() => setGlSummary(null))
        .finally(() => setGlLoading(false));
    }
    if (tab === 'menu') {
      setMenuLoading(true);
      traceApi.financial.menuAnalysis(range)
        .then(data => {
          setMenuRows(data);
          setMenuCatFilter('all');
          if (onContextReady && data.length) {
            const fmt = (n: number) => n.toLocaleString('ru-RU');
            const top5 = data.slice(0, 5).map(d =>
              `  ${d.name}: выручка ${fmt(d.revenue)}, маржа ${d.marginPct != null ? d.marginPct.toFixed(1) + '%' : 'н/д'}`
            ).join('\n');
            onContextReady(
              `Раздел: Финансы (Анализ меню)\nПериод: ${range}\nВсего блюд: ${data.length}\nТоп-5 по выручке:\n${top5}`
            );
          }
        }).catch(() => setMenuRows([]))
        .finally(() => setMenuLoading(false));
    }
  }, [tab, range, isPoster]);


  // ── Render helpers ──
  const fmtN = (n: number) => Math.round(n).toLocaleString('ru-RU');
  // Value + unit that stays readable for small sums (no "0 млн").
  const amt = (n: number): [string, string] => Math.abs(n) >= 1e6 ? [mln(n), mlnUnit(lang)] : [fmtN(n), sum(lang)];
  const pctOf = (v: number, total: number) => total > 0 ? `${(Math.abs(v) / total * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%` : '—';
  const Strip: React.FC<{ items: [string, React.ReactNode, string?, string?][]; four?: boolean }> = ({ items, four }) => (
    <section className={`strip${four ? ' four' : ''}`}>
      {items.map(([l, v, u, d], i) => <div key={i}><div className="s-l">{l}</div><div className="s-v">{v}{u && <small>{u}</small>}</div>{d && <div className="s-d">{d}</div>}</div>)}
    </section>
  );
  const Loading = () => <div style={{ padding: '8px 0' }}><Skel lines={['w9', 'w9', 'w7', 'w9', 'w5']} /></div>;
  const tag = (s: string) => {
    const u = s.toUpperCase();
    const ok = u === 'ACCEPTED' || u === 'POSTED';
    return <span className={`tag ${ok ? 'ok' : u === 'CREATED' || u === 'NEW' ? 'warn' : ''}`}>{statusLabel(s, lang)}</span>;
  };
  const noCustomTab = tab === 'invoices' || tab === 'inventory' || tab === 'menu';
  const periodSub = (() => {
    const { from, to } = periodDates(period.range, period.custom);
    if (noCustomTab && period.range === 'custom') return tr(lang, 'Этот раздел показывает только 30 дней', 'This tab shows the last 30 days only', 'Bu bo‘lim faqat 30 kunni ko‘rsatadi');
    return period.range === 'today' ? `${tr(lang, 'Сегодня', 'Today', 'Bugun')}, ${dayLabel(to, lang)}` : rangeLabel(from, to, lang);
  })();

  // ── P&L ──
  const plPane = () => {
    if (plLoading && !pl) return <Loading />;
    if (!pl || pl.revenue <= 0) return <p className="rd-empty">{tr(lang, 'Нет данных за период', 'No data for the period', "Davr uchun ma'lumot yo'q")}</p>;
    const gross = pl.revenue - pl.cogs;
    const rev = pl.revenue;
    const steps: [string, number, number, number, string][] = [];
    // [label, value, segStart, segEnd, class] — each cost bites into revenue, ending at net profit.
    steps.push([tr(lang, 'Выручка', 'Revenue', 'Tushum'), rev, 0, rev, 'subtotal']);
    steps.push([tr(lang, 'Себестоимость', 'Cost of goods', 'Tannarx'), -pl.cogs, gross, rev, 'cost']);
    steps.push([tr(lang, 'Валовая маржа', 'Gross margin', 'Yalpi marja'), gross, 0, gross, 'subtotal']);
    let cur = gross;
    const costs: [string, number][] = [
      [tr(lang, 'ФОТ', 'Payroll', 'Ish haqi fondi'), pl.laborCost], [tr(lang, 'Аренда', 'Rent', 'Ijara'), pl.rent],
      [tr(lang, 'Коммунальные', 'Utilities', 'Kommunal'), pl.utilities], [tr(lang, 'Прочие расходы', 'Other costs', 'Boshqa xarajatlar'), pl.otherOpex],
    ];
    for (const [l, v] of costs) if (v > 0) { steps.push([l, -v, Math.max(0, cur - v), Math.max(0, cur), 'cost']); cur -= v; }
    steps.push([tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda'), pl.netProfit, 0, Math.max(0, pl.netProfit), `subtotal net${pl.netProfit < 0 ? ' loss' : ''}`]);
    const lb = pl.laborBreakdown;
    const fot: [string, number][] = lb ? ([
      [tr(lang, 'Оклады и почасовая оплата', 'Salaries and hourly pay', 'Maosh va soatbay'), lb.tariff], [tr(lang, 'Проценты от продаж', 'Sales commission', 'Savdodan foiz'), lb.incentive],
      [tr(lang, 'Бонусы', 'Bonuses', 'Bonuslar'), lb.bonus], [tr(lang, 'Штрафы', 'Penalties', 'Jarimalar'), -lb.penalty],
    ] as [string, number][]).filter(([, v]) => v !== 0) : [];
    const monthly = [...(pl.monthly ?? [])].sort((a, b) => a.month.localeCompare(b.month));
    const fcState: AiState = forecastLoading ? 'loading' : forecast?.fromAI ? 'done' : 'empty';
    const targetLabel = activeTargetMonth ? MONTH_LABEL(activeTargetMonth, lang) : '';
    return <>
      <p className="src">{tr(lang, 'Продажи и проводки iiko за период.', 'iiko sales and ledger entries for the period.', 'Davr uchun iiko savdo va provodkalari.')}</p>
      <Strip items={[
        [tr(lang, 'Выручка', 'Revenue', 'Tushum'), mln(pl.revenue), mlnUnit(lang)],
        [tr(lang, 'Себестоимость', 'Cost of goods', 'Tannarx'), mln(pl.cogs), mlnUnit(lang), pl.foodCostPct != null ? tr(lang, `${pl.foodCostPct}% от выручки`, `${pl.foodCostPct}% of revenue`, `tushumning ${pl.foodCostPct}%`) : undefined],
        ...(pl.laborCost > 0 ? [[tr(lang, 'ФОТ', 'Payroll', 'Ish haqi'), mln(pl.laborCost), mlnUnit(lang), pl.laborCostPct != null ? tr(lang, `${pl.laborCostPct}% от выручки`, `${pl.laborCostPct}% of revenue`, `tushumning ${pl.laborCostPct}%`) : undefined] as [string, React.ReactNode, string?, string?]] : []),
        [tr(lang, 'Валовая маржа', 'Gross margin', 'Yalpi marja'), mln(gross), mlnUnit(lang), tr(lang, `${pctOf(gross, rev)} от выручки`, `${pctOf(gross, rev)} of revenue`, `tushumning ${pctOf(gross, rev)}`)],
        [tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda'), mln(pl.netProfit), mlnUnit(lang), pl.netProfitPct != null ? tr(lang, `${pl.netProfitPct}% рентабельность`, `${pl.netProfitPct}% margin`, `${pl.netProfitPct}% rentabellik`) : undefined],
      ]} />

      <div className="pl-grid" style={fot.length ? undefined : { gridTemplateColumns: '1fr' }}>
        <section className="card-ph" aria-labelledby="h-wf">
          <div className="sec-head"><h2 id="h-wf">{tr(lang, 'Куда уходит выручка', 'Where revenue goes', 'Tushum qayerga ketadi')}</h2></div>
          <table className="wf"><tbody>
            {steps.map(([l, v, a, b, cls], i) => (
              <tr key={i} className={cls}>
                <td className="lbl">{l}</td>
                <td className="bar"><div className="track"><span className="seg" style={{ left: `${a / rev * 100}%`, width: `${Math.max(0, (b - a) / rev * 100)}%` }} /></div></td>
                <td className="amt">{v < 0 ? '−' : ''}{fmtN(Math.abs(v))}</td>
                <td className="pct">{pctOf(v, rev)}</td>
              </tr>
            ))}
          </tbody></table>
          {pl.rent === 0 && pl.utilities === 0 && pl.otherOpex === 0 && <p className="side-note">{tr(lang, 'Аренда и коммунальные не найдены в проводках iiko за период.', 'No rent or utilities found in iiko entries for the period.', 'Davr uchun iiko provodkalarida ijara va kommunal topilmadi.')}</p>}
        </section>
        {fot.length > 0 && (
          <section className="card-ph" aria-labelledby="h-fot">
            <div className="sec-head"><h2 id="h-fot">{tr(lang, 'Из чего состоит ФОТ', 'What payroll is made of', 'Ish haqi fondi tarkibi')}</h2></div>
            <ul className="fot">
              {fot.map(([l, v]) => <li key={l}><span>{l}</span><span>{v < 0 ? '−' : ''}{fmtN(Math.abs(v))}</span></li>)}
              <li className="total"><span>{tr(lang, 'Итого ФОТ', 'Total payroll', 'Jami ish haqi')}</span><span>{fmtN(pl.laborCost)}</span></li>
            </ul>
            {pl.laborCostPct != null && <p className="side-note">{tr(lang, `ФОТ ${pl.laborCostPct}% от выручки. Для кафе и ресторанов обычно 20-30%.`, `Payroll is ${pl.laborCostPct}% of revenue. Cafés and restaurants usually run 20-30%.`, `Ish haqi tushumning ${pl.laborCostPct}%. Odatda 20-30%.`)}</p>}
          </section>
        )}
      </div>

      {monthly.length >= 2 && (
        <section className="fc rise" data-state={fcState} aria-labelledby="h-fc">
          <div className="fc-head">
            <h2 id="h-fc">{tr(lang, 'Прогноз прибыли', 'Profit forecast', 'Foyda prognozi')}</h2>
            {activeTargetMonth && (
              <label className="fc-target">{tr(lang, 'на', 'for', '')} <span className="sel">
                <select value={activeTargetMonth} disabled={forecastLoading} onChange={e => { setForecastMonth(e.target.value); if (forecast?.fromAI) runForecast(e.target.value); }} aria-label={tr(lang, 'Месяц прогноза', 'Forecast month', 'Prognoz oyi')}>
                  {[0, 1, 2].map(k => { const m = lastFullMonthKey ? shiftMonth(lastFullMonthKey, k + 1) : activeTargetMonth; return <option key={m} value={m}>{MONTH_LABEL(m, lang)}</option>; })}
                </select><i className="ph ph-caret-down chev" aria-hidden="true" /></span></label>
            )}
            {fcState === 'done' && <AiMeta lang={lang} when={forecastAt} onRerun={() => runForecast()} />}
          </div>
          <div className="fc-body">
            <div>
              <LineChart bars accentLast={!!(forecast?.fromAI && forecast.forecastRevenue)} labels={[...monthly.map(m => m.label), ...(forecast?.fromAI && forecast.forecastRevenue ? [forecast.nextMonth ?? targetLabel] : [])]}
                cur={[...monthly.map(m => m.revenue / 1e6), ...(forecast?.fromAI && forecast.forecastRevenue ? [forecast.forecastRevenue / 1e6] : [])]}
                curName={tr(lang, 'Выручка', 'Revenue', 'Tushum')} height={220} tip={v => `${mln(v * 1e6)} ${mlnUnit(lang)}`} />
              <div className="chart-key"><span><i />{tr(lang, 'Выручка, факт', 'Revenue, actual', 'Tushum, fakt')}</span>{forecast?.fromAI && <span><i className="f" />{tr(lang, 'Прогноз (последний столбец)', 'Forecast (last bar)', 'Prognoz (oxirgi ustun)')}</span>}</div>
            </div>
            <div>
              {fcState === 'empty' && <div className="st-empty st-col"><p className="ai-desc">{tr(lang, 'Сколько заработаем в выбранном месяце, по тренду за прошлые месяцы, сезону и уже известным расходам.', 'How much the chosen month will earn, from the past months’ trend, season and known costs.', "Tanlangan oyda qancha topamiz: o'tgan oylar trendi, mavsum va ma'lum xarajatlar bo'yicha.")}</p><button className="btn solid" onClick={() => runForecast()}>{tr(lang, 'Сделать прогноз', 'Make a forecast', 'Prognoz qilish')}</button></div>}
              {fcState === 'loading' && <div className="st-loading" aria-live="polite"><p className="ai-wait">{tr(lang, 'Смотрим выручку и расходы по месяцам…', 'Reading revenue and costs by month…', "Oylar bo'yicha tushum va xarajatlarni ko'ryapmiz…")}</p><Skel lines={['w9', 'w7', 'w9', 'w5']} /></div>}
              {fcState === 'done' && forecast && <div className="st-done">
                <div className="s-l">{tr(lang, `Чистая прибыль, ${forecast.nextMonth ?? targetLabel}`, `Net profit, ${forecast.nextMonth ?? targetLabel}`, `Sof foyda, ${forecast.nextMonth ?? targetLabel}`)}</div>
                <div className="fc-num">≈ {forecast.forecastProfit != null ? mln(forecast.forecastProfit) : '—'} {mlnUnit(lang)}<small>{sum(lang)}</small></div>
                <div className="s-d">{forecast.forecastRevenue != null ? tr(lang, `выручка ≈ ${mln(forecast.forecastRevenue)} млн`, `revenue ≈ ${mln(forecast.forecastRevenue)}M`, `tushum ≈ ${mln(forecast.forecastRevenue)} mln`) : ''}{forecast.forecastProfitPct != null ? tr(lang, `, рентабельность ${forecast.forecastProfitPct.toFixed(1)}%`, `, margin ${forecast.forecastProfitPct.toFixed(1)}%`, `, rentabellik ${forecast.forecastProfitPct.toFixed(1)}%`) : ''}</div>
                {forecast.reasoning && <><h3>{tr(lang, 'Почему так', 'Why', 'Nega')}</h3><p>{forecast.reasoning}</p></>}
                {forecast.risks && <><h3>{tr(lang, 'Риски', 'Risks', 'Xavflar')}</h3><p>{forecast.risks}</p></>}
              </div>}
            </div>
          </div>
        </section>
      )}

      {pl.categories?.length > 0 && (
        <section className="block card-ph" style={{ marginTop: 44 }} aria-labelledby="h-fcc">
          <div className="sec-head"><h2 id="h-fcc">{tr(lang, 'Фудкост по категориям', 'Food cost by category', "Kategoriyalar bo'yicha fudkost")}</h2></div>
          <table className="dt">
            <thead><tr><th>{tr(lang, 'Категория', 'Category', 'Kategoriya')}</th><th className="r">{tr(lang, 'Выручка', 'Revenue', 'Tushum')}</th><th className="r hide-sm">{tr(lang, 'Себестоимость', 'Cost', 'Tannarx')}</th><th className="r hide-sm">{tr(lang, 'Маржа', 'Margin', 'Marja')}</th><th className="r">{tr(lang, 'Фудкост', 'Food cost', 'Fudkost')}</th></tr></thead>
            <tbody>{pl.categories.map(c => (
              <tr key={c.name}><td className="strong">{c.name}</td><td className="r">{fmtN(c.revenue)}</td><td className="r hide-sm">{c.cogs > 0 ? fmtN(c.cogs) : '—'}</td><td className="r hide-sm">{c.cogs > 0 ? fmtN(c.revenue - c.cogs) : '—'}</td>
                <td className={`r ${c.foodCostPct != null && c.foodCostPct > 35 ? 'hi-bad' : ''}`}>{c.foodCostPct != null ? `${c.foodCostPct.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%` : '—'}</td></tr>
            ))}</tbody>
          </table>
          {pl.cogs > pl.categories.reduce((a, c) => a + c.cogs, 0) + 1 && <p className="foot"><span>{tr(lang, `Ещё ${mln(pl.cogs - pl.categories.reduce((a, c) => a + c.cogs, 0))} млн себестоимости без категории: питание персонала и проработки.`, `Another ${mln(pl.cogs - pl.categories.reduce((a, c) => a + c.cogs, 0))}M of cost has no category: staff meals and test dishes.`, `Yana ${mln(pl.cogs - pl.categories.reduce((a, c) => a + c.cogs, 0))} mln tannarx kategoriyasiz.`)}</span></p>}
        </section>
      )}
    </>;
  };

  // ── Menu analysis ──
  const menuPane = () => {
    if (menuLoading) return <Loading />;
    if (!menuRows.length) return <p className="rd-empty">{tr(lang, 'Нет данных за период', 'No data for the period', "Davr uchun ma'lumot yo'q")}</p>;
    const cats = ['all', ...Array.from(new Set(menuRows.map(r => r.category))).sort()];
    const filtered = menuCatFilter === 'all' ? menuRows : menuRows.filter(r => r.category === menuCatFilter);
    const sorted = [...filtered].sort((a, b) => { const av = (a[menuSort] ?? 0) as number, bv = (b[menuSort] ?? 0) as number; return menuSortDir === 'desc' ? bv - av : av - bv; });
    const totRev = menuRows.reduce((s, r) => s + r.revenue, 0), totCost = menuRows.reduce((s, r) => s + r.cost, 0), totGp = menuRows.reduce((s, r) => s + r.grossProfit, 0);
    const fcOf = (r: MenuAnalysisRow) => r.revenue > 0 && r.cost > 0 ? r.cost / r.revenue * 100 : null;
    const over = menuRows.filter(r => (fcOf(r) ?? 0) > 35).length;
    const th = (k: typeof menuSort, l: string, cls = '') => (
      <th className={cls} aria-sort={menuSort === k ? (menuSortDir === 'desc' ? 'descending' : 'ascending') : undefined} style={{ cursor: 'pointer' }}
        onClick={() => { if (menuSort === k) setMenuSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setMenuSort(k); setMenuSortDir('desc'); } }}>{l}{menuSort === k ? (menuSortDir === 'desc' ? ' ↓' : ' ↑') : ''}</th>
    );
    return <>
      <Strip four items={[
        [tr(lang, 'Позиций в продаже', 'Items sold', 'Sotilgan pozitsiyalar'), String(menuRows.length), '', filtered.length !== menuRows.length ? tr(lang, `${filtered.length} показано ниже`, `${filtered.length} shown below`, `${filtered.length} ta pastda`) : undefined],
        [tr(lang, 'Средняя маржа', 'Average margin', "O'rtacha marja"), totRev > 0 ? (totGp / totRev * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : '—', '%', tr(lang, 'по выручке', 'by revenue', "tushum bo'yicha")],
        [tr(lang, 'Фудкост меню', 'Menu food cost', 'Menyu fudkosti'), totRev > 0 && totCost > 0 ? (totCost / totRev * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : '—', '%', tr(lang, 'норма до 28%', 'target under 28%', 'meʼyor 28% gacha')],
        [tr(lang, 'Выше нормы', 'Over target', "Me'yordan yuqori"), String(over), tr(lang, 'позиций', 'items', 'pozitsiya'), tr(lang, 'фудкост больше 35%', 'food cost over 35%', 'fudkost 35% dan yuqori')],
      ]} />
      <section className="block card-ph" style={{ marginTop: 36 }} aria-labelledby="h-mt">
        <div className="sec-head"><h2 id="h-mt">{tr(lang, 'Маржа по блюдам', 'Margin by dish', "Taomlar bo'yicha marja")}</h2>{onNavigate && <a className="link" href="?view=sales" onClick={e => { e.preventDefault(); onNavigate('sales'); }}>{tr(lang, 'ABC-анализ в Продажах', 'ABC analysis in Sales', 'Savdoda ABC tahlil')}</a>}</div>
        <div className="tools"><span className="sel"><select value={menuCatFilter} onChange={e => setMenuCatFilter(e.target.value)} aria-label={tr(lang, 'Категория', 'Category', 'Kategoriya')}>
          {cats.map(c => <option key={c} value={c}>{c === 'all' ? tr(lang, 'Все категории', 'All categories', 'Barcha kategoriyalar') : c}</option>)}
        </select><i className="ph ph-caret-down chev" aria-hidden="true" /></span></div>
        <table className="dt">
          <thead><tr><th>{tr(lang, 'Блюдо', 'Dish', 'Taom')}</th><th className="hide-md">{tr(lang, 'Категория', 'Category', 'Kategoriya')}</th>
            {th('qty', tr(lang, 'Продано', 'Sold', 'Sotildi'), 'r hide-sm')}{th('revenue', tr(lang, 'Выручка', 'Revenue', 'Tushum'), 'r')}{th('cost', tr(lang, 'Себест.', 'Cost', 'Tannarx'), 'r hide-sm')}
            {th('foodCostPct' as any, tr(lang, 'Фудкост', 'Food cost', 'Fudkost'), 'r')}{th('grossProfit', tr(lang, 'Вал. прибыль', 'Gross profit', 'Yalpi foyda'), 'r hide-sm')}{th('marginPct', tr(lang, 'Маржа', 'Margin', 'Marja'), 'r hide-md')}</tr></thead>
          <tbody>{(menuSort === ('foodCostPct' as any) ? [...filtered].sort((a, b) => ((fcOf(b) ?? -1) - (fcOf(a) ?? -1)) * (menuSortDir === 'desc' ? 1 : -1)) : sorted).map((r, i) => {
            const fc = fcOf(r);
            return (
              <tr key={`${r.name}-${i}`}><td className="strong">{r.name}</td><td className="hide-md muted">{r.category}</td><td className="r hide-sm">{fmtN(r.qty)}</td><td className="r">{fmtN(r.revenue)}</td>
                <td className="r hide-sm">{r.cost > 0 ? fmtN(r.cost) : '—'}</td><td className={`r ${fc != null && fc > 35 ? 'hi-bad' : ''}`}>{fc != null ? `${Math.round(fc)}%` : '—'}</td>
                <td className="r hide-sm">{r.grossProfit > 0 ? fmtN(r.grossProfit) : '—'}</td><td className="r hide-md">{r.marginPct != null ? `${Math.round(r.marginPct)}%` : '—'}</td></tr>
            );
          })}</tbody>
        </table>
      </section>
    </>;
  };

  // ── Invoices ──
  const invPane = () => {
    if (invoicesLoading) return <Loading />;
    if (!invoices.length) return <p className="rd-empty">{tr(lang, 'Накладных за период нет', 'No invoices for the period', "Davr uchun hisob-fakturalar yo'q")}</p>;
    const total = invoices.reduce((s, i) => s + i.amount, 0);
    const bySup = new Map<string, number>(); for (const i of invoices) bySup.set(i.supplier, (bySup.get(i.supplier) ?? 0) + i.amount);
    const top = [...bySup.entries()].sort((a, b) => b[1] - a[1])[0];
    const drafts = invoices.filter(i => { const u = i.status.toUpperCase(); return u === 'CREATED' || u === 'NEW'; });
    return <>
      <Strip four items={[
        [tr(lang, 'Накладных', 'Invoices', 'Hisob-fakturalar'), String(invoices.length), '', periodSub],
        [tr(lang, 'На сумму', 'Total', 'Jami'), amt(total)[0], amt(total)[1]],
        [tr(lang, 'Крупнейший поставщик', 'Largest supplier', "Eng yirik ta'minotchi"), top?.[0] ?? '—', '', top ? amt(top[1]).join(' ') : undefined],
        [tr(lang, 'Не проведены', 'Not posted', "O'tkazilmagan"), String(drafts.length), '', drafts.length ? `${tr(lang, 'на', 'worth', '')} ${amt(drafts.reduce((s, d) => s + d.amount, 0)).join(' ')}` : undefined],
      ]} />
      <section className="block card-ph" style={{ marginTop: 36 }} aria-labelledby="h-inv">
        <div className="sec-head"><h2 id="h-inv">{tr(lang, 'Приходные накладные', 'Supply invoices', 'Kirim hisob-fakturalari')}</h2><span className="faint" style={{ fontSize: 13 }}>{isPoster ? 'Poster' : tr(lang, 'из iikoServer', 'from iikoServer', 'iikoServer dan')}</span></div>
        <table className="dt">
          <thead><tr><th>{tr(lang, 'Дата', 'Date', 'Sana')}</th><th className="hide-sm">{tr(lang, 'Номер', 'Number', 'Raqam')}</th><th>{tr(lang, 'Поставщик', 'Supplier', "Ta'minotchi")}</th><th className="r">{tr(lang, 'Сумма', 'Amount', 'Summa')}</th><th>{tr(lang, 'Статус', 'Status', 'Holat')}</th></tr></thead>
          <tbody>{invoices.map(inv => (
            <tr key={inv.id}><td>{inv.date}</td><td className="hide-sm mono">{inv.id.replace(/^\d{4}-\d{2}-\d{2}-/, '')}</td><td className="strong">{inv.supplier}</td><td className="r">{fmtN(inv.amount)}</td><td>{tag(inv.status)}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </>;
  };

  // ── Write-offs ──
  const wastePane = () => {
    if (writeoffsLoading) return <Loading />;
    if (!writeoffs.length) return <p className="rd-empty">{tr(lang, 'Списаний за период нет', 'No write-offs for the period', "Davr uchun hisobdan chiqarishlar yo'q")}</p>;
    const food = writeoffs.filter(isRealFoodWaste);
    const foodTotal = food.reduce((s, w) => s + w.cost, 0);
    const { from, to } = periodDates(period.range, period.custom);
    const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
    const wpct = writeoffRevenue > 0 ? foodTotal / writeoffRevenue * 100 : null;
    const save = wpct != null && wpct > WASTE_BENCHMARK ? (wpct - WASTE_BENCHMARK) / 100 * writeoffRevenue * (30 / days) : null;
    const grouped = new Map<string, number>(); for (const w of food) grouped.set(w.name, (grouped.get(w.name) ?? 0) + w.cost);
    const topW = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const depts = [...new Set(writeoffs.map(w => w.category))];
    const rows = writeoffs.filter(w => writeoffDept === '__all__' ? true : writeoffDept === FOOD_FILTER ? isRealFoodWaste(w) : w.category === writeoffDept);
    return <>
      <section className="waste" aria-label={tr(lang, 'Списания еды', 'Food write-offs', 'Oziq-ovqat chiqimlari')}>
        <div><div className="s-l">{tr(lang, 'Списано еды', 'Food written off', 'Chiqarilgan oziq-ovqat')}</div><div className="s-v">{amt(foodTotal)[0]}<small>{amt(foodTotal)[1]}</small></div><div className="s-d">{periodSub}</div></div>
        <div><div className="s-l">{tr(lang, 'Доля от выручки', 'Share of revenue', 'Tushumdagi ulush')}</div><div className="s-v">{wpct != null ? wpct.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : '—'}<small>%</small></div><div className="s-d">{tr(lang, `норма ${WASTE_BENCHMARK}%`, `benchmark ${WASTE_BENCHMARK}%`, `meʼyor ${WASTE_BENCHMARK}%`)}</div>
          {wpct != null && <span className="bench" aria-hidden="true"><b style={{ width: `${Math.min(100, wpct / (WASTE_BENCHMARK * 2) * 100)}%` }} /><i style={{ left: '50%' }} /></span>}</div>
        <div><div className="s-l">{tr(lang, 'Можно сэкономить', 'Could save', 'Tejash mumkin')}</div><div className="s-v">{save != null ? amt(save)[0] : '0'}<small>{save != null ? amt(save)[1] : sum(lang)} / {tr(lang, 'мес', 'mo', 'oy')}</small></div><div className="s-d">{save != null ? tr(lang, `если выйти на ${WASTE_BENCHMARK}%`, `at ${WASTE_BENCHMARK}%`, `${WASTE_BENCHMARK}% ga chiqilsa`) : tr(lang, 'списания в норме', 'within benchmark', "me'yorda")}</div></div>
        <div><div className="s-l">{tr(lang, 'Больше всего списываем', 'Written off most', "Eng ko'p chiqariladi")}</div><ol>{topW.map(([n, c]) => <li key={n}>{n} <span>{amt(c).join(' ')}</span></li>)}</ol></div>
      </section>
      <section className="block card-ph" aria-labelledby="h-acts">
        <div className="sec-head"><h2 id="h-acts">{tr(lang, 'Акты списания', 'Write-off documents', 'Hisobdan chiqarish hujjatlari')}</h2>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="seg small" role="group" aria-label={tr(lang, 'Что показать', 'What to show', "Nimani ko'rsatish")}>
              <button aria-pressed={writeoffDept === FOOD_FILTER} onClick={() => setWriteoffDept(FOOD_FILTER)}>{tr(lang, 'Только еда', 'Food only', 'Faqat oziq-ovqat')}</button>
              <button aria-pressed={writeoffDept === '__all__'} onClick={() => setWriteoffDept('__all__')}>{tr(lang, 'Всё', 'All', 'Hammasi')}</button>
            </span>
            {depts.length > 1 && <span className="sel"><select value={depts.includes(writeoffDept) ? writeoffDept : ''} onChange={e => setWriteoffDept(e.target.value || FOOD_FILTER)} aria-label={tr(lang, 'Подразделение', 'Department', "Bo'lim")}>
              <option value="">{tr(lang, 'Подразделение…', 'Department…', "Bo'lim…")}</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select><i className="ph ph-caret-down chev" aria-hidden="true" /></span>}
          </span>
        </div>
        <table className="dt">
          <thead><tr><th className="hide-sm">{tr(lang, 'Акт', 'Doc', 'Hujjat')}</th><th>{tr(lang, 'Дата', 'Date', 'Sana')}</th><th className="hide-sm">{tr(lang, 'Где', 'Where', 'Qayerda')}</th><th>{tr(lang, 'Позиция', 'Item', 'Pozitsiya')}</th><th className="r">{tr(lang, 'Кол-во', 'Qty', 'Miqdor')}</th><th className="r">{tr(lang, 'Себест.', 'Cost', 'Tannarx')}</th></tr></thead>
          <tbody>{rows.map(w => (
            <tr key={w.id}><td className="hide-sm mono">{w.docNumber || '—'}</td><td>{w.date}</td><td className="hide-sm muted">{w.category}</td><td className="strong">{w.name}</td><td className="r">{w.qty}</td><td className="r">{fmtN(w.cost)}</td></tr>
          ))}</tbody>
        </table>
        <p className="foot"><span>{tr(lang, `Итого ${fmtN(rows.reduce((s, w) => s + w.cost, 0))} · ${rows.length} позиций.`, `Total ${fmtN(rows.reduce((s, w) => s + w.cost, 0))} · ${rows.length} items.`, `Jami ${fmtN(rows.reduce((s, w) => s + w.cost, 0))} · ${rows.length} pozitsiya.`)} {writeoffDept === FOOD_FILTER ? tr(lang, 'Посуда, хозтовары и питание персонала скрыты: это не порча продуктов.', 'Tableware, supplies and staff meals are hidden: they are not spoilage.', "Idish, xo'jalik mollari va xodimlar ovqati yashirilgan.") : ''}</span></p>
      </section>
    </>;
  };

  // ── Inventory ──
  const stockPane = () => (
    <section className="block card-ph" aria-labelledby="h-stock">
      <div className="sec-head"><h2 id="h-stock">{tr(lang, 'Склад', 'Stock', 'Ombor')}</h2>
        <span className="seg small" role="group" aria-label={tr(lang, 'Что показать', 'What to show', "Nimani ko'rsatish")}>
          <button aria-pressed={inventoryView === 'live'} onClick={() => setInventoryView('live')}>{tr(lang, 'Остатки сейчас', 'Stock now', 'Hozirgi qoldiq')}</button>
          <button aria-pressed={inventoryView === 'docs'} onClick={() => setInventoryView('docs')}>{isPoster ? tr(lang, 'Архив', 'History', 'Arxiv') : tr(lang, 'Инвентаризации', 'Stocktakes', 'Inventarizatsiyalar')}</button>
        </span>
      </div>
      {!isPoster && inventoryView === 'docs' && inventory && inventory.length > 0 && <p className="src" style={{ margin: '-6px 0 14px' }}>{tr(lang, 'Недостачи и излишки по каждой инвентаризации. Нажмите на строку, чтобы увидеть позиции.', 'Shortages and surpluses per stocktake. Click a row to see items.', "Har bir inventarizatsiya bo'yicha kamomad va ortiqcha. Pozitsiyalar uchun qatorni bosing.")}</p>}
      {!isPoster && inventoryView === 'live' ? <IikoStock lang={lang} /> : isPoster && inventoryView === 'docs' ? (inventoryDocsLoading ? <Loading /> : !inventoryDocs.length ? <p className="rd-empty">{tr(lang, 'Инвентаризаций не найдено', 'No stocktakes found', 'Inventarizatsiya topilmadi')}</p> : (
        <table className="dt"><thead><tr><th>{tr(lang, 'Склад', 'Storage', 'Ombor')}</th><th>{tr(lang, 'Начало', 'Started', 'Boshlandi')}</th><th className="hide-sm">{tr(lang, 'Окончание', 'Ended', 'Tugadi')}</th><th className="r">{tr(lang, 'Сумма', 'Amount', 'Summa')}</th><th className="hide-sm">{tr(lang, 'Статус', 'Status', 'Holat')}</th></tr></thead>
          <tbody>{inventoryDocs.map(d => <tr key={d.id}><td className="strong">{d.storageName}</td><td>{d.dateStart}</td><td className="hide-sm">{d.dateEnd}</td><td className="r">{fmtN(d.sum)}</td><td className="hide-sm muted">{d.status}</td></tr>)}</tbody></table>
      )) : inventoryLoading ? <Loading /> : !inventory || !inventory.length ? <p className="rd-empty">{isPoster ? tr(lang, 'Нет данных об остатках', 'No stock data', "Qoldiq ma'lumotlari yo'q") : tr(lang, 'Документов инвентаризации за период нет', 'No stocktake documents for the period', 'Davr uchun hujjatlar yoʻq')}</p>
        : isPoster ? (
          <table className="dt"><thead><tr><th>{tr(lang, 'Позиция', 'Item', 'Pozitsiya')}</th><th className="r">{tr(lang, 'Остаток', 'On hand', 'Qoldiq')}</th><th className="r hide-sm">{tr(lang, 'Цена за ед.', 'Unit cost', 'Birlik narxi')}</th><th className="r">{tr(lang, 'Стоимость', 'Value', 'Qiymat')}</th></tr></thead>
            <tbody>{inventory.filter(isPosterInventoryItem).map(i => <tr key={i.id}><td className="strong">{i.name}</td><td className="r">{i.qty.toLocaleString('ru-RU')} {i.unit}</td><td className="r hide-sm">{fmtN(i.unitCost)}</td><td className="r">{fmtN(i.totalValue)}</td></tr>)}</tbody></table>
        ) : (
          <div className="rd-legacy-block">
            <StocktakeList docs={inventory.filter((d): d is FinancialInventoryDoc => !isPosterInventoryItem(d))} lang={lang} onOpen={setInventoryDoc} />
          </div>
        )}
    </section>
  );

  // ── Cash shifts ──
  const shiftsPane = () => {
    if (cashshiftsLoading) return <Loading />;
    if (!cashshifts.length) return <p className="rd-empty">{tr(lang, 'Смен за период нет', 'No shifts for the period', "Davr uchun smenalar yo'q")}</p>;
    const withDiff = cashshifts.filter(s => s.cashDiff != null && s.cashDiff !== 0);
    const tot = cashshifts.reduce((s, c) => s + c.payOrders, 0), cash = cashshifts.reduce((s, c) => s + c.salesCash, 0);
    const unacc = cashshifts.filter(s => s.sessionStatus === 'UNACCEPTED' || s.sessionStatus === 'HASWARNINGS');
    const stLabel = (s: string) => s === 'ACCEPTED' ? tr(lang, 'Принята', 'Accepted', 'Qabul qilingan') : s === 'OPEN' ? tr(lang, 'Открыта', 'Open', 'Ochiq') : s === 'CLOSED' ? tr(lang, 'Закрыта', 'Closed', 'Yopiq') : s === 'UNACCEPTED' ? tr(lang, 'Не принята', 'Not accepted', 'Qabul qilinmagan') : s === 'HASWARNINGS' ? tr(lang, 'Есть замечания', 'Has warnings', 'Ogohlantirish bor') : s;
    return <>
      <Strip four items={[
        [tr(lang, 'Смен', 'Shifts', 'Smenalar'), String(cashshifts.length), '', periodSub],
        [tr(lang, 'С расхождением', 'With a discrepancy', 'Farq bilan'), String(withDiff.length), '', withDiff.length ? `${tr(lang, 'на', 'worth', '')} ${fmtN(withDiff.reduce((s, c) => s + (c.cashDiff ?? 0), 0))}` : undefined],
        [tr(lang, 'Наличными', 'Cash share', 'Naqd ulushi'), tot > 0 ? (cash / tot * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : '—', '%', tr(lang, 'от выручки', 'of revenue', 'tushumdan')],
        [tr(lang, 'Не приняты', 'Not accepted', 'Qabul qilinmagan'), String(unacc.length), '', unacc[0]?.openDate ?? undefined],
      ]} />
      <section className="block card-ph" style={{ marginTop: 36 }} aria-labelledby="h-sh">
        <div className="sec-head"><h2 id="h-sh">{tr(lang, 'Кассовые смены', 'Cash shifts', 'Kassa smenalari')}</h2></div>
        <table className="dt">
          <thead><tr><th>{tr(lang, 'Смена', 'Shift', 'Smena')}</th><th className="hide-sm">{tr(lang, 'Время', 'Time', 'Vaqt')}</th><th className="r hide-sm">{tr(lang, 'Наличные', 'Cash', 'Naqd')}</th><th className="r hide-sm">{tr(lang, 'Карта', 'Card', 'Karta')}</th><th className="r">{tr(lang, 'Выручка', 'Revenue', 'Tushum')}</th><th className="r">{tr(lang, 'Расхождение', 'Discrepancy', 'Farq')}</th><th className="hide-sm">{tr(lang, 'Статус', 'Status', 'Holat')}</th></tr></thead>
          <tbody>{cashshifts.map(s => (
            <tr key={s.id}><td className="strong">№{s.sessionNumber}</td><td className="hide-sm muted">{s.openDate ?? '—'} – {s.closeDate ?? tr(lang, 'идёт', 'running', 'davom etmoqda')}</td>
              <td className="r hide-sm">{fmtN(s.salesCash)}</td><td className="r hide-sm">{fmtN(s.salesCard)}</td><td className="r">{fmtN(s.payOrders)}</td>
              <td className={`r ${(s.cashDiff ?? 0) < 0 ? 'neg' : ''}`}>{s.cashDiff == null ? '—' : s.cashDiff === 0 ? tr(lang, 'нет', 'none', "yo'q") : `${s.cashDiff < 0 ? '−' : '+'}${fmtN(Math.abs(s.cashDiff))}`}{Math.abs(s.cashDiff ?? 0) >= 80000 && <span className="flag">{tr(lang, 'проверить', 'check', 'tekshirish')}</span>}</td>
              <td className="hide-sm"><span className={`tag ${s.sessionStatus === 'ACCEPTED' ? 'ok' : s.sessionStatus === 'UNACCEPTED' || s.sessionStatus === 'HASWARNINGS' ? 'warn' : ''}`}>{stLabel(s.sessionStatus)}</span></td></tr>
          ))}</tbody>
        </table>
      </section>
    </>;
  };

  // ── General ledger ──
  const glPane = () => {
    if (isPoster) {
      if (glCategoriesLoading) return <Loading />;
      return (
        <section className="block card-ph" aria-labelledby="h-glc">
          <div className="sec-head"><h2 id="h-glc">{tr(lang, 'Доходы и расходы по категориям', 'Income and expenses by category', "Toifalar bo'yicha daromad va xarajat")}</h2><span className="faint" style={{ fontSize: 13 }}>Poster</span></div>
          {!glCategories.length ? <p className="rd-empty">{tr(lang, 'Нет данных за период', 'No data for the period', "Davr uchun ma'lumot yo'q")}</p> : (
            <ul className="kv">{glCategories.map((c, i) => <li key={i}><span style={{ paddingLeft: c.level * 16 }}>{c.name}</span><span className={c.amount < 0 ? 'neg' : ''}>{c.amount < 0 ? '−' : ''}{fmtN(Math.abs(c.amount))}</span></li>)}</ul>
          )}
        </section>
      );
    }
    if (glLoading) return <Loading />;
    if (!glSummary) return <p className="rd-empty">{tr(lang, 'Нет данных за период', 'No data for the period', "Davr uchun ma'lumot yo'q")}</p>;
    const g = glSummary;
    return <>
      <p className="src">{tr(lang, 'Проводки iiko (General Ledger) за период.', 'iiko ledger entries (General Ledger) for the period.', 'Davr uchun iiko provodkalari.')}</p>
      <div className="gl">
        <section className="card-ph" aria-labelledby="h-inc">
          <div className="sec-head"><h2 id="h-inc">{tr(lang, 'Доходы', 'Income', 'Daromadlar')}</h2></div>
          <ul className="kv">
            {g.income.lines.map(l => <li key={l.name}><span>{l.name}</span><span>{fmtN(l.amount)}</span></li>)}
            {g.income.discounts > 0 && <li className="muted-row"><span>{tr(lang, 'Скидки (не входят в итог)', 'Discounts (not in total)', 'Chegirmalar (jamiga kirmaydi)')}</span><span>−{fmtN(g.income.discounts)}</span></li>}
            <li className="total"><span>{tr(lang, 'Итого доходы', 'Total income', 'Jami daromad')}</span><span>{fmtN(g.income.total)}</span></li>
          </ul>
        </section>
        <section className="card-ph" aria-labelledby="h-ap">
          <div className="sec-head"><h2 id="h-ap">{tr(lang, 'Долг поставщикам', 'Owed to suppliers', "Ta'minotchilarga qarz")}</h2></div>
          <ul className="kv">
            <li><span>{tr(lang, 'Новые накладные', 'New invoices', 'Yangi hisob-fakturalar')}</span><span>+ {fmtN(g.payables.invoiced)}</span></li>
            <li><span>{tr(lang, 'Оплачено', 'Paid', "To'langan")}</span><span>− {fmtN(g.payables.paid)}</span></li>
            <li className="total"><span>{tr(lang, 'Изменение долга', 'Change in debt', "Qarz o'zgarishi")}</span><span>{g.payables.netChange > 0 ? '+' : g.payables.netChange < 0 ? '−' : ''}{fmtN(Math.abs(g.payables.netChange))}</span></li>
          </ul>
          <p className={`debt-note ${g.payables.netChange < 0 ? 'neg' : ''}`}>{g.payables.netChange < 0 ? tr(lang, 'Долг перед поставщиками вырос за период.', 'Debt to suppliers grew this period.', "Ta'minotchilarga qarz o'sdi.") : tr(lang, 'Долг перед поставщиками снизился за период.', 'Debt to suppliers went down this period.', "Ta'minotchilarga qarz kamaydi.")}</p>
        </section>
        <section className="card-ph" aria-labelledby="h-tax">
          <div className="sec-head"><h2 id="h-tax">{tr(lang, 'Налоги', 'Taxes', 'Soliqlar')}</h2></div>
          {!g.taxes.lines.length ? <p className="rd-empty">{tr(lang, 'Налоги не найдены в проводках за период', 'No taxes in the entries for the period', 'Davr uchun soliqlar topilmadi')}</p> : (
            <ul className="kv">
              {g.taxes.lines.map(t => <li key={t.name}><span>{t.name}</span><span>{fmtN(t.amount)}</span></li>)}
              <li className="total"><span>{tr(lang, 'Итого налоги', 'Total taxes', 'Jami soliqlar')}</span><span>{fmtN(g.taxes.total)}</span></li>
            </ul>
          )}
          {g.taxes.total > 0 && g.income.total > 0 && <p className="side-note">{tr(lang, `${(g.taxes.total / g.income.total * 100).toFixed(1)}% от доходов.`, `${(g.taxes.total / g.income.total * 100).toFixed(1)}% of income.`, `daromadning ${(g.taxes.total / g.income.total * 100).toFixed(1)}%.`)}</p>}
        </section>
        <section className="card-ph" aria-labelledby="h-cashacc">
          <div className="sec-head"><h2 id="h-cashacc">{tr(lang, 'Кассы и счета', 'Tills and accounts', 'Kassalar va hisoblar')}</h2></div>
          {!g.cashPositions.length ? <p className="rd-empty">{tr(lang, 'Нет данных', 'No data', "Ma'lumot yo'q")}</p> : (
            <table className="dt">
              <thead><tr><th>{tr(lang, 'Счёт', 'Account', 'Hisob')}</th><th className="r">{tr(lang, 'Приход', 'In', 'Kirim')}</th><th className="r">{tr(lang, 'Расход', 'Out', 'Chiqim')}</th><th className="r">{tr(lang, 'Итого', 'Net', 'Natija')}</th></tr></thead>
              <tbody>{g.cashPositions.map(c => <tr key={c.account}><td className="strong">{c.account}</td><td className="r">{fmtN(c.incoming)}</td><td className="r">{fmtN(c.outgoing)}</td><td className={`r ${c.net < 0 ? 'neg' : ''}`}>{c.net < 0 ? '−' : '+'}{fmtN(Math.abs(c.net))}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      </div>
    </>;
  };

  const panes: Record<Tab, () => React.ReactNode> = { pl: plPane, menu: menuPane, invoices: invPane, writeoffs: wastePane, inventory: stockPane, cashshifts: shiftsPane, gl: glPane };

  return (
    <>
      <div className="page-head rise">
        <div>
          <h1>{tr(lang, 'Финансы', 'Finance', 'Moliya')}</h1>
          <div className="sub"><span>{periodSub}</span></div>
        </div>
        <PeriodSeg lang={lang} value={period} onChange={setPeriod} allowCustom={!noCustomTab} />
      </div>

      <nav className="tabs rise" role="tablist" aria-label={tr(lang, 'Разделы финансов', 'Finance sections', "Moliya bo'limlari")} style={{ animationDelay: '.04s' }}>
        {TABS.map(({ key, label }) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </nav>

      <div className="pane rise" role="tabpanel" style={{ animationDelay: '.08s' }} key={tab}>
        {!posKnown ? <Loading /> : panes[tab]()}
      </div>

      {inventoryDoc && <StocktakeDrawer doc={inventoryDoc} lang={lang} onClose={() => setInventoryDoc(null)} />}
    </>
  );
};

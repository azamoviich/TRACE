// Операции — redesigned per TRACE-mockups/operations.html (Oct 2026).
// Styles: styles/rd/ops.css (scoped .rd-ops).
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Card } from '../ui/Card';
import { AIInsightCard } from '../ui/AIInsightCard';
import { PLUGIN_ENABLED } from '../ui/ComingSoon';
import { useOccupiedTables } from '../../hooks/useOccupiedTables';
import { Language } from '../../types';
import { TRANSLATIONS, tr, formatMinutes, formatMinutesShort } from '../../constants';
import { useRealtimeData, RealtimeEvent, StopListUpdateData, PosterWebhookData } from '../../hooks/useRealtimeData';
import { Clock, Trash2, Users, CreditCard, Banknote, AlertTriangle, CheckCircle, Timer, X, Plug, Radio, ChefHat, CalendarClock, Bell, TrendingDown, TrendingUp, Zap, Sparkles, ChevronRight, FileDown, FileSpreadsheet, Send, Calendar as CalendarIcon, Crown, Receipt, Grid2x2, Wallet } from 'lucide-react';
import { DateRangePicker } from '../ui/DateRangePicker';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { traceApi, CashShift, OpsKpis, StaffRow, StopItem, HallPlan, HallElement, isDemoTenant, demoActiveOrders, OpsAlert, VoidEvent, getTenantPlan, ShiftScheduleDay, StaffAbcRow, BranchSummary, ActiveOrderRow, ReservationRow, StaffProfitabilityRow, bookingApi, StaffReservation } from '../../services/traceApi';
import { ViewState } from '../../types';
import { HallEditor } from '../HallEditor';
import { ProLock } from '../ui/ProLock';
import { Skel, rangeLabel, nowHM, AiState, ruPl } from '../rd/ui';
import { Trio, TrioTile } from '../rd/Trio';
import { SlotText } from '../ui/SlotNumber';
import { tashkentDateStr } from '../../utils/tz';

// ── Hall floor plan ───────────────────────────────────────────────────────

// Hours between two "HH:00"-ish clock strings, wrapping past midnight if
// end <= start (an overnight shift like 20:00-02:00).
function hoursBetween(start: string, end: string): number {
  const toH = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) + (m || 0) / 60; };
  const a = toH(start), b = toH(end);
  return b <= a ? (b + 24) - a : b - a;
}

// Matrix layout — waiter rows × day columns — matches how a printed shift
// schedule is normally read (one glance per person's whole week), instead
// of a flat list of day→slot rows a manager has to cross-reference by name.
function downloadShiftScheduleExcel(
  schedule: ShiftScheduleDay[],
  summary: string | undefined,
  lang: Language,
) {
  const days = schedule.map(d => d.day);
  const waiterNames = [...new Set(schedule.flatMap(d => d.assignments.map(a => a.waiter)))];
  const cellShifts = new Map<string, { start: string; end: string }[]>();
  const totalHours = new Map<string, number>();
  for (const d of schedule) {
    for (const a of d.assignments) {
      const key = `${a.waiter}|${d.day}`;
      if (!cellShifts.has(key)) cellShifts.set(key, []);
      cellShifts.get(key)!.push({ start: a.start, end: a.end });
      totalHours.set(a.waiter, (totalHours.get(a.waiter) ?? 0) + hoursBetween(a.start, a.end));
    }
  }
  waiterNames.sort((a, b) => (totalHours.get(b) ?? 0) - (totalHours.get(a) ?? 0));

  const wb = XLSX.utils.book_new();
  const generatedAt = new Date().toISOString().slice(0, 10);
  const rows: (string | number)[][] = [
    [tr(lang, 'TRACE · График смен на неделю', 'TRACE · Weekly Shift Schedule', 'TRACE · Haftalik smena jadvali')],
    [tr(lang, `Сформировано: ${generatedAt}`, `Generated: ${generatedAt}`, `Yaratildi: ${generatedAt}`)],
    [],
  ];
  if (summary) { rows.push([summary]); rows.push([]); }

  const headerRow = rows.length;
  rows.push([tr(lang, 'Официант', 'Waiter', 'Ofitsiant'), ...days, tr(lang, 'Итого часов', 'Total hours', 'Jami soat')]);
  for (const name of waiterNames) {
    const cleanName = name.replace(/\(официант\)/i, '').trim();
    const rowCells = days.map(d => {
      const shifts = cellShifts.get(`${name}|${d}`);
      if (!shifts || shifts.length === 0) return tr(lang, 'вых', 'off', 'dam');
      return shifts.map(s => `${s.start}–${s.end}`).join(', ');
    });
    rows.push([cleanName, ...rowCells, `${(totalHours.get(name) ?? 0).toFixed(1)}${tr(lang,'ч','h','s')}`]);
  }
  rows.push([]);
  rows.push([tr(lang, 'Сделано с TRACE-OS · trace-os.uz', 'Made with TRACE-OS · trace-os.uz', 'TRACE-OS bilan yaratildi · trace-os.uz')]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, ...days.map(() => ({ wch: 16 })), { wch: 12 }];
  ws['!freeze'] = { xSplit: 1, ySplit: headerRow + 1 } as any;
  const ref = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  ws['!autofilter'] = { ref: `${XLSX.utils.encode_cell({ r: headerRow, c: ref.s.c })}:${XLSX.utils.encode_cell({ r: headerRow, c: ref.e.c })}` };

  XLSX.utils.book_append_sheet(wb, ws, tr(lang, 'График смен', 'Schedule', 'Jadval').slice(0, 31));
  XLSX.writeFile(wb, `TRACE-shift-schedule-${generatedAt}.xlsx`);
}

// Client-side PDF export — used in demo mode where there's no backend to
// render it server-side. Same matrix layout as the Excel export.
async function downloadShiftSchedulePdfClientSide(
  schedule: ShiftScheduleDay[],
  summary: string | undefined,
  lang: Language,
) {
  const days = schedule.map(d => d.day);
  const waiterNames = [...new Set(schedule.flatMap(d => d.assignments.map(a => a.waiter)))];
  const cellShifts = new Map<string, { start: string; end: string }[]>();
  const totalHours = new Map<string, number>();
  for (const d of schedule) {
    for (const a of d.assignments) {
      const key = `${a.waiter}|${d.day}`;
      if (!cellShifts.has(key)) cellShifts.set(key, []);
      cellShifts.get(key)!.push({ start: a.start, end: a.end });
      totalHours.set(a.waiter, (totalHours.get(a.waiter) ?? 0) + hoursBetween(a.start, a.end));
    }
  }
  waiterNames.sort((a, b) => (totalHours.get(b) ?? 0) - (totalHours.get(a) ?? 0));

  const { registerCyrillicFont } = await import('../../lib/pdfFonts');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  registerCyrillicFont(doc);
  const generatedAt = new Date().toISOString().slice(0, 10);
  doc.setFont('Roboto', 'bold');
  doc.setFontSize(14);
  doc.text(tr(lang, 'TRACE · График смен на неделю', 'TRACE · Weekly Shift Schedule', 'TRACE · Haftalik smena jadvali'), 32, 32);
  doc.setFont('Roboto', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(tr(lang, `Сформировано: ${generatedAt}`, `Generated: ${generatedAt}`, `Yaratildi: ${generatedAt}`), 32, 48);
  let startY = 62;
  if (summary) {
    const wrapped = doc.splitTextToSize(summary, 760);
    doc.text(wrapped, 32, startY);
    startY += wrapped.length * 12 + 10;
  }

  autoTable(doc, {
    startY,
    head: [[tr(lang, 'Официант', 'Waiter', 'Ofitsiant'), ...days, tr(lang, 'Итого часов', 'Total hours', 'Jami soat')]],
    body: waiterNames.map(name => {
      const cleanName = name.replace(/\(официант\)/i, '').trim();
      const rowCells = days.map(d => {
        const shifts = cellShifts.get(`${name}|${d}`);
        if (!shifts || shifts.length === 0) return tr(lang, 'вых', 'off', 'dam');
        return shifts.map(s => `${s.start}–${s.end}`).join(', ');
      });
      return [cleanName, ...rowCells, `${(totalHours.get(name) ?? 0).toFixed(1)}${tr(lang,'ч','h','s')}`];
    }),
    styles: { font: 'Roboto', fontSize: 8, cellPadding: 5 },
    headStyles: { font: 'Roboto', fillColor: [255, 107, 53] },
  });

  doc.save(`TRACE-shift-schedule-${generatedAt}.pdf`);
}

const HEAT_PERIODS = ['today', 7, 30, 90] as const;
type HeatPeriod = typeof HEAT_PERIODS[number];

function todayISO() {
  return tashkentDateStr();
}

function HallMap({ lang, onToast, occupiedTables, tableInfo, branchId, isPoster, onHasPlanChange }: { lang: Language; onToast?: (m: string, t: 'info') => void; occupiedTables?: Set<number>; tableInfo?: Map<number, { min: number; sum: number }>; branchId?: string; isPoster?: boolean; onHasPlanChange?: (hasPlan: boolean) => void }) {
  const [plans, setPlans] = useState<HallPlan[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'now' | 'revenue' | 'duration'>('now');
  const [period, setPeriod] = useState<HeatPeriod>(30);
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);
  const [revenueRows, setRevenueRows] = useState<{ table: number; revenue: number; orders: number }[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const revenueCache = useRef<Map<string, { table: number; revenue: number; orders: number }[]>>(new Map());
  const [durationRows, setDurationRows] = useState<{ table: number; avgMin: number; visits: number }[]>([]);
  const [durationLoading, setDurationLoading] = useState(false);
  const durationCache = useRef<Map<string, { table: number; avgMin: number; visits: number }[]>>(new Map());

  useEffect(() => {
    traceApi.halls.list(branchId)
      .then(p => { setPlans(p); setLoading(false); onHasPlanChange?.(p.length > 0); })
      .catch((e) => { console.warn('halls fetch:', e); setLoading(false); onHasPlanChange?.(false); });
  }, [branchId]);

  // Effective request args — a custom calendar pick wins, otherwise "today"
  // maps to a same-day range and the numeric presets stay day-count based.
  const effectiveRange = customRange ?? (period === 'today' ? { from: todayISO(), to: todayISO() } : null);
  const effectiveDays = typeof period === 'number' ? period : 30;

  useEffect(() => {
    if (mode !== 'revenue') return;
    const cacheKey = effectiveRange ? `${effectiveRange.from}:${effectiveRange.to}` : String(effectiveDays);
    const cached = revenueCache.current.get(cacheKey);
    if (cached) { setRevenueRows(cached); return; }
    setRevenueLoading(true);
    traceApi.operations.tableRevenue(effectiveDays, effectiveRange ?? undefined, branchId)
      .then(rows => { revenueCache.current.set(cacheKey, rows); setRevenueRows(rows); })
      .catch(() => setRevenueRows([]))
      .finally(() => setRevenueLoading(false));
  }, [mode, effectiveDays, effectiveRange?.from, effectiveRange?.to, branchId]);

  useEffect(() => {
    if (mode !== 'duration') return;
    const cacheKey = effectiveRange ? `${effectiveRange.from}:${effectiveRange.to}` : String(effectiveDays);
    const cached = durationCache.current.get(cacheKey);
    if (cached) { setDurationRows(cached); return; }
    setDurationLoading(true);
    traceApi.operations.tableDurations(effectiveDays, effectiveRange ?? undefined, branchId)
      .then(rows => { durationCache.current.set(cacheKey, rows); setDurationRows(rows); })
      .catch(() => setDurationRows([]))
      .finally(() => setDurationLoading(false));
  }, [mode, effectiveDays, effectiveRange?.from, effectiveRange?.to, branchId]);

  const activePlan = plans[activeTab] ?? plans[0];

  // Tables that actually belong to the currently-open hall/floor — a
  // multi-hall venue shares one realtime_events stream, so the raw revenue
  // rows span every hall until scoped down to this plan's linked tables.
  const activePlanTableNumbers = useMemo(() => {
    if (!activePlan) return null;
    return new Set(activePlan.elements.map(e => e.iiko_table_number).filter((n): n is number => n != null));
  }, [activePlan]);

  // Tables with no revenue in the window are dropped entirely rather than
  // shown as a zero-value badge — a heatmap full of "0" tiles reads worse
  // than tables that simply carry no revenue color at all.
  const scopedRevenueRows = useMemo(() => {
    const withRevenue = revenueRows.filter(r => r.revenue > 0);
    if (!activePlanTableNumbers) return withRevenue;
    return withRevenue.filter(r => activePlanTableNumbers.has(r.table));
  }, [revenueRows, activePlanTableNumbers]);

  // Same scoping for historical occupancy (duration) rows.
  const scopedDurationRows = useMemo(() => {
    const withDuration = durationRows.filter(r => r.visits > 0);
    if (!activePlanTableNumbers) return withDuration;
    return withDuration.filter(r => activePlanTableNumbers.has(r.table));
  }, [durationRows, activePlanTableNumbers]);

  // Normalize revenue → 0..1 heat per table
  const tableHeat = useMemo(() => {
    if (mode === 'revenue') {
      if (scopedRevenueRows.length === 0) return undefined;
      const max = Math.max(...scopedRevenueRows.map(r => r.revenue));
      return new Map(scopedRevenueRows.map(r => [r.table, max > 0 ? r.revenue / max : 0]));
    }
    if (mode === 'duration') {
      if (scopedDurationRows.length === 0) return undefined;
      // Intensity is TOTAL occupied time that period (avg minutes per visit
      // × visit count), not the per-visit average — a table doing 20 short
      // orders can rack up more real occupied hours than one doing 5 long ones.
      const totals = scopedDurationRows.map(r => r.avgMin * r.visits);
      const max = Math.max(...totals);
      return new Map(scopedDurationRows.map((r, i) => [r.table, max > 0 ? totals[i] / max : 0]));
    }
    return undefined;
  }, [mode, scopedRevenueRows, scopedDurationRows]);

  const revenueInfo = useMemo(() => {
    if (mode !== 'revenue' || scopedRevenueRows.length === 0) return undefined;
    return new Map(scopedRevenueRows.map(r => [r.table, { revenue: r.revenue, orders: r.orders }]));
  }, [mode, scopedRevenueRows]);

  const durationInfo = useMemo(() => {
    if (mode !== 'duration' || scopedDurationRows.length === 0) return undefined;
    return new Map(scopedDurationRows.map(r => [r.table, { avgMin: r.avgMin, visits: r.visits }]));
  }, [mode, scopedDurationRows]);

  // In revenue/duration mode, don't just skip the badge — drop the table
  // shape itself so a mostly-idle hall doesn't render as a grid of blank
  // tables. Structural elements (walls, bar, entrance) stay for orientation.
  const displayPlan = useMemo(() => {
    if (mode === 'now' || !activePlan) return activePlan;
    const coveredTableNumbers = new Set(
      (mode === 'revenue' ? scopedRevenueRows : scopedDurationRows).map(r => r.table),
    );
    const isTable = (t: string) => t === 'rect_table' || t === 'round_table' || t === 'stool';
    return {
      ...activePlan,
      elements: activePlan.elements.filter(e =>
        !isTable(e.type) || (e.iiko_table_number != null && coveredTableNumbers.has(e.iiko_table_number))),
    };
  }, [mode, activePlan, scopedRevenueRows, scopedDurationRows]);

  // HallEditor snapshots `plan.elements` into local state on mount only, so
  // the inline viewer must remount whenever the filtered table set changes
  // (mode switch, period switch, hall switch) — not just on plan.id.
  const displayPlanKey = mode === 'revenue'
    ? `${activePlan?.id}-revenue-${scopedRevenueRows.map(r => r.table).sort((a, b) => a - b).join(',')}`
    : mode === 'duration'
    ? `${activePlan?.id}-duration-${scopedDurationRows.map(r => r.table).sort((a, b) => a - b).join(',')}`
    : `${activePlan?.id}-now`;

  // Ranked summary — total, top table, avg check, coverage — surfaced above
  // the plan instead of buried in per-table tooltips.
  const revenueSummary = useMemo(() => {
    if (mode !== 'revenue' || scopedRevenueRows.length === 0) return null;
    const sorted = [...scopedRevenueRows].sort((a, b) => b.revenue - a.revenue);
    const total = sorted.reduce((s, r) => s + r.revenue, 0);
    const orders = sorted.reduce((s, r) => s + r.orders, 0);
    return {
      top: sorted[0],
      bottom: sorted[sorted.length - 1],
      total, orders,
      avgCheck: orders > 0 ? total / orders : 0,
      tablesCovered: sorted.length,
    };
  }, [mode, scopedRevenueRows]);

  // Ranked summary for historical occupancy — busiest table, total occupied
  // hours, avg visit length, coverage.
  const durationSummary = useMemo(() => {
    if (mode !== 'duration' || scopedDurationRows.length === 0) return null;
    const withTotal = scopedDurationRows.map(r => ({ ...r, totalMin: r.avgMin * r.visits }));
    const sorted = [...withTotal].sort((a, b) => b.totalMin - a.totalMin);
    const totalMin = sorted.reduce((s, r) => s + r.totalMin, 0);
    const visits = sorted.reduce((s, r) => s + r.visits, 0);
    return {
      top: sorted[0],
      totalMin, visits,
      avgVisitMin: visits > 0 ? totalMin / visits : 0,
      tablesCovered: sorted.length,
    };
  }, [mode, scopedDurationRows]);

  const occupiedTableNumbers = useMemo(() => occupiedTables ?? new Set<number>(), [occupiedTables]);

  if (loading) {
    return <Skel lines={['w9', 'w9', 'w7', 'w9', 'w5']} />;
  }

  if (plans.length === 0) {
    return null;
  }

  const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
  const tablesInPlan = activePlan.elements.filter(e => e.iiko_table_number != null).length;
  const stats: [string, React.ReactNode][] = mode === 'revenue' && revenueSummary ? [
    [tr(lang, 'Выручка зала', 'Floor revenue', 'Zal tushumi'), <>{fmt(revenueSummary.total)}<small>{tr(lang, 'сум', 'UZS', "so'm")}</small></>],
    [tr(lang, 'Лучший стол', 'Top table', 'Eng yaxshi stol'), <>{revenueSummary.top.table}<small>{fmt(revenueSummary.top.revenue)}</small></>],
    [tr(lang, 'Средний чек', 'Avg check', "O'rtacha chek"), <>{fmt(revenueSummary.avgCheck)}</>],
    [tr(lang, 'Столов с продажами', 'Tables with sales', 'Sotuvli stollar'), <>{revenueSummary.tablesCovered}<small>{tr(lang, `из ${tablesInPlan}`, `of ${tablesInPlan}`, `${tablesInPlan} dan`)}</small></>],
  ] : mode === 'duration' && durationSummary ? [
    [tr(lang, 'Зал занят', 'Floor occupied', 'Zal band'), <>{formatMinutes(durationSummary.totalMin, lang)}</>],
    [tr(lang, 'Самый занятый', 'Busiest table', 'Eng band stol'), <>{durationSummary.top.table}<small>{formatMinutes(durationSummary.top.avgMin * durationSummary.top.visits, lang)}</small></>],
    [tr(lang, 'Посадка в среднем', 'Avg visit', "O'rtacha o'tirish"), <>{formatMinutes(durationSummary.avgVisitMin, lang)}</>],
    [tr(lang, 'Столов с данными', 'Tables with data', "Ma'lumotli stollar"), <>{durationSummary.tablesCovered}<small>{tr(lang, `из ${tablesInPlan}`, `of ${tablesInPlan}`, `${tablesInPlan} dan`)}</small></>],
  ] : mode === 'now' ? (() => {
    const occ = [...occupiedTableNumbers].filter(n => activePlanTableNumbers?.has(n) ?? true);
    const mins = occ.map(n => tableInfo?.get(n)?.min ?? 0);
    return [
      [tr(lang, 'Занято', 'Occupied', 'Band'), <>{occ.length}<small>{tr(lang, `из ${tablesInPlan}`, `of ${tablesInPlan}`, `${tablesInPlan} dan`)}</small></>],
      [tr(lang, 'Стол в среднем', 'Avg table', "O'rtacha stol"), <>{mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : '—'}<small>{tr(lang, 'мин', 'min', 'daq')}</small></>],
      [tr(lang, 'Дольше 90 мин', 'Over 90 min', "90 daq.dan ko'p"), <>{mins.filter(m => m >= 90).length}</>],
      [tr(lang, 'Свободно', 'Free', "Bo'sh"), <>{Math.max(0, tablesInPlan - occ.length)}<small>{tr(lang, ruPl(Math.max(0, tablesInPlan - occ.length), 'стол', 'стола', 'столов'), 'tables', 'stol')}</small></>],
    ] as [string, React.ReactNode][];
  })() : [];
  const busy = (mode === 'revenue' && revenueLoading) || (mode === 'duration' && durationLoading);

  return (
    <div>
      <div className="map-tools">
        {plans.length > 1 && (
          <span className="seg small" role="group" aria-label={tr(lang, 'Зал', 'Floor', 'Zal')}>
            {plans.map((p, i) => <button key={p.id} aria-pressed={activeTab === i} onClick={() => setActiveTab(i)}>{p.name}</button>)}
          </span>
        )}
        <span className="seg small" role="group" aria-label={tr(lang, 'Что показать', 'What to show', "Nimani ko'rsatish")}>
          {([['now', tr(lang, 'Сейчас', 'Now', 'Hozir')], ['revenue', tr(lang, 'Выручка', 'Revenue', 'Tushum')], ['duration', tr(lang, 'Загрузка', 'Occupancy', 'Bandlik')]] as const).map(([id, l]) => (
            <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{l}</button>
          ))}
        </span>
        {mode !== 'now' && (
          <span className="seg small periods on" role="group" aria-label={tr(lang, 'Период', 'Period', 'Davr')}>
            {HEAT_PERIODS.map(d => (
              <button key={d} aria-pressed={!customRange && period === d} onClick={() => { setPeriod(d); setCustomRange(null); }}>
                {d === 'today' ? tr(lang, 'Сегодня', 'Today', 'Bugun') : tr(lang, `${d} дней`, `${d} days`, `${d} kun`)}
              </button>
            ))}
            <button ref={calendarBtnRef} aria-pressed={!!customRange} onClick={() => setCalendarOpen(o => !o)}>
              {customRange ? rangeLabel(customRange.from, customRange.to, lang) : tr(lang, 'Период…', 'Range…', 'Davr…')}
            </button>
            <DateRangePicker lang={lang} value={customRange} isOpen={calendarOpen} onClose={() => setCalendarOpen(false)} anchorRef={calendarBtnRef}
              onApply={r => { setCustomRange(r); setCalendarOpen(false); }} onClear={() => { setCustomRange(null); setCalendarOpen(false); }} />
          </span>
        )}
      </div>

      {mode !== 'now' && !busy && stats.length === 0 && (
        <p className="rd-empty">{mode === 'revenue'
          ? tr(lang, 'Нет закрытых заказов за период', 'No closed orders for this period', 'Bu davr uchun yopilgan buyurtmalar yoʻq')
          : tr(lang, 'Нет данных о посадках за период', 'No visit data for this period', 'Bu davr uchun oʻtirish maʼlumotlari yoʻq')}</p>
      )}

      <div className="rd-hall" style={busy ? { opacity: .5 } : undefined}>
        <HallEditor
          key={displayPlanKey}
          plan={displayPlan}
          occupiedTableNumbers={occupiedTableNumbers}
          tableHeat={tableHeat}
          tableInfo={mode === 'now' ? tableInfo : undefined}
          revenueInfo={mode === 'revenue' ? revenueInfo : undefined}
          durationInfo={mode === 'duration' ? durationInfo : undefined}
          legendMode={mode === 'revenue' ? 'revenue' : mode === 'duration' ? 'duration' : 'occupancy'}
          onSave={async () => {}}
          onClose={() => {}}
          readOnly
          inline
          rdLook
          lang={lang}
        />
      </div>
      {stats.length > 0 && (
        <div className="map-stats">
          {stats.map(([l, v], i) => <div key={i}><div className="l">{l}</div><div className="v">{v}</div></div>)}
        </div>
      )}
    </div>
  );
}

// ── Void Tracker ─────────────────────────────────────────────────────────
// Deletions per waiter today, straight from plugin order_before_delete events.
// High counts = mistakes or unauthorized voids — theft-control signal.

function VoidDetailModal({ event, lang, onClose }: { event: VoidEvent; lang: Language; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const when = new Date(event.at).toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="vd" role="dialog" aria-modal="true" aria-labelledby="vd-t">
        <div className="vd-head">
          <div>
            <h2 id="vd-t">{event.type === 'order_before_delete' ? tr(lang, 'Заказ удалён', 'Order deleted', "Buyurtma o'chirildi") : tr(lang, 'Позиции сняты', 'Items voided', 'Pozitsiyalar olib tashlandi')}</h2>
            <p>{[event.orderNum ? `#${event.orderNum}` : null, event.table, event.waiter].filter(Boolean).join(' · ')}</p>
          </div>
          <button className="vd-x" onClick={onClose} aria-label={tr(lang, 'Закрыть', 'Close', 'Yopish')}><i className="ph ph-x" aria-hidden="true" /></button>
        </div>
        <ul className="kv">
          <li><span>{tr(lang, 'Когда', 'When', 'Qachon')}</span><span>{when}</span></li>
          {event.sum > 0 && <li><span>{tr(lang, 'Сумма', 'Total', 'Summa')}</span><span className="neg">−{Math.round(event.sum).toLocaleString('ru-RU')}</span></li>}
          <li><span>{tr(lang, 'Списание', 'Write-off', 'Hisobdan chiqarish')}</span>
            <span>{event.writeoff ? <span className={`wo wo-${event.writeoff}`}>{woLabel(lang, event.writeoff)}</span>
              : <span className="faint">{tr(lang, 'iiko ещё не передал', 'not reported by iiko yet', "iiko hali yubormadi")}</span>}</span></li>
          {event.reason && <li><span>{tr(lang, 'Причина', 'Reason', 'Sabab')}</span><span>{event.reason}</span></li>}
          {event.comment && <li><span>{tr(lang, 'Комментарий', 'Comment', 'Izoh')}</span><span>{event.comment}</span></li>}
        </ul>
        {event.writeoff && <p className="vd-note">{event.writeoff === 'without'
          ? tr(lang, 'Без списания: блюдо не готовили, продукты остались на складе.', 'Not written off: nothing was cooked, stock stayed in the store.', "Hisobdan chiqarilmagan: taom tayyorlanmagan, mahsulot omborda qoldi.")
          : tr(lang, 'Со списанием: продукты ушли со склада — это прямая потеря себестоимости.', 'Written off: the ingredients left the store — a direct cost loss.', "Hisobdan chiqarilgan: mahsulot ombordan chiqdi — bu to'g'ridan-to'g'ri yo'qotish.")}</p>}
        <h3 className="vd-sub">{tr(lang, 'Позиции', 'Items', 'Pozitsiyalar')}{event.items.length > 0 && <span className="faint"> {event.items.length}</span>}</h3>
        {event.items.length > 0 ? (
          <ul className="kv">
            {event.items.map((it, i) => (
              <li key={i}>
                <span>{it.name} <span className="faint">×{it.quantity}</span>{it.writeoff && <span className={`wo wo-${it.writeoff}`}>{woLabel(lang, it.writeoff)}</span>}</span>
                <span>{it.sum != null ? Math.round(it.sum).toLocaleString('ru-RU') : ''}</span>
              </li>
            ))}
          </ul>
        ) : <p className="rd-empty">{event.type === 'order_before_delete'
          ? tr(lang, 'Заказ удалён целиком — касса не передала состав на момент удаления.', 'The whole order was deleted — the till did not send its items.', "Buyurtma butunlay o'chirildi — kassa tarkibini yubormadi.")
          : tr(lang, 'Список позиций недоступен.', 'Item list unavailable.', "Pozitsiyalar ro'yxati yo'q.")}</p>}
      </div>
    </>
  );
}

// ── What needs attention right now ───────────────────────────────────────

const ALERT_ICONS: Record<string, string> = {
  long_ticket: 'ph-timer', double_bill: 'ph-receipt', dead_zone: 'ph-lightning',
  void_spike: 'ph-trash', kitchen_overdue: 'ph-cooking-pot', revenue_pace_drop: 'ph-trend-down',
};

function Alerts({ lang, pluginConnected, onGo }: { lang: Language; pluginConnected: boolean; onGo: (a: OpsAlert) => void }) {
  const [alerts, setAlerts] = useState<OpsAlert[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const load = useCallback(() => {
    traceApi.operations.alerts(lang).then(setAlerts).catch(() => setAlerts([]));
  }, [lang]);
  useEffect(() => {
    // Alerts come from plugin events only — nothing to poll without the plugin.
    if (!pluginConnected) return;
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load, pluginConnected]);
  const visible = alerts.filter(a => !hidden.has(a.id));
  if (!pluginConnected || visible.length === 0) return null;
  const goLabel = (a: OpsAlert) => a.type === 'void_spike' ? tr(lang, 'Смотреть удаления', 'See voids', "O'chirishlarni ko'rish")
    : a.type === 'long_ticket' || a.type === 'double_bill' || a.type === 'dead_zone' ? tr(lang, 'Показать на схеме', 'Show on the plan', "Sxemada ko'rsatish")
    : a.type === 'kitchen_overdue' ? tr(lang, 'Открытые заказы', 'Open orders', 'Ochiq buyurtmalar') : null;
  return (
    <section className="alerts rise" style={{ animationDelay: '.04s' }} aria-labelledby="h-alerts">
      <div className="alerts-head"><h2 id="h-alerts">{tr(lang, 'Требует внимания', 'Needs attention', "E'tibor talab qiladi")}</h2><span className="faint">{visible.length}</span></div>
      {visible.map(a => (
        <div key={a.id} className={`alert${a.level === 'critical' ? ' hot' : ''}`}>
          <span className="alert-ico"><i className={`ph ${ALERT_ICONS[a.type] ?? 'ph-warning'}`} aria-hidden="true" /></span>
          <div><div className="alert-t">{a.title}</div><div className="alert-s">{a.detail}</div></div>
          <div className="alert-acts">
            {goLabel(a) && <button className="go" onClick={() => onGo(a)}>{goLabel(a)}</button>}
            <button className="hide" onClick={() => setHidden(s => new Set(s).add(a.id))}>{tr(lang, 'Скрыть', 'Hide', 'Yashirish')}</button>
          </div>
        </div>
      ))}
    </section>
  );
}

// ── Voids ─────────────────────────────────────────────────────────────────

// Was the deleted food written off (it left the store — a real loss) or not.
function woLabel(lang: Language, w: 'with' | 'without' | 'mixed') {
  return w === 'with' ? tr(lang, 'со списанием', 'written off', 'hisobdan chiqarilgan')
    : w === 'without' ? tr(lang, 'без списания', 'not written off', 'hisobdan chiqarilmagan')
    : tr(lang, 'частично списано', 'partly written off', 'qisman chiqarilgan');
}

function Bookings({ lang, rows, onAll }: { lang: Language; rows: StaffReservation[]; onAll?: () => void }) {
  const today = tashkentDateStr();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
  const day = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tashkent' });
  const hm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
  const when = (iso: string) => {
    const d = day(iso);
    const lbl = d === today ? tr(lang, 'сегодня', 'today', 'bugun') : d === tomorrow ? tr(lang, 'завтра', 'tomorrow', 'ertaga') : d.split('-').reverse().slice(0, 2).join('.');
    return `${lbl}, ${hm(iso)}`;
  };
  const dur = (a: string, b: string) => { const m = Math.round((Date.parse(b) - Date.parse(a)) / 60000); return m % 60 ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} ${tr(lang, 'ч', 'h', 'soat')} ` : ''}${m % 60} ${tr(lang, 'мин', 'min', 'daq')}` : `${m / 60} ${tr(lang, 'ч', 'h', 'soat')}`; };
  const shown = rows.slice(0, 6);
  return (
    <section className="card-ph" aria-labelledby="h-bk">
      <div className="sec-head"><h2 id="h-bk">{tr(lang, 'Бронирования', 'Bookings', 'Bronlar')}{rows.length > 0 && <span className="count">{rows.length}</span>}</h2>
        {onAll && <button className="link" type="button" onClick={onAll}>{tr(lang, 'Все брони', 'All bookings', 'Barcha bronlar')}</button>}</div>
      {rows.length === 0 ? <p className="rd-empty">{tr(lang, 'На сегодня и завтра броней нет', 'No bookings for today or tomorrow', "Bugun va ertaga bron yo'q")}</p> : (
        <table className="bk">
          <thead><tr><th>{tr(lang, 'Гость', 'Guest', 'Mehmon')}</th><th className="c-phone">{tr(lang, 'Телефон', 'Phone', 'Telefon')}</th><th>{tr(lang, 'Когда', 'When', 'Qachon')}</th><th className="c-dur">{tr(lang, 'На сколько', 'Duration', 'Davomiyligi')}</th><th>{tr(lang, 'Статус', 'Status', 'Holat')}</th></tr></thead>
          <tbody>{shown.map(r => (
            <tr key={r.id}>
              <td>{r.guest_name || tr(lang, 'Гость', 'Guest', 'Mehmon')}, {r.party_size} {tr(lang, 'чел.', 'ppl', 'kishi')}{r.table_name ? <span className="bk-sub">{tr(lang, 'стол', 'table', 'stol')} {r.table_name}</span> : null}</td>
              <td className="c-phone"><span className="phone">{r.guest_phone || '—'}</span></td>
              <td className="nw">{when(r.start_at)}</td><td className="c-dur nw">{dur(r.start_at, r.end_at)}</td>
              <td><span className={`bk-st ${r.status === 'pending' ? 'new' : 'ok2'}`}>{r.status === 'pending' ? tr(lang, 'Ждёт звонка', 'Awaiting call', "Qo'ng'iroq kutmoqda") : r.status === 'seated' ? tr(lang, 'За столом', 'Seated', 'Stolda') : tr(lang, 'Подтверждено', 'Confirmed', 'Tasdiqlangan')}</span></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}

function Voids({ lang, events }: { lang: Language; events: VoidEvent[] }) {
  const [detail, setDetail] = useState<VoidEvent | null>(null);
  const [all, setAll] = useState(false);
  const total = events.reduce((a, e) => a + e.sum, 0);
  const shown = all ? events : events.slice(0, 6);
  const hm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
  return (
    <section className="card-ph" aria-labelledby="h-voids">
      <div className="sec-head"><h2 id="h-voids">{tr(lang, 'Удаления', 'Voids', "O'chirishlar")}</h2>
        {events.length > 0 && <span className="voids-sum">{tr(lang, `${events.length} за смену, −${Math.round(total).toLocaleString('ru-RU')}`, `${events.length} this shift, −${Math.round(total).toLocaleString('ru-RU')}`, `smenada ${events.length}, −${Math.round(total).toLocaleString('ru-RU')}`)}</span>}
      </div>
      {events.length === 0 ? <p className="rd-empty">{tr(lang, 'За смену ничего не удаляли', 'Nothing voided this shift', "Smenada hech narsa o'chirilmagan")}</p> : (
        <div className="voids-list">
          {shown.map(v => (
            <button key={v.id} className="void" onClick={() => setDetail(v)}>
              <span className="when">{hm(v.at)}</span>
              <span className="what">
                {v.table ? `${v.table}, ` : ''}{v.type === 'order_before_delete' ? tr(lang, 'заказ удалён', 'order deleted', "buyurtma o'chirildi") : v.items.map(i => i.name).join(', ') || tr(lang, 'позиции сняты', 'items voided', 'pozitsiyalar olindi')}
                <span>{v.waiter}{v.orderNum ? `, ${tr(lang, 'заказ', 'order', 'buyurtma')} #${v.orderNum}` : ''}</span>
              </span>
              <span className="amt">{v.sum > 0 ? `−${Math.round(v.sum).toLocaleString('ru-RU')}` : ''}
                {v.writeoff && <span className={`wo wo-${v.writeoff}`}>{woLabel(lang, v.writeoff)}</span>}</span>
            </button>
          ))}
        </div>
      )}
      {events.length > 6 && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}><button className="link" onClick={() => setAll(a => !a)}>{all ? tr(lang, 'Свернуть', 'Collapse', "Yig'ish") : tr(lang, `Показать все ${events.length}`, `Show all ${events.length}`, `Hammasi ${events.length}`)}</button></div>}
      {detail && <VoidDetailModal event={detail} lang={lang} onClose={() => setDetail(null)} />}
    </section>
  );
}

// ── Waiters table ─────────────────────────────────────────────────────────

// A ranks the top ~70% of revenue, B the next ~20%, C the long tail.
function paretoAbc<T>(items: T[], revenueOf: (it: T) => number): Map<T, 'A' | 'B' | 'C'> {
  const sorted = [...items].sort((a, b) => revenueOf(b) - revenueOf(a));
  const total = sorted.reduce((s, it) => s + revenueOf(it), 0);
  const map = new Map<T, 'A' | 'B' | 'C'>();
  let cum = 0;
  for (const it of sorted) {
    const prevPct = total > 0 ? (cum / total) * 100 : 0;
    cum += revenueOf(it);
    map.set(it, prevPct < 70 ? 'A' : prevPct < 90 ? 'B' : 'C');
  }
  return map;
}

type StaffRange = 'today' | '7days' | '30days';
function StaffTable({ lang, staffRows, staffLoading, isPoster }: { lang: Language; staffRows: StaffRow[]; staffLoading: boolean; isPoster: boolean }) {
  const [range, setRange] = useState<StaffRange>('today');
  const [abcRows, setAbcRows] = useState<StaffAbcRow[]>([]);
  const [abcLoading, setAbcLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // TRACE payroll accrual per employee (Employee Hub), joined by name.
  const [payroll, setPayroll] = useState<Map<string, StaffProfitabilityRow>>(new Map());
  useEffect(() => {
    traceApi.operations.staffProfitability(range)
      .then(r => setPayroll(new Map((r.rows ?? []).map(row => [row.name.trim().toLowerCase(), row]))))
      .catch(() => setPayroll(new Map()));
  }, [range]);
  useEffect(() => {
    if (range === 'today') return;
    setAbcLoading(true);
    traceApi.operations.staffAbc(range).then(r => setAbcRows(r.rows ?? [])).catch(() => setAbcRows([])).finally(() => setAbcLoading(false));
  }, [range]);
  const today = range === 'today';
  const grades = useMemo(() => paretoAbc(staffRows, s => s.revenue), [staffRows]);
  const totalRev = staffRows.reduce((a, s) => a + s.revenue, 0) || 1;
  const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
  const accrual = (name: string) => { const p = payroll.get(name.trim().toLowerCase()); return p?.traceEmployeeId && p.traceAccrual != null ? p.traceAccrual : null; };
  const hasAccrual = [...payroll.values()].some(p => p.traceEmployeeId && p.traceAccrual != null);
  const loading = today ? staffLoading : abcLoading;
  const rows = today ? [...staffRows].sort((a, b) => b.revenue - a.revenue) : [...abcRows].sort((a, b) => b.revenue - a.revenue);
  return (
    <section className="band rise card-ph" style={{ animationDelay: '.24s' }} aria-labelledby="h-staff">
      <div className="sec-head">
        <h2 id="h-staff">{tr(lang, 'Официанты', 'Waiters', 'Ofitsiantlar')}</h2>
        <span className="seg small" role="group" aria-label={tr(lang, 'Период', 'Period', 'Davr')}>
          {(['today', '7days', '30days'] as const).map(r => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r === 'today' ? tr(lang, 'Сегодня', 'Today', 'Bugun') : r === '7days' ? tr(lang, '7 дней', '7 days', '7 kun') : tr(lang, '30 дней', '30 days', '30 kun')}</button>)}
        </span>
      </div>
      {loading ? <Skel lines={['w9', 'w9', 'w9', 'w7']} /> : rows.length === 0 ? <p className="rd-empty">{tr(lang, 'Нет данных за период', 'No data for the period', "Davr uchun ma'lumot yo'q")}</p> : (
        <table className={`staff${today ? '' : ' week'}`}>
          <thead><tr>
            <th>{tr(lang, 'Официант', 'Waiter', 'Ofitsiant')}</th>
            {today && <><th className="c-time">{tr(lang, 'Пришёл', 'In', 'Keldi')}</th><th className="c-time">{tr(lang, 'Ушёл', 'Out', 'Ketdi')}</th></>}
            <th className="r">{tr(lang, 'Заказы', 'Orders', 'Buyurtmalar')}</th>
            {today && <th className="r c-guests">{tr(lang, 'Гости', 'Guests', 'Mehmonlar')}</th>}
            <th className="r">{tr(lang, 'Ср. чек', 'Avg check', "O'rt. chek")}</th>
            {today && <th className="r c-pg">{tr(lang, 'На гостя', 'Per guest', 'Mehmonga')}</th>}
            {today && <th className="r c-avgt">{tr(lang, 'Ср. стол', 'Avg table', "O'rt. stol")}</th>}
            <th className="r c-share">{tr(lang, 'Доля', 'Share', 'Ulush')}</th>
            {hasAccrual && <th className="r c-acc" title={tr(lang, 'По настройкам зарплаты в Сотрудниках', 'From pay settings in Employees', "Xodimlardagi ish haqi sozlamalari bo'yicha")}>{tr(lang, 'Начислено', 'Accrued', 'Hisoblangan')}</th>}
            <th className="r" title={tr(lang, 'ABC по выручке: A даёт первые 70%, B следующие 20%', 'ABC by revenue: A brings the first 70%, B the next 20%', "Tushum bo'yicha ABC: A birinchi 70%, B keyingi 20%")}>ABC</th>
          </tr></thead>
          <tbody>
            {today ? (rows as StaffRow[]).map(s => {
              const isOpen = open === s.name;
              const g = s.revenue > 0 ? grades.get(s) ?? 'C' : null;
              const acc = accrual(s.name);
              return (
                <React.Fragment key={s.name}>
                  <tr className={`row${isOpen ? ' open' : ''}`} aria-expanded={isOpen} onClick={() => setOpen(o => o === s.name ? null : s.name)}>
                    <td className="n"><i className="ph ph-caret-down" aria-hidden="true" />{s.name}</td>
                    <td className="c-time">{s.enterTime ?? '—'}</td>
                    <td className="c-time">{s.exitTime ?? (s.enterTime ? <span className="on-shift">{tr(lang, 'на смене', 'on shift', 'smenada')}</span> : '—')}</td>
                    <td className="r">{fmt(s.orders)}</td>
                    <td className="r c-guests">{s.guests > 0 ? fmt(s.guests) : '—'}</td>
                    <td className="r">{s.avgCheck > 0 ? fmt(s.avgCheck) : '—'}</td>
                    <td className="r c-pg">{s.guests > 0 ? fmt(s.revenue / s.guests) : '—'}</td>
                    <td className="r c-avgt">{s.avgServiceMin != null ? `${Math.round(s.avgServiceMin)} ${tr(lang, 'мин', 'min', 'daq')}` : '—'}</td>
                    <td className="r c-share">{(s.revenue / totalRev * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</td>
                    {hasAccrual && <td className="r c-acc">{acc != null ? fmt(acc) : '—'}</td>}
                    <td className="r">{g ? <span className={`grade ${g}`}>{g}</span> : (s.openTables ? <span className="faint">{tr(lang, `${s.openTables} стол.`, `${s.openTables} tbl`, `${s.openTables} stol`)}</span> : '—')}</td>
                  </tr>
                  <tr className="detail" hidden={!isOpen}><td colSpan={hasAccrual ? 11 : 10}><div className="det">
                    <div><h4>{tr(lang, 'Что продаёт чаще всего', 'Sells most often', "Eng ko'p sotadi")}</h4>
                      {s.topDishes.length ? <ol>{s.topDishes.slice(0, 5).map(d => <li key={d.name}>{d.name} <span className="faint">× {d.qty} · {fmt(d.revenue)}</span></li>)}</ol> : <p className="faint">{tr(lang, 'Нет данных по блюдам', 'No dish data', "Taomlar bo'yicha ma'lumot yo'q")}</p>}</div>
                    <div><h4>{tr(lang, 'Смена', 'Shift', 'Smena')}</h4><p>{s.hoursWorked != null ? tr(lang, `${s.hoursWorked} ч на смене, `, `${s.hoursWorked} h on shift, `, `smenada ${s.hoursWorked} soat, `) : ''}{tr(lang, `${fmt(s.dishes)} позиций, выручка ${fmt(s.revenue)}`, `${fmt(s.dishes)} items, revenue ${fmt(s.revenue)}`, `${fmt(s.dishes)} pozitsiya, tushum ${fmt(s.revenue)}`)}.</p></div>
                  </div></td></tr>
                </React.Fragment>
              );
            }) : (rows as StaffAbcRow[]).map(s => {
              const acc = accrual(s.name);
              return (
                <tr key={s.name} className="row">
                  <td className="n">{s.name}</td>
                  <td className="r">{fmt(s.orders)}</td>
                  <td className="r">{fmt(s.avgCheck)}</td>
                  <td className="r c-share">{s.share.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</td>
                  {hasAccrual && <td className="r c-acc">{acc != null ? fmt(acc) : '—'}</td>}
                  <td className="r"><span className={`grade ${s.abc}`}>{s.abc}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="staff-note">{today
        ? (isPoster ? tr(lang, 'Данные из Poster за сегодня.', "Today's data from Poster.", 'Bugungi Poster maʼlumotlari.') : tr(lang, 'Время прихода и ухода приходит с кассы iikoFront.', 'Clock-in and clock-out come from the iikoFront till.', 'Kelish va ketish vaqti iikoFront kassasidan keladi.'))
        : tr(lang, 'ABC по выручке за период (Парето 70/90).', 'ABC by revenue for the period (Pareto 70/90).', "Davr tushumi bo'yicha ABC (Pareto 70/90).")}</p>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export const Operations: React.FC<{
  lang: Language;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  branch?: string | null;
  onContextReady?: (ctx: string) => void;
  branches?: BranchSummary[];
  isAllBranches?: boolean;
  onNavigate?: (v: ViewState) => void;
}> = ({ lang, onShowToast, branch, onContextReady, branches = [], isAllBranches = false, onNavigate }) => {
  const t = TRANSLATIONS[lang];
  const demo = isDemoTenant();
  const isBasePlan = getTenantPlan() === 'base';

  const [removedStopIds, setRemovedStopIds] = useState<Set<string>>(new Set());

  // AI features
  const [staffNarrative, setStaffNarrative] = useState<string | null>(null);
  const [staffNarrativeError, setStaffNarrativeError] = useState<string | null>(null);
  const [wastePatterns, setWastePatterns] = useState<{ patterns?: { dish: string; peakDay: string; rootCause: string; advice: string }[]; summary?: string } | null>(null);
  const [wasteLoading, setWasteLoading] = useState(false);
  const [wasteError, setWasteError] = useState<string | null>(null);
  const [shiftSchedule, setShiftSchedule] = useState<{ schedule?: ShiftScheduleDay[]; summary?: string } | null>(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [shiftPdfLoading, setShiftPdfLoading] = useState(false);
  const [shiftTgLoading, setShiftTgLoading] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(false);

  // iiko API data
  const [cashShift, setCashShift]       = useState<CashShift | null>(null);
  const [cashShiftLoading, setCashShiftLoading] = useState(true);
  const [kpis, setKpis]                 = useState<OpsKpis | null>(null);
  const [kpisLoading, setKpisLoading]   = useState(true);
  const [staffRows, setStaffRows]       = useState<StaffRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [stopList, setStopList]         = useState<StopItem[]>([]);
  const [stopLoading, setStopLoading]   = useState(true);
  const [showCardBreakdown, setShowCardBreakdown] = useState(false);
  // Poster has no TRACEPLUGIN equivalent — see docs/poster-unsupported-features.md.
  // Every widget below that gates on `pluginConnected` needs this AND'd in too,
  // otherwise a Poster tenant's websocket (to TRACE's own backend, always up
  // regardless of POS type) reads as "plugin connected" with zero real events
  // ever arriving — a permanent "waiting..." state, not an honest empty one.
  const [isPoster, setIsPoster] = useState(false);
  // True once a real Poster Marketplace webhook arrives over the WS — proof
  // the push path flows for this account, not just that our socket is open.
  const [posterLive, setPosterLive] = useState(false);
  // Bumped on each Poster `transaction` webhook: reload orders/occupancy now.
  const [posterOrdersTick, setPosterOrdersTick] = useState(0);
  // Whether the (single-branch) hall map has a real plan to show — default
  // true so the card doesn't flash visible-then-gone while HallMap's own
  // fetch is still in flight; HallMap reports the real answer once known.
  const [hasHallPlan, setHasHallPlan] = useState(true);
  // Same idea per-branch for the "All branches" hall map view — each
  // branch's own HallMap instance reports whether it has a real plan.
  const [branchHasHallPlan, setBranchHasHallPlan] = useState<Map<string, boolean>>(new Map());

  // Seeds branchHasHallPlan independently of HallMap mounting — the render
  // below only mounts HallMap for branches already marked true in this map,
  // so without this fetch nothing would ever set that flag and the whole
  // multi-branch card would stay hidden forever.
  useEffect(() => {
    if (!isAllBranches || branches.length === 0) return;
    let cancelled = false;
    Promise.all(branches.map(b => traceApi.halls.list(b.id).then(p => [b.id, p.length > 0] as const).catch(() => [b.id, false] as const)))
      .then(entries => { if (!cancelled) setBranchHasHallPlan(new Map(entries)); });
    return () => { cancelled = true; };
  }, [isAllBranches, branches]);

  useEffect(() => {
    if (demo) return;
    traceApi.settings.telegramStatus().then(s => setTelegramConnected(!!s.connected)).catch(() => {});
  }, [demo]);

  useEffect(() => {
    traceApi.sales.status().then(s => setIsPoster(!!s.poster)).catch(() => {});
  }, [demo]);

  useEffect(() => {
    Promise.all([
      traceApi.operations.cashShift().catch(() => null),
      traceApi.operations.kpis().catch(() => null),
      traceApi.operations.staff().catch(() => [] as typeof staffRows),
      traceApi.operations.stopList().catch(() => [] as typeof stopList),
    ]).then(([shift, kpiData, rows, stops]) => {
      setCashShift(shift);
      setCashShiftLoading(false);
      setKpis(kpiData);
      setKpisLoading(false);
      setStaffRows(rows);
      setStaffLoading(false);
      setStopList(stops);
      setStopLoading(false);

      if (onContextReady) {
        const fmt = (n: number) => n.toLocaleString('ru-RU');
        const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
        const totalOrd = rows.reduce((s, r) => s + r.orders, 0);
        const staffList = [...rows].sort((a, b) => b.revenue - a.revenue)
          .map(r => `  ${r.name}: ${fmt(r.revenue)} UZS, ${r.orders} заказов`)
          .join('\n');
        const stopLines = stops.length > 0
          ? stops.map(s => `  ${s.name}${s.category ? ` [${s.category}]` : ''}`).join('\n')
          : '  нет';
        onContextReady(
          `Раздел: Операции\n` +
          `Официанты (смена):\n${staffList || '  нет данных'}\n` +
          `Итого выручка: ${fmt(totalRev)} UZS | Заказов: ${totalOrd}\n` +
          (kpiData ? `Среднее время обслуживания: ${kpiData.avgServiceMin != null ? kpiData.avgServiceMin + ' мин' : 'н/д'} | Списания: ${kpiData.wasteSum != null ? fmt(kpiData.wasteSum) + ' UZS' : 'н/д'}\n` : '') +
          `\nСтоп-лист (${stops.length} позиций):\n${stopLines}` +
          (shift ? `\nКасса: нал ${fmt(shift.cash)} UZS, карта ${fmt(shift.card)} UZS, выручка ${fmt(shift.revenue)} UZS, заказов ${shift.orders}` : '')
        );
      }
    });
  }, [onContextReady]);

  // Staff narrative — Pro only, user-triggered
  const [staffNarrativeLoading, setStaffNarrativeLoading] = useState(false);
  const fetchStaffNarrative = () => {
    if (isBasePlan || staffNarrativeLoading) return;
    setStaffNarrativeLoading(true);
    setStaffNarrativeError(null);
    traceApi.ai.staffNarrative(lang)
      .then(r => {
        if (r.fromAI && r.narrative) setStaffNarrative(r.narrative);
        else setStaffNarrativeError(tr(lang, 'Не удалось получить анализ. Попробуйте ещё раз.', 'Couldn\'t generate analysis. Try again.', 'Tahlil olinmadi. Qayta urinib ko\'ring.'));
      })
      .catch(() => setStaffNarrativeError(tr(lang, 'Не удалось получить анализ. Попробуйте ещё раз.', 'Couldn\'t generate analysis. Try again.', 'Tahlil olinmadi. Qayta urinib ko\'ring.')))
      .finally(() => setStaffNarrativeLoading(false));
  };

  // Tick every 30s so ticketMin refreshes without plugin events
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Realtime active orders map (plugin) — demo tenant gets a fixed seeded board, no plugin/WS needed
  const [rtOrders, setRtOrders] = useState<Map<string, { tableNum?: number; waiter?: string; items: number; guests?: number | null; openTime: string; sum: number; number?: number; status: string }>>(() => {
    if (!demo) return new Map();
    const m = new Map();
    for (const o of demoActiveOrders()) {
      m.set(o.id, { tableNum: o.tableNum, waiter: o.waiter, items: o.items, openTime: o.openTime, sum: o.sum, number: o.number, status: o.status });
    }
    return m;
  });

  // Seed active orders from backend on mount (WS only carries events after
  // page load, so orders opened earlier were invisible), then keep
  // reconciling against the same REST snapshot every 30s. rtOrders is
  // otherwise a pure WS event replay — a single dropped order_closed/
  // order_removed send (reconnect storm, missed frame) leaves a closed
  // order stuck "active" forever with no self-correction. useOccupiedTables
  // already guards the heatmap/dashboard this same way; this list needs the
  // same resync so a lost close event heals itself within 30s instead of
  // requiring a page reload.
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    const resync = () => {
      traceApi.operations.activeOrders()
        .then(rows => {
          if (cancelled) return;
          // Full replace from the authoritative REST snapshot — same
          // pattern useOccupiedTables uses. A WS bill_printed push is more
          // current than REST's status field (which only reflects the last
          // poll), so preserve that one field off the existing entry.
          setRtOrders(prev => {
            const m = new Map<string, { tableNum?: number; waiter?: string; items: number; guests?: number | null; openTime: string; sum: number; number?: number; status: string }>();
            for (const o of rows) {
              const existing = prev.get(o.id);
              m.set(o.id, {
                tableNum: o.tableNum ?? undefined, waiter: o.waiter, items: o.items,
                guests: o.guests ?? null,
                openTime: o.openTime, sum: o.sum, number: o.number,
                status: existing?.status === 'Bill' ? existing.status : o.status,
              });
            }
            return m;
          });
        })
        .catch(() => {});
    };
    resync();
    const id = setInterval(resync, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [demo]);

  const wsUrl = import.meta.env.VITE_BACKEND_WS_URL as string | undefined;
  const { connected: rtConnected } = useRealtimeData({
    backendWsUrl: wsUrl ?? '',
    // See Dashboard: no `!!wsUrl` gate — the hook falls back to same host.
    enabled: !demo,
    onEvent: useCallback((event: RealtimeEvent) => {
      // Poster Marketplace webhooks (posterWebhook.ts), namespaced
      // `poster.<object>.<action>`. The body is a bare ping, so each object
      // refetches the REST endpoint behind its widget.
      if (event.type.startsWith('poster.')) {
        setPosterLive(true);
        const obj = (event.data as PosterWebhookData)?.object;
        if (obj === 'transaction') setPosterOrdersTick(t => t + 1);
        else if (obj === 'incoming_order') traceApi.operations.reservations().then(setReservations).catch(() => {});
        else if (obj === 'stock') traceApi.operations.stopList().then(setStopList).catch(() => {});
        return;
      }

      // Stop list — live push from plugin. The raw event only carries product
      // ids, so refetch the REST endpoint which resolves human product names.
      if (event.type === 'stop_list_updated') {
        traceApi.operations.stopList().then(setStopList).catch(() => {});
        return;
      }

      const d = event.data as any;
      const orderId = d.orderId as string | undefined;
      if (!orderId) return;

      if (event.type === 'order_opened' || event.type === 'order_updated') {
        setRtOrders(prev => {
          const m = new Map(prev);
          m.set(orderId, { tableNum: d.table?.number, waiter: d.waiter, items: (d.items ?? []).length, guests: d.guestsCount ?? m.get(orderId)?.guests ?? null, openTime: d.openTime ?? m.get(orderId)?.openTime ?? event.timestamp, sum: d.sum ?? 0, number: d.number, status: 'New' });
          return m;
        });
      } else if (event.type === 'order_bill_printed') {
        // Bill printed — mark order status in active orders table
        setRtOrders(prev => {
          const existing = prev.get(orderId);
          if (!existing) return prev;
          const m = new Map(prev);
          m.set(orderId, { ...existing, status: 'Bill' });
          return m;
        });
      } else if (event.type === 'order_closed' || event.type === 'order_removed') {
        setRtOrders(prev => { const m = new Map(prev); m.delete(orderId); return m; });
      }
    }, []),
  });
  // rtConnected only proves the BROWSER's own websocket reached our
  // always-on backend — it says nothing about whether TRACEPLUGIN (the
  // iiko-side agent running at the restaurant) was ever installed or is
  // actually online. Poll the backend's real per-tenant plugin registry
  // (ws/handler.ts's pluginClients) so the badge — and everything gated on
  // it, including the hall heatmap — reflects the plugin, not our uptime.
  const [pluginLiveConnected, setPluginLiveConnected] = useState(false);
  useEffect(() => {
    if (demo || isPoster) return;
    let cancelled = false;
    const poll = () => traceApi.operations.pluginStatus().then(s => { if (!cancelled) setPluginLiveConnected(s.connected); }).catch(() => {});
    poll();
    const id = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [demo, isPoster]);
  const pluginConnected = !isPoster && (demo || (rtConnected && pluginLiveConnected));

  // Same source Dashboard's occupancy stat uses — the hall heatmap and the
  // "Загрузка зала" % always agree instead of drifting apart from separate
  // event-replay logic.
  const { tables: occupiedTables, info: tableInfo } = useOccupiedTables(true, 30_000, posterOrdersTick);

  const mergedActiveOrders = useMemo(() => {
    return Array.from(rtOrders.entries()).map(([id, o]) => ({
      id, number: o.number,
      table: o.tableNum != null ? tr(lang, `Стол ${o.tableNum}`, `Table ${o.tableNum}`, `Stol ${o.tableNum}`) : '—',
      waiter: o.waiter ?? '—', items: o.items, guests: o.guests ?? null, status: o.status ?? 'New', openTime: o.openTime,
      ticketMin: Math.floor((now - new Date(o.openTime).getTime()) / 60000), sum: o.sum,
    }));
  }, [rtOrders, lang, now]);

  // rtOrders above is a WebSocket replay (TRACEPLUGIN-only) and stays empty
  // for Poster tenants. Poll every 30s as a self-healing baseline and reload
  // instantly on a Poster `transaction` webhook (posterOrdersTick).
  const [posterActiveOrders, setPosterActiveOrders] = useState<ActiveOrderRow[]>([]);
  const loadPosterOrdersRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!isPoster || isAllBranches) { setPosterActiveOrders([]); return; }
    let cancelled = false;
    const load = () => { traceApi.operations.activeOrders().then(rows => { if (!cancelled) setPosterActiveOrders(rows); }).catch(() => {}); };
    loadPosterOrdersRef.current = load;
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isPoster, isAllBranches]);
  const posterOrdersTickMounted = useRef(false);
  useEffect(() => {
    if (!isPoster || isAllBranches) return;
    if (!posterOrdersTickMounted.current) { posterOrdersTickMounted.current = true; return; }
    loadPosterOrdersRef.current();
  }, [posterOrdersTick, isPoster, isAllBranches]);

  // Poster only — incomingOrders.getReservations, no iiko-side equivalent.
  // Polls every 60s, plus an instant reload on an `incoming_order` webhook.
  // TRACE's own bookings (Бронирование): today's and tomorrow's, not cancelled.
  // null = the section is off for this restaurant (or not loaded) → hidden.
  const [bookings, setBookings] = useState<StaffReservation[] | null>(null);
  useEffect(() => {
    if (isPoster || isAllBranches) { setBookings(null); return; }
    let alive = true;
    const load = () => {
      const from = new Date(), to = new Date(Date.now() + 2 * 86400_000);
      bookingApi.reservations.list({ from: from.toISOString(), to: to.toISOString() }, ['pending', 'confirmed', 'seated'])
        .then(r => { if (alive) setBookings(Array.isArray(r) ? r.sort((a, b) => a.start_at.localeCompare(b.start_at)) : []); })
        .catch(() => { if (alive) setBookings(null); });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [isPoster, isAllBranches]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  useEffect(() => {
    if (!isPoster || isAllBranches) { setReservations([]); return; }
    let cancelled = false;
    setReservationsLoading(true);
    const load = () => traceApi.operations.reservations()
      .then(rows => { if (!cancelled) setReservations(rows); })
      .catch(() => { if (!cancelled) setReservations([]); })
      .finally(() => { if (!cancelled) setReservationsLoading(false); });
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isPoster, isAllBranches]);

  // "All branches" combined active orders — polls the REST snapshot per
  // sibling branch and merges, rather than fanning out live WebSocket
  // connections (useRealtimeData above is wired for a single tenant). Less
  // instantaneous than the single-branch live view, but correct and simple;
  // a live multi-branch WS fan-out is a larger follow-up if this isn't fast
  // enough in practice.
  const [combinedActiveOrders, setCombinedActiveOrders] = useState<(ActiveOrderRow & { branchName: string; branchId: string })[]>([]);
  useEffect(() => {
    if (!isAllBranches || branches.length === 0) { setCombinedActiveOrders([]); return; }
    let cancelled = false;
    const load = () => {
      Promise.all(branches.map(b =>
        traceApi.operations.activeOrders(b.id)
          .then(rows => rows.map(r => ({ ...r, branchName: b.name, branchId: b.id })))
          .catch(() => [] as (ActiveOrderRow & { branchName: string; branchId: string })[]),
      )).then(perBranch => {
        if (!cancelled) setCombinedActiveOrders(perBranch.flat());
      });
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isAllBranches, branches]);

  // Per-branch occupancy derived from the same combined-orders fetch above —
  // mirrors useOccupiedTables' logic (most-recently-opened order per table)
  // but scoped per branch, so each branch's hall map gets its own accurate
  // occupancy instead of reusing the self-tenant's.
  const perBranchOccupancy = useMemo(() => {
    const result = new Map<string, { tables: Set<number>; info: Map<number, { min: number; sum: number }> }>();
    if (!isAllBranches) return result;
    const now = Date.now();
    const openMsByBranchTable = new Map<string, number>();
    for (const o of combinedActiveOrders) {
      if (o.tableNum == null) continue;
      if (!result.has(o.branchId)) result.set(o.branchId, { tables: new Set(), info: new Map() });
      const key = `${o.branchId}:${o.tableNum}`;
      const openMs = new Date(o.openTime).getTime();
      const prevOpenMs = openMsByBranchTable.get(key);
      if (prevOpenMs != null && prevOpenMs >= openMs) continue;
      openMsByBranchTable.set(key, openMs);
      const entry = result.get(o.branchId)!;
      entry.tables.add(o.tableNum);
      entry.info.set(o.tableNum, { min: Math.max(0, Math.floor((now - openMs) / 60000)), sum: o.sum });
    }
    return result;
  }, [combinedActiveOrders, isAllBranches]);

  // Distinct (branch, table) pairs — a plain count of active orders would
  // double-count a table with two open tickets; this also avoids conflating
  // "Table 1" at Branch A with "Table 1" at Branch B (table numbers aren't
  // unique across branches).
  const combinedOccupiedCount = useMemo(() => {
    const keys = new Set<string>();
    for (const o of combinedActiveOrders) {
      if (o.tableNum != null) keys.add(`${o.branchName}:${o.tableNum}`);
    }
    return keys.size;
  }, [combinedActiveOrders]);

  const stopItems = stopList.filter(i => !removedStopIds.has(i.id));
  const [stopVisible, setStopVisible] = useState(5);
  const [activeOrdersVisible, setActiveOrdersVisible] = useState(5);

  // Voids feed the "Удаления" block and the alert jump target.
  const [voidEvents, setVoidEvents] = useState<VoidEvent[]>([]);
  useEffect(() => {
    if (!pluginConnected) return;
    const load = () => traceApi.operations.voidEvents().then(setVoidEvents).catch(() => {});
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [pluginConnected]);

  const [ordersAll, setOrdersAll] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const fmtN = (n: number) => Math.round(n).toLocaleString('ru-RU');
  const hm = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }) : '';
  const nowLabel = new Date().toLocaleString(tr(lang, 'ru-RU', 'en-GB', 'uz-Latn-UZ'), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });

  // ── AI tools ──
  const [waste, setWaste] = useState<{ state: AiState; at: string | null; err?: string | null }>({ state: 'empty', at: null });
  const runWaste = () => {
    setWaste({ state: 'loading', at: null });
    traceApi.ai.wasteRootCause(lang)
      .then(r => { if (r.fromAI) { setWastePatterns(r); setWaste({ state: 'done', at: nowHM() }); } else setWaste({ state: 'empty', at: null, err: tr(lang, 'Не получилось: проверьте подключение кассы и попробуйте ещё раз.', "Didn't work: check the POS connection and try again.", "Bo'lmadi: kassa ulanishini tekshiring.") }); })
      .catch(() => setWaste({ state: 'empty', at: null, err: tr(lang, 'Не получилось. Попробуйте ещё раз.', "Didn't work. Try again.", "Bo'lmadi. Qayta urinib ko'ring.") }));
  };
  const [shiftAi, setShiftAi] = useState<{ state: AiState; at: string | null; err?: string | null }>({ state: 'empty', at: null });
  const runShift = () => {
    setShiftAi({ state: 'loading', at: null });
    traceApi.ai.shiftSchedule(lang)
      .then(r => { if (r.fromAI) { setShiftSchedule(r); setShiftAi({ state: 'done', at: nowHM() }); } else setShiftAi({ state: 'empty', at: null, err: tr(lang, 'Не получилось: проверьте подключение кассы и попробуйте ещё раз.', "Didn't work: check the POS connection and try again.", "Bo'lmadi: kassa ulanishini tekshiring.") }); })
      .catch(() => setShiftAi({ state: 'empty', at: null, err: tr(lang, 'Не получилось. Попробуйте ещё раз.', "Didn't work. Try again.", "Bo'lmadi. Qayta urinib ko'ring.") }));
  };
  const teamState: AiState = staffNarrativeLoading ? 'loading' : staffNarrative ? 'done' : 'empty';
  const [teamAt, setTeamAt] = useState<string | null>(null);
  useEffect(() => { if (staffNarrative) setTeamAt(nowHM()); }, [staffNarrative]);

  const shiftDownload = (kind: 'pdf' | 'xlsx' | 'tg') => {
    const sch = shiftSchedule?.schedule; if (!sch?.length) return;
    if (kind === 'xlsx') { downloadShiftScheduleExcel(sch, shiftSchedule!.summary, lang); return; }
    if (kind === 'pdf') {
      if (demo) { downloadShiftSchedulePdfClientSide(sch, shiftSchedule!.summary, lang); return; }
      setShiftPdfLoading(true);
      traceApi.ai.shiftScheduleExportPdf(sch, shiftSchedule!.summary, lang)
        .then(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `TRACE-shift-schedule-${new Date().toISOString().slice(0, 10)}.pdf`; a.click(); URL.revokeObjectURL(url); })
        .catch(() => onShowToast?.(tr(lang, 'Не удалось скачать PDF', "Couldn't download PDF", "PDF yuklab bo'lmadi"), 'error'))
        .finally(() => setShiftPdfLoading(false));
      return;
    }
    if (demo) { onShowToast?.(tr(lang, 'Демо: отправлено в Telegram', 'Demo: sent to Telegram', 'Demo: Telegramga yuborildi'), 'success'); return; }
    if (!telegramConnected) { onShowToast?.(tr(lang, 'Сначала подключите Telegram в Настройках → Отчёты', 'Connect Telegram first in Settings → Reports', "Avval Sozlamalar → Hisobotlar'da Telegram ulang"), 'info'); return; }
    setShiftTgLoading(true);
    traceApi.ai.shiftScheduleSendTelegram(sch, shiftSchedule!.summary, lang)
      .then(r => onShowToast?.(r.ok ? tr(lang, 'Отправлено в Telegram', 'Sent to Telegram', 'Telegramga yuborildi') : (r.error ?? tr(lang, 'Не удалось отправить', "Couldn't send", "Yuborib bo'lmadi")), r.ok ? 'success' : 'error'))
      .catch(() => onShowToast?.(tr(lang, 'Не удалось отправить', "Couldn't send", "Yuborib bo'lmadi"), 'error'))
      .finally(() => setShiftTgLoading(false));
  };

  const proLock = isBasePlan ? tr(lang, 'Доступно в тарифе Pro', 'Available on the Pro plan', 'Pro tarifida mavjud') : null;
  const scheduleTable = (() => {
    const sch = shiftSchedule?.schedule; if (!sch?.length) return null;
    const days = sch.map(d => d.day);
    const waiters = [...new Set(sch.flatMap(d => d.assignments.map(a => a.waiter)))];
    const cells = new Map<string, string>();
    const hours = new Map<string, number>();
    for (const d of sch) for (const a of d.assignments) {
      const k = `${a.waiter}|${d.day}`;
      cells.set(k, [cells.get(k), `${a.start}–${a.end}`].filter(Boolean).join(', '));
      hours.set(a.waiter, (hours.get(a.waiter) ?? 0) + hoursBetween(a.start, a.end));
    }
    waiters.sort((a, b) => (hours.get(b) ?? 0) - (hours.get(a) ?? 0));
    return (
      <div className="sched"><table>
        <thead><tr><th>{tr(lang, 'Официант', 'Waiter', 'Ofitsiant')}</th>{days.map(d => <th key={d}>{d}</th>)}<th>{tr(lang, 'Часов', 'Hours', 'Soat')}</th></tr></thead>
        <tbody>{waiters.map(w => (
          <tr key={w}><td>{w.replace(/\(официант\)/i, '').trim()}</td>
            {days.map(d => { const c = cells.get(`${w}|${d}`); return <td key={d} className={c ? '' : 'down'}>{c ?? tr(lang, 'вых', 'off', 'dam')}</td>; })}
            <td>{(hours.get(w) ?? 0).toFixed(1)}</td></tr>
        ))}</tbody>
      </table></div>
    );
  })();

  const tiles: TrioTile[] = [
    {
      key: 'waste', icon: 'ph-trash', short: tr(lang, 'Списания', 'Waste', 'Chiqim'), title: tr(lang, 'Причины списаний', 'Why we write off', 'Hisobdan chiqarish sabablari'),
      desc: tr(lang, 'В какие дни и на каких продуктах больше всего списаний и сколько закупать, чтобы их стало меньше.', 'Which days and products drive write-offs and how much to buy so there are fewer.', "Qaysi kunlar va mahsulotlarda ko'proq hisobdan chiqariladi va qancha xarid qilish kerak."),
      runLabel: tr(lang, 'Найти причины', 'Find causes', 'Sabablarni topish'), wait: tr(lang, 'Сравниваем списания по дням недели с продажами и закупками…', 'Comparing write-offs by weekday with sales and purchases…', 'Hafta kunlari boʻyicha chiqimlarni savdo va xaridlar bilan solishtiryapmiz…'),
      state: waste.state, when: waste.at, error: waste.err, onRun: runWaste, locked: proLock,
      summary: wastePatterns?.summary ? <>{wastePatterns.summary.split(/(?<=\.)\s/)[0]}</> : <><b>{wastePatterns?.patterns?.length ?? 0}</b> {tr(lang, 'закономерностей', 'patterns', 'qonuniyat')}</>,
      body: <>
        {wastePatterns?.summary && <p className="ai-p">{wastePatterns.summary}</p>}
        {!!wastePatterns?.patterns?.length && (
          <table className="norms">
            <thead><tr><th>{tr(lang, 'Продукт', 'Product', 'Mahsulot')}</th><th>{tr(lang, 'Когда', 'When', 'Qachon')}</th><th>{tr(lang, 'Почему', 'Why', 'Nega')}</th><th>{tr(lang, 'Что делать', 'What to do', 'Nima qilish')}</th></tr></thead>
            <tbody>{wastePatterns.patterns.map((p, i) => <tr key={i}><td>{p.dish}</td><td>{p.peakDay}</td><td className="muted">{p.rootCause}</td><td>{p.advice}</td></tr>)}</tbody>
          </table>
        )}
      </>,
    },
    {
      key: 'shift', icon: 'ph-calendar-blank', short: tr(lang, 'Смены', 'Shifts', 'Smenalar'), title: tr(lang, 'График смен', 'Shift schedule', 'Smena jadvali'),
      desc: tr(lang, 'Сколько официантов ставить на следующую неделю по дням и часам. С учётом праздников и броней.', 'How many waiters to roster next week by day and hour. Accounts for holidays and bookings.', "Keyingi haftaga kunlar va soatlar bo'yicha qancha ofitsiant qo'yish kerak."),
      runLabel: tr(lang, 'Составить график', 'Build the schedule', 'Jadval tuzish'), wait: tr(lang, 'Считаем гостей на официанта по часам за 8 недель…', 'Working out guests per waiter by hour over 8 weeks…', '8 hafta davomida soatlar boʻyicha ofitsiantga mehmonlarni hisoblayapmiz…'),
      state: shiftAi.state, when: shiftAi.at, error: shiftAi.err, onRun: runShift, locked: proLock,
      summary: shiftSchedule?.summary ? <>{shiftSchedule.summary.split(/(?<=\.)\s/)[0]}</> : null,
      body: <>
        {scheduleTable}
        {shiftSchedule?.summary && <p className="ai-p">{shiftSchedule.summary}</p>}
        <div className="exports">
          <button className="btn" type="button" disabled={shiftPdfLoading} onClick={() => shiftDownload('pdf')}><i className="ph ph-file-pdf" aria-hidden="true" />{shiftPdfLoading ? tr(lang, 'Готовим…', 'Preparing…', 'Tayyorlanmoqda…') : tr(lang, 'Скачать PDF', 'Download PDF', 'PDF yuklab olish')}</button>
          <button className="btn" type="button" onClick={() => shiftDownload('xlsx')}><i className="ph ph-file-xls" aria-hidden="true" />{tr(lang, 'Скачать Excel', 'Download Excel', 'Excel yuklab olish')}</button>
          <button className="btn" type="button" disabled={shiftTgLoading} onClick={() => shiftDownload('tg')}><i className="ph ph-telegram-logo" aria-hidden="true" />{shiftTgLoading ? tr(lang, 'Отправка…', 'Sending…', 'Yuborilmoqda…') : tr(lang, 'В Telegram', 'To Telegram', 'Telegramga')}</button>
        </div>
      </>,
    },
    {
      key: 'team', icon: 'ph-users-three', short: tr(lang, 'Команда', 'Team', 'Jamoa'), title: tr(lang, 'Разбор команды', 'Team review', 'Jamoa tahlili'),
      desc: tr(lang, 'Как работал каждый официант за 7 дней: чек, допродажи, скорость. Банкеты не считаются.', 'How each waiter did over 7 days: check, upsells, speed. Banquets excluded.', "Har bir ofitsiant 7 kun ichida qanday ishladi: chek, qo'shimcha sotuv, tezlik."),
      runLabel: tr(lang, 'Разобрать', 'Review', 'Tahlil qilish'), wait: tr(lang, 'Сравниваем официантов в одинаковые смены…', 'Comparing waiters on the same shifts…', 'Ofitsiantlarni bir xil smenalarda solishtiryapmiz…'),
      state: teamState, when: teamAt, error: staffNarrativeError, onRun: () => fetchStaffNarrative(), locked: proLock,
      summary: staffNarrative ? <>{staffNarrative.split(/(?<=\.)\s/)[0]}</> : null,
      body: staffNarrative && <>{staffNarrative.split(/\n+/).filter(Boolean).map((p, i) => <p key={i} className="ai-p">{p.split(/\*\*(.+?)\*\*/g).map((s, j) => j % 2 ? <b key={j}>{s}</b> : s)}</p>)}</>,
    },
  ];

  const displayOrders: any[] = isAllBranches ? combinedActiveOrders : isPoster ? posterActiveOrders : mergedActiveOrders;
  const ordersSorted = [...displayOrders].sort((a, b) => (b.ticketMin ?? 0) - (a.ticketMin ?? 0));
  const ordersShown = ordersAll ? ordersSorted : ordersSorted.slice(0, 8);
  const stLabel = (o: any): [string, string] => o.status === 'Bill' ? ['bill', tr(lang, 'Пречек', 'Pre-bill', 'Pre-chek')]
    : o.kitchenStatus === 'ready' ? ['ready', tr(lang, 'Отдано', 'Served', 'Berildi')]
    : ['prep', o.kitchenStatus === 'preparing' ? tr(lang, 'Готовится', 'Preparing', 'Tayyorlanmoqda') : tr(lang, 'Открыт', 'Open', 'Ochiq')];
  const showHall = isAllBranches ? branches.some(b => branchHasHallPlan.get(b.id) === true) : hasHallPlan;
  const strip: [string, React.ReactNode, string][] = [
    [tr(lang, 'Среднее время стола', 'Average table time', "O'rtacha stol vaqti"), kpis?.avgServiceMin != null ? <>{Math.round(kpis.avgServiceMin)}<small>{tr(lang, 'мин', 'min', 'daq')}</small></> : '—',
      kpis?.avgServiceMin != null ? (isPoster ? tr(lang, 'сегодня · Poster', 'today · Poster', 'bugun · Poster') : tr(lang, 'сегодня · iikoFront', 'today · iikoFront', 'bugun · iikoFront')) : tr(lang, 'копим данные по закрытым заказам', 'collecting closed orders', "yopilgan buyurtmalar yig'ilmoqda")],
    ...(!isPoster ? [[tr(lang, 'Время отдачи кухни', 'Kitchen time', 'Oshxona vaqti'), kpis?.avgKitchenMin != null ? <>{Math.round(kpis.avgKitchenMin)}<small>{tr(lang, 'мин', 'min', 'daq')}</small></> : '—', tr(lang, 'от заказа до «готово»', 'from order to “ready”', 'buyurtmadan «tayyor»gacha')] as [string, React.ReactNode, string]] : []),
    [tr(lang, 'Списания сегодня', 'Write-offs today', 'Bugungi chiqim'), kpis?.wasteSum != null ? <>{fmtN(kpis.wasteSum)}<small>{tr(lang, 'сум', 'UZS', "so'm")}</small></> : '—', isPoster ? 'Poster' : 'iiko'],
    [tr(lang, 'На смене', 'On shift', 'Smenada'), kpis?.staffActive != null ? <>{kpis.staffActive}<small>{tr(lang, 'человек', 'people', 'kishi')}</small></> : '—', tr(lang, 'сотрудников сегодня', 'staff today', 'bugungi xodimlar')],
  ];

  return (
    <>
      <div className="page-head rise">
        <div>
          <h1>{tr(lang, 'Операции', 'Operations', 'Operatsiyalar')}</h1>
          <div className="sub"><span>{nowLabel.replace(/^./, c => c.toUpperCase())}.</span>
            <span className="faint">{isAllBranches ? tr(lang, `Все филиалы (${branches.length}), обновление раз в 30 секунд.`, `All branches (${branches.length}), refreshed every 30 seconds.`, `Barcha filiallar (${branches.length}), har 30 soniyada yangilanadi.`)
              : pluginConnected ? tr(lang, 'Данные с кассы идут в реальном времени.', 'Till data arrives in real time.', 'Kassa maʼlumotlari real vaqtda keladi.')
              : isPoster && posterLive ? tr(lang, 'Данные Poster идут в реальном времени.', 'Poster data arrives in real time.', 'Poster maʼlumotlari real vaqtda keladi.')
              : isPoster ? tr(lang, 'Poster, обновление раз в 30 секунд.', 'Poster, refreshed every 30 seconds.', 'Poster, har 30 soniyada yangilanadi.')
              : tr(lang, 'Касса iikoFront не на связи: живые данные недоступны.', 'The iikoFront till is offline: no live data.', 'iikoFront kassasi ulanmagan.')}</span>
          </div>
        </div>
      </div>

      {/* 1. What needs attention right now */}
      <Alerts lang={lang} pluginConnected={pluginConnected} onGo={a => jump(a.type === 'void_spike' ? 'h-voids' : a.type === 'kitchen_overdue' ? 'h-orders' : 'h-hall')} />

      {/* 2. Pace of the shift */}
      <section className="strip rise" style={{ animationDelay: '.08s' }} aria-label={tr(lang, 'Показатели смены', 'Shift numbers', "Smena ko'rsatkichlari")}>
        {strip.map(([l, v, d]) => <div key={l}><div className="s-l">{l}</div><div className="s-v">{kpisLoading ? <span className="faint">…</span> : v}</div><div className="s-d">{d}</div></div>)}
      </section>

      {/* 3. Floor + cash + stop list */}
      <div className="floor rise" style={{ animationDelay: '.12s', ...(showHall || !isAllBranches ? {} : { gridTemplateColumns: '1fr' }) }}>
        {!showHall && !isAllBranches && (
          <section className="card-ph" aria-labelledby="h-hall">
            <div className="sec-head"><h2 id="h-hall">{tr(lang, 'Зал', 'Floor', 'Zal')}</h2></div>
            <div className="hall-empty">
              <i className="ph ph-squares-four" aria-hidden="true" />
              <p>{isPoster
                ? tr(lang, 'Схемы зала пока нет. Её настроит поддержка TRACE — тогда здесь будет видно, какие столы заняты.', 'No floor plan yet. TRACE support sets it up — then this shows which tables are busy.', "Zal sxemasi hali yo'q. Uni TRACE yordami sozlaydi — keyin band stollar ko'rinadi.")
                : tr(lang, 'Схемы зала пока нет. Она появится сама, когда касса iikoFront передаст залы и столы.', 'No floor plan yet. It appears by itself once the iikoFront till sends its halls and tables.', "Zal sxemasi hali yo'q. iikoFront kassasi zal va stollarni yuborganda o'zi paydo bo'ladi.")}</p>
            </div>
          </section>
        )}
        {showHall && (
          <section className="card-ph" aria-labelledby="h-hall">
            <div className="sec-head"><h2 id="h-hall">{tr(lang, 'Зал', 'Floor', 'Zal')}</h2>{((PLUGIN_ENABLED && pluginConnected) || (isPoster && posterLive)) && <span className="state">{tr(lang, 'Live', 'Live', 'Live')}</span>}</div>
            {isAllBranches ? branches.filter(b => branchHasHallPlan.get(b.id) === true).map(b => {
              const occ = perBranchOccupancy.get(b.id);
              return (
                <div key={b.id} style={{ marginBottom: 24 }}>
                  <h3 className="sec-note" style={{ margin: '0 0 8px' }}>{b.name}</h3>
                  <HallMap lang={lang} onToast={onShowToast} branchId={b.id} occupiedTables={occ && occ.tables.size > 0 ? occ.tables : undefined} tableInfo={occ?.info} isPoster={isPoster}
                    onHasPlanChange={hasPlan => setBranchHasHallPlan(m => new Map(m).set(b.id, hasPlan))} />
                </div>
              );
            }) : (
              <HallMap lang={lang} onToast={onShowToast} occupiedTables={(PLUGIN_ENABLED && pluginConnected || isPoster) && occupiedTables.size > 0 ? occupiedTables : undefined} tableInfo={tableInfo} isPoster={isPoster} onHasPlanChange={setHasHallPlan} />
            )}
          </section>
        )}

        <div className="side">
          <section className="card-ph" aria-labelledby="h-cash">
            <div className="sec-head"><h2 id="h-cash">{tr(lang, 'Кассовая смена', 'Cash shift', 'Kassa smenasi')}</h2>
              {cashShift && <span className="state" style={cashShift.status === 'open' ? undefined : { color: 'var(--text-3)', borderColor: 'var(--rule)' }}>{cashShift.status === 'open' ? tr(lang, 'Открыта', 'Open', 'Ochiq') : tr(lang, 'Закрыта', 'Closed', 'Yopiq')}</span>}</div>
            {cashShiftLoading ? <Skel lines={['w7', 'w9', 'w9', 'w9']} /> : !cashShift ? <p className="rd-empty">{tr(lang, 'Не удалось загрузить смену', "Couldn't load the shift", "Smenani yuklab bo'lmadi")}</p> : <>
              <div className="cash-who"><span>{tr(lang, 'Кассир', 'Cashier', 'Kassir')} <b>{cashShift.cashier ?? '—'}</b></span>{cashShift.openTime && <span>{tr(lang, 'с', 'since', '')} {hm(cashShift.openTime)}</span>}</div>
              <div className="cash-rows">
                <div className="cash-row"><span>{tr(lang, 'Наличные', 'Cash', 'Naqd')}</span><b>{fmtN(cashShift.cash)}</b></div>
                {cashShift.cardBreakdown?.length ? (
                  <button className="cash-row" aria-expanded={cardOpen} onClick={() => setCardOpen(o => !o)}><span>{tr(lang, 'Безнал', 'Card', 'Karta')}<i className="ph ph-caret-down" aria-hidden="true" /></span><b>{fmtN(cashShift.card)}</b></button>
                ) : <div className="cash-row"><span>{tr(lang, 'Безнал', 'Card', 'Karta')}</span><b>{fmtN(cashShift.card)}</b></div>}
                {cardOpen && <div className="card-split">{cashShift.cardBreakdown.map(c => <div key={c.type}><span>{c.type}</span><span>{fmtN(c.amount)}</span></div>)}</div>}
                {cashShift.orders > 0 && <div className="cash-row"><span>{tr(lang, 'Заказы', 'Orders', 'Buyurtmalar')}</span><b>{cashShift.orders}</b></div>}
                <div className="cash-row"><span>{tr(lang, 'Изъятия', 'Payouts', 'Inkassatsiya')}</span><b>{cashShift.payOut > 0 ? fmtN(cashShift.payOut) : '—'}</b></div>
              </div>
              <div className="cash-total"><span className="muted">{tr(lang, 'Выручка смены', 'Shift revenue', 'Smena tushumi')}</span><b>{fmtN(cashShift.revenue)}</b></div>
            </>}
          </section>

          <section className="card-ph stop" aria-labelledby="h-stop">
            <div className="sec-head"><h2 id="h-stop">{tr(lang, 'Стоп-лист', 'Stop list', 'Stop-list')}{stopItems.length > 0 && <span className="count">{stopItems.length}</span>}</h2></div>
            {stopLoading ? <Skel lines={['w9', 'w7', 'w9']} /> : stopItems.length === 0 ? <p className="rd-empty">{tr(lang, 'Стоп-лист пуст', 'The stop list is empty', "Stop-list bo'sh")}</p> : (
              <ul>
                {stopItems.slice(0, stopVisible).map(item => (
                  <li key={item.id}>
                    <span>{item.name}</span>
                    <span className="since">{item.stoppedAt ? `${tr(lang, 'с', 'since', '')} ${hm(item.stoppedAt)}` : item.category}</span>
                    <button className="back" onClick={() => { setRemovedStopIds(p => new Set([...p, item.id])); onShowToast?.(tr(lang, `${item.name}: скрыто до обновления`, `${item.name}: hidden until refresh`, `${item.name}: yangilanguncha yashirildi`), 'info'); }}>{tr(lang, 'Скрыть', 'Hide', 'Yashirish')}</button>
                  </li>
                ))}
              </ul>
            )}
            {stopItems.length > 5 && <button className="link" style={{ marginTop: 10 }} onClick={() => setStopVisible(v => v > 5 ? 5 : stopItems.length)}>{stopVisible > 5 ? tr(lang, 'Свернуть', 'Collapse', "Yig'ish") : tr(lang, `Показать все ${stopItems.length}`, `Show all ${stopItems.length}`, `Hammasi ${stopItems.length}`)}</button>}
          </section>
        </div>
      </div>

      {/* 4. Open orders */}
      <section className="band rise card-ph" style={{ animationDelay: '.16s' }} aria-labelledby="h-orders">
        <div className="sec-head"><h2 id="h-orders">{tr(lang, 'Открытые заказы', 'Open orders', 'Ochiq buyurtmalar')}{displayOrders.length > 0 && <span className="count">{displayOrders.length}</span>}</h2></div>
        {displayOrders.length === 0 ? <p className="rd-empty">{tr(lang, 'Открытых заказов нет', 'No open orders', "Ochiq buyurtmalar yo'q")}</p> : (
          <table className="orders">
            <thead><tr>
              {isAllBranches && <th>{tr(lang, 'Филиал', 'Branch', 'Filial')}</th>}
              <th>{tr(lang, 'Стол', 'Table', 'Stol')}</th><th>{tr(lang, 'Официант', 'Waiter', 'Ofitsiant')}</th>
              <th className="r c-items">{tr(lang, 'Позиций', 'Items', 'Pozitsiya')}</th><th className="r c-guests">{tr(lang, 'Гости', 'Guests', 'Mehmonlar')}</th>
              <th className="r">{tr(lang, 'Открыт', 'Open for', 'Ochiq')}</th><th className="r">{tr(lang, 'Сумма', 'Total', 'Summa')}</th><th className="c-status">{tr(lang, 'Статус', 'Status', 'Holat')}</th>
            </tr></thead>
            <tbody>{ordersShown.map(o => { const [cls, l] = stLabel(o); return (
              <tr key={`${o.branchName ?? ''}-${o.id}`}>
                {isAllBranches && <td>{o.branchName}</td>}
                <td className="t">{String(o.table).replace(/^(Стол|Table|Stol)\s*/, '')}</td><td>{o.waiter}</td>
                <td className="r c-items">{o.items}</td><td className="r c-guests">{o.guests ?? '—'}</td>
                <td className={`r nw ${(o.ticketMin ?? 0) >= 90 ? 'min-long' : ''}`}>{o.ticketMin ?? 0} {tr(lang, 'мин', 'min', 'daq')}</td>
                <td className="r">{o.sum ? fmtN(o.sum) : '—'}</td>
                <td className="c-status"><span className={`st ${cls}`}>{l}</span></td>
              </tr>); })}</tbody>
          </table>
        )}
        {displayOrders.length > 8 && <div className="table-foot" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="link" onClick={() => setOrdersAll(a => !a)}>{ordersAll ? tr(lang, 'Свернуть', 'Collapse', "Yig'ish") : tr(lang, `Показать все ${displayOrders.length}`, `Show all ${displayOrders.length}`, `Hammasi ${displayOrders.length}`)}</button></div>}
      </section>

      {/* 5. Voids + bookings */}
      {(pluginConnected || (isPoster && reservations.length > 0) || bookings != null) && (
        <div className="band-2 band rise" style={{ animationDelay: '.2s', ...(pluginConnected && ((isPoster && reservations.length > 0) || bookings != null) ? {} : { gridTemplateColumns: '1fr' }) }}>
          {pluginConnected && <Voids lang={lang} events={voidEvents} />}
          {bookings != null && <Bookings lang={lang} rows={bookings} onAll={onNavigate ? () => onNavigate('booking') : undefined} />}
          {isPoster && !isAllBranches && reservations.length > 0 && (
            <section className="card-ph" aria-labelledby="h-bk">
              <div className="sec-head"><h2 id="h-bk">{tr(lang, 'Бронирования', 'Bookings', 'Bronlar')}</h2></div>
              <table className="bk">
                <thead><tr><th>{tr(lang, 'Гость', 'Guest', 'Mehmon')}</th><th className="c-phone">{tr(lang, 'Телефон', 'Phone', 'Telefon')}</th><th>{tr(lang, 'Когда', 'When', 'Qachon')}</th><th className="c-dur">{tr(lang, 'На сколько', 'Duration', 'Davomiyligi')}</th><th>{tr(lang, 'Статус', 'Status', 'Holat')}</th></tr></thead>
                <tbody>{reservations.map(r => (
                  <tr key={r.id}>
                    <td>{r.guestName}{r.partySize ? `, ${r.partySize} ${tr(lang, 'чел.', 'ppl', 'kishi')}` : ''}</td>
                    <td className="c-phone"><span className="phone">{r.phone ?? '—'}</span></td>
                    <td>{r.date}</td><td className="c-dur">{formatMinutesShort(r.durationMin, lang)}</td>
                    <td><span className={`bk-st ${r.status === 'accepted' ? 'ok2' : r.status === 'canceled' ? 'cx' : 'new'}`}>{r.status === 'accepted' ? tr(lang, 'Подтверждено', 'Confirmed', 'Tasdiqlangan') : r.status === 'canceled' ? tr(lang, 'Отменено', 'Cancelled', 'Bekor qilingan') : tr(lang, 'Новое', 'New', 'Yangi')}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </section>
          )}
        </div>
      )}

      {/* 6. Team */}
      <StaffTable lang={lang} staffRows={staffRows} staffLoading={staffLoading} isPoster={isPoster} />

      {/* 7. AI tools */}
      <Trio lang={lang} tiles={tiles} />
    </>
  );
};

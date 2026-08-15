import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Card } from '../ui/Card';
import { AIInsightCard } from '../ui/AIInsightCard';
import { PLUGIN_ENABLED } from '../ui/ComingSoon';
import { useOccupiedTables } from '../../hooks/useOccupiedTables';
import { Language } from '../../types';
import { TRANSLATIONS, tr, formatMinutes, formatMinutesShort } from '../../constants';
import { useRealtimeData, RealtimeEvent, StopListUpdateData } from '../../hooks/useRealtimeData';
import { Clock, Trash2, Users, CreditCard, Banknote, AlertTriangle, CheckCircle, Timer, X, Plug, Radio, ChefHat, CalendarClock, Bell, TrendingDown, TrendingUp, Zap, Sparkles, ChevronRight, FileDown, FileSpreadsheet, Send, Calendar as CalendarIcon, Crown, Receipt, Grid2x2 } from 'lucide-react';
import { DateRangePicker } from '../ui/DateRangePicker';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { traceApi, CashShift, OpsKpis, StaffRow, StopItem, HallPlan, HallElement, isDemoTenant, demoActiveOrders, OpsAlert, VoidEvent, getTenantPlan, ShiftScheduleDay, StaffAbcRow, BranchSummary, ActiveOrderRow, ReservationRow } from '../../services/traceApi';
import { HallEditor } from '../HallEditor';
import { ProLock } from '../ui/ProLock';
import { SlotText } from '../ui/SlotNumber';

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
  return new Date().toISOString().slice(0, 10);
}

function HallMap({ lang, onToast, occupiedTables, tableInfo, branchId, isPoster, onHasPlanChange }: { lang: Language; onToast?: (m: string, t: 'info') => void; occupiedTables?: Set<number>; tableInfo?: Map<number, { min: number; sum: number }>; branchId?: string; isPoster?: boolean; onHasPlanChange?: (hasPlan: boolean) => void }) {
  const [plans, setPlans] = useState<HallPlan[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'now' | 'revenue'>('now');
  const [period, setPeriod] = useState<HeatPeriod>(30);
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);
  const [revenueRows, setRevenueRows] = useState<{ table: number; revenue: number; orders: number }[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const revenueCache = useRef<Map<string, { table: number; revenue: number; orders: number }[]>>(new Map());

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

  // Normalize revenue → 0..1 heat per table
  const tableHeat = useMemo(() => {
    if (mode !== 'revenue' || scopedRevenueRows.length === 0) return undefined;
    const max = Math.max(...scopedRevenueRows.map(r => r.revenue));
    return new Map(scopedRevenueRows.map(r => [r.table, max > 0 ? r.revenue / max : 0]));
  }, [mode, scopedRevenueRows]);

  const revenueInfo = useMemo(() => {
    if (mode !== 'revenue' || scopedRevenueRows.length === 0) return undefined;
    return new Map(scopedRevenueRows.map(r => [r.table, { revenue: r.revenue, orders: r.orders }]));
  }, [mode, scopedRevenueRows]);

  // In revenue mode, don't just skip the badge — drop the table shape
  // itself so a mostly-idle hall doesn't render as a grid of blank tables.
  // Structural elements (walls, bar, entrance) stay for orientation.
  const displayPlan = useMemo(() => {
    if (mode !== 'revenue' || !activePlan) return activePlan;
    const revenueTableNumbers = new Set(scopedRevenueRows.map(r => r.table));
    const isTable = (t: string) => t === 'rect_table' || t === 'round_table' || t === 'stool';
    return {
      ...activePlan,
      elements: activePlan.elements.filter(e =>
        !isTable(e.type) || (e.iiko_table_number != null && revenueTableNumbers.has(e.iiko_table_number))),
    };
  }, [mode, activePlan, scopedRevenueRows]);

  // HallEditor snapshots `plan.elements` into local state on mount only, so
  // the inline viewer must remount whenever the filtered table set changes
  // (mode switch, period switch, hall switch) — not just on plan.id.
  const displayPlanKey = mode === 'revenue'
    ? `${activePlan?.id}-revenue-${scopedRevenueRows.map(r => r.table).sort((a, b) => a - b).join(',')}`
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

  const occupiedTableNumbers = useMemo(() => occupiedTables ?? new Set<number>(), [occupiedTables]);

  if (loading) {
    return <div className="h-48 bg-zinc-900/40 rounded animate-pulse" />;
  }

  if (plans.length === 0) {
    return null;
  }

  const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        {plans.length > 1 ? (
          <div className="flex gap-1 p-0.5 bg-background rounded-xl border border-border">
            {plans.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setActiveTab(i)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-[0.02em] transition-all
                  ${activeTab === i ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text'}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        ) : <div />}

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {mode === 'revenue' && (
            <div className="relative flex items-center gap-0.5 p-0.5 bg-background rounded-xl border border-border">
              {HEAT_PERIODS.map(d => (
                <button
                  key={d}
                  onClick={() => { setPeriod(d); setCustomRange(null); }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all
                    ${!customRange && period === d ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-text'}`}
                >
                  {d === 'today' ? tr(lang, 'Сегодня', 'Today', 'Bugun') : tr(lang, `${d}д`, `${d}d`, `${d}k`)}
                </button>
              ))}
              <button
                ref={calendarBtnRef}
                onClick={() => setCalendarOpen(o => !o)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all
                  ${calendarOpen || customRange ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-text'}`}
                title={tr(lang, 'Выбрать период', 'Pick a range', 'Davrni tanlash')}
              >
                <CalendarIcon size={12} />
                {customRange && <span className="whitespace-nowrap">{customRange.from.slice(5)}–{customRange.to.slice(5)}</span>}
              </button>
              <DateRangePicker
                lang={lang}
                value={customRange}
                isOpen={calendarOpen}
                onClose={() => setCalendarOpen(false)}
                anchorRef={calendarBtnRef}
                onApply={r => { setCustomRange(r); setCalendarOpen(false); }}
                onClear={() => { setCustomRange(null); setCalendarOpen(false); }}
              />
            </div>
          )}
          <div className="flex gap-0.5 p-0.5 bg-background rounded-xl border border-border">
            {([
              { id: 'now' as const,     label: tr(lang, 'Сейчас', 'Now', 'Hozir'), icon: Radio },
              { id: 'revenue' as const, label: tr(lang, 'Выручка', 'Revenue', 'Tushum'), icon: TrendingUp },
            ]).map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all
                  ${mode === m.id ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-text'}`}
              >
                <m.icon size={11} />
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Revenue summary strip ── */}
      {mode === 'revenue' && revenueLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-[68px] bg-zinc-800/40 rounded-xl animate-pulse" />)}
        </div>
      )}

      {mode === 'revenue' && !revenueLoading && revenueSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            {
              icon: Banknote, iconClass: 'bg-primary/10 text-primary',
              label: tr(lang, 'Выручка зала', 'Hall revenue', 'Zal tushumi'),
              value: fmt(revenueSummary.total), suffix: 'UZS',
            },
            {
              icon: Crown, iconClass: 'bg-amber-500/10 text-amber-400',
              label: tr(lang, 'Топ-стол', 'Top table', 'Eng yaxshi stol'),
              value: tr(lang, `Стол ${revenueSummary.top.table}`, `Table ${revenueSummary.top.table}`, `Stol ${revenueSummary.top.table}`),
              suffix: `${fmt(revenueSummary.top.revenue)} UZS`,
            },
            {
              icon: Receipt, iconClass: 'bg-success/10 text-success',
              label: tr(lang, 'Средний чек', 'Avg check', "O'rtacha chek"),
              value: fmt(revenueSummary.avgCheck), suffix: 'UZS',
            },
            {
              icon: Grid2x2, iconClass: 'bg-blue-500/10 text-blue-400',
              label: tr(lang, 'Столов с продажами', 'Tables w/ sales', 'Sotuvli stollar'),
              value: String(revenueSummary.tablesCovered),
              suffix: `/ ${activePlan.elements.filter(e => e.iiko_table_number != null).length}`,
            },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-3 py-2.5">
              <div className={`p-2 rounded-lg flex-shrink-0 ${s.iconClass}`}><s.icon size={15} /></div>
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.12em] text-muted truncate">{s.label}</p>
                <p className="text-[13px] font-bold text-text metric-number leading-tight mt-0.5 truncate">
                  {s.value} <span className="text-[9px] text-muted font-normal">{s.suffix}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === 'revenue' && !revenueLoading && !revenueSummary && (
        <div className="flex flex-col items-center justify-center gap-1.5 mb-4 py-6 text-muted bg-card border border-dashed border-border rounded-xl">
          <TrendingUp size={18} className="opacity-40" />
          <span className="text-[11px]">{tr(lang, 'Нет данных о закрытых заказах за период', 'No closed-order data for this period', 'Bu davr uchun yopilgan buyurtmalar yoʻq')}</span>
        </div>
      )}

      <HallEditor
        key={displayPlanKey}
        plan={displayPlan}
        occupiedTableNumbers={occupiedTableNumbers}
        tableHeat={tableHeat}
        tableInfo={mode === 'now' ? tableInfo : undefined}
        revenueInfo={mode === 'revenue' ? revenueInfo : undefined}
        legendMode={mode === 'revenue' ? 'revenue' : 'occupancy'}
        onSave={async () => {}}
        onClose={() => {}}
        readOnly
        inline
        lang={lang}
      />
    </div>
  );
}



// ── Smart Alerts ─────────────────────────────────────────────────────────

const ALERT_ICONS: Record<string, React.ReactNode> = {
  long_ticket:       <Timer size={13} />,
  double_bill:       <CreditCard size={13} />,
  dead_zone:         <Zap size={13} />,
  void_spike:        <Trash2 size={13} />,
  kitchen_overdue:   <ChefHat size={13} />,
  revenue_pace_drop: <TrendingDown size={13} />,
};

function SmartAlerts({ lang, pluginConnected }: { lang: Language; pluginConnected: boolean }) {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const [alerts, setAlerts] = useState<OpsAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    traceApi.operations.alerts(lang)
      .then(setAlerts)
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, [lang]);

  useEffect(() => {
    // Alerts are derived from realtime_events (TRACEPLUGIN-only) — always
    // empty for Poster (pluginConnected is always false there), so skip
    // polling for data that will never arrive rather than fetching only to
    // have the early return below discard it.
    if (!pluginConnected) { setLoading(false); return; }
    load();
    intervalRef.current = setInterval(load, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load, pluginConnected]);

  const [open, setOpen] = useState(false);

  const visible = alerts.filter(a => !dismissed.has(a.id));
  if (!pluginConnected || loading || visible.length === 0) return null;

  const hasCritical = visible.some(a => a.level === 'critical');

  return (
    <>
      {/* Floating bell — bottom-right, badge shows count */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-[calc(80px_+_env(safe-area-inset-bottom))] md:bottom-5 right-5 z-40 w-12 h-12 rounded-full border shadow-lg flex items-center justify-center transition-colors
          ${hasCritical ? 'bg-danger/15 border-danger/40 text-danger' : 'bg-card border-border text-amber-400'} hover:scale-105`}
        title={ru ? 'Оповещения' : isUz ? 'Ogohlantirishlar' : 'Alerts'}
      >
        <Bell size={18} className={hasCritical ? 'animate-pulse' : ''} />
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
          {visible.length}
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-[calc(140px_+_env(safe-area-inset-bottom))] md:bottom-20 right-5 z-40 w-[min(360px,calc(100vw-40px))] max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl p-3 space-y-1.5">
          <div className="flex items-center gap-2 px-1 pb-1">
            <Bell size={12} className="text-danger" />
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-semibold">
              {ru ? 'Активные оповещения' : isUz ? 'Faol ogohlantirishlar' : 'Active Alerts'}
            </p>
          </div>
          {visible.map(alert => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border ${
                alert.level === 'critical'
                  ? 'bg-danger/8 border-danger/25 text-danger'
                  : 'bg-amber-500/8 border-amber-500/25 text-amber-400'
              }`}
            >
              <span className="mt-0.5 flex-shrink-0">
                {ALERT_ICONS[alert.type] ?? <AlertTriangle size={13} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold leading-tight">{alert.title}</p>
                <p className="text-[11px] opacity-70 mt-0.5 leading-snug">{alert.detail}</p>
              </div>
              <button
                onClick={() => setDismissed(prev => new Set([...prev, alert.id]))}
                className="opacity-40 hover:opacity-80 transition-opacity flex-shrink-0 mt-0.5"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Void Tracker ─────────────────────────────────────────────────────────
// Deletions per waiter today, straight from plugin order_before_delete events.
// High counts = mistakes or unauthorized voids — theft-control signal.

function VoidDetailModal({ event, lang, onClose }: { event: VoidEvent; lang: Language; onClose: () => void }) {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl animate-fade-in">
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-bold text-text">
              {event.type === 'order_before_delete'
                ? tr(lang, 'Заказ удалён', 'Order deleted', 'Buyurtma oʻchirildi')
                : tr(lang, 'Позиции сняты', 'Items voided', 'Pozitsiyalar olib tashlandi')}
            </h2>
            <p className="text-[11px] text-muted mt-0.5">
              {event.orderNum ? `#${event.orderNum}` : ''}{event.table ? ` · ${event.table}` : ''} · {event.waiter}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-card-hover transition-colors flex-shrink-0 ml-3">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted">{tr(lang, 'Время', 'Time', 'Vaqt')}</span>
            <span className="text-text font-medium">
              {new Date(event.at).toLocaleString(ru ? 'ru-RU' : isUz ? 'uz-Latn-UZ' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {event.sum > 0 && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted">{tr(lang, 'Сумма', 'Sum', 'Summa')}</span>
              <span className="text-danger font-bold metric-number">{event.sum.toLocaleString('ru-RU')} UZS</span>
            </div>
          )}
          {event.items.length > 0 ? (
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted mb-2">
                {tr(lang, `Позиции (${event.items.length})`, `Items (${event.items.length})`, `Pozitsiyalar (${event.items.length})`)}
              </p>
              <div className="space-y-1.5">
                {event.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-[12px]">
                    <span className="text-text">{item.name} <span className="text-muted">×{item.quantity}</span></span>
                    {item.sum != null && <span className="text-muted metric-number">{item.sum.toLocaleString('ru-RU')}</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : event.type === 'order_before_delete' ? (
            <p className="text-[12px] text-muted/60">{tr(lang, 'Заказ удалён целиком — плагин не передал состав на момент удаления', 'Whole order was deleted — the plugin did not report item contents at delete time', "Buyurtma butunlay o'chirildi — plagin o'chirish vaqtida tarkibini yubormadi")}</p>
          ) : (
            <p className="text-[12px] text-muted/60">{tr(lang, 'Список позиций недоступен', 'Item list unavailable', "Pozitsiyalar ro'yxati yo'q")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function VoidTrackerCard({ lang, pluginConnected }: { lang: Language; pluginConnected: boolean }) {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const [events, setEvents] = useState<VoidEvent[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<VoidEvent | null>(null);

  useEffect(() => {
    // Poster has no order-void data source (realtime_events is TRACEPLUGIN-only) —
    // pluginConnected is always false for Poster, so the card never renders
    // (see the early return below); skip the fetch entirely rather than
    // polling for data that will always come back empty.
    if (!pluginConnected) return;
    traceApi.operations.voidEvents().then(setEvents).catch(() => {});
    const id = setInterval(() => traceApi.operations.voidEvents().then(setEvents).catch(() => {}), 120_000);
    return () => clearInterval(id);
  }, [pluginConnected]);

  const byWaiter = useMemo(() => {
    const m = new Map<string, VoidEvent[]>();
    for (const e of events) {
      const list = m.get(e.waiter) ?? [];
      list.push(e);
      m.set(e.waiter, list);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [events]);

  if (!pluginConnected || events.length === 0) return null;

  return (
    <>
      <Card title={
        <div className="flex items-center gap-2">
          <Trash2 size={14} className="text-danger" />
          <span>{ru ? 'Удаления заказов' : isUz ? "Buyurtma o'chirishlari" : 'Order Voids'}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-danger/15 text-danger font-bold">
            {events.length}
          </span>
        </div>
      }>
        <div className="mt-1 space-y-1.5">
          {byWaiter.map(([waiter, list]) => {
            const isOpen = expanded.has(waiter);
            return (
              <div key={waiter} className={`rounded-xl border overflow-hidden ${
                list.length >= 3 ? 'border-danger/30 bg-danger/5' : 'border-border bg-background'
              }`}>
                <button
                  onClick={() => setExpanded(prev => { const s = new Set(prev); s.has(waiter) ? s.delete(waiter) : s.add(waiter); return s; })}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                >
                  <ChevronRight size={12} className={`text-muted flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  <span className="text-[12px] font-semibold text-text flex-1 min-w-0 truncate">{waiter}</span>
                  <span className="text-[10px] text-muted">
                    {ru ? 'с' : isUz ? 'dan' : 'since'} {new Date(list[list.length - 1].at).toLocaleTimeString(ru ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className={`text-[15px] font-black metric-number ${list.length >= 3 ? 'text-danger' : 'text-text'}`}>
                    {list.length}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border/60">
                    {list.map(ev => (
                      <button
                        key={ev.id}
                        onClick={() => setDetail(ev)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-border/40 last:border-0 hover:bg-card-hover transition-colors"
                      >
                        {ev.type === 'order_before_delete'
                          ? <Trash2 size={11} className="text-danger flex-shrink-0" />
                          : <AlertTriangle size={11} className="text-amber-400 flex-shrink-0" />}
                        <span className="text-[11px] text-text flex-1 min-w-0 truncate">
                          {ev.orderNum ? `#${ev.orderNum}` : tr(lang, 'Заказ', 'Order', 'Buyurtma')}
                          {ev.table ? ` · ${ev.table}` : ''}
                          {ev.items.length > 0 ? ` · ${ev.items.length} ${tr(lang, 'поз.', 'items', 'pozitsiya')}` : ''}
                        </span>
                        {ev.sum > 0 && <span className="text-[10px] text-danger metric-number flex-shrink-0">{ev.sum.toLocaleString('ru-RU')}</span>}
                        <span className="text-[10px] text-muted font-mono flex-shrink-0">
                          {new Date(ev.at).toLocaleTimeString(ru ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[10px] text-muted pt-1 border-t border-border">
            {ru ? 'Нажмите на официанта, затем на заказ — детали · iikoFront' : isUz ? "Ofitsiantni, so'ng buyurtmani bosing — tafsilotlar · iikoFront" : 'Tap a waiter, then an order — details · iikoFront'}
          </p>
        </div>
      </Card>
      {detail && <VoidDetailModal event={detail} lang={lang} onClose={() => setDetail(null)} />}
    </>
  );
}

// ── Staff Performance Card ────────────────────────────────────────────────

type StaffSort = 'revenue' | 'orders' | 'avgCheck' | 'avgServiceMin';

const RANK_CLS = ['text-amber-400', 'text-zinc-300', 'text-amber-600'];

// ABC (Pareto) analysis of waiters by revenue — no cost/salary side since
// iiko has no per-waiter rate data (verified: attendance paymentDetails and
// the salary module both read back as 0 for every waiter on this tenant).
// A ranks the top ~70% of revenue, B the next ~20%, C the long tail.
const ABC_COLORS: Record<'A' | 'B' | 'C', string> = { A: '#22c55e', B: '#f59e0b', C: '#6b7280' };

type StaffRangeMode = 'today' | '7days' | '30days' | 'custom';

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

// Combined staff card: leaderboard (today = rich iiko/plugin data with table
// time + top dishes; past ranges = ABC/Pareto revenue analysis, since that's
// all iiko has for historical days) + the AI team narrative underneath —
// these used to be three separate cards (Эффективность персонала, ABC-анализ
// официантов, Нарратив по команде) covering overlapping ground.
function StaffPerfCard({
  staffRows, staffLoading, lang, t, isBasePlan, isPoster,
  staffNarrative, staffNarrativeLoading, staffNarrativeError, fetchStaffNarrative,
}: {
  staffRows: import('../../services/traceApi').StaffRow[];
  staffLoading: boolean;
  lang: Language;
  t: typeof import('../../constants').TRANSLATIONS['ru'];
  isBasePlan: boolean;
  isPoster: boolean;
  staffNarrative: string | null;
  staffNarrativeLoading: boolean;
  staffNarrativeError: string | null;
  fetchStaffNarrative: () => void;
}) {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const [sort, setSort] = useState<StaffSort>('revenue');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState<StaffRangeMode>('today');
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);
  const [abcRows, setAbcRows] = useState<StaffAbcRow[]>([]);
  const [abcLoading, setAbcLoading] = useState(false);

  useEffect(() => {
    if (rangeMode === 'today') return;
    if (rangeMode === 'custom' && !customRange) return;
    setAbcLoading(true);
    traceApi.operations.staffAbc(rangeMode, customRange?.from, customRange?.to)
      .then(r => setAbcRows(r.rows ?? []))
      .catch(() => setAbcRows([]))
      .finally(() => setAbcLoading(false));
  }, [rangeMode, customRange]);

  // ABC grade for "today", computed locally from the same revenue figures
  // already on staffRows — no need for a second fetch just for today.
  const todayAbc = useMemo(() => paretoAbc(staffRows, s => s.revenue), [staffRows]);

  const isToday = rangeMode === 'today';
  const loading = isToday ? staffLoading : abcLoading;

  const sorted = useMemo(() => {
    if (isToday) {
      return [...staffRows].sort((a, b) => {
        if (sort === 'avgServiceMin') {
          if (a.avgServiceMin == null && b.avgServiceMin == null) return 0;
          if (a.avgServiceMin == null) return 1;
          if (b.avgServiceMin == null) return -1;
          return a.avgServiceMin - b.avgServiceMin;
        }
        return (b[sort] as number) - (a[sort] as number);
      });
    }
    return [...abcRows].sort((a, b) => sort === 'avgServiceMin' ? 0 : (b[sort as 'revenue'|'orders'|'avgCheck'] as number) - (a[sort as 'revenue'|'orders'|'avgCheck'] as number));
  }, [isToday, staffRows, abcRows, sort]);

  const totalRevenue = (isToday ? staffRows : abcRows).reduce((s, r) => s + r.revenue, 0);
  const totalOrders  = (isToday ? staffRows : abcRows).reduce((s, r) => s + r.orders, 0);
  const avgCheckAll  = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const maxRevenue   = sorted[0]?.revenue ?? 1;
  const teamCount    = isToday ? staffRows.length : abcRows.length;

  const SORT_OPTS: { id: StaffSort; ru: string; en: string; uz: string }[] = [
    { id: 'revenue',       ru: 'Выручка',  en: 'Revenue', uz: 'Tushum'   },
    { id: 'orders',        ru: 'Заказы',   en: 'Orders',  uz: 'Buyurtmalar' },
    { id: 'avgCheck',      ru: 'Ср. чек',  en: 'Avg chk', uz: 'O\'rt. chek' },
    ...(isToday ? [{ id: 'avgServiceMin' as StaffSort, ru: 'Ср. стол', en: 'Tbl time', uz: "O'rt. stol" }] : []),
  ];

  const empty = isToday ? staffRows.length === 0 : abcRows.length === 0;

  return (
    <Card title={t.staff_perf}>
      {/* Range selector */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-[10px] text-muted">
          {isToday
            ? (isPoster
                ? tr(lang, 'Сегодня · Poster', 'Today · Poster', 'Bugun · Poster')
                : tr(lang, 'Сегодня · iiko OLAP · время из плагина', 'Today · iiko OLAP · time from plugin', 'Bugun · iiko OLAP · plagindan vaqt'))
            : tr(lang, 'ABC по выручке (Парето 70/90)', 'ABC by revenue (Pareto 70/90)', "Tushum bo'yicha ABC (Pareto 70/90)")}
        </p>
        <div className="relative flex items-center gap-1 bg-background border border-border rounded-lg p-0.5 flex-shrink-0">
          {(['today', '7days', '30days'] as const).map(r => (
            <button key={r} onClick={() => { setRangeMode(r); setCustomRange(null); }}
              className={`px-2 py-1 text-[9px] font-medium rounded-[3px] transition-all ${rangeMode === r ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text'}`}>
              {r === 'today' ? tr(lang, 'Сегодня', 'Today', 'Bugun') : r === '7days' ? '7д' : '30д'}
            </button>
          ))}
          {rangeMode === 'custom' && customRange && (
            <span className="px-2 py-1 text-[9px] font-medium rounded-[3px] bg-card text-text shadow-sm whitespace-nowrap">
              {customRange.from.slice(5)}–{customRange.to.slice(5)}
            </span>
          )}
          <button
            ref={calendarBtnRef}
            onClick={() => setCalendarOpen(o => !o)}
            className={`px-1.5 py-1 rounded-[3px] transition-colors ${calendarOpen || rangeMode === 'custom' ? 'text-primary' : 'text-muted hover:text-text'}`}
          >
            <CalendarIcon size={11} />
          </button>
          <DateRangePicker
            lang={lang}
            value={customRange}
            isOpen={calendarOpen}
            onClose={() => setCalendarOpen(false)}
            anchorRef={calendarBtnRef}
            onApply={r => { setCustomRange(r); setRangeMode('custom'); setCalendarOpen(false); }}
            onClear={() => { setCustomRange(null); setRangeMode('today'); setCalendarOpen(false); }}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 mt-2 animate-pulse">
          {[0,1,2,3].map(i => <div key={i} className="h-16 bg-zinc-800/60 rounded" />)}
        </div>
      ) : empty ? (
        <p className="text-[12px] text-muted py-4">{ru ? 'Нет данных за период' : isUz ? "Davr uchun ma'lumot yo'q" : 'No data for period'}</p>
      ) : (
        <div className="space-y-3 mt-1">

          {/* Team summary row */}
          <div className="grid grid-cols-3 gap-px bg-border rounded-xl overflow-hidden w-full">
            {[
              { label: ru ? 'Команда' : isUz ? 'Jamoa' : 'Team',     value: String(teamCount) },
              { label: ru ? 'Заказов' : isUz ? 'Buyurtmalar' : 'Orders',   value: String(totalOrders) },
              { label: ru ? 'Ср. чек' : isUz ? "O'rt. chek" : 'Avg chk',  value: avgCheckAll > 0 ? Math.round(avgCheckAll / 1000) + 'k' : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card px-3 py-2 text-center">
                <p className="text-[8px] uppercase tracking-[0.12em] text-muted">{label}</p>
                <p className="text-[15px] font-bold metric-number text-text mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Sort tabs */}
          <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5 self-start">
            {SORT_OPTS.map(o => (
              <button key={o.id} onClick={() => setSort(o.id)}
                className={`px-2.5 py-1 text-[9px] font-medium rounded-[3px] transition-all whitespace-nowrap ${
                  sort === o.id ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text'
                }`}>
                {tr(lang, o.ru, o.en, o.uz)}
              </button>
            ))}
          </div>

          {/* Leaderboard */}
          <div className="space-y-1.5">
            {isToday ? (sorted as StaffRow[]).map((s, i) => {
              const barW    = maxRevenue > 0 ? (s.revenue / maxRevenue) * 100 : 0;
              const timeOk  = s.avgServiceMin == null || s.avgServiceMin <= 20;
              const revPerGuest = s.guests > 0 ? Math.round(s.revenue / s.guests) : 0;
              const isExpanded = expanded === s.name;
              const grade = s.revenue > 0 ? (todayAbc.get(s) ?? 'C') : null;
              const openTables = s.openTables ?? 0;
              return (
                <div key={`${s.name}-${i}`} className="bg-background border border-border rounded-xl p-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => setExpanded(o => o === s.name ? null : s.name)}
                    className="flex items-center justify-between gap-2 w-full text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`text-[13px] font-black w-5 text-center shrink-0 ${RANK_CLS[i] ?? 'text-zinc-600'}`}>
                        {i + 1}
                      </span>
                      {grade ? (
                        <span
                          className="text-[9px] font-bold w-4 h-4 flex-shrink-0 rounded flex items-center justify-center text-white"
                          style={{ backgroundColor: ABC_COLORS[grade] }}
                        >{grade}</span>
                      ) : (
                        <span className="w-4 h-4 flex-shrink-0 rounded flex items-center justify-center" title={ru ? 'Ещё нет закрытых продаж' : isUz ? "Hali yopilgan sotuv yo'q" : 'No closed sales yet'}>
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        </span>
                      )}
                      <span className="text-[13px] font-semibold text-text truncate">{s.name}</span>
                      <ChevronRight size={12} className={`text-muted shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                    {s.revenue > 0 ? (
                      <span className="text-[12px] font-bold metric-number text-text shrink-0">
                        {Math.round(s.revenue / 1000).toLocaleString('ru-RU')}k
                      </span>
                    ) : openTables > 0 ? (
                      <span className="text-[10px] font-medium text-amber-400 shrink-0">
                        {ru ? `${openTables} стол(а) открыто` : isUz ? `${openTables} stol ochiq` : `${openTables} table(s) open`}
                      </span>
                    ) : null}
                  </button>

                  {/* Revenue bar relative to #1 */}
                  {grade && (
                    <div className="h-[3px] bg-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${barW}%`, backgroundColor: ABC_COLORS[grade] }} />
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-1">
                    <div className="bg-card rounded-lg px-1.5 py-1.5 text-center">
                      <p className="text-[8px] uppercase tracking-[0.1em] text-zinc-500 leading-none mb-0.5">{ru ? 'Заказы' : isUz ? 'Buyurtmalar' : 'Orders'}</p>
                      <p className="text-[12px] font-bold metric-number text-text leading-none">{s.orders}</p>
                    </div>
                    <div className="bg-card rounded-lg px-1.5 py-1.5 text-center">
                      <p className="text-[8px] uppercase tracking-[0.1em] text-zinc-500 leading-none mb-0.5">{ru ? 'Гости' : isUz ? 'Mehmonlar' : 'Guests'}</p>
                      <p className="text-[12px] font-bold metric-number text-text leading-none">{s.guests > 0 ? s.guests : '—'}</p>
                    </div>
                    <div className="bg-card rounded-lg px-1.5 py-1.5 text-center">
                      <p className="text-[8px] uppercase tracking-[0.1em] text-zinc-500 leading-none mb-0.5">{ru ? 'На гостя' : isUz ? 'Mehmonga' : 'Per guest'}</p>
                      <p className="text-[12px] font-bold metric-number text-text leading-none">{revPerGuest > 0 ? Math.round(revPerGuest / 1000) + 'k' : '—'}</p>
                    </div>
                    <div className="bg-card rounded-lg px-1.5 py-1.5 text-center">
                      <p className="text-[8px] uppercase tracking-[0.1em] text-zinc-500 leading-none mb-0.5">{ru ? 'Ср. стол' : isUz ? "O'rt. stol" : 'Tbl time'}</p>
                      <p className={`text-[12px] font-bold metric-number leading-none ${s.avgServiceMin == null ? 'text-muted' : timeOk ? 'text-success' : 'text-danger'}`}>
                        {s.avgServiceMin != null ? formatMinutesShort(s.avgServiceMin, lang) : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Attendance strip — shown when iiko attendance data is available */}
                  {(s.enterTime || s.exitTime) && (
                    <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                      <Clock className="w-3 h-3 text-muted shrink-0" />
                      <span className="text-[10px] text-muted">
                        {ru ? 'Пришёл' : isUz ? 'Keldi' : 'In'}
                      </span>
                      <span className="text-[11px] font-semibold text-text metric-number">{s.enterTime ?? '—'}</span>
                      <span className="text-[10px] text-muted mx-0.5">→</span>
                      <span className="text-[10px] text-muted">
                        {ru ? 'Ушёл' : isUz ? 'Ketdi' : 'Out'}
                      </span>
                      <span className="text-[11px] font-semibold text-text metric-number">{s.exitTime ?? '...'}</span>
                      {s.hoursWorked != null && (
                        <span className="ml-auto text-[10px] text-muted">{s.hoursWorked}h</span>
                      )}
                    </div>
                  )}

                  {/* "What waiter sold what" drill-down */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-border space-y-1">
                      {s.topDishes.length === 0 ? (
                        <p className="text-[10px] text-muted py-1">
                          {ru ? 'Нет данных по блюдам' : isUz ? "Taomlar bo'yicha ma'lumot yo'q" : 'No dish-level data'}
                        </p>
                      ) : s.topDishes.map((d, di) => (
                        <div key={di} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-text truncate">{d.name}</span>
                          <span className="text-muted shrink-0 metric-number">
                            ×{d.qty} · {Math.round(d.revenue / 1000).toLocaleString('ru-RU')}k
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }) : (sorted as StaffAbcRow[]).map((s, i) => {
              const barW = maxRevenue > 0 ? (s.revenue / maxRevenue) * 100 : 0;
              return (
                <div key={`${s.name}-${i}`} className="bg-background border border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`text-[13px] font-black w-5 text-center shrink-0 ${RANK_CLS[i] ?? 'text-zinc-600'}`}>
                        {i + 1}
                      </span>
                      <span
                        className="text-[9px] font-bold w-4 h-4 flex-shrink-0 rounded flex items-center justify-center text-white"
                        style={{ backgroundColor: ABC_COLORS[s.abc] }}
                      >{s.abc}</span>
                      <span className="text-[13px] font-semibold text-text truncate">{s.name}</span>
                    </div>
                    <span className="text-[12px] font-bold metric-number text-text shrink-0">
                      {Math.round(s.revenue / 1000).toLocaleString('ru-RU')}k
                    </span>
                  </div>
                  <div className="h-[3px] bg-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${barW}%`, backgroundColor: ABC_COLORS[s.abc] }} />
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="bg-card rounded-lg px-1.5 py-1.5 text-center">
                      <p className="text-[8px] uppercase tracking-[0.1em] text-zinc-500 leading-none mb-0.5">{ru ? 'Заказы' : isUz ? 'Buyurtmalar' : 'Orders'}</p>
                      <p className="text-[12px] font-bold metric-number text-text leading-none">{s.orders}</p>
                    </div>
                    <div className="bg-card rounded-lg px-1.5 py-1.5 text-center">
                      <p className="text-[8px] uppercase tracking-[0.1em] text-zinc-500 leading-none mb-0.5">{ru ? 'Ср. чек' : isUz ? "O'rt. chek" : 'Avg chk'}</p>
                      <p className="text-[12px] font-bold metric-number text-text leading-none">{s.avgCheck > 0 ? Math.round(s.avgCheck / 1000) + 'k' : '—'}</p>
                    </div>
                    <div className="bg-card rounded-lg px-1.5 py-1.5 text-center">
                      <p className="text-[8px] uppercase tracking-[0.1em] text-zinc-500 leading-none mb-0.5">{ru ? 'Доля' : isUz ? 'Ulush' : 'Share'}</p>
                      <p className="text-[12px] font-bold metric-number text-text leading-none">{s.share}%</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI team narrative — merged in from the old standalone card */}
      {!isBasePlan && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-primary" />
              <p className="text-[11px] font-medium text-text">{tr(lang, 'Нарратив по команде', 'Staff narrative', 'Jamoa tahlili')}</p>
            </div>
            {!staffNarrativeLoading && (
              <button onClick={fetchStaffNarrative} className="text-[11px] text-primary hover:text-primary-hover transition-colors">
                {staffNarrative ? tr(lang, 'Обновить', 'Refresh', 'Yangilash') : tr(lang, 'Получить анализ', 'Get analysis', 'Tahlil olish')}
              </button>
            )}
          </div>
          {staffNarrativeLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-2.5 bg-primary/10 rounded w-full" />
              <div className="h-2.5 bg-primary/10 rounded w-4/5" />
            </div>
          ) : staffNarrativeError ? (
            <p className="text-[12px] text-danger">{staffNarrativeError}</p>
          ) : staffNarrative ? (
            <p className="text-[12px] text-muted leading-relaxed">{staffNarrative}</p>
          ) : (
            <p className="text-[11px] text-muted/50">{tr(lang, 'AI-выводы по работе команды за 7 дней', 'AI read on the team over the last 7 days', "Jamoaning 7 kunlik ishi bo'yicha AI xulosasi")}</p>
          )}
        </div>
      )}
    </Card>
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
}> = ({ lang, onShowToast, branch, onContextReady, branches = [], isAllBranches = false }) => {
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
  // Whether the (single-branch) hall map has a real plan to show — default
  // true so the card doesn't flash visible-then-gone while HallMap's own
  // fetch is still in flight; HallMap reports the real answer once known.
  const [hasHallPlan, setHasHallPlan] = useState(true);
  // Same idea per-branch for the "All branches" hall map view — each
  // branch's own HallMap instance reports whether it has a real plan.
  const [branchHasHallPlan, setBranchHasHallPlan] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (demo) return;
    traceApi.settings.telegramStatus().then(s => setTelegramConnected(!!s.connected)).catch(() => {});
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

  // Seed active orders from backend on mount — the WS stream only carries
  // events that happen after page load, so orders opened earlier were invisible.
  useEffect(() => {
    if (demo) return;
    traceApi.operations.activeOrders()
      .then(rows => {
        setRtOrders(prev => {
          const m = new Map(prev);
          for (const o of rows) {
            if (!m.has(o.id)) {
              m.set(o.id, {
                tableNum: o.tableNum ?? undefined, waiter: o.waiter, items: o.items,
                guests: o.guests ?? null,
                openTime: o.openTime, sum: o.sum, number: o.number, status: o.status,
              });
            }
          }
          return m;
        });
      })
      .catch(() => {});
  }, [demo]);

  const wsUrl = import.meta.env.VITE_BACKEND_WS_URL as string | undefined;
  const { connected: rtConnected } = useRealtimeData({
    backendWsUrl: wsUrl ?? '',
    enabled: !!wsUrl && !demo,
    onEvent: useCallback((event: RealtimeEvent) => {
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
  const pluginConnected = !isPoster && (demo || rtConnected);

  // Same source Dashboard's occupancy stat uses — the hall heatmap and the
  // "Загрузка зала" % always agree instead of drifting apart from separate
  // event-replay logic.
  const { tables: occupiedTables, info: tableInfo } = useOccupiedTables(!demo);

  const mergedActiveOrders = useMemo(() => {
    return Array.from(rtOrders.entries()).map(([id, o]) => ({
      id, number: o.number,
      table: o.tableNum != null ? tr(lang, `Стол ${o.tableNum}`, `Table ${o.tableNum}`, `Stol ${o.tableNum}`) : '—',
      waiter: o.waiter ?? '—', items: o.items, guests: o.guests ?? null, status: o.status ?? 'New', openTime: o.openTime,
      ticketMin: Math.floor((now - new Date(o.openTime).getTime()) / 60000), sum: o.sum,
    }));
  }, [rtOrders, lang, now]);

  // rtOrders above is a WebSocket replay (TRACEPLUGIN-only) and stays empty
  // for Poster tenants — Poster has no push feed, so poll the same REST
  // endpoint useOccupiedTables already re-fetches every 30s, same pattern
  // as the "all branches" combinedActiveOrders effect below.
  const [posterActiveOrders, setPosterActiveOrders] = useState<ActiveOrderRow[]>([]);
  useEffect(() => {
    if (!isPoster || isAllBranches) { setPosterActiveOrders([]); return; }
    let cancelled = false;
    const load = () => { traceApi.operations.activeOrders().then(rows => { if (!cancelled) setPosterActiveOrders(rows); }).catch(() => {}); };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isPoster, isAllBranches]);

  // Poster only — incomingOrders.getReservations, no iiko-side equivalent.
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  useEffect(() => {
    if (!isPoster || isAllBranches) { setReservations([]); return; }
    setReservationsLoading(true);
    traceApi.operations.reservations().then(setReservations).catch(() => setReservations([])).finally(() => setReservationsLoading(false));
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

  return (
    <div className="space-y-5 animate-fade-in pb-24">

      {/* ── SMART ALERTS ── */}
      <SmartAlerts lang={lang} pluginConnected={pluginConnected} />

      {/* ── TOP KPIs ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Avg Service Time — real for Poster too now (date_close - date_start on today's closed orders), just labeled differently below */}
        <Card className="stagger-item">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-md flex-shrink-0"><Clock size={20} /></div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted">{t.avg_service_time}</p>
              {kpisLoading
                ? <div className="h-6 w-20 bg-zinc-800 rounded animate-pulse mt-1" />
                : <p className="metric-number text-[22px] font-bold text-text leading-none mt-1">
                    <SlotText text={kpis?.avgServiceMin != null ? formatMinutes(kpis.avgServiceMin, lang) : '—'} />
                  </p>
              }
              <p className="text-[11px] mt-1 font-medium text-muted">
                {kpis?.avgServiceMin != null
                  ? (isPoster ? tr(lang, 'Сегодня · Poster', 'Today · Poster', 'Bugun · Poster') : tr(lang, 'Сегодня · iikoFront', 'Today · iikoFront', 'Bugun · iikoFront'))
                  : tr(lang, 'Накапливаем данные по закрытым заказам', 'Collecting data from closed orders', "Yopilgan buyurtmalar bo'yicha ma'lumot yig'ilmoqda")}
              </p>
            </div>
          </div>
        </Card>

        {/* Kitchen Serve Time — Poster's processing_status has no timestamped history of transitions (see getServiceTiming comment), so avgKitchenMin stays null; hidden rather than shown permanently stuck */}
        {!isPoster && (
        <Card className="stagger-item">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-md flex-shrink-0"><ChefHat size={20} /></div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted">
                {tr(lang, 'Время отдачи кухни', 'Kitchen Serve Time', 'Oshxona berish vaqti')}
              </p>
              {kpisLoading
                ? <div className="h-6 w-20 bg-zinc-800 rounded animate-pulse mt-1" />
                : <p className="metric-number text-[22px] font-bold text-text leading-none mt-1">
                    <SlotText text={kpis?.avgKitchenMin != null ? formatMinutes(kpis.avgKitchenMin, lang) : '—'} />
                  </p>
              }
              <p className="text-[11px] mt-1 font-medium text-muted">
                {kpis?.avgKitchenMin != null
                  ? tr(lang, 'Заказ → готово · сегодня', 'Order → ready · today', 'Buyurtma → tayyor · bugun')
                  : tr(lang, 'Накапливаем данные кухни', 'Collecting kitchen data', "Oshxona ma'lumotlari yig'ilmoqda")}
              </p>
            </div>
          </div>
        </Card>
        )}

        {/* Waste — iiko OLAP writeoffs, or Poster's storage.getWastes for Poster tenants */}
        <Card className="stagger-item">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-danger/10 text-danger rounded-md flex-shrink-0"><Trash2 size={20} /></div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted">{t.waste}</p>
              {kpisLoading
                ? <div className="h-6 w-28 bg-zinc-800 rounded animate-pulse mt-1" />
                : <p className="metric-number text-[22px] font-bold text-text leading-none mt-1">
                    <SlotText text={kpis?.wasteSum != null ? `${Math.round(kpis.wasteSum).toLocaleString('ru-RU')} UZS` : '—'} />
                  </p>
              }
              <p className="text-[11px] mt-1 font-medium text-muted">
                {tr(lang, 'Списания сегодня', 'Write-offs today', 'Bugungi hisobdan chiqarishlar')}
              </p>
            </div>
          </div>
        </Card>

        {/* Staff Active — unique waiters from iiko OLAP today */}
        <Card className="stagger-item">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-success/10 text-success rounded-md flex-shrink-0"><Users size={20} /></div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted">{t.staff_active}</p>
              {kpisLoading
                ? <div className="h-6 w-16 bg-zinc-800 rounded animate-pulse mt-1" />
                : <p className="metric-number text-[22px] font-bold text-text leading-none mt-1">
                    <SlotText text={kpis?.staffActive != null ? String(kpis.staffActive) : '—'} />
                  </p>
              }
              <p className="text-[11px] mt-1 font-medium text-muted">
                {tr(lang, 'Сотрудников сегодня', 'Staff today', 'Bugungi xodimlar')}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── CASH SHIFT + STOP LIST ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={t.cash_shift}>
          {cashShiftLoading ? (
            <div className="space-y-3 mt-2 animate-pulse">
              <div className="h-10 bg-zinc-800/60 rounded" />
              <div className="grid grid-cols-2 gap-px">
                {[0,1,2,3].map(i => <div key={i} className="h-14 bg-zinc-800/60 rounded" />)}
              </div>
              <div className="h-8 bg-zinc-800/60 rounded" />
            </div>
          ) : !cashShift ? (
            <p className="text-[12px] text-muted py-4">{tr(lang, 'Не удалось загрузить данные смены', 'Could not load shift data', 'Smena ma\'lumotlarini yuklab bo\'lmadi')}</p>
          ) : (
          <div className="mt-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted">{t.cashier}</p>
                <p className="text-[15px] font-semibold text-text mt-0.5">
                  {cashShift.cashier ?? tr(lang, 'Нет данных от плагина', 'No plugin data', 'Plagindan ma\'lumot yo\'q')}
                </p>
                {cashShift.openTime && (
                  <p className="text-[10px] text-muted mt-0.5">
                    {t.shift_open} {new Date(cashShift.openTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] ${
                cashShift.status === 'open' ? 'bg-success/10 text-success' : 'bg-muted/10 text-muted'
              }`}>
                {cashShift.status === 'open' ? t.shift_open : tr(lang, 'Закрыта', 'Closed', 'Yopiq')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border rounded-xl overflow-hidden">
              {[
                { icon: Banknote,    label: tr(lang, 'Наличные', 'Cash', 'Naqd pul'), value: Math.round(cashShift.cash).toLocaleString('ru-RU'), onClick: undefined },
                { icon: CreditCard, label: tr(lang, 'Безнал', 'Card', 'Karta'), value: Math.round(cashShift.card).toLocaleString('ru-RU'), onClick: cashShift.cardBreakdown?.length ? () => setShowCardBreakdown(true) : undefined },
                { icon: Clock,      label: t.orders,                              value: cashShift.orders > 0 ? String(cashShift.orders) : '—', onClick: undefined },
                { icon: Banknote,   label: tr(lang, 'Изъятия', 'Payouts', 'Inkassatsiya'), value: cashShift.payOut > 0 ? Math.round(cashShift.payOut).toLocaleString('ru-RU') : '—', onClick: undefined },
              ].map(({ icon: Icon, label, value, onClick }, i) => (
                <div
                  key={i}
                  onClick={onClick}
                  className={`bg-card p-3 flex items-center gap-2.5 ${onClick ? 'cursor-pointer hover:bg-zinc-800/60 active:bg-zinc-700/60 transition-colors' : ''}`}
                >
                  <Icon size={14} className="text-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-muted flex items-center gap-1">
                      {label}
                      {onClick && <span className="text-[8px] text-zinc-500">▾</span>}
                    </p>
                    <p className="text-[14px] font-bold text-text metric-number leading-none mt-0.5">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Card breakdown modal */}
            {showCardBreakdown && cashShift.cardBreakdown?.length > 0 && (
              <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowCardBreakdown(false)}>
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                <div
                  className="relative w-full max-w-sm bg-card border border-border rounded-t-2xl p-4 pb-8 space-y-1"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-muted font-semibold">
                      {tr(lang, 'Безналичные оплаты', 'Card payments', 'Karta orqali to\'lovlar')}
                    </p>
                    <button onClick={() => setShowCardBreakdown(false)} className="text-muted hover:text-text transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                  {cashShift.cardBreakdown.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <span className="text-[13px] text-text">{item.type}</span>
                      <span className="text-[13px] font-bold metric-number text-text">{Math.round(item.amount).toLocaleString('ru-RU')} UZS</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="pt-1">
              <p className="text-[9px] uppercase tracking-[0.15em] text-muted mb-1">{t.shift_revenue}</p>
              <p className="text-[28px] font-display font-black text-text leading-none">
                {Math.round(cashShift.revenue).toLocaleString('ru-RU')}
                <span className="text-[14px] text-muted font-medium ml-1.5">UZS</span>
              </p>
            </div>
          </div>
          )}
        </Card>

        <Card title={t.stop_list}>
          {stopLoading ? (
            <div className="space-y-2 mt-2 animate-pulse">
              {[0,1,2].map(i => <div key={i} className="h-10 bg-zinc-800/60 rounded" />)}
            </div>
          ) : (
          <div className="mt-2 space-y-1">
            {stopItems.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-success">
                <CheckCircle size={16} />
                <span className="text-[13px]">{tr(lang, 'Стоп-лист пуст', 'Stop list is empty', 'Stop-list bo\'sh')}</span>
              </div>
            ) : stopItems.slice(0, stopVisible).map((item) => (
              <div key={item.id} className="flex items-start justify-between py-2.5 border-b border-border last:border-0 group">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={14} className="text-danger mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-medium text-text">{item.name}</p>
                    {item.category && <p className="text-[10px] text-muted mt-0.5">{item.category}</p>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setRemovedStopIds(prev => new Set([...prev, item.id]));
                    onShowToast?.(tr(lang, `${item.name} — убрано из стоп-листа`, `${item.name} — removed from stop list`, `${item.name} — stop-listdan olib tashlandi`), 'success');
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-danger ml-4 mt-0.5 flex-shrink-0"
                  title={tr(lang, 'Убрать из стоп-листа', 'Remove from stop list', 'Stop-listdan olib tashlash')}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          )}
          {!stopLoading && stopItems.length > stopVisible && (
            <button
              onClick={() => setStopVisible(stopItems.length)}
              className="w-full mt-2 py-2 text-[11px] font-medium text-muted hover:text-text border border-border hover:border-primary/40 rounded-lg transition-all"
            >
              {tr(lang, `Показать все (${stopItems.length})`, `Show all (${stopItems.length})`, `Hammasini ko'rsatish (${stopItems.length})`)}
            </button>
          )}
          {!stopLoading && stopVisible > 5 && stopItems.length > 5 && (
            <button
              onClick={() => setStopVisible(5)}
              className="w-full mt-2 py-2 text-[11px] font-medium text-muted hover:text-text border border-border hover:border-primary/40 rounded-lg transition-all"
            >
              {tr(lang, 'Свернуть', 'Collapse', "Yig'ish")}
            </button>
          )}
          {!stopLoading && stopItems.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[10px] text-muted">
                {isPoster
                  ? tr(lang, `${stopItems.length} позиц. · Poster`, `${stopItems.length} items · Poster`, `${stopItems.length} ta · Poster`)
                  : tr(lang, `${stopItems.length} позиц. · iiko`, `${stopItems.length} items · iiko`, `${stopItems.length} ta · iiko`)}
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* ── HALL MAP ── */}
      {isAllBranches ? (
        branches.some(b => branchHasHallPlan.get(b.id) !== false) && (
        <Card title={
          <div className="flex items-center gap-2">
            <span>{t.hall_heatmap}</span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-primary/10 text-primary text-[9px] font-semibold uppercase tracking-[0.12em]">
              {tr(lang, `Все филиалы (${branches.length})`, `All branches (${branches.length})`, `Barcha filiallar (${branches.length})`)}
            </span>
          </div>
        }>
          <p className="text-[10px] text-muted -mt-1 mb-3">
            {tr(lang, 'Каждый филиал показан отдельно — планировки залов разные, поэтому не объединяются в одну схему.',
                     "Each branch shown separately — floor plans differ per branch, so they can't merge into one diagram.",
                     "Har bir filial alohida ko'rsatilgan — zal tartiblari filiallar bo'yicha har xil, shuning uchun bitta sxemaga birlashtirilmaydi.")}
          </p>
          <div className="space-y-6">
            {branches.filter(b => branchHasHallPlan.get(b.id) !== false).map(b => {
              const occ = perBranchOccupancy.get(b.id);
              return (
                <div key={b.id}>
                  <p className="text-[11px] font-semibold text-text mb-2">{b.name}</p>
                  <HallMap
                    lang={lang}
                    onToast={onShowToast}
                    branchId={b.id}
                    occupiedTables={occ && occ.tables.size > 0 ? occ.tables : undefined}
                    tableInfo={occ?.info}
                    isPoster={isPoster}
                    onHasPlanChange={hasPlan => setBranchHasHallPlan(m => new Map(m).set(b.id, hasPlan))}
                  />
                </div>
              );
            })}
          </div>
        </Card>
        )
      ) : hasHallPlan && (
        <Card title={
          <div className="flex items-center gap-2">
            <span>{t.hall_heatmap}</span>
            {PLUGIN_ENABLED && pluginConnected && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-success/10 text-success text-[9px] font-semibold uppercase tracking-[0.12em]"><Radio size={8} className="animate-pulse" />{tr(lang, 'Live', 'Live', 'Live')}</span>
            )}
          </div>
        }>
          <HallMap lang={lang} onToast={onShowToast} occupiedTables={(PLUGIN_ENABLED && pluginConnected || isPoster) && occupiedTables.size > 0 ? occupiedTables : undefined} tableInfo={tableInfo} isPoster={isPoster} onHasPlanChange={setHasHallPlan} />
        </Card>
      )}

      {/* ── ACTIVE ORDERS ── */}
      {/* Poster path is poll-based (dash.getTransactions?status=1, re-fetched every 30s), not TRACEPLUGIN's push feed — labeled accordingly below, not shown as "Live" */}
      {(() => {
        const displayOrders: any[] = isAllBranches ? combinedActiveOrders : isPoster ? posterActiveOrders : mergedActiveOrders;
        return (
      <Card title={
        <div className="flex items-center gap-2">
          <span>{t.active_orders}</span>
          {isAllBranches ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-primary/10 text-primary text-[9px] font-semibold uppercase tracking-[0.12em]">
              {tr(lang, `Все филиалы (${branches.length})`, `All branches (${branches.length})`, `Barcha filiallar (${branches.length})`)}
            </span>
          ) : PLUGIN_ENABLED && pluginConnected ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-success/10 text-success text-[9px] font-semibold uppercase tracking-[0.12em]"><Radio size={8} className="animate-pulse" />{tr(lang, 'Live', 'Live', 'Live')}</span>
          ) : isPoster && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-muted/10 text-muted text-[9px] font-semibold uppercase tracking-[0.12em]">{tr(lang, 'Опрос · 30с', 'Poll · 30s', "So'rov · 30s")}</span>
          )}
        </div>
      }>
        {isAllBranches && (
          <p className="text-[10px] text-muted -mt-1 mb-2">
            {tr(lang, 'Обновляется каждые 30с по всем филиалам (не мгновенно, как в режиме одного филиала).',
                     'Refreshes every 30s across all branches (not instant like single-branch live mode).',
                     "Har 30s da barcha filiallar bo'yicha yangilanadi (bitta filial rejimidagidek darhol emas).")}
          </p>
        )}
        {displayOrders.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-muted">
            <CheckCircle size={15} className="text-success flex-shrink-0" />
            <span className="text-[12px]">{tr(lang, 'Нет активных заказов', 'No active orders', 'Faol buyurtmalar yo\'q')}</span>
          </div>
        ) : (
        <>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-left min-w-[520px]">
            <thead>
              <tr className="border-b border-border">
                {[
                  tr(lang, '№', '#', '№'),
                  ...(isAllBranches ? [tr(lang, 'Филиал', 'Branch', 'Filial')] : []),
                  tr(lang, 'Стол', 'Table', 'Stol'), tr(lang, 'Официант', 'Waiter', 'Ofitsiant'),
                  tr(lang, 'Позиций', 'Items', 'Pozitsiyalar'), tr(lang, 'Гости', 'Guests', 'Mehmonlar'), t.ticket_time, tr(lang, 'Статус', 'Status', 'Holat'),
                ].map(h => (
                  <th key={h} className="py-2 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...displayOrders].sort((a: any, b: any) => (b.ticketMin ?? 0) - (a.ticketMin ?? 0)).slice(0, activeOrdersVisible).map((o: any) => (
                <tr key={`${o.branchName ?? ''}-${o.id}`} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                  <td className="py-2.5 pr-4 text-[11px] text-muted font-mono">{o.number ?? '—'}</td>
                  {isAllBranches && <td className="py-2.5 pr-4 text-[12px] text-text">{o.branchName}</td>}
                  <td className="py-2.5 pr-4 text-[13px] font-medium text-text">{o.table}</td>
                  <td className="py-2.5 pr-4 text-[12px] text-muted">{o.waiter}</td>
                  <td className="py-2.5 pr-4 text-[13px] text-text metric-number">{o.items}</td>
                  <td className="py-2.5 pr-4 text-[13px] text-muted metric-number">{o.guests ?? '—'}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-1.5">
                      <Timer size={12} className={(o.ticketMin ?? 0) > 15 ? 'text-danger' : (o.ticketMin ?? 0) > 8 ? 'text-amber-400' : 'text-success'} />
                      <span className={`text-[13px] font-bold metric-number ${(o.ticketMin ?? 0) > 15 ? 'text-danger' : (o.ticketMin ?? 0) > 8 ? 'text-amber-400' : 'text-success'}`}>
                        {formatMinutesShort(o.ticketMin ?? 0, lang)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] ${
                      o.status === 'Bill'
                        ? 'text-amber-400 bg-amber-400/10'
                        : o.kitchenStatus === 'ready'
                        ? 'text-success bg-success/10'
                        : o.kitchenStatus === 'preparing'
                        ? 'text-amber-400 bg-amber-400/10'
                        : 'text-primary bg-primary/10'
                    }`}>
                      {o.status === 'Bill' ? tr(lang, 'Счёт', 'Bill', 'Hisob')
                        : o.kitchenStatus === 'ready' ? tr(lang, 'Готово', 'Ready', 'Tayyor')
                        : o.kitchenStatus === 'preparing' ? tr(lang, 'Готовится', 'Preparing', 'Tayyorlanmoqda')
                        : o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {displayOrders.length > activeOrdersVisible && (
          <button
            onClick={() => setActiveOrdersVisible(displayOrders.length)}
            className="w-full mt-2 py-2 text-[11px] font-medium text-muted hover:text-text border border-border hover:border-primary/40 rounded-lg transition-all"
          >
            {tr(lang, `Показать все (${displayOrders.length})`, `Show all (${displayOrders.length})`, `Hammasini ko'rsatish (${displayOrders.length})`)}
          </button>
        )}
        {activeOrdersVisible > 5 && displayOrders.length > 5 && (
          <button
            onClick={() => setActiveOrdersVisible(5)}
            className="w-full mt-2 py-2 text-[11px] font-medium text-muted hover:text-text border border-border hover:border-primary/40 rounded-lg transition-all"
          >
            {tr(lang, 'Свернуть', 'Collapse', "Yig'ish")}
          </button>
        )}
        <p className="text-[10px] text-muted mt-3 pt-3 border-t border-border">
          {isAllBranches
            ? tr(lang, `${displayOrders.length} активных · ${combinedOccupiedCount} столов занято · все филиалы`,
                        `${displayOrders.length} active · ${combinedOccupiedCount} tables occupied · all branches`,
                        `${displayOrders.length} ta faol · ${combinedOccupiedCount} stol band · barcha filiallar`)
            : isPoster
              ? tr(lang, `${displayOrders.length} активных · Poster`, `${displayOrders.length} active · Poster`, `${displayOrders.length} ta faol · Poster`)
              : tr(lang, `${displayOrders.length} активных · Live · iikoFront`, `${displayOrders.length} active · Live · iikoFront`, `${displayOrders.length} ta faol · Live · iikoFront`)}
        </p>
        </>
        )}
      </Card>
        );
      })()}

      {/* ── RESERVATIONS ── */}
      {/* Poster only — incomingOrders.getReservations, no iiko-side equivalent anywhere in TRACE.
          Hidden entirely (not an empty state) once loaded with zero upcoming reservations —
          a permanent "nothing here" card is clutter, not information. */}
      {isPoster && !isAllBranches && (reservationsLoading || reservations.length > 0) && (
        <Card title={
          <div className="flex items-center gap-2">
            <CalendarClock size={14} />
            <span>{tr(lang, 'Бронирования', 'Reservations', 'Bronlar')}</span>
          </div>
        }>
          {reservationsLoading ? (
            <div className="h-16 bg-zinc-800/40 rounded animate-pulse" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[480px]">
                <thead>
                  <tr className="border-b border-border">
                    {[
                      tr(lang, 'Гость', 'Guest', 'Mehmon'),
                      tr(lang, 'Телефон', 'Phone', 'Telefon'),
                      tr(lang, 'Дата и время', 'Date & time', 'Sana va vaqt'),
                      tr(lang, 'Длительность', 'Duration', 'Davomiyligi'),
                      tr(lang, 'Статус', 'Status', 'Holat'),
                    ].map(h => (
                      <th key={h} className="py-2 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reservations.map(r => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                      <td className="py-2.5 pr-4 text-[13px] font-medium text-text">{r.guestName}</td>
                      <td className="py-2.5 pr-4 text-[12px] text-muted">{r.phone ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-[12px] text-muted">{r.date}</td>
                      <td className="py-2.5 pr-4 text-[12px] text-muted metric-number">{formatMinutesShort(r.durationMin, lang)}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] ${
                          r.status === 'accepted' ? 'text-success bg-success/10'
                          : r.status === 'canceled' ? 'text-muted bg-muted/10'
                          : 'text-amber-400 bg-amber-400/10'
                        }`}>
                          {r.status === 'accepted' ? tr(lang, 'Подтверждено', 'Accepted', 'Tasdiqlangan')
                            : r.status === 'canceled' ? tr(lang, 'Отменено', 'Canceled', 'Bekor qilingan')
                            : tr(lang, 'Новое', 'New', 'Yangi')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── STAFF (perf + ABC + narrative, merged) ── */}
      <StaffPerfCard
        staffRows={staffRows} staffLoading={staffLoading} lang={lang} t={t}
        isBasePlan={isBasePlan} isPoster={isPoster}
        staffNarrative={staffNarrative}
        staffNarrativeLoading={staffNarrativeLoading}
        staffNarrativeError={staffNarrativeError}
        fetchStaffNarrative={fetchStaffNarrative}
      />

      {/* ── VOID TRACKER ── */}
      <VoidTrackerCard lang={lang} pluginConnected={pluginConnected} />

      {/* ── AI INSIGHTS ── */}
      {isBasePlan ? (
        <>
          <ProLock
            lang={lang}
            title={tr(lang, 'Причины списаний', 'Waste root cause', 'Hisobdan chiqarish sabablari')}
            description={tr(lang, 'AI находит паттерны списаний по дням недели и рекомендует нормы закупки', 'AI finds waste patterns by weekday and recommends order quantities', 'AI hafta kunlari bo\'yicha hisobdan chiqarish naqshlarini topadi va xarid normalarini tavsiya qiladi')}
          />
          <ProLock
            lang={lang}
            title={tr(lang, 'Рекомендации по сменам', 'Shift schedule recommendations', 'Smenalar bo\'yicha tavsiyalar')}
            description={tr(lang, 'AI рекомендует количество официантов по дням и часам на следующую неделю', 'AI recommends waiter counts by day and hour for next week', 'AI keyingi hafta uchun kunlar va soatlar bo\'yicha ofitsiantlar sonini tavsiya qiladi')}
          />
        </>
      ) : (
      <>
      <div className="flex items-center gap-2 pt-2">
        <Sparkles size={13} className="text-primary" />
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-medium">
          {tr(lang, 'AI-аналитика операций', 'Operations AI insights', 'Operatsiyalar AI tahlili')}
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      <AIInsightCard
        lang={lang}
        icon={<Trash2 size={15} />}
        title={tr(lang, 'Причины списаний', 'Waste root cause', 'Hisobdan chiqarish sabablari')}
        description={tr(lang, 'Паттерны списаний по дням недели и нормы закупки', 'Waste patterns by weekday and order quantities', "Hafta kunlari bo'yicha naqshlar va xarid normalari")}
        loading={wasteLoading}
        hasResult={!!wastePatterns}
        error={wasteError}
        onGenerate={() => {
          setWasteLoading(true);
          setWasteError(null);
          traceApi.ai.wasteRootCause(lang)
            .then(r => {
              if (r.fromAI) setWastePatterns(r);
              else setWasteError(tr(lang, 'Не удалось получить анализ. Проверьте настройки подключения POS и попробуйте ещё раз.', 'Couldn\'t generate analysis. Check your POS connection settings and try again.', 'Tahlil olinmadi. POS ulanish sozlamalarini tekshirib, qayta urinib ko\'ring.'));
            })
            .catch(() => setWasteError(tr(lang, 'Не удалось получить анализ. Попробуйте ещё раз.', 'Couldn\'t generate analysis. Try again.', 'Tahlil olinmadi. Qayta urinib ko\'ring.')))
            .finally(() => setWasteLoading(false));
        }}
        actionLabel={tr(lang, 'Анализировать', 'Analyze', 'Tahlil qilish')}
      >
        {wastePatterns && (
          <div className="space-y-3">
            {wastePatterns.summary && <p className="text-[12px] text-muted leading-relaxed mb-3">{wastePatterns.summary}</p>}
            {wastePatterns.patterns?.map((p, i) => (
              <div key={i} className="rounded-xl border border-border bg-[#111] px-3 py-2.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] font-semibold text-text">{p.dish}</p>
                  <span className="text-[9px] uppercase tracking-widest text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5">{p.peakDay}</span>
                </div>
                <p className="text-[11px] text-muted">{p.rootCause}</p>
                <p className="text-[11px] text-primary mt-1">→ {p.advice}</p>
              </div>
            ))}
          </div>
        )}
      </AIInsightCard>

      <AIInsightCard
        lang={lang}
        icon={<CalendarClock size={15} />}
        title={tr(lang, 'Рекомендации по сменам', 'Shift schedule', 'Smenalar bo\'yicha tavsiyalar')}
        description={tr(lang, 'Сколько официантов нужно по дням и часам на следующую неделю', 'Waiter counts by day and hour for next week', "Keyingi hafta uchun ofitsiantlar soni")}
        loading={shiftLoading}
        hasResult={!!shiftSchedule}
        error={shiftError}
        onGenerate={() => {
          setShiftLoading(true);
          setShiftError(null);
          traceApi.ai.shiftSchedule(lang)
            .then(r => {
              if (r.fromAI) setShiftSchedule(r);
              else setShiftError(tr(lang, 'Не удалось получить рекомендации. Проверьте настройки подключения POS и попробуйте ещё раз.', 'Couldn\'t generate recommendations. Check your POS connection settings and try again.', 'Tavsiyalar olinmadi. POS ulanish sozlamalarini tekshirib, qayta urinib ko\'ring.'));
            })
            .catch(() => setShiftError(tr(lang, 'Не удалось получить рекомендации. Попробуйте ещё раз.', 'Couldn\'t generate recommendations. Try again.', 'Tavsiyalar olinmadi. Qayta urinib ko\'ring.')))
            .finally(() => setShiftLoading(false));
        }}
      >
        {shiftSchedule && (
          <div>
            {shiftSchedule.summary && <p className="text-[12px] text-muted leading-relaxed mb-3">{shiftSchedule.summary}</p>}
            {shiftSchedule.schedule && shiftSchedule.schedule.length > 0 && (() => {
              const days = shiftSchedule.schedule.map(d => d.day);
              const waiters = [...new Set(shiftSchedule.schedule.flatMap(d => d.assignments.map(a => a.waiter)))];
              const cellShifts = new Map<string, { start: string; end: string }[]>();
              const totalHours = new Map<string, number>();
              for (const d of shiftSchedule.schedule) {
                for (const a of d.assignments) {
                  const key = `${a.waiter}|${d.day}`;
                  if (!cellShifts.has(key)) cellShifts.set(key, []);
                  cellShifts.get(key)!.push({ start: a.start, end: a.end });
                  totalHours.set(a.waiter, (totalHours.get(a.waiter) ?? 0) + hoursBetween(a.start, a.end));
                }
              }
              waiters.sort((a, b) => (totalHours.get(b) ?? 0) - (totalHours.get(a) ?? 0));
              return (
                <div className="overflow-x-auto -mx-1">
                  <table className="text-[10px] border-collapse w-full min-w-[560px]">
                    <thead>
                      <tr>
                        <th className="text-left px-2 py-1.5 text-muted font-medium sticky left-0 bg-card">{tr(lang,'Официант','Waiter','Ofitsiant')}</th>
                        {days.map(d => <th key={d} className="px-2 py-1.5 text-muted font-medium whitespace-nowrap text-center">{d}</th>)}
                        <th className="px-2 py-1.5 text-primary font-semibold whitespace-nowrap">{tr(lang,'Итого','Total','Jami')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waiters.map((name, i) => (
                        <tr key={name} className={i % 2 === 0 ? 'bg-[#111]' : ''}>
                          <td className="px-2 py-1.5 font-semibold text-text whitespace-nowrap sticky left-0" style={{ background: i % 2 === 0 ? '#111' : 'var(--card)' }}>
                            {name.replace(/\(официант\)/i,'').trim()}
                          </td>
                          {days.map(d => {
                            const shifts = cellShifts.get(`${name}|${d}`);
                            return (
                              <td key={d} className={`px-2 py-1.5 text-center whitespace-nowrap ${shifts ? 'text-emerald-400' : 'text-red-400/70'}`}>
                                {shifts ? shifts.map(s => `${s.start}–${s.end}`).join(', ') : tr(lang,'вых','off','dam')}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-center font-semibold text-primary whitespace-nowrap">
                            {(totalHours.get(name) ?? 0).toFixed(1)}{tr(lang,'ч','h','s')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            {shiftSchedule.schedule && shiftSchedule.schedule.length > 0 && (
              <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                <button
                  disabled={shiftPdfLoading}
                  onClick={() => {
                    if (demo) {
                      downloadShiftSchedulePdfClientSide(shiftSchedule.schedule!, shiftSchedule.summary, lang);
                      return;
                    }
                    setShiftPdfLoading(true);
                    traceApi.ai.shiftScheduleExportPdf(shiftSchedule.schedule!, shiftSchedule.summary, lang)
                      .then(blob => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `TRACE-shift-schedule-${new Date().toISOString().slice(0,10)}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                      })
                      .catch(() => onShowToast?.(tr(lang, 'Не удалось скачать PDF', 'Couldn\'t download PDF', 'PDF yuklab bo\'lmadi'), 'error'))
                      .finally(() => setShiftPdfLoading(false));
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border hover:border-primary/40 text-[11px] font-medium text-muted hover:text-text transition-all disabled:opacity-50"
                >
                  <FileDown size={13} />
                  {shiftPdfLoading ? tr(lang, 'Готовим…', 'Preparing…', 'Tayyorlanmoqda…') : tr(lang, 'Скачать PDF', 'Download PDF', 'PDF yuklab olish')}
                </button>
                <button
                  onClick={() => downloadShiftScheduleExcel(shiftSchedule.schedule!, shiftSchedule.summary, lang)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border hover:border-primary/40 text-[11px] font-medium text-muted hover:text-text transition-all"
                >
                  <FileSpreadsheet size={13} />
                  {tr(lang, 'Скачать Excel', 'Download Excel', 'Excel yuklab olish')}
                </button>
                <button
                  disabled={shiftTgLoading}
                  title={!demo && !telegramConnected ? tr(lang, 'Подключите Telegram в Настройках', 'Connect Telegram in Settings', 'Sozlamalarda Telegram ulang') : undefined}
                  onClick={() => {
                    if (demo) {
                      setShiftTgLoading(true);
                      setTimeout(() => {
                        setShiftTgLoading(false);
                        onShowToast?.(tr(lang, 'Демо: сообщение "отправлено" в Telegram', 'Demo: message "sent" to Telegram', 'Demo: Telegramga "yuborildi"'), 'success');
                      }, 700);
                      return;
                    }
                    if (!telegramConnected) {
                      onShowToast?.(tr(lang, 'Сначала подключите Telegram в Настройках → Отчёты', 'Connect Telegram first in Settings → Reports', "Avval Sozlamalar → Hisobotlar'da Telegram ulang"), 'info');
                      return;
                    }
                    setShiftTgLoading(true);
                    traceApi.ai.shiftScheduleSendTelegram(shiftSchedule.schedule!, shiftSchedule.summary, lang)
                      .then(r => {
                        if (r.ok) onShowToast?.(tr(lang, 'Отправлено в Telegram', 'Sent to Telegram', 'Telegramga yuborildi'), 'success');
                        else onShowToast?.(r.error ?? tr(lang, 'Не удалось отправить', "Couldn't send", "Yuborib bo'lmadi"), 'error');
                      })
                      .catch(() => onShowToast?.(tr(lang, 'Не удалось отправить', "Couldn't send", "Yuborib bo'lmadi"), 'error'))
                      .finally(() => setShiftTgLoading(false));
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border hover:border-primary/40 text-[11px] font-medium text-muted hover:text-text transition-all disabled:opacity-50"
                >
                  <Send size={13} />
                  {shiftTgLoading ? tr(lang, 'Отправка…', 'Sending…', 'Yuborilmoqda…') : tr(lang, 'В Telegram', 'To Telegram', 'Telegramga')}
                </button>
              </div>
            )}
          </div>
        )}
      </AIInsightCard>

      </div>
      </>
      )}

    </div>
  );
};

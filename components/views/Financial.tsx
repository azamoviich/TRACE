import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../ui/Card';
import { ChartTooltip } from '../ui/ChartTooltip';
import { DateRangePicker } from '../ui/DateRangePicker';
import { Language } from '../../types';
import { TRANSLATIONS, tr } from '../../constants';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { CheckCircle, Package, TrendingDown, Sparkles, X, ChevronRight, ChevronLeft, TrendingUp, Calendar as CalendarIcon } from 'lucide-react';
import {
  traceApi,
  FinancialWriteoffRow,
  FinancialInvoiceRow,
  FinancialInventoryDoc,
  PosterInventoryItem,
  PosterInventoryDoc,
  InventoryItem,
  FinancialPL,
  GLSummary,
  CashShiftDoc,
  MenuAnalysisRow,
} from '../../services/traceApi';

// ── Inventory Detail Drawer ───────────────────────────────────────────────────
const InventoryDrawer: React.FC<{
  doc: FinancialInventoryDoc;
  lang: Language;
  onClose: () => void;
}> = ({ doc, lang, onClose }) => {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    traceApi.financial.inventoryItems(doc.id, doc.date, doc.documentNumber)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [doc.id, doc.date]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const totalSum = items?.reduce((s, i) => s + i.sum, 0) ?? 0;

  const fmt = (n: number) => n.toLocaleString('ru-RU');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-mono text-[13px] font-bold text-text">{doc.documentNumber}</p>
              <span className={`px-2 py-0.5 rounded-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] ${
                doc.status === 'PROCESSED' ? 'text-success bg-success/10' :
                doc.status === 'NEW'       ? 'text-amber-400 bg-amber-400/10' : 'text-muted bg-muted/10'
              }`}>
                {doc.status === 'PROCESSED' ? tr(lang, 'Проведено', 'Posted', "O'tkazilgan")
                  : doc.status === 'NEW' ? tr(lang, 'Черновик', 'Draft', 'Qoralama')
                  : doc.status}
              </span>
            </div>
            <p className="text-[11px] text-muted">{doc.date} · {doc.storeCode || '—'}{doc.comment ? ` · ${doc.comment}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-card-hover transition-colors ml-4 flex-shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Summary chips */}
        {items && items.length > 0 && (
          <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border">
              <Package size={11} className="text-muted" />
              <span className="text-[11px] text-muted">{items.length} {tr(lang, 'позиций', 'items', 'pozitsiya')}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border ml-auto">
              <span className="text-[11px] font-semibold text-text">
                {fmt(Math.round(totalSum))} UZS
              </span>
            </div>
          </div>
        )}

        {/* Items table */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="space-y-2 py-2">
              {[90,70,80,60,75].map(w => <div key={w} className="h-3 bg-border/60 rounded animate-pulse" style={{ width: `${w}%` }} />)}
            </div>
          ) : !items || items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Package size={24} className="text-muted/40" />
              <p className="text-[12px] text-muted">{tr(lang, 'Позиции не найдены', 'No items found', 'Pozitsiyalar topilmadi')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[620px]">
                <thead className="border-b border-border">
                  <tr>
                    {[
                      tr(lang, 'Наименование', 'Product', 'Nomi'),
                      tr(lang, 'Категория', 'Category', 'Kategoriya'),
                      tr(lang, 'Ед.', 'Unit', 'Birlik'),
                      tr(lang, 'По книге', 'Book', 'Kitob'),
                      tr(lang, 'Факт', 'Actual', 'Fakt'),
                      tr(lang, 'Разница', 'Diff', 'Farq'),
                      tr(lang, 'Цена', 'Price', 'Narx'),
                      tr(lang, 'Сумма', 'Amount', 'Summa'),
                    ].map(h => (
                      <th key={h} className="pb-3 pr-3 text-[10px] uppercase tracking-[0.12em] text-muted font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-card-hover/50 transition-colors">
                      <td className="py-2.5 pr-3 text-[12px] font-medium text-text max-w-[180px]">
                        <div className="truncate">{item.productName}</div>
                        {item.productCode && <div className="text-[10px] text-muted font-mono mt-0.5">{item.productCode}</div>}
                      </td>
                      <td className="py-2.5 pr-3 text-[11px] text-muted truncate max-w-[100px]">{item.category || '—'}</td>
                      <td className="py-2.5 pr-3 text-[11px] text-muted font-mono">{item.unit || '—'}</td>
                      <td className="py-2.5 pr-3 text-[12px] text-muted font-mono">{item.bookQty ? item.bookQty.toFixed(2) : '—'}</td>
                      <td className="py-2.5 pr-3 text-[12px] text-text font-mono font-semibold">{item.actualQty ? item.actualQty.toFixed(2) : '—'}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`text-[12px] font-mono font-semibold ${
                          (item.diffQty ?? 0) < 0 ? 'text-danger' : (item.diffQty ?? 0) > 0 ? 'text-success' : 'text-muted'
                        }`}>
                          {(item.diffQty ?? 0) > 0 ? '+' : ''}{(item.diffQty ?? 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-[12px] text-muted font-mono">{fmt(Math.round(item.price ?? 0))}</td>
                      <td className="py-2.5 text-[12px] text-muted font-mono">{fmt(Math.round(item.sum ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        {items && items.length > 0 && (() => {
          const positiveSum = items.filter(i => i.sum >= 0).reduce((s, i) => s + i.sum, 0);
          const negativeSum = items.filter(i => i.sum < 0).reduce((s, i) => s + i.sum, 0);
          const totalSum    = items.reduce((s, i) => s + i.sum, 0);
          return (
            <div className="px-5 py-3 border-t border-border flex-shrink-0 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted">{tr(lang, 'Позиций', 'Items', 'Pozitsiyalar')}</span>
                <span className="text-[11px] text-muted font-mono">{items.length}</span>
              </div>
              {negativeSum !== 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">{tr(lang, 'Недостача', 'Shortage', 'Kamomad')}</span>
                  <span className="text-[11px] text-red-400 font-mono">{fmt(Math.round(negativeSum))} UZS</span>
                </div>
              )}
              {positiveSum !== 0 && negativeSum !== 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted">{tr(lang, 'Излишки', 'Surplus', 'Ortiqcha')}</span>
                  <span className="text-[11px] text-success font-mono">+{fmt(Math.round(positiveSum))} UZS</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-1.5">
                <p className="text-[11px] text-muted">{tr(lang, 'Итого', 'Total', 'Jami')}</p>
                <p className="text-[13px] font-semibold text-text font-mono">{fmt(Math.round(totalSum))} UZS</p>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

// ── Waste Impact Banner ───────────────────────────────────────────────────────

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

function WasteImpactBanner({ writeoffs, revenue, numDays, lang }: {
  writeoffs: FinancialWriteoffRow[];
  revenue: number;
  numDays: number;
  lang: Language;
}) {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const wasteTotal = writeoffs.reduce((s, w) => s + w.cost, 0);
  if (wasteTotal === 0) return null;

  const wastePct   = revenue > 0 ? (wasteTotal / revenue) * 100 : null;
  const overBench  = wastePct !== null && wastePct > WASTE_BENCHMARK;
  const savings    = overBench && revenue > 0
    ? Math.round(((wastePct! - WASTE_BENCHMARK) / 100) * revenue * (30 / numDays))
    : null;
  const statusColor = wastePct == null ? 'text-muted'
    : wastePct > WASTE_BENCHMARK * 1.5 ? 'text-danger'
    : wastePct > WASTE_BENCHMARK ? 'text-amber-400' : 'text-success';

  // Group by dish name, sort by cost desc
  const grouped = new Map<string, { name: string; cost: number; qty: number }>();
  for (const w of writeoffs) {
    const e = grouped.get(w.name) ?? { name: w.name, cost: 0, qty: 0 };
    grouped.set(w.name, { ...e, cost: e.cost + w.cost, qty: e.qty + w.qty });
  }
  const top = Array.from(grouped.values()).sort((a, b) => b.cost - a.cost).slice(0, 5);
  const maxCost = top[0]?.cost ?? 1;

  const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

  return (
    <div className="mb-5 grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Real waste amount */}
      <div className="glass rounded-2xl p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted mb-2.5 font-medium">
          {ru ? 'Реальные списания еды' : isUz ? 'Haqiqiy oziq-ovqat isrofi' : 'Real food waste'}
        </p>
        <p className="metric-number text-[26px] font-bold text-text leading-none tracking-tight">
          −{fmt(wasteTotal)}
          <span className="text-[13px] font-semibold text-muted ml-1.5">UZS</span>
        </p>
        <p className="text-[11px] text-muted mt-2">
          {ru
            ? `за ${numDays === 1 ? 'сегодня' : numDays + ' дней'} · Кухня, Бар, Кондитерка, Пекарня`
            : isUz ? `${numDays === 1 ? 'bugun' : numDays + ' kun'} · Oshxona, Bar, Konditer, Novvoyxona`
            : `over ${numDays === 1 ? 'today' : numDays + ' days'} · Kitchen, Bar, Pastry, Bakery`}
        </p>
      </div>

      {/* vs benchmark */}
      <div className="glass rounded-2xl p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted mb-2.5 font-medium">
          {ru ? 'Доля от выручки' : isUz ? "Daromaddan ulush" : '% of revenue'}
        </p>
        {wastePct !== null ? (
          <>
            <p className={`metric-number text-[26px] font-bold leading-none tracking-tight ${statusColor}`}>
              {wastePct.toFixed(1)}<span className="text-[13px] font-semibold ml-0.5">%</span>
            </p>
            <div className="mt-3 space-y-1.5">
              <div className="h-1.5 bg-background rounded-full overflow-hidden relative">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min((wastePct / (WASTE_BENCHMARK * 2)) * 100, 100)}%`, backgroundColor: 'currentColor' }}
                />
                <div className="absolute top-0 bottom-0 w-px bg-text/40" style={{ left: '50%' }} />
              </div>
              <p className="text-[10px] text-muted">
                {ru ? `Benchmark ${WASTE_BENCHMARK}%` : isUz ? `Benchmark ${WASTE_BENCHMARK}%` : `Benchmark ${WASTE_BENCHMARK}%`}
              </p>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-muted">{ru ? 'Нет данных по выручке' : isUz ? "Daromad ma'lumoti yo'q" : 'No revenue data'}</p>
        )}
      </div>

      {/* Status / savings */}
      <div className="glass rounded-2xl p-4">
        {savings !== null ? (
          <>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted mb-2.5 font-medium">
              {ru ? 'Потенциал экономии / мес' : isUz ? 'Tejash imkoniyati / oy' : 'Savings potential / mo'}
            </p>
            <p className="metric-number text-[26px] font-bold text-success leading-none tracking-tight">
              +{fmt(savings)}<span className="text-[13px] font-semibold ml-1.5">UZS</span>
            </p>
            <p className="text-[11px] text-muted mt-2">
              {ru ? `при выходе на ${WASTE_BENCHMARK}%` : isUz ? `${WASTE_BENCHMARK}% ga chiqqanda` : `if you reach ${WASTE_BENCHMARK}%`}
            </p>
          </>
        ) : (
          <div className="h-full flex flex-col justify-center">
            <div className="flex items-center gap-1.5 text-success mb-1">
              <CheckCircle size={14} />
              <span className="text-[13px] font-semibold">{ru ? 'Ниже benchmark' : isUz ? 'Benchmarkdan past' : 'Below benchmark'}</span>
            </div>
            <p className="text-[11px] text-muted">
              {ru ? 'Списания под контролем' : isUz ? 'Isrof nazoratda' : 'Waste is under control'}
            </p>
          </div>
        )}
      </div>

      {/* Explanation — one calm line, not a wall of text */}
      <p className="lg:col-span-3 text-[10px] text-muted/60 leading-relaxed -mt-1">
        {ru
          ? <>Benchmark {WASTE_BENCHMARK}% — среднее по рынку, сколько ресторан теряет на порче продукта. Считаются только настоящие пищевые списания (не техника, не хоз. расходы, не питание персонала).</>
          : isUz
          ? <>Benchmark {WASTE_BENCHMARK}% — bozor o'rtachasi, restoran mahsulot buzilishidan qancha yo'qotadi. Faqat haqiqiy oziq-ovqat isrofi hisoblanadi (texnika, xo'jalik, xodimlar ovqati emas).</>
          : <>Benchmark {WASTE_BENCHMARK}% is the market average for spoilage loss. Only real food waste counts here — not equipment, supplies, or staff meals.</>}
      </p>

      {/* Top offenders */}
      <div className="lg:col-span-3 glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown size={12} className="text-muted" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-medium">
            {ru ? 'Главные виновники' : isUz ? 'Asosiy sabablar' : 'Top offenders'}
          </p>
        </div>
        <div className="space-y-2.5">
          {top.map((item) => (
            <div key={item.name} className="flex items-center gap-3">
              <span className="text-[11px] text-text font-medium truncate flex-shrink-0 w-[35%]">{item.name}</span>
              <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-danger/60"
                  style={{ width: `${(item.cost / maxCost) * 100}%`, transition: 'width 0.7s ease' }}
                />
              </div>
              <span className="text-[10px] text-muted flex-shrink-0 w-14 text-right">{item.qty} {ru ? 'шт.' : isUz ? 'dona' : 'pcs'}</span>
              <span className="text-[11px] font-semibold text-danger metric-number flex-shrink-0 w-20 text-right">−{fmt(item.cost)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type Tab = 'pl' | 'invoices' | 'writeoffs' | 'inventory' | 'cashshifts' | 'menu' | 'gl';
type Range = 'today' | '7days' | '30days';
type PLRange = Range | 'custom';

function RangeSelector({ value, onChange, lang }: { value: Range; onChange: (r: Range) => void; lang: Language }) {
  return (
    <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
      {(['today', '7days', '30days'] as Range[]).map(r => (
        <button key={r} onClick={() => onChange(r)}
          className={`px-2.5 py-1 text-[9px] font-medium rounded-[3px] transition-all ${value === r ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text'}`}>
          {r === 'today' ? tr(lang, 'Сегодня', 'Today', 'Bugun') : r === '7days' ? '7д' : '30д'}
        </button>
      ))}
    </div>
  );
}

// P&L gets its own range selector (with a calendar/custom-range option) —
// separate from the shared RangeSelector used by the other financial
// sub-tabs (invoices, write-offs, inventory, etc.), whose backend routes
// only accept the today/7days/30days presets, not an arbitrary date range.
function PLRangeSelector({
  value, onChange, lang, customRange, calendarOpen, setCalendarOpen, calendarBtnRef, onApplyCustom, onClearCustom,
}: {
  value: PLRange; onChange: (r: PLRange) => void; lang: Language;
  customRange: { from: string; to: string } | null;
  calendarOpen: boolean; setCalendarOpen: (fn: (o: boolean) => boolean) => void;
  calendarBtnRef: React.RefObject<HTMLButtonElement | null>;
  onApplyCustom: (r: { from: string; to: string }) => void;
  onClearCustom: () => void;
}) {
  return (
    <div className="relative flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
      {(['today', '7days', '30days'] as PLRange[]).map(r => (
        <button key={r} onClick={() => onChange(r)}
          className={`px-2.5 py-1 text-[9px] font-medium rounded-[3px] transition-all ${value === r ? 'bg-card text-text shadow-sm' : 'text-muted hover:text-text'}`}>
          {r === 'today' ? tr(lang, 'Сегодня', 'Today', 'Bugun') : r === '7days' ? '7д' : '30д'}
        </button>
      ))}
      {value === 'custom' && customRange && (
        <span className="px-2.5 py-1 text-[9px] font-medium rounded-[3px] bg-card text-text shadow-sm whitespace-nowrap">
          {customRange.from.slice(5)} – {customRange.to.slice(5)}
        </span>
      )}
      <button
        ref={calendarBtnRef}
        onClick={() => setCalendarOpen(o => !o)}
        className={`px-1.5 py-1 rounded-[3px] transition-colors ${calendarOpen || value === 'custom' ? 'text-primary' : 'text-muted hover:text-text'}`}
      >
        <CalendarIcon size={11} />
      </button>
      <DateRangePicker
        lang={lang}
        value={customRange}
        isOpen={calendarOpen}
        onClose={() => setCalendarOpen(() => false)}
        anchorRef={calendarBtnRef}
        onApply={onApplyCustom}
        onClear={onClearCustom}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[0,1,2,3,4].map(i => <div key={i} className="h-10 bg-zinc-800/60 rounded" />)}
    </div>
  );
}

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
}> = ({ lang, onShowToast, branch, onContextReady }) => {
  const t = TRANSLATIONS[lang];
  const [tab, setTab] = useState<Tab>('pl');

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pl',         label: 'P&L' },
    { key: 'menu',       label: tr(lang, 'Анализ меню', 'Menu Analysis', 'Menyu tahlili') },
    { key: 'invoices',   label: t.invoices },
    { key: 'writeoffs',  label: t.writeoffs },
    { key: 'inventory',  label: t.inventory },
    { key: 'cashshifts', label: tr(lang, 'Кассовые смены', 'Cash Shifts', 'Kassa smenalari') },
    { key: 'gl',         label: tr(lang, 'Учёт', 'Accounting', 'Hisob') },
  ];


  // Shared range for all tabs
  const [range, setRange] = useState<Range>('7days');
  const [plRange, setPlRange] = useState<PLRange>('7days');
  const [plCustomRange, setPlCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [plCalendarOpen, setPlCalendarOpen] = useState(false);
  const plCalendarBtnRef = useRef<HTMLButtonElement>(null);

  // P&L
  const [pl, setPl]           = useState<FinancialPL | null>(null);
  const [plLoading, setPlLoading] = useState(false);

  // AI profit forecast — user-triggered, not auto
  const [forecast, setForecast] = useState<{ fromAI: boolean; nextMonth?: string; nextMonthKey?: string; forecastRevenue?: number; forecastProfit?: number; forecastProfitPct?: number | null; reasoning?: string; risks?: string; trend?: 'up'|'flat'|'down' } | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
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
    }).then(setForecast).catch(() => setForecast(null)).finally(() => setForecastLoading(false));
  };

  // POS type — Poster tenants get different (or currently unsupported) data for several tabs below
  const [isPoster, setIsPoster] = useState(false);
  useEffect(() => {
    traceApi.sales.status().then(s => setIsPoster(!!s.poster)).catch(() => {});
  }, []);

  // Invoices
  const [invoices, setInvoices]             = useState<FinancialInvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Write-offs
  const [writeoffs, setWriteoffs]               = useState<FinancialWriteoffRow[]>([]);
  const [writeoffsLoading, setWriteoffsLoading] = useState(false);
  const [writeoffRevenue, setWriteoffRevenue]   = useState(0);
  const [writeoffDept, setWriteoffDept]         = useState<string>(FOOD_FILTER);
  const [woRange, setWoRange]                   = useState<PLRange>('7days');
  const [woCustomRange, setWoCustomRange]       = useState<{ from: string; to: string } | null>(null);
  const [woCalendarOpen, setWoCalendarOpen]     = useState(false);
  const woCalendarBtnRef = useRef<HTMLButtonElement>(null);

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

  // Menu analysis
  const [menuRows, setMenuRows]               = useState<MenuAnalysisRow[]>([]);
  const [menuLoading, setMenuLoading]         = useState(false);
  type MenuSortKey = 'revenue' | 'qty' | 'cost' | 'grossProfit' | 'marginPct' | 'foodCostPct';
  const [menuSort, setMenuSort]               = useState<MenuSortKey>('revenue');
  const [menuSortDir, setMenuSortDir]         = useState<'asc' | 'desc'>('desc');
  const [menuCatFilter, setMenuCatFilter]     = useState<string>('all');


  useEffect(() => {
    if (tab === 'pl') {
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
  }, [tab, plRange, plCustomRange, onContextReady]);

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
    if (tab === 'gl') {
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
  }, [tab, range]);

  const tt = (p: any) => <ChartTooltip {...p} />;

  // Pie chart — real if we have foodCostPct + profitPct
  const pieData = pl?.foodCostPct != null && pl?.profitPct != null
    ? [
        { name: tr(lang, 'Фуд-кост', 'Food Cost', 'Food Cost'),          value: pl.foodCostPct,                                          color: '#ef4444' },
        ...(pl.laborCostPct != null && pl.laborCostPct > 0.05
          ? [{ name: tr(lang, 'ФОТ', 'Labor Cost', 'Labor Cost'),          value: pl.laborCostPct,                                         color: '#f59e0b' }]
          : []),
        { name: tr(lang, 'Валовая прибыль', 'Gross Profit', 'Yalpi foyda'), value: Math.max(0, pl.profitPct),                               color: '#22c55e' },
        { name: tr(lang, 'Прочие расходы', 'Other Costs', 'Boshqa xarajatlar'),
          value: Math.max(0, Math.round((100 - pl.foodCostPct - (pl.laborCostPct ?? 0) - Math.max(0, pl.profitPct)) * 10) / 10),
          color: '#6b7280' },
      ].filter(d => d.value > 0.05)
    : [
        { name: 'Food Cost', value: 28, color: '#ef4444' }, { name: 'Labor Cost', value: 22, color: '#f59e0b' },
        { name: 'Rent & Utils', value: 15, color: '#3b82f6' }, { name: 'Marketing', value: 5, color: '#a855f7' },
        { name: 'Net Profit', value: 30, color: '#22c55e' },
      ];

  // Forecast chart — real monthly data + AI predicted next month
  const forecastData = pl?.monthly && pl.monthly.length >= 2
    ? [
        ...pl.monthly.map(m => ({ month: m.label, profit: m.revenue, est: false })),
        ...(forecast?.fromAI && forecast.forecastRevenue
          ? [{ month: forecast.nextMonth ?? '?', profit: forecast.forecastRevenue, est: true }]
          : forecastLoading
          ? [{ month: '...', profit: 0, est: true }]
          : []),
      ]
    : [
        { month: 'Jan', profit: 120 }, { month: 'Feb', profit: 135 },
        { month: 'Mar', profit: 110 }, { month: 'Apr', profit: 160 },
        { month: 'May', profit: 190 }, { month: 'Jun', profit: 210, est: true },
      ];
  const forecastIsDemo = !pl?.monthly || pl.monthly.length < 2;

  return (
    <div className="space-y-5 animate-fade-in pb-24">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[22px] font-bold text-text tracking-tight">{t.financial}</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="overflow-x-auto">
          <div className="flex items-center gap-px border border-border rounded-xl overflow-hidden bg-card w-fit min-w-max">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 text-[12px] font-medium transition-colors ${
                  tab === key ? 'bg-primary text-white' : 'text-muted hover:text-text hover:bg-[#1a1a1a]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tab === 'pl' ? (
          <PLRangeSelector
            value={plRange}
            onChange={r => { setPlRange(r); if (r !== 'custom') setPlCustomRange(null); }}
            lang={lang}
            customRange={plCustomRange}
            calendarOpen={plCalendarOpen}
            setCalendarOpen={setPlCalendarOpen}
            calendarBtnRef={plCalendarBtnRef}
            onApplyCustom={r => { setPlCustomRange(r); setPlRange('custom'); setPlCalendarOpen(false); }}
            onClearCustom={() => { setPlCustomRange(null); setPlRange('7days'); setPlCalendarOpen(false); }}
          />
        ) : tab === 'writeoffs' ? (
          <PLRangeSelector
            value={woRange}
            onChange={r => { setWoRange(r); if (r !== 'custom') setWoCustomRange(null); }}
            lang={lang}
            customRange={woCustomRange}
            calendarOpen={woCalendarOpen}
            setCalendarOpen={setWoCalendarOpen}
            calendarBtnRef={woCalendarBtnRef}
            onApplyCustom={r => { setWoCustomRange(r); setWoRange('custom'); setWoCalendarOpen(false); }}
            onClearCustom={() => { setWoCustomRange(null); setWoRange('7days'); setWoCalendarOpen(false); }}
          />
        ) : (
          <RangeSelector value={range} onChange={setRange} lang={lang} />
        )}
      </div>

      {/* ── P&L TAB ── */}
      {tab === 'pl' && (
        <div className="space-y-5">
          {/* Top metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {plLoading ? (
              [0,1,2,3].map(i => <Card key={i}><div className="h-16 bg-zinc-800/60 rounded animate-pulse" /></Card>)
            ) : (() => {
              const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(Math.round(n));
              const grossMarginPct = pl && pl.revenue > 0 && pl.cogs > 0 ? Math.round(((pl.revenue - pl.cogs) / pl.revenue) * 1000) / 10 : null;
              return [
                {
                  label: tr(lang, 'Выручка', 'Revenue', 'Tushum'),
                  main: pl ? fmt(pl.revenue) : '—',
                  unit: pl ? 'UZS' : '',
                  sub: null,
                  color: 'text-text',
                  accent: '',
                },
                {
                  label: tr(lang, 'Себестоимость', 'COGS', 'Tannarx'),
                  main: pl?.foodCostPct != null ? `${pl.foodCostPct}%` : '—',
                  unit: '',
                  sub: pl?.cogs ? fmt(pl.cogs) + ' UZS' : null,
                  color: pl?.foodCostPct != null && pl.foodCostPct > 35 ? 'text-danger' : pl?.foodCostPct != null && pl.foodCostPct > 28 ? 'text-amber-400' : 'text-text',
                  accent: tr(lang, 'фуд-кост', 'food cost', 'food cost'),
                },
                {
                  label: tr(lang, 'ФОТ', 'Labor Cost', 'Mehnat xarajati'),
                  main: pl?.laborCostPct != null && pl.laborCostPct > 0 ? `${pl.laborCostPct}%` : '—',
                  unit: '',
                  sub: pl?.laborCost && pl.laborCost > 0 ? fmt(pl.laborCost) + ' UZS' : null,
                  color: pl?.laborCostPct != null && pl.laborCostPct > 35 ? 'text-danger' : 'text-amber-400',
                  accent: tr(lang, 'от выручки', 'of revenue', 'tushumdan'),
                },
                {
                  label: tr(lang, 'Валовая маржа', 'Gross Margin', 'Yalpi marja'),
                  main: grossMarginPct != null ? `${grossMarginPct}%` : '—',
                  unit: '',
                  sub: pl && pl.cogs > 0 ? fmt(pl.revenue - pl.cogs) + ' UZS' : null,
                  color: grossMarginPct != null && grossMarginPct > 60 ? 'text-success' : grossMarginPct != null && grossMarginPct < 45 ? 'text-danger' : 'text-text',
                  accent: tr(lang, 'до ФОТ', 'before labor', 'mehnat xarajatisiz'),
                },
                {
                  label: tr(lang, 'Чистая прибыль', 'Net Profit', 'Sof foyda'),
                  main: pl?.netProfitPct != null ? `${pl.netProfitPct}%` : '—',
                  unit: '',
                  sub: pl?.netProfit != null ? fmt(pl.netProfit) + ' UZS' : null,
                  color: pl?.netProfitPct != null && pl.netProfitPct > 0 ? 'text-success' : pl?.netProfitPct != null ? 'text-danger' : 'text-muted',
                  accent: tr(lang, 'после всех расходов', 'after all costs', 'barcha xarajatlardan keyin'),
                },
              ].map(({ label, main, unit, sub, color, accent }) => (
                <Card key={label} className="relative overflow-hidden">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted">{label}</p>
                  <p className={`metric-number font-black leading-none mt-1.5 text-[clamp(16px,4vw,24px)] ${color}`}>
                    {main}<span className="text-[clamp(10px,2.5vw,13px)] text-muted font-medium ml-0.5">{unit}</span>
                  </p>
                  {sub && <p className="text-[11px] text-muted mt-1 metric-number">{sub}</p>}
                  {accent && <p className="text-[9px] text-muted/50 uppercase tracking-[0.1em] mt-0.5">{accent}</p>}
                </Card>
              ));
            })()}
          </div>

          {/* P&L waterfall breakdown */}
          {!plLoading && pl && pl.revenue > 0 && (
            <Card title={tr(lang, 'Структура P&L', 'P&L Breakdown', 'P&L tuzilmasi')}>
              {(() => {
                const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
                const pct = (n: number) => pl.revenue > 0 ? Math.round((n / pl.revenue) * 10) / 10 : 0;
                const grossMargin = pl.revenue - pl.cogs;
                const rows = [
                  { label: tr(lang, 'Выручка', 'Revenue', 'Tushum'), value: pl.revenue, pct: 100, color: '#3b82f6', indent: false, isTotal: true },
                  { label: tr(lang, '− Себестоимость (COGS)', '− Cost of Goods Sold', '− Tannarx (COGS)'), value: -pl.cogs, pct: -pct(pl.cogs), color: '#ef4444', indent: true, isTotal: false },
                  { label: tr(lang, '= Валовая маржа', '= Gross Margin', '= Yalpi marja'), value: grossMargin, pct: pct(grossMargin), color: '#f59e0b', indent: false, isTotal: true },
                  ...(pl.laborCost > 0 ? [{ label: tr(lang, '− ФОТ (зарплаты)', '− Labor Cost (salaries)', '− Mehnat xarajati'), value: -pl.laborCost, pct: -pct(pl.laborCost), color: '#a855f7', indent: true, isTotal: false }] : []),
                  ...(pl.rent > 0 ? [{ label: tr(lang, '− Аренда', '− Rent', '− Ijara'), value: -pl.rent, pct: -pct(pl.rent), color: '#6b7280', indent: true, isTotal: false }] : []),
                  ...(pl.utilities > 0 ? [{ label: tr(lang, '− Коммунальные услуги', '− Utilities', '− Kommunal xizmatlar'), value: -pl.utilities, pct: -pct(pl.utilities), color: '#6b7280', indent: true, isTotal: false }] : []),
                  ...(pl.otherOpex > 0 ? [{ label: tr(lang, '− Прочие расходы', '− Other Costs', '− Boshqa xarajatlar'), value: -pl.otherOpex, pct: -pct(pl.otherOpex), color: '#6b7280', indent: true, isTotal: false }] : []),
                  { label: tr(lang, '= Чистая прибыль', '= Net Profit', '= Sof foyda'), value: pl.netProfit, pct: pct(pl.netProfit), color: pl.netProfit >= 0 ? '#22c55e' : '#ef4444', indent: false, isTotal: true },
                ];
                return (
                  <div className="mt-2 space-y-2">
                    {rows.map((row, i) => (
                      <div key={i} className={`${row.indent ? 'ml-4' : ''}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[12px] ${row.isTotal ? 'font-semibold text-text' : 'text-muted'}`}>{row.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-muted/60 metric-number w-10 text-right">{row.pct > 0 ? '+' : ''}{row.pct}%</span>
                            <span className={`text-[13px] font-bold metric-number w-28 text-right ${row.isTotal ? 'text-text' : row.value < 0 ? 'text-danger' : 'text-muted'}`}>
                              {row.value < 0 ? `−${fmt(-row.value)}` : fmt(row.value)}
                            </span>
                          </div>
                        </div>
                        {row.isTotal && (
                          <div className="h-2 rounded-full bg-border overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${Math.min(100, Math.abs(row.pct))}%`, backgroundColor: row.color }} />
                          </div>
                        )}
                      </div>
                    ))}
                    {/* ФОТ composition — how the labor cost breaks down by pay type */}
                    {pl.laborBreakdown && pl.laborCost > 0 && (() => {
                      const lb = pl.laborBreakdown;
                      const parts = [
                        { label: tr(lang, 'Тариф (почасовая)', 'Hourly tariff', 'Soatlik tarif'), value: lb.tariff, color: '#a855f7' },
                        { label: tr(lang, 'Премии/проценты', 'Incentive pay', 'Rag\'batlantirish'), value: lb.incentive, color: '#c084fc' },
                        { label: tr(lang, 'Бонусы', 'Bonuses', 'Bonuslar'), value: lb.bonus, color: '#e9d5ff' },
                        { label: tr(lang, 'Штрафы', 'Penalties', 'Jarimalar'), value: -lb.penalty, color: '#ef4444' },
                      ].filter(p => Math.abs(p.value) > 0);
                      const maxAbs = Math.max(...parts.map(p => Math.abs(p.value)), 1);
                      if (parts.length === 0) return null;
                      return (
                        <div className="ml-4 pl-3 border-l border-border/60 space-y-1.5 py-1">
                          <p className="text-[9px] uppercase tracking-[0.1em] text-muted/50">{tr(lang, 'Состав ФОТ', 'Labor cost composition', 'Mehnat xarajati tarkibi')}</p>
                          {parts.map(p => (
                            <div key={p.label} className="flex items-center gap-2">
                              <span className="text-[10px] text-muted w-32 flex-shrink-0">{p.label}</span>
                              <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(Math.abs(p.value) / maxAbs) * 100}%`, backgroundColor: p.color }} />
                              </div>
                              <span className={`text-[10px] metric-number w-20 text-right ${p.value < 0 ? 'text-danger' : 'text-muted'}`}>
                                {p.value < 0 ? `−${fmt(-p.value)}` : fmt(p.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    <p className="text-[9px] text-muted/40 uppercase tracking-[0.1em] pt-1">
                      {tr(lang, 'Источник: iiko OLAP · продажи + проводки', 'Source: iiko OLAP · sales + transactions', 'Manba: iiko OLAP · savdo + provodkalar')}
                    </p>
                    {pl.rent === 0 && pl.utilities === 0 && pl.otherOpex === 0 && (
                      <p className="text-[9px] text-muted/50 normal-case tracking-normal pt-0.5">
                        {tr(lang,
                          'Аренда/коммуналка не найдены в проводках iiko за период — либо не вносились, либо счета названы иначе, чем ожидается',
                          'No rent/utilities found in iiko transactions for this period — either not entered, or the accounts are named differently than expected',
                          'Ushbu davr uchun iiko provodkalarida ijara/kommunal topilmadi')}
                      </p>
                    )}
                  </div>
                );
              })()}
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title={t.pl_structure}>
              {plLoading ? (
                <div className="flex items-center gap-4 mt-2 animate-pulse">
                  <div className="w-40 h-40 flex-shrink-0 rounded-full bg-zinc-800/60" />
                  <div className="space-y-3 flex-1">
                    {[0,1,2].map(i => <div key={i} className="h-4 bg-zinc-800/60 rounded" />)}
                  </div>
                </div>
              ) : (
              <div className="flex items-center gap-4 mt-2">
                <div className="w-40 h-40 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} innerRadius={44} outerRadius={62} paddingAngle={4} dataKey="value" stroke="none" animationDuration={900}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip content={(p: any) => <ChartTooltip {...p} valueFormatter={(v: any) => `${v}%`} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2.5 flex-1">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-[12px] text-muted">{d.name}</span>
                      </div>
                      <span className="metric-number text-[13px] font-bold text-text">{d.value}%</span>
                    </div>
                  ))}
                  {pl?.foodCostPct == null && (
                    <p className="text-[9px] text-muted/50 uppercase tracking-[0.1em] pt-1">{tr(lang, 'демо-данные', 'demo data', 'demo ma\'lumotlar')}</p>
                  )}
                </div>
              </div>
              )}
            </Card>

            <Card title={t.profit_forecast}>
              {plLoading ? (
                <div className="h-[220px] mt-2 flex items-end justify-around gap-2 animate-pulse">
                  {[60,80,50,90,75,95].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-zinc-800/60" style={{ height: `${h}%` }} />
                  ))}
                </div>
              ) : (
              <>
              <div className="h-[220px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecastData} margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#1a1a1a" />
                    <XAxis dataKey="month" stroke="transparent" tick={{ fill: '#666', fontSize: 10, fontFamily: 'Onest' }} tickLine={false} axisLine={false} />
                    <YAxis stroke="transparent" tick={{ fill: '#666', fontSize: 10, fontFamily: 'Onest' }} tickLine={false} axisLine={false} width={40} tickFormatter={v => v >= 1_000_000 ? `${Math.round(v / 1_000_000)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}K` : String(v)} />
                    <Tooltip content={tt} cursor={{ fill: 'rgba(255,107,53,0.05)' }} />
                    <Bar dataKey="profit" radius={[3, 3, 0, 0]} animationDuration={900}>
                      {forecastData.map((entry: any, i: number) => (
                        <Cell key={i} fill={entry.est ? '#ff6b35' : '#22c55e'} opacity={entry.est ? 0.7 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-center text-muted mt-2 uppercase tracking-[0.12em]">
                {forecastIsDemo
                  ? tr(lang, 'Демо-данные · нужно 2+ месяцев истории', 'Demo data · need 2+ months history', 'Demo ma\'lumotlar · 2+ oylik tarix kerak')
                  : tr(lang, 'Выручка по месяцам · iiko · оранжевый = прогноз ИИ', 'Monthly revenue · iiko · orange = AI forecast', 'Oylik tushum · iiko · to\'q sariq = AI bashorati')}
              </p>

              {/* Target month picker */}
              {!forecastIsDemo && activeTargetMonth && (
                <div className="flex items-center justify-center gap-2 mt-3">
                  <button
                    onClick={() => { const m = shiftMonth(activeTargetMonth, -1); setForecastMonth(m); runForecast(m); }}
                    disabled={forecastLoading}
                    className="p-1 rounded-md text-muted hover:text-text hover:bg-card-hover transition-colors disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[11px] font-medium text-text metric-number w-24 text-center">
                    {MONTH_LABEL(activeTargetMonth, lang)}
                  </span>
                  <button
                    onClick={() => { const m = shiftMonth(activeTargetMonth, 1); setForecastMonth(m); runForecast(m); }}
                    disabled={forecastLoading}
                    className="p-1 rounded-md text-muted hover:text-text hover:bg-card-hover transition-colors disabled:opacity-40"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}

              {/* AI reasoning */}
              {forecastLoading ? (
                <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-3">
                    <Sparkles size={14} className="text-primary flex-shrink-0 animate-pulse" />
                    <p className="text-[13px] text-muted">
                      {tr(lang, 'ИИ анализирует данные...', 'AI is analyzing...', 'AI tahlil qilmoqda...')}
                    </p>
                    <div className="flex gap-1 ml-auto">
                      {[0,1,2].map(i => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60"
                          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-2.5 bg-primary/10 rounded animate-pulse w-full" />
                    <div className="h-2.5 bg-primary/10 rounded animate-pulse w-4/5" />
                    <div className="h-2.5 bg-primary/10 rounded animate-pulse w-3/5" />
                  </div>
                </div>
              ) : forecast?.fromAI && forecast.reasoning ? (
                <div className="mt-3 p-3 rounded-lg bg-card border border-border">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Sparkles size={11} className="text-primary" />
                    <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${forecast.trend === 'up' ? 'text-success' : forecast.trend === 'down' ? 'text-danger' : 'text-amber-400'}`}>
                      {forecast.trend === 'up' ? '↑' : forecast.trend === 'down' ? '↓' : '→'} {tr(lang, 'Прогноз ИИ', 'AI Forecast', 'AI bashorati')} · {forecast.nextMonth}
                    </span>
                    <span className="text-[10px] text-muted ml-auto metric-number">
                      {forecast.forecastRevenue != null && `${Math.round(forecast.forecastRevenue / 1_000_000)}M UZS выручка`}
                    </span>
                  </div>
                  {forecast.forecastProfitPct != null && (
                    <p className="text-[11px] mb-1.5">
                      <span className="text-muted">{tr(lang, 'Прогноз прибыли:', 'Forecast profit:', 'Foyda bashorati:')} </span>
                      <span className={`font-semibold metric-number ${forecast.forecastProfitPct < 0 ? 'text-danger' : 'text-text'}`}>
                        {forecast.forecastProfit != null ? `${forecast.forecastProfit > 0 ? '+' : ''}${Math.round(forecast.forecastProfit / 1_000_000)}M UZS` : ''}
                      </span>
                      <span className={`ml-1 ${forecast.forecastProfitPct < 0 ? 'text-danger' : 'text-muted'}`}>
                        ({forecast.forecastProfitPct > 0 ? '+' : ''}{forecast.forecastProfitPct.toFixed(1)}%)
                      </span>
                    </p>
                  )}
                  <p className="text-[12px] text-text/80 leading-relaxed">{forecast.reasoning}</p>
                  {forecast.risks && (
                    <p className="text-[11px] text-amber-400/90 leading-relaxed mt-1.5">
                      ⚠ {forecast.risks}
                    </p>
                  )}
                  <button
                    onClick={() => runForecast()}
                    className="mt-3 text-[11px] text-muted hover:text-primary transition-colors"
                  >
                    {tr(lang, 'Обновить прогноз', 'Refresh forecast', 'Bashoratni yangilash')}
                  </button>
                </div>
              ) : !forecastIsDemo ? (
                <button
                  onClick={() => runForecast()}
                  disabled={forecastLoading}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-primary/30 text-primary hover:bg-primary/5 transition-colors text-[13px] font-medium"
                >
                  <Sparkles size={14} />
                  {tr(lang, 'Получить AI-прогноз', 'Get AI Forecast', 'AI bashoratini olish')}
                </button>
              ) : null}
              </>
              )}
            </Card>
          </div>

          <Card title={tr(lang, 'Фуд-кост по категориям', 'Food Cost by Category', 'Kategoriyalar bo\'yicha food cost')}>
            <div className="overflow-x-auto mt-1">
              {plLoading ? (
                <Skeleton />
              ) : pl?.categories && pl.categories.length > 0 ? (
                <table className="w-full text-left min-w-[480px]">
                  <thead className="border-b border-border">
                    <tr>
                      {[t.category,
                        tr(lang, 'Выручка', 'Revenue', 'Tushum'),
                        tr(lang, 'Себест.', 'COGS', 'Tannarx'),
                        tr(lang, 'Маржа', 'Margin', 'Marja'),
                        tr(lang, 'Фуд-кост', 'Food Cost', 'Food Cost'),
                      ].map(h => (
                        <th key={h} className="pb-3 text-[10px] uppercase tracking-[0.15em] text-muted font-medium first:pl-0 px-3 first:px-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pl.categories.map((row, i) => {
                      const margin = row.revenue - row.cogs;
                      const marginPct = row.revenue > 0 ? Math.round((margin / row.revenue) * 1000) / 10 : null;
                      return (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                        <td className="py-3 text-[13px] font-medium text-text">{row.name}</td>
                        <td className="py-3 px-3 text-[12px] text-muted metric-number">{row.revenue.toLocaleString('ru-RU')}</td>
                        <td className="py-3 px-3 text-[12px] text-muted metric-number">{row.cogs > 0 ? row.cogs.toLocaleString('ru-RU') : '—'}</td>
                        <td className={`py-3 px-3 text-[12px] font-semibold metric-number ${
                          marginPct == null ? 'text-muted' : marginPct > 65 ? 'text-success' : marginPct < 50 ? 'text-danger' : 'text-amber-400'
                        }`}>
                          {marginPct != null ? `${marginPct}%` : '—'}
                        </td>
                        <td className={`py-3 px-3 text-[13px] font-bold metric-number ${
                          row.foodCostPct == null ? 'text-muted' :
                          row.foodCostPct > 35 ? 'text-danger' :
                          row.foodCostPct > 28 ? 'text-amber-400' : 'text-success'
                        }`}>
                          {row.foodCostPct != null ? `${row.foodCostPct}%` : '—'}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left opacity-40">
                  <thead className="border-b border-border">
                    <tr>
                      {[t.category, t.ideal_cost, t.actual_cost, t.variance].map(h => (
                        <th key={h} className="pb-3 text-[10px] uppercase tracking-[0.15em] text-muted font-medium first:pl-0 px-3 first:px-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { cat: tr(lang, 'Мясо и Гриль', 'Meat & Grill', 'Go\'sht va Gril'), ideal: '32%', actual: '35%', var: '-3%' },
                      { cat: 'Alcohol', ideal: '18%', actual: '19%', var: '-1%' },
                      { cat: tr(lang, 'Овощи', 'Vegetables', 'Sabzavotlar'), ideal: '25%', actual: '24%', var: '+1%' },
                    ].map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="py-3 text-[13px] font-medium text-text">{row.cat}</td>
                        <td className="py-3 px-3 text-[12px] text-muted metric-number">{row.ideal}</td>
                        <td className="py-3 px-3 text-[13px] text-text metric-number">{row.actual}</td>
                        <td className="py-3 px-3 text-[13px] font-bold metric-number text-muted">{row.var}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(!pl?.categories || pl.categories.length === 0) && (
                <p className="text-[10px] text-muted/50 uppercase tracking-[0.1em] mt-3 text-center">
                  {tr(lang, 'Демо · данные загружаются из iiko', 'Demo · loading real data from iiko', 'Demo · iiko\'dan ma\'lumotlar yuklanmoqda')}
                </p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── INVOICES TAB ── */}
      {tab === 'invoices' && (
        <Card title={t.invoices}>
          <p className="text-[10px] text-muted mb-3">
            {isPoster
              ? tr(lang, 'Приходные накладные · Poster', 'Supply invoices · Poster', 'Kirim hisob-fakturalari · Poster')
              : tr(lang, 'Приходные накладные · iikoServer', 'Supply invoices · iikoServer', 'Kirim hisob-fakturalari · iikoServer')}
          </p>
          {invoicesLoading ? <Skeleton /> : invoices.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-muted">
              <Package size={15} />
              <span className="text-[12px]">{tr(lang, 'Накладных не найдено за период', 'No invoices for period', 'Davr uchun hisob-fakturalar topilmadi')}</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[500px]">
                  <thead className="border-b border-border">
                    <tr>
                      {['#', tr(lang, 'Поставщик', 'Supplier', 'Yetkazib beruvchi'), tr(lang, 'Дата', 'Date', 'Sana'),
                        t.invoice_amount, tr(lang, 'Статус', 'Status', 'Holati')].map(h => (
                        <th key={h} className="pb-3 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const docNum = inv.id.replace(/^\d{4}-\d{2}-\d{2}-/, '');
                      return (
                      <tr key={inv.id}
                        className="border-b border-border last:border-0 hover:bg-card-hover transition-colors cursor-pointer"
                        onClick={() => onShowToast?.(`${inv.supplier} · ${Math.round(inv.amount).toLocaleString('ru-RU')} UZS`, 'info')}>
                        <td className="py-3 pr-4 text-[11px] font-mono text-muted">{docNum}</td>
                        <td className="py-3 pr-4 text-[13px] font-medium text-text">{inv.supplier}</td>
                        <td className="py-3 pr-4 text-[12px] text-muted">{inv.date}</td>
                        <td className="py-3 pr-4 text-[13px] font-semibold text-text metric-number">{Math.round(inv.amount).toLocaleString('ru-RU')}</td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] ${statusColor(inv.status)}`}>
                            {statusLabel(inv.status, lang)}
                          </span>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-[11px] text-muted">
                  {tr(lang,
                    `Итого: ${invoices.reduce((s, i) => s + i.amount, 0).toLocaleString('ru-RU')} UZS · ${invoices.length} накл.`,
                    `Total: ${invoices.reduce((s, i) => s + i.amount, 0).toLocaleString('ru-RU')} UZS · ${invoices.length} invoices`,
                    `Jami: ${invoices.reduce((s, i) => s + i.amount, 0).toLocaleString('ru-RU')} UZS · ${invoices.length} hisob-faktura`)}
                </p>
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── WRITE-OFFS TAB ── */}
      {tab === 'writeoffs' && (
        <>
          {!writeoffsLoading && writeoffs.length > 0 && (
            <WasteImpactBanner
              writeoffs={writeoffs.filter(isRealFoodWaste)}
              revenue={writeoffRevenue}
              numDays={
                woRange === 'custom' && woCustomRange
                  ? Math.max(1, Math.round((new Date(woCustomRange.to).getTime() - new Date(woCustomRange.from).getTime()) / 86400000) + 1)
                  : woRange === '30days' ? 30 : woRange === '7days' ? 7 : 1
              }
              lang={lang}
            />
          )}
        <Card title={t.writeoffs}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-muted">
              {isPoster
                ? tr(lang, 'Списания по причине · Poster', 'Write-offs by reason · Poster', 'Sabab bo\'yicha hisobdan chiqarish · Poster')
                : tr(lang, 'Акты списания · iikoServer API', 'Writeoff documents · iikoServer API', 'Hisobdan chiqarish hujjatlari · iikoServer API')}
            </p>
          </div>
          {writeoffsLoading ? <Skeleton /> : writeoffs.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-success">
              <CheckCircle size={15} />
              <span className="text-[12px]">{tr(lang, 'Списаний нет за период', 'No write-offs for period', 'Davr uchun hisobdan chiqarishlar yo\'q')}</span>
            </div>
          ) : (
            <>
              {(() => {
                const byDept = new Map<string, { sum: number; isFood: boolean }>();
                for (const w of writeoffs) {
                  const e = byDept.get(w.category) ?? { sum: 0, isFood: isRealFoodWaste(w) };
                  e.sum += w.cost;
                  byDept.set(w.category, e);
                }
                const deptEntries = [...byDept.entries()].sort((a, b) => b[1].sum - a[1].sum);
                const foodDepts  = deptEntries.filter(([, v]) => v.isFood);
                const otherDepts = deptEntries.filter(([, v]) => !v.isFood);
                const foodTotal = writeoffs.filter(isRealFoodWaste).reduce((s, w) => s + w.cost, 0);
                const allTotal  = writeoffs.reduce((s, w) => s + w.cost, 0);

                const deptChip = (dept: string, sum: number, isFood: boolean) => (
                  <button
                    key={dept}
                    onClick={() => setWriteoffDept(dept === writeoffDept ? FOOD_FILTER : dept)}
                    className={`px-2.5 py-1 rounded-md text-[10.5px] font-medium transition-colors border ${
                      writeoffDept === dept
                        ? 'bg-primary text-white border-primary'
                        : isFood
                        ? 'bg-card-hover text-text border-border hover:border-primary/40'
                        : 'bg-transparent text-muted/70 border-border/50 hover:text-muted'
                    }`}>
                    {dept} · {sum.toLocaleString('ru-RU')}
                  </button>
                );

                return (
                  <div className="mb-4 space-y-2.5">
                    {/* Primary toggle */}
                    <div className="inline-flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
                      <button
                        onClick={() => setWriteoffDept(FOOD_FILTER)}
                        className={`px-3 py-1.5 text-[11px] font-semibold rounded-[5px] transition-all ${
                          writeoffDept === FOOD_FILTER ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text'
                        }`}>
                        {tr(lang, 'Еда', 'Food', 'Oziq-ovqat')} · {foodTotal.toLocaleString('ru-RU')}
                      </button>
                      <button
                        onClick={() => setWriteoffDept('__all__')}
                        className={`px-3 py-1.5 text-[11px] font-semibold rounded-[5px] transition-all ${
                          writeoffDept === '__all__' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text'
                        }`}>
                        {tr(lang, 'Всё', 'All', 'Barchasi')} · {allTotal.toLocaleString('ru-RU')}
                      </button>
                    </div>

                    {/* Per-department drill-down, grouped so food/other read at a glance */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] uppercase tracking-[0.12em] text-muted/60 mr-0.5">
                        {tr(lang, 'Еда:', 'Food:', 'Oziq-ovqat:')}
                      </span>
                      {foodDepts.map(([dept, { sum, isFood }]) => deptChip(dept, sum, isFood))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] uppercase tracking-[0.12em] text-muted/60 mr-0.5">
                        {tr(lang, 'Прочее:', 'Other:', 'Boshqa:')}
                      </span>
                      {otherDepts.map(([dept, { sum, isFood }]) => deptChip(dept, sum, isFood))}
                    </div>
                  </div>
                );
              })()}
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[560px]">
                  <thead className="border-b border-border">
                    <tr>
                      {[tr(lang, 'Позиция', 'Item', 'Pozitsiya'), tr(lang, 'Подразделение', 'Department', 'Bo\'lim'), tr(lang, 'Акт №', 'Doc #', 'Hujjat №'),
                        tr(lang, 'Кол-во', 'Qty', 'Miqdor'), tr(lang, 'Себест.', 'Cost', 'Tannarx'),
                        tr(lang, 'Дата', 'Date', 'Sana')].map(h => (
                        <th key={h} className="pb-3 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {writeoffs.filter(w =>
                      writeoffDept === '__all__' ? true :
                      writeoffDept === FOOD_FILTER ? isRealFoodWaste(w) :
                      w.category === writeoffDept
                    ).map((w) => (
                      <tr key={w.id} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                        <td className="py-3 pr-4 text-[13px] font-medium text-text">{w.name}</td>
                        <td className="py-3 pr-4 text-[11px] text-muted">{w.category}</td>
                        <td className="py-3 pr-4 text-[11px] text-muted">{w.docNumber || '—'}</td>
                        <td className="py-3 pr-4 text-[12px] text-muted metric-number">{w.qty}</td>
                        <td className="py-3 pr-4 text-[13px] font-semibold text-danger metric-number">−{Math.round(w.cost).toLocaleString('ru-RU')}</td>
                        <td className="py-3 text-[11px] text-muted">{w.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                {(() => {
                  const filtered = writeoffs.filter(w =>
                    writeoffDept === '__all__' ? true :
                    writeoffDept === FOOD_FILTER ? isRealFoodWaste(w) :
                    w.category === writeoffDept
                  );
                  const total = filtered.reduce((s, w) => s + w.cost, 0);
                  return (
                    <p className="text-[11px] text-muted">
                      {tr(lang,
                        `Итого: −${total.toLocaleString('ru-RU')} UZS · ${filtered.length} позиций`,
                        `Total: −${total.toLocaleString('ru-RU')} UZS · ${filtered.length} items`,
                        `Jami: −${total.toLocaleString('ru-RU')} UZS · ${filtered.length} pozitsiya`)}
                    </p>
                  );
                })()}
              </div>
            </>
          )}
        </Card>
        </>
      )}

      {/* ── INVENTORY TAB ── */}
      {tab === 'inventory' && (
        <Card title={tr(lang, 'Инвентаризации', 'Inventory', 'Inventarizatsiyalar')}>
          <p className="text-[10px] text-muted mb-3">
            {isPoster
              ? (inventoryView === 'live'
                ? tr(lang, 'Текущие остатки склада · Poster', 'Current stock balance · Poster', 'Joriy ombor qoldig\'i · Poster')
                : tr(lang, 'Архив инвентаризаций · Poster', 'Stocktaking archive · Poster', 'Inventarizatsiya arxivi · Poster'))
              : tr(lang, 'Документы инвентаризации · iikoServer', 'Stocktaking documents · iikoServer', 'Inventarizatsiya hujjatlari · iikoServer')}
          </p>
          {isPoster && (
            <div className="inline-flex items-center gap-1 bg-background border border-border rounded-lg p-0.5 mb-3">
              <button
                onClick={() => setInventoryView('live')}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-[5px] transition-all ${inventoryView === 'live' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text'}`}>
                {tr(lang, 'Текущий остаток', 'Live stock', 'Joriy qoldiq')}
              </button>
              <button
                onClick={() => setInventoryView('docs')}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-[5px] transition-all ${inventoryView === 'docs' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text'}`}>
                {tr(lang, 'Архив инвентаризаций', 'Count history', 'Inventarizatsiya arxivi')}
              </button>
            </div>
          )}
          {isPoster && inventoryView === 'docs' ? (
            inventoryDocsLoading ? <Skeleton /> : inventoryDocs.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-muted">
                <Package size={15} />
                <span className="text-[12px]">{tr(lang, 'Инвентаризаций не найдено', 'No count events found', 'Inventarizatsiya topilmadi')}</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[480px]">
                  <thead className="border-b border-border">
                    <tr>
                      {[
                        tr(lang, 'Склад', 'Storage', 'Ombor'),
                        tr(lang, 'Начало', 'Started', 'Boshlandi'),
                        tr(lang, 'Окончание', 'Ended', 'Tugadi'),
                        tr(lang, 'Сумма', 'Amount', 'Summa'),
                        tr(lang, 'Статус', 'Status', 'Holati'),
                      ].map(h => (
                        <th key={h} className="pb-3 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryDocs.map(doc => (
                      <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                        <td className="py-3 pr-4 text-[13px] font-medium text-text">{doc.storageName}</td>
                        <td className="py-3 pr-4 text-[12px] text-muted">{doc.dateStart}</td>
                        <td className="py-3 pr-4 text-[12px] text-muted">{doc.dateEnd}</td>
                        <td className="py-3 pr-4 text-[13px] font-semibold text-text metric-number">{doc.sum.toLocaleString('ru-RU')}</td>
                        <td className="py-3 pr-4 text-[11px] text-muted">{doc.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : inventoryLoading ? <Skeleton /> : !inventory ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Package size={28} className="text-muted/40" />
              <p className="text-[12px] text-muted max-w-[260px]">
                {isPoster
                  ? tr(lang, 'На складе нет данных об остатках', 'No stock balance data', "Ombor qoldig'i ma'lumotlari yo'q")
                  : tr(lang,
                    'Документов инвентаризации за период не найдено',
                    'No inventory documents found for period',
                    'Davr uchun inventarizatsiya hujjatlari topilmadi')}
              </p>
            </div>
          ) : isPoster ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[480px]">
                  <thead className="border-b border-border">
                    <tr>
                      {[
                        tr(lang, 'Позиция', 'Item', 'Pozitsiya'),
                        tr(lang, 'Остаток', 'Qty', 'Qoldiq'),
                        tr(lang, 'Себест. за ед.', 'Unit cost', 'Birlik tannarxi'),
                        tr(lang, 'Стоимость', 'Total value', 'Umumiy qiymat'),
                      ].map(h => (
                        <th key={h} className="pb-3 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.filter(isPosterInventoryItem).map(item => (
                      <tr key={item.id} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                        <td className="py-3 pr-4 text-[13px] font-medium text-text">{item.name}</td>
                        <td className="py-3 pr-4 text-[12px] text-muted metric-number">{item.qty.toLocaleString('ru-RU')} {item.unit}</td>
                        <td className="py-3 pr-4 text-[12px] text-muted font-mono">{item.unitCost.toLocaleString('ru-RU')}</td>
                        <td className="py-3 pr-4 text-[13px] font-semibold text-text metric-number">{item.totalValue.toLocaleString('ru-RU')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-[11px] text-muted">
                  {tr(lang,
                    `${inventory.length} позиций · итого ${inventory.filter(isPosterInventoryItem).reduce((s, i) => s + i.totalValue, 0).toLocaleString('ru-RU')} UZS`,
                    `${inventory.length} items · total ${inventory.filter(isPosterInventoryItem).reduce((s, i) => s + i.totalValue, 0).toLocaleString('ru-RU')} UZS`,
                    `${inventory.length} pozitsiya · jami ${inventory.filter(isPosterInventoryItem).reduce((s, i) => s + i.totalValue, 0).toLocaleString('ru-RU')} UZS`)}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[500px]">
                  <thead className="border-b border-border">
                    <tr>
                      {[
                        tr(lang, '№ документа', 'Doc #', 'Hujjat №'),
                        tr(lang, 'Дата', 'Date', 'Sana'),
                        tr(lang, 'Склад', 'Store', 'Ombor'),
                        tr(lang, 'Сумма', 'Amount', 'Summa'),
                        tr(lang, 'Статус', 'Status', 'Holati'),
                        tr(lang, 'Комментарий', 'Comment', 'Izoh'),
                        '',
                      ].map(h => (
                        <th key={h} className="pb-3 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.filter((d): d is FinancialInventoryDoc => !isPosterInventoryItem(d)).map(doc => (
                      <tr key={doc.id}
                        onClick={() => setInventoryDoc(doc)}
                        className="border-b border-border last:border-0 hover:bg-card-hover transition-colors cursor-pointer group">
                        <td className="py-3 pr-4 text-[12px] font-mono text-text group-hover:text-primary transition-colors">{doc.documentNumber}</td>
                        <td className="py-3 pr-4 text-[12px] text-muted">{doc.date}</td>
                        <td className="py-3 pr-4 text-[11px] text-muted">{doc.storeCode || '—'}</td>
                        <td className="py-3 pr-4 text-[12px] text-muted font-mono">{doc.sum != null ? doc.sum.toLocaleString('ru-RU') : '—'}</td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-0.5 rounded-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] ${
                            doc.status === 'PROCESSED' ? 'text-success bg-success/10' :
                            doc.status === 'NEW'       ? 'text-amber-400 bg-amber-400/10' :
                                                         'text-muted bg-muted/10'
                          }`}>
                            {doc.status === 'PROCESSED'
                              ? tr(lang, 'Проведено', 'Posted', "O'tkazilgan")
                              : doc.status === 'NEW'
                              ? tr(lang, 'Черновик', 'Draft', 'Qoralama')
                              : doc.status}
                          </span>
                        </td>
                        <td className="py-3 pr-2 text-[11px] text-muted truncate max-w-[120px]">{doc.comment || '—'}</td>
                        <td className="py-3 text-muted group-hover:text-primary transition-colors"><ChevronRight size={13} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <p className="text-[11px] text-muted">
                  {tr(lang,
                    `${inventory.length} докум. · итого ${inventory.reduce((s, d) => s + ((d as FinancialInventoryDoc).sum ?? 0), 0).toLocaleString('ru-RU')} UZS`,
                    `${inventory.length} docs · total ${inventory.reduce((s, d) => s + ((d as FinancialInventoryDoc).sum ?? 0), 0).toLocaleString('ru-RU')} UZS`,
                    `${inventory.length} hujjat · jami ${inventory.reduce((s, d) => s + ((d as FinancialInventoryDoc).sum ?? 0), 0).toLocaleString('ru-RU')} UZS`)}
                </p>
                <p className="text-[10px] text-muted/50">{tr(lang, 'Нажмите на строку для деталей', 'Click a row for details', 'Tafsilotlar uchun qatorni bosing')}</p>
              </div>
            </>
          )}
        </Card>
      )}

      {inventoryDoc && (
        <InventoryDrawer doc={inventoryDoc} lang={lang} onClose={() => setInventoryDoc(null)} />
      )}

      {/* ── CASH SHIFTS TAB ── */}
      {tab === 'cashshifts' && (
        <Card title={tr(lang, 'Кассовые смены', 'Cash Shifts', 'Kassa smenalari')}>
          <p className="text-[10px] text-muted mb-3">
            {tr(lang, 'Кассовые смены · iikoServer', 'Cash shifts · iikoServer', 'Kassa smenalari · iikoServer')}
          </p>
          {cashshiftsLoading ? <Skeleton /> : cashshifts.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-muted">
              <Package size={15} />
              <span className="text-[12px]">{tr(lang, 'Смен не найдено за период', 'No shifts found for period', 'Davr uchun smenalar topilmadi')}</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[640px]">
                  <thead className="border-b border-border">
                    <tr>
                      {[
                        '№',
                        tr(lang, 'Открыта', 'Opened', 'Ochilgan'),
                        tr(lang, 'Закрыта', 'Closed', 'Yopilgan'),
                        tr(lang, 'Выручка', 'Revenue', 'Tushum'),
                        tr(lang, 'Наличные', 'Cash', 'Naqd'),
                        tr(lang, 'Карта', 'Card', 'Karta'),
                        tr(lang, 'Расхождение', 'Diff', 'Farq'),
                        tr(lang, 'Статус', 'Status', 'Holati'),
                      ].map(h => (
                        <th key={h} className="pb-3 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cashshifts.map(s => {
                      const diffColor = s.cashDiff === 0 ? 'text-muted' : s.cashDiff < 0 ? 'text-danger' : 'text-success';
                      const statusColor =
                        s.sessionStatus === 'ACCEPTED'    ? 'text-success bg-success/10' :
                        s.sessionStatus === 'OPEN'        ? 'text-primary bg-primary/10' :
                        s.sessionStatus === 'HASWARNINGS' ? 'text-amber-400 bg-amber-400/10' :
                                                            'text-muted bg-muted/10';
                      const statusLabel =
                        s.sessionStatus === 'ACCEPTED'     ? tr(lang, 'Принята', 'Accepted', 'Qabul qilingan')   :
                        s.sessionStatus === 'OPEN'         ? tr(lang, 'Открыта', 'Open', 'Ochiq')       :
                        s.sessionStatus === 'CLOSED'       ? tr(lang, 'Закрыта', 'Closed', 'Yopiq')     :
                        s.sessionStatus === 'UNACCEPTED'   ? tr(lang, 'Не принята', 'Unaccepted', 'Qabul qilinmagan') :
                        s.sessionStatus === 'HASWARNINGS'  ? tr(lang, 'Подозр.', 'Warning', 'Ogohlantirish')    :
                        s.sessionStatus;
                      return (
                        <tr key={s.id} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                          <td className="py-3 pr-4 text-[11px] font-mono text-muted">{s.sessionNumber}</td>
                          <td className="py-3 pr-4 text-[11px] text-muted">{s.openDate ?? '—'}</td>
                          <td className="py-3 pr-4 text-[11px] text-muted">{s.closeDate ?? '—'}</td>
                          <td className="py-3 pr-4 text-[13px] font-semibold text-text metric-number">{Math.round(s.payOrders).toLocaleString('ru-RU')}</td>
                          <td className="py-3 pr-4 text-[12px] text-muted metric-number">{Math.round(s.salesCash).toLocaleString('ru-RU')}</td>
                          <td className="py-3 pr-4 text-[12px] text-muted metric-number">{Math.round(s.salesCard).toLocaleString('ru-RU')}</td>
                          <td className={`py-3 pr-4 text-[12px] font-semibold metric-number ${diffColor}`}>
                            {s.cashDiff === 0 ? '—' : (s.cashDiff > 0 ? '+' : '') + Math.round(s.cashDiff).toLocaleString('ru-RU')}
                          </td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <p className="text-[11px] text-muted">
                  {tr(lang,
                    `${cashshifts.length} смен · итого ${cashshifts.reduce((s, c) => s + c.payOrders, 0).toLocaleString('ru-RU')} UZS`,
                    `${cashshifts.length} shifts · total ${cashshifts.reduce((s, c) => s + c.payOrders, 0).toLocaleString('ru-RU')} UZS`,
                    `${cashshifts.length} smena · jami ${cashshifts.reduce((s, c) => s + c.payOrders, 0).toLocaleString('ru-RU')} UZS`)}
                </p>
                {cashshifts.some(s => s.cashDiff !== 0) && (
                  <p className="text-[11px] text-danger metric-number">
                    {tr(lang, 'Расхожд.: ', 'Diff: ', 'Farq: ')}
                    {cashshifts.reduce((s, c) => s + c.cashDiff, 0).toLocaleString('ru-RU')}
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── УЧЁТ (GL) TAB ── */}
      {tab === 'gl' && (
        <div className="space-y-4">
          <p className="text-[10px] text-muted -mt-1">
            {tr(lang, 'Кредиторка, налоги и движение по кассам · из проводок iiko (General Ledger)', 'Payables, taxes, and cash channel activity · from iiko\'s general ledger', "Kreditorlik, soliqlar va kassa harakati · iiko provodkalaridan")}
          </p>
          {glLoading ? <Skeleton /> : !glSummary ? (
            <div className="glass rounded-3xl p-10 text-center text-muted text-[13px]">
              {tr(lang, 'Нет данных за период', 'No data for this period', "Davr uchun ma'lumot yo'q")}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Income breakdown */}
              <Card title={tr(lang, 'Структура доходов', 'Income Breakdown', 'Daromadlar tarkibi')} className="lg:col-span-2">
                {glSummary.income.lines.length === 0 ? (
                  <p className="text-[12px] text-muted py-4">{tr(lang, 'Нет данных за период', 'No data for this period', "Davr uchun ma'lumot yo'q")}</p>
                ) : (
                  <div className="space-y-2.5 mt-1">
                    {(() => {
                      const maxAmt = Math.max(...glSummary.income.lines.map(l => l.amount), 1);
                      return glSummary.income.lines.map(l => (
                        <div key={l.name} className="flex items-center gap-3">
                          <span className="text-[12px] text-text w-56 flex-shrink-0 truncate">{l.name}</span>
                          <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary/60" style={{ width: `${(l.amount / maxAmt) * 100}%` }} />
                          </div>
                          <span className="text-[12px] font-semibold text-text metric-number w-28 text-right flex-shrink-0">{l.amount.toLocaleString('ru-RU')} UZS</span>
                        </div>
                      ));
                    })()}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-[12px] font-semibold text-text">{tr(lang, 'Итого доходы', 'Total income', 'Jami daromad')}</span>
                      <span className="text-[14px] font-bold text-success metric-number">{glSummary.income.total.toLocaleString('ru-RU')} UZS</span>
                    </div>
                    {glSummary.income.discounts > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted">{tr(lang, '− Скидки (не входят в итог)', '− Discounts (excluded from total)', "− Chegirmalar (jamiga kirmaydi)")}</span>
                        <span className="text-[11px] text-danger metric-number">−{glSummary.income.discounts.toLocaleString('ru-RU')} UZS</span>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Payables */}
              <Card title={tr(lang, 'Кредиторка (поставщики)', 'Accounts Payable', 'Kreditorlik qarzi')}>
                <div className="space-y-3 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted">{tr(lang, 'Начислено (новые накладные)', 'Invoiced this period', 'Hisoblangan')}</span>
                    <span className="text-[13px] font-semibold text-text metric-number">{glSummary.payables.invoiced.toLocaleString('ru-RU')} UZS</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted">{tr(lang, 'Оплачено', 'Paid', "To'langan")}</span>
                    <span className="text-[13px] font-semibold text-text metric-number">{glSummary.payables.paid.toLocaleString('ru-RU')} UZS</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-[12px] font-medium text-text">{tr(lang, 'Изменение долга', 'Debt change', 'Qarz o\'zgarishi')}</span>
                    <span className={`text-[14px] font-bold metric-number ${glSummary.payables.netChange < 0 ? 'text-danger' : 'text-success'}`}>
                      {glSummary.payables.netChange > 0 ? '+' : ''}{glSummary.payables.netChange.toLocaleString('ru-RU')} UZS
                    </span>
                  </div>
                  <p className="text-[10px] text-muted/50 pt-1">
                    {glSummary.payables.netChange < 0
                      ? tr(lang, 'Долг перед поставщиками вырос за период', 'Debt to suppliers grew this period', "Ta'minotchilarga qarz o'sdi")
                      : tr(lang, 'Долг перед поставщиками снизился за период', 'Debt to suppliers shrank this period', "Ta'minotchilarga qarz kamaydi")}
                  </p>
                </div>
              </Card>

              {/* Taxes */}
              <Card title={tr(lang, 'Налоговая нагрузка', 'Tax Burden', 'Soliq yuki')}>
                {glSummary.taxes.lines.length === 0 ? (
                  <p className="text-[12px] text-muted py-4">{tr(lang, 'Налоги не найдены в проводках за период', 'No taxes found in transactions for this period', "Davr uchun soliqlar topilmadi")}</p>
                ) : (
                  <div className="space-y-2 mt-1">
                    {glSummary.taxes.lines.map(t => (
                      <div key={t.name} className="flex items-center justify-between">
                        <span className="text-[12px] text-muted">{t.name}</span>
                        <span className="text-[12px] font-medium text-text metric-number">{t.amount.toLocaleString('ru-RU')} UZS</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-[12px] font-semibold text-text">{tr(lang, 'Итого налоги', 'Total taxes', 'Jami soliqlar')}</span>
                      <span className="text-[14px] font-bold text-danger metric-number">{glSummary.taxes.total.toLocaleString('ru-RU')} UZS</span>
                    </div>
                  </div>
                )}
              </Card>

              {/* Cash positions */}
              <Card title={tr(lang, 'Движение по кассам и счетам', 'Cash & Account Activity', 'Kassa va hisoblar harakati')} className="lg:col-span-2">
                {glSummary.cashPositions.length === 0 ? (
                  <p className="text-[12px] text-muted py-4">{tr(lang, 'Нет данных', 'No data', "Ma'lumot yo'q")}</p>
                ) : (
                  <div className="space-y-2.5 mt-1">
                    {glSummary.cashPositions.map(c => {
                      const maxFlow = Math.max(...glSummary.cashPositions.map(x => Math.max(x.incoming, x.outgoing)), 1);
                      return (
                        <div key={c.account}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-medium text-text">{c.account}</span>
                            <span className={`text-[11px] metric-number font-semibold ${c.net >= 0 ? 'text-success' : 'text-danger'}`}>
                              {c.net > 0 ? '+' : ''}{c.net.toLocaleString('ru-RU')} UZS
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-success/60" style={{ width: `${(c.incoming / maxFlow) * 100}%` }} />
                            </div>
                            <span className="text-[10px] text-muted w-24 text-right metric-number">+{c.incoming.toLocaleString('ru-RU')}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-danger/60" style={{ width: `${(c.outgoing / maxFlow) * 100}%` }} />
                            </div>
                            <span className="text-[10px] text-muted w-24 text-right metric-number">−{c.outgoing.toLocaleString('ru-RU')}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      {tab === 'menu' && (() => {
        const cats = ['all', ...Array.from(new Set(menuRows.map(r => r.category))).sort()];
        const filtered = menuCatFilter === 'all' ? menuRows : menuRows.filter(r => r.category === menuCatFilter);
        const sorted = [...filtered].sort((a, b) => {
          const av = a[menuSort] ?? 0;
          const bv = b[menuSort] ?? 0;
          return menuSortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number);
        });
        const toggleSort = (key: typeof menuSort) => {
          if (menuSort === key) setMenuSortDir(d => d === 'desc' ? 'asc' : 'desc');
          else { setMenuSort(key); setMenuSortDir('desc'); }
        };
        const sortIcon = (key: typeof menuSort) =>
          menuSort !== key ? null : menuSortDir === 'desc' ? ' ↓' : ' ↑';
        const fmt = (n: number) => n.toLocaleString('ru-RU');
        const totalRevenue = filtered.reduce((s, r) => s + r.revenue, 0);
        const totalCost    = filtered.reduce((s, r) => s + r.cost, 0);
        const totalGP      = filtered.reduce((s, r) => s + r.grossProfit, 0);
        const avgMargin    = totalRevenue > 0 ? Math.round((totalGP / totalRevenue) * 1000) / 10 : null;
        const avgFoodCost  = totalRevenue > 0 && totalCost > 0 ? Math.round((totalCost / totalRevenue) * 1000) / 10 : null;
        const fcColor = (pct: number | null) =>
          pct == null ? 'text-muted' : pct < 28 ? 'text-success' : pct <= 35 ? 'text-amber-400' : 'text-danger';
        return (
          <Card className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h3 className="text-[13px] font-semibold text-text">
                {tr(lang, 'Анализ меню', 'Menu Analysis', 'Menyu tahlili')}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={menuCatFilter}
                  onChange={e => setMenuCatFilter(e.target.value)}
                  className="bg-card border border-border rounded-[5px] text-[11px] text-text px-2 py-1 outline-none"
                >
                  {cats.map(c => (
                    <option key={c} value={c}>{c === 'all' ? tr(lang, 'Все категории', 'All categories', 'Barcha kategoriyalar') : c}</option>
                  ))}
                </select>
              </div>
            </div>
            {menuLoading ? <Skeleton /> : menuRows.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-muted">
                <Package size={15} />
                <span className="text-[12px]">{tr(lang, 'Нет данных за период', 'No data for period', 'Davr uchun ma\'lumot yo\'q')}</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                  {[
                    { label: tr(lang, 'Позиций', 'Items', 'Pozitsiyalar'), value: String(filtered.length), sub: null, color: 'text-text' },
                    { label: tr(lang, 'Выручка', 'Revenue', 'Tushum'), value: fmt(totalRevenue), sub: 'UZS', color: 'text-text' },
                    { label: tr(lang, 'Себестоимость', 'COGS', 'Tannarx'), value: fmt(totalCost), sub: 'UZS', color: 'text-text' },
                    { label: tr(lang, 'Фуд-кост', 'Food Cost', 'Food Cost'), value: avgFoodCost != null ? `${avgFoodCost}%` : '—', sub: tr(lang, 'норма < 28%', 'target < 28%', "maqsad < 28%"), color: fcColor(avgFoodCost) },
                    { label: tr(lang, 'Ср. маржа', 'Avg margin', "O'rt. marja"), value: avgMargin != null ? `${avgMargin}%` : '—', sub: null, color: 'text-text' },
                  ].map(m => (
                    <div key={m.label} className="bg-card border border-border rounded-lg p-3">
                      <div className="text-[10px] text-muted uppercase tracking-[0.12em] mb-1">{m.label}</div>
                      <div className={`text-[15px] font-bold metric-number ${m.color}`}>{m.value}</div>
                      {m.sub && <div className="text-[9px] text-muted">{m.sub}</div>}
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[780px]">
                    <thead className="border-b border-border">
                      <tr>
                        <th className="pb-3 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium">{tr(lang, 'Блюдо', 'Dish', 'Taom')}</th>
                        <th className="pb-3 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium">{tr(lang, 'Категория', 'Category', 'Kategoriya')}</th>
                        {([
                          ['qty',         tr(lang, 'Кол-во', 'Qty', 'Miqdor')],
                          ['revenue',     tr(lang, 'Выручка', 'Revenue', 'Tushum')],
                          ['cost',        tr(lang, 'Себест.', 'COGS', 'Tannarx')],
                          ['foodCostPct', tr(lang, 'Фуд-кост %', 'Food Cost %', 'Food Cost %')],
                          ['grossProfit', tr(lang, 'Вал. прибыль', 'Gross Profit', 'Yalpi foyda')],
                          ['marginPct',   tr(lang, 'Маржа %', 'Margin %', 'Marja %')],
                        ] as [typeof menuSort, string][]).map(([key, label]) => (
                          <th
                            key={key}
                            className="pb-3 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium cursor-pointer hover:text-text select-none"
                            onClick={() => toggleSort(key)}
                          >
                            {label}{sortIcon(key)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((row, i) => {
                        const rowFoodCost = row.revenue > 0 && row.cost > 0
                          ? Math.round((row.cost / row.revenue) * 1000) / 10
                          : null;
                        const marginColor =
                          row.marginPct == null ? 'text-muted'     :
                          row.marginPct >= 60   ? 'text-success'   :
                          row.marginPct >= 35   ? 'text-amber-400' : 'text-danger';
                        return (
                          <tr key={`${row.name}-${i}`} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                            <td className="py-2.5 pr-4 text-[12px] font-medium text-text max-w-[180px] truncate">{row.name}</td>
                            <td className="py-2.5 pr-4 text-[11px] text-muted">{row.category}</td>
                            <td className="py-2.5 pr-4 text-[12px] text-text metric-number">{fmt(row.qty)}</td>
                            <td className="py-2.5 pr-4 text-[12px] font-semibold text-text metric-number">{fmt(row.revenue)}</td>
                            <td className="py-2.5 pr-4 text-[12px] text-muted metric-number">{row.cost > 0 ? fmt(row.cost) : '—'}</td>
                            <td className={`py-2.5 pr-4 text-[12px] font-bold metric-number ${fcColor(rowFoodCost)}`}>
                              {rowFoodCost != null ? `${rowFoodCost}%` : '—'}
                            </td>
                            <td className="py-2.5 pr-4 text-[12px] metric-number">{row.grossProfit > 0 ? fmt(row.grossProfit) : '—'}</td>
                            <td className={`py-2.5 pr-4 text-[12px] font-bold metric-number ${marginColor}`}>
                              {row.marginPct != null ? `${row.marginPct}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[10px] text-muted">
                  {tr(lang,
                    `${filtered.length} позиций · выручка ${fmt(totalRevenue)} UZS · себест. ${fmt(totalCost)} UZS`,
                    `${filtered.length} items · revenue ${fmt(totalRevenue)} UZS · COGS ${fmt(totalCost)} UZS`,
                    `${filtered.length} ta pozitsiya · tushum ${fmt(totalRevenue)} UZS · tannarx ${fmt(totalCost)} UZS`
                  )}
                </p>
              </>
            )}
          </Card>
        );
      })()}
    </div>
  );
};

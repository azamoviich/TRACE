import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Calendar, Zap, TrendingUp, Sparkles, AlertTriangle, Users, BarChart2, CheckCircle, X, RefreshCw, SlidersHorizontal, Receipt, ChevronDown } from 'lucide-react';
import { useRealtimeData, RealtimeEvent, RealtimeOrderData } from '../../hooks/useRealtimeData';
import { Card } from '../ui/Card';
import { ChartTooltip } from '../ui/ChartTooltip';
import { ComparisonSelector } from '../ui/ComparisonSelector';
import { DateRangePicker } from '../ui/DateRangePicker';
import { PLUGIN_ENABLED } from '../ui/ComingSoon';
import { TRANSLATIONS, tr, formatMinutes, formatMinutesShort } from '../../constants';
import { DashboardSkeleton } from '../ui/Skeleton';
import { SlotText } from '../ui/SlotNumber';
import { Language, TimeRange, Metric, ComparisonPeriod } from '../../types';
import { useCountUp } from '../../hooks/useCountUp';
import { traceApi, isDemoTenant, demoLiveOrderFeed, branchHeaders, RevenueRow, DishRow, IntegrationStatus, AIDailyBriefing, HourlyRow, RevenueType } from '../../services/traceApi';
import { useOccupiedTables } from '../../hooks/useOccupiedTables';
import { tashkentDateStr, tashkentHours } from '../../utils/tz';

interface DashboardProps {
  lang: Language;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  branch?: string | null;
  onContextReady?: (ctx: string) => void;
}

function parseNum(value: string): { num: number; suffix: string; isDecimal: boolean } {
  if (value.includes('%')) return { num: parseFloat(value), suffix: '%', isDecimal: true };
  const parts = value.trim().split(/\s+/);
  const num = parseFloat(parts[0].replace(/[,\s]/g, ''));
  return { num: isNaN(num) ? 0 : num, suffix: parts.slice(1).join(' '), isDecimal: false };
}



// The big hero number — slot-machine reveal whenever the value changes
// (filter toggled, period switched, branch changed), instead of freezing
// on the old number then snapping straight to the new one.
function HeroRevenue({ value, suffix, loading }: { value: number; suffix: string; loading?: boolean }) {
  return (
    <div className="flex items-end gap-3">
      <SlotText
        text={Math.round(value).toLocaleString('ru-RU')}
        loading={loading}
        className="font-display font-black text-text leading-none tracking-tight metric-number"
        style={{ fontSize: 'clamp(36px, 9vw, 80px)' }}
      />
      {suffix && (
        <span
          className="font-display font-semibold text-muted mb-1.5"
          style={{ fontSize: 'clamp(16px, 1.8vw, 24px)' }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

function StatBox({ label, value, suffix, pct, loading }: { label: string; value: string; suffix?: string; pct: number | null; loading?: boolean }) {
  const up = pct !== null && pct >= 0;
  return (
    <div>
      <p className="text-[13px] text-muted font-medium mb-1.5">{label}</p>
      <p className="metric-number font-display font-bold text-text leading-none" style={{ fontSize: 'clamp(18px, 2vw, 26px)' }}>
        <SlotText text={value} loading={loading} />
        {suffix && <span className="text-muted ml-1" style={{ fontSize: '0.55em' }}>{suffix}</span>}
      </p>
      {pct !== null ? (
        <p className={`text-[12px] font-semibold flex items-center gap-0.5 mt-1 ${up ? 'text-success' : 'text-danger'}`}>
          {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {up ? '+' : ''}{pct}%
        </p>
      ) : (
        <p className="text-[12px] text-muted mt-1">—</p>
      )}
    </div>
  );
}

// Inline "real guest" filter — pick which table-plan sections (staff comp
// tables, delivery/takeaway aggregator channels) don't count as real guests.
// Lives next to revenue instead of a separate Settings page so picking a
// filter and seeing the numbers update happen in the same place.
function RealGuestFilterPopover({ lang, onClose, onSaved }: { lang: Language; onClose: () => void; onSaved: () => void }) {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const [sections, setSections] = useState<{ name: string; tableCount: number; excluded: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPluginData, setHasPluginData] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    traceApi.settings.listRealGuestSections()
      .then(r => { setSections(r.sections); setHasPluginData(r.hasPluginData); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [onClose]);

  const toggle = (name: string) => setSections(prev => prev.map(s => s.name === name ? { ...s, excluded: !s.excluded } : s));

  const save = async () => {
    setSaving(true);
    try {
      await traceApi.settings.saveRealGuestSections(sections.filter(s => s.excluded).map(s => s.name));
      onSaved();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div ref={ref} className="absolute z-30 mt-2 w-[min(300px,85vw)] max-w-[calc(100vw-2rem)] right-0 sm:right-auto bg-card border border-border rounded-2xl shadow-xl p-4" style={{ top: '100%' }}>
      <p className="text-[13px] font-semibold text-text mb-1">
        {tr(lang, 'Реальные гости', 'Real guests', 'Haqiqiy mehmonlar')}
      </p>
      <p className="text-[11px] text-muted mb-3">
        {tr(lang, 'Выберите разделы, которые не считаются гостями (стафф, доставка и т.д.)', 'Pick sections that don\'t count as guests (staff, delivery, etc.)', "Mehmon hisoblanmaydigan bo'limlarni tanlang (xodimlar, yetkazib berish va h.k.)")}
      </p>
      {loading ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map(i => <div key={i} className="h-8 bg-card-hover rounded-lg animate-pulse" />)}
        </div>
      ) : !hasPluginData ? (
        <p className="text-[12px] text-muted">
          {tr(lang, 'Нет данных — требуется плагин iikoFront', 'No data yet — requires the iikoFront plugin', 'Maʼlumot yoʻq — iikoFront plagini kerak')}
        </p>
      ) : sections.length === 0 ? (
        <p className="text-[12px] text-muted">{tr(lang, 'Разделы не найдены', 'No sections found', "Bo'limlar topilmadi")}</p>
      ) : (
        <>
          <div className="space-y-1 max-h-[240px] overflow-y-auto">
            {sections.map(s => (
              <label key={s.name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-card-hover transition-colors cursor-pointer">
                <input type="checkbox" checked={s.excluded} onChange={() => toggle(s.name)} className="accent-primary w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-[12px] text-text truncate flex-1">{s.name}</span>
                <span className="text-[10px] text-muted flex-shrink-0">{s.tableCount}</span>
              </label>
            ))}
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="w-full mt-3 px-3 py-2 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? (ru ? 'Сохранение...' : isUz ? 'Saqlanmoqda...' : 'Saving...') : (ru ? 'Применить' : isUz ? 'Qo\'llash' : 'Apply')}
          </button>
        </>
      )}
    </div>
  );
}

// iiko surfaces roughly ten disagreeing "revenue" totals (with/without
// discount, by category, by payment method, ...). Rather than pick one and
// hide the rest, this lets the user choose which definition drives the
// Dashboard's headline number — see RevenueType in traceApi.ts.
const REVENUE_TYPE_LABELS: Record<RevenueType, { ru: string; en: string; uz: string; hint: { ru: string; en: string; uz: string } }> = {
  net:       { ru: 'Со скидками',        en: 'After discounts', uz: 'Chegirmalar bilan',
               hint: { ru: 'Сколько реально заплатили гости', en: 'What guests actually paid', uz: "Mehmonlar to'lagan summa" } },
  gross:     { ru: 'Без скидок',         en: 'Before discounts', uz: 'Chegirmasiz',
               hint: { ru: 'По ценам в меню, без учёта скидок', en: 'At menu price, ignoring discounts', uz: "Menyudagi narx bo'yicha" } },
  food_only: { ru: 'Только еда и напитки', en: 'Food & drinks only', uz: "Faqat taom va ichimlik",
               hint: { ru: 'Без сервисного сбора, чаевых, модификаторов', en: 'Excludes service charge, tips, modifiers', uz: "Xizmat haqi va choy pulisiz" } },
  cash:      { ru: 'Наличными',          en: 'Cash only', uz: 'Naqd pul',
               hint: { ru: 'Только оплаты наличными', en: 'Cash payments only', uz: 'Faqat naqd tolovlar' } },
  card:      { ru: 'По картам',          en: 'Card only', uz: 'Karta orqali',
               hint: { ru: 'Только безналичные оплаты', en: 'Card/cashless payments only', uz: "Faqat naqdsiz to'lovlar" } },
  excl_comp: { ru: 'Без комплиментов',    en: 'Excl. comps', uz: 'Bepul buyurtmalarisiz',
               hint: { ru: 'Без бесплатных и блогерских заказов', en: 'Excludes unpaid and blogger/comp orders', uz: "Bepul va blogger buyurtmalarisiz" } },
  gl_kitchen:        { ru: 'Выручка Кухня (учёт)',   en: 'Kitchen revenue (GL)', uz: 'Oshxona tushumi (hisob)',
                       hint: { ru: 'Из проводок iiko, счёт «Выручка Кухня»', en: 'From iiko GL account "Выручка Кухня"', uz: '"Выручка Кухня" hisobidan' } },
  gl_bar:            { ru: 'Выручка Бар (учёт)',     en: 'Bar revenue (GL)', uz: 'Bar tushumi (hisob)',
                       hint: { ru: 'Из проводок iiko, счёт «Выручка Бар»', en: 'From iiko GL account "Выручка Бар"', uz: '"Выручка Бар" hisobidan' } },
  gl_pastry:         { ru: 'Выручка Кондитерка (учёт)', en: 'Pastry revenue (GL)', uz: 'Konditer tushumi (hisob)',
                       hint: { ru: 'Из проводок iiko, счёт «Выручка Кондитеры»', en: 'From iiko GL account "Выручка Кондитеры"', uz: '"Выручка Кондитеры" hisobidan' } },
  gl_service_charge: { ru: 'Надбавка за обслуживание', en: 'Service charge', uz: 'Xizmat haqi',
                       hint: { ru: 'Только сервисный сбор, без остальной выручки', en: 'Service charge line only, no other revenue', uz: 'Faqat xizmat haqi' } },
  gl_transfers:      { ru: 'От перемещения между филиалами', en: 'Inter-branch transfers', uz: 'Filiallar orasidagi ko\'chirish',
                       hint: { ru: 'Выручка от перемещения товаров между филиалами', en: 'Revenue from goods transferred between branches', uz: "Filiallar orasida ko'chirilgan mahsulotlar tushumi" } },
  gl_other_income:   { ru: 'Прочие доходы', en: 'Other income', uz: 'Boshqa daromadlar',
                       hint: { ru: 'Разное — не основная выручка', en: 'Misc — not core revenue', uz: 'Aralash — asosiy tushum emas' } },
  gl_no_discount:    { ru: 'Без скидочных позиций (учёт)', en: 'Non-discountable items (GL)', uz: 'Chegirmasiz pozitsiyalar (hisob)',
                       hint: { ru: 'Счёт «Выручка без учета скидок» — товары, не участвующие в скидках', en: 'GL account for items never eligible for discounts', uz: 'Chegirmaga kirmaydigan mahsulotlar hisobi' } },
};

function RevenueTypePopover({ lang, value, onChange, onClose }: { lang: Language; value: RevenueType; onChange: (t: RevenueType) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [onClose]);

  const GL_KEYS = new Set(['gl_kitchen', 'gl_bar', 'gl_pastry', 'gl_service_charge', 'gl_transfers', 'gl_other_income', 'gl_no_discount']);

  return (
    <div
      ref={ref}
      className="fixed z-30 left-4 right-4 bottom-4 max-h-[60vh] sm:absolute sm:z-30 sm:top-full sm:mt-2 sm:left-auto sm:right-0 sm:bottom-auto sm:w-[min(280px,85vw)] sm:max-w-[calc(100vw-2rem)] sm:max-h-[70vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-xl p-2"
    >
      <p className="text-[11px] text-muted px-2 pt-1 pb-2">
        {tr(lang, 'Какую выручку показывать', 'Which revenue to show', "Qaysi tushumni ko'rsatish")}
      </p>
      {(Object.keys(REVENUE_TYPE_LABELS) as RevenueType[]).map((key, i, arr) => {
        const l = REVENUE_TYPE_LABELS[key];
        const active = value === key;
        const isFirstGL = GL_KEYS.has(key) && !GL_KEYS.has(arr[i - 1]);
        return (
          <React.Fragment key={key}>
            {isFirstGL && (
              <p className="text-[9px] uppercase tracking-[0.1em] text-muted/50 px-2.5 pt-2 pb-1">
                {tr(lang, 'Из бухучёта iiko', 'From iiko accounting', 'iiko hisobidan')}
              </p>
            )}
            <button
              onClick={() => { onChange(key); onClose(); }}
              className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors ${active ? 'bg-primary/10' : 'hover:bg-card-hover'}`}
            >
              <p className={`text-[12.5px] font-medium ${active ? 'text-primary' : 'text-text'}`}>{tr(lang, l.ru, l.en, l.uz)}</p>
              <p className="text-[10.5px] text-muted mt-0.5">{tr(lang, l.hint.ru, l.hint.en, l.hint.uz)}</p>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Small animated stat (no card)
function Stat({ metric, lang }: { metric: Metric; lang: Language }) {
  const t = TRANSLATIONS[lang];
  const { num, suffix, isDecimal } = parseNum(metric.value);
  const n = useCountUp(num, 900);
  const label = t[metric.label as keyof typeof t] || metric.label;
  const formatted = isDecimal ? n.toFixed(1) : Math.round(n).toLocaleString('ru-RU');
  const up = metric.change > 0;

  return (
    <div>
      <p className="text-[13px] text-muted font-medium mb-1.5">{label}</p>
      <p className="metric-number font-display font-bold text-text leading-none"
        style={{ fontSize: 'clamp(18px, 2vw, 26px)' }}>
        {formatted}
        {suffix && <span className="text-muted ml-1" style={{ fontSize: '0.55em' }}>{suffix}</span>}
      </p>
      <p className={`text-[12px] font-semibold flex items-center gap-0.5 mt-1 ${up ? 'text-success' : 'text-danger'}`}>
        {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {metric.change > 0 ? '+' : ''}{metric.change}%
      </p>
    </div>
  );
}

// ── AI Daily Briefing Card ────────────────────────────────────────────────────

const BRIEFING_SECTIONS = [
  { key: 'summary',  icon: BarChart2,    colorClass: 'text-primary',   labelRu: 'Итог дня',       labelEn: 'Day summary',   labelUz: 'Kun yakuni'      },
  { key: 'actions',  icon: CheckCircle,  colorClass: 'text-success',   labelRu: 'Топ-3 действия', labelEn: 'Top 3 actions', labelUz: 'Top-3 amal'      },
  { key: 'staff',    icon: Users,        colorClass: 'text-blue-400',  labelRu: 'Персонал',       labelEn: 'Staff',         labelUz: 'Xodimlar'        },
  { key: 'forecast', icon: TrendingUp,   colorClass: 'text-amber-400', labelRu: 'Прогноз',        labelEn: 'Forecast',      labelUz: 'Bashorat'        },
  { key: 'risk',     icon: AlertTriangle,colorClass: 'text-danger',    labelRu: 'Риск / шанс',    labelEn: 'Risk / opp.',   labelUz: 'Xavf / imkoniyat'},
] as const;

const BRIEFING_CACHE_KEY = 'trace_ai_briefing';

function loadCachedBriefing(): AIDailyBriefing | null {
  try {
    const raw = localStorage.getItem(BRIEFING_CACHE_KEY);
    if (!raw) return null;
    const { data, date } = JSON.parse(raw);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return date === today ? data : null;
  } catch { return null; }
}

function saveCachedBriefing(b: AIDailyBriefing) {
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    localStorage.setItem(BRIEFING_CACHE_KEY, JSON.stringify({ data: b, date: today }));
  } catch {}
}

function AIDailyBriefingCard({ lang, dataReady }: { lang: Language; dataReady: boolean }) {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const [briefing, setBriefing] = useState<AIDailyBriefing | null>(() => loadCachedBriefing());
  const [loading,  setLoading]  = useState(false);

  const fetchBriefing = (force = false) => {
    if (loading || !dataReady) return;
    setLoading(true);
    traceApi.ai.briefing(lang, force)
      .then(b => { setBriefing(b); if (b.fromAI) saveCachedBriefing(b); })
      .catch(() => setBriefing({ fromAI: false }))
      .finally(() => setLoading(false));
  };

  return (
    <div className="p-5 glass rounded-3xl">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-primary" />
          <p className="text-[13px] text-muted font-medium">
            {ru ? 'AI Брифинг дня' : isUz ? 'AI kunlik brifing' : 'AI Daily Briefing'}
          </p>
        </div>
        {briefing?.fromAI && (
          <div className="flex items-center gap-2">
            {loading && (
              <div className="flex gap-0.5">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1 h-1 rounded-full bg-primary/50"
                    style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            )}
            <button
              onClick={() => fetchBriefing(true)}
              disabled={loading}
              className="flex items-center gap-1 text-[12px] text-muted hover:text-text transition-colors disabled:opacity-40"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {ru ? 'Обновить' : isUz ? 'Yangilash' : 'Update'}
            </button>
          </div>
        )}
      </div>

      {/* Not yet fetched — show trigger button */}
      {!briefing && !loading && (
        <button
          onClick={() => fetchBriefing()}
          disabled={!dataReady}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-primary/30 text-primary hover:bg-primary/5 transition-colors text-[13px] font-medium disabled:opacity-40"
        >
          <Sparkles size={14} />
          {ru ? 'Получить AI-брифинг' : isUz ? 'AI brifingini olish' : 'Get AI Briefing'}
        </button>
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-4">
          {BRIEFING_SECTIONS.map(({ key, icon: Icon, colorClass, labelRu, labelEn, labelUz }) => (
            <div key={key}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon size={11} className={colorClass} />
                <p className="text-[13px] text-muted font-medium">{ru ? labelRu : isUz ? labelUz : labelEn}</p>
              </div>
              <div className="h-3 bg-card-hover rounded animate-pulse w-4/5" />
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {!loading && briefing?.fromAI && (
        <div className="space-y-4">
          {BRIEFING_SECTIONS.map(({ key, icon: Icon, colorClass, labelRu, labelEn, labelUz }) => {
            const label = ru ? labelRu : isUz ? labelUz : labelEn;
            const rawContent = (briefing as any)[key];
            const content = (() => {
              if (!rawContent) return null;
              if (Array.isArray(rawContent)) return rawContent;
              if (typeof rawContent === 'string') {
                const trimmed = rawContent.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) return null;
                return trimmed || null;
              }
              return null;
            })();
            return (
              <div key={key}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon size={11} className={colorClass} />
                  <p className="text-[13px] text-muted font-medium">{label}</p>
                </div>
                {content ? (
                  key === 'actions' && Array.isArray(content) ? (
                    <ul className="space-y-1">
                      {(content as string[]).map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-[14px] text-text leading-relaxed">
                          <span className="text-success mt-0.5 flex-shrink-0">→</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[14px] text-text leading-relaxed">{content as string}</p>
                  )
                ) : (
                  <p className="text-[13px] text-muted/40 italic">—</p>
                )}
              </div>
            );
          })}
          <div className="pt-4 border-t border-border">
            <p className="text-[11px] text-muted/30">TRACE AI</p>
          </div>
        </div>
      )}

    </div>
  );
}

const TIME_RANGES: { key: TimeRange; ru: string; en: string; uz: string }[] = [
  { key: 'today', ru: 'Сегодня', en: 'Today', uz: 'Bugun' },
  { key: '7days', ru: '7 дней', en: '7 days', uz: '7 kun' },
  { key: '30days', ru: '30 дней', en: '30 days', uz: '30 kun' },
];

function comparisonDateRange(timeRange: TimeRange, comparison: ComparisonPeriod): { from: string; to: string } {
  const d = (offsetDays: number) => {
    const dt = new Date(Date.now() - offsetDays * 86400_000);
    return tashkentDateStr(dt);
  };
  const periodDays = timeRange === '30days' ? 30 : timeRange === '7days' ? 7 : 1;
  const shifts: Record<ComparisonPeriod, number> = {
    yesterday: 1,
    last_week: 7,
    last_month: 30,
    last_year: 365,
  };
  const shift = shifts[comparison] ?? 1;
  return { from: d(shift + periodDays - 1), to: d(shift) };
}

export const Dashboard: React.FC<DashboardProps> = ({ lang, onShowToast, branch, onContextReady }) => {
  const t = TRANSLATIONS[lang];
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [comparison, setComparison] = useState<ComparisonPeriod>('yesterday');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [renderKey, setRenderKey] = useState(0);
  const [liveRevenue, setLiveRevenue] = useState(0);
  const [liveOrderCount, setLiveOrderCount] = useState(0);
  const [iikoRows, setIikoRows] = useState<RevenueRow[]>([]);
  const [topDishes, setTopDishes] = useState<DishRow[]>([]);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>({});
  const [aiInsightText, setAiInsightText] = useState<string | null>(null);
  const [aiInsightLoading, setAiInsightLoading] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);
  const [comparisonRows, setComparisonRows] = useState<RevenueRow[]>([]);
  // Same-hour-cutoff comparison for 'today': the comparison day's hourly
  // breakdown, so "10AM today" compares against "10AM yesterday" (actual
  // accumulated hours) instead of a linear time-of-day estimate.
  const [compHourlyRows, setCompHourlyRows] = useState<HourlyRow[]>([]);
  const [realGuestRevenue, setRealGuestRevenue] = useState<{ available: boolean; revenue?: number; orders?: number; guests?: number; excludedRevenue?: number } | null>(null);
  const [compRealGuestRevenue, setCompRealGuestRevenue] = useState<{ available: boolean; revenue?: number; orders?: number; guests?: number } | null>(null);
  const [rgRefreshKey, setRgRefreshKey] = useState(0);
  const [rgFilterOpen, setRgFilterOpen] = useState(false);
  // Which of iiko's ~10 disagreeing revenue definitions drives the headline
  // number — see RevenueType in traceApi.ts. Persisted so it survives a
  // refresh instead of silently reverting to "net" every time.
  const [revenueType, setRevenueType] = useState<RevenueType>(() => {
    if (typeof window === 'undefined') return 'net';
    return (localStorage.getItem('trace_revenue_type') as RevenueType) || 'net';
  });
  const [revenueTypeOpen, setRevenueTypeOpen] = useState(false);
  useEffect(() => { localStorage.setItem('trace_revenue_type', revenueType); }, [revenueType]);
  // Business hours — server-persisted per tenant (see Settings). Used only
  // to scale "vs yesterday" for partial days; defaults match the same 9/23
  // fallback used before this was backend-persisted.
  const [businessHours, setBusinessHours] = useState<{ openHour: number; closeHour: number }>({ openHour: 9, closeHour: 23 });
  useEffect(() => {
    if (isDemoTenant()) return;
    traceApi.settings.businessHours().then(h => {
      setBusinessHours({ openHour: h.openHour ?? 9, closeHour: h.closeHour ?? 23 });
    }).catch(() => {});
  }, []);
  // True for the whole span of a refetch (period change, branch switch,
  // filter applied) — distinct from dataLoaded, which only guards the very
  // first full-page skeleton. Numbers keep spinning for as long as this is
  // true instead of sitting frozen on the old value until new data lands.
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    setStatsLoading(true);
    const isCustom = timeRange === 'custom' && customRange;
    const chartRange = timeRange === '30days' ? '30days' : timeRange === 'custom' ? 'custom' : '7days';
    const dishRange = (timeRange === 'today' || timeRange === '7days' || timeRange === '30days') ? timeRange : 'custom';
    Promise.all([
      isCustom
        ? traceApi.sales.revenue('custom', customRange.from, customRange.to, revenueType)
        : traceApi.sales.revenue(chartRange as any, undefined, undefined, revenueType),
      isCustom
        ? traceApi.sales.topDishes('custom', 5, customRange.from, customRange.to)
        : traceApi.sales.topDishes(dishRange as any, 5),
      traceApi.sales.status(),
      // Uses dishRange, not chartRange — chartRange deliberately collapses
      // "today" into "7days" for the trend chart, but this tile shows a
      // single aggregated total for whatever period is actually selected,
      // so it must respect "today" literally instead of widening it.
      isCustom
        ? traceApi.sales.realGuestRevenue('custom', customRange.from, customRange.to)
        : traceApi.sales.realGuestRevenue(dishRange as any),
    ]).then(([rows, dishes, status, realGuest]) => {
      setIikoRows(rows);
      setTopDishes(dishes);
      setIntegrationStatus(status);
      setRealGuestRevenue(realGuest);
      setDataLoaded(true);
      setRenderKey(k => k + 1);
      if (onContextReady && rows.length > 0) {
        const todayStr = tashkentDateStr();
        const todayRow = rows.find(r => r.date === todayStr) ?? rows[rows.length - 1];
        const prevRow  = rows.length > 1 ? rows[rows.length - 2] : null;
        const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
        const totalOrd = rows.reduce((s, r) => s + r.orders, 0);
        const avgCheck = totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0;
        const pct = prevRow && prevRow.revenue > 0
          ? Math.round(((todayRow.revenue - prevRow.revenue) / prevRow.revenue) * 100) : 0;
        const fmt = (n: number) => n.toLocaleString('ru-RU');
        const revenueTable = rows.map(r => `  ${r.date}: ${fmt(r.revenue)} UZS, ${r.orders} заказов, ср.чек ${r.orders > 0 ? fmt(Math.round(r.revenue / r.orders)) : 0} UZS`).join('\n');
        const dishList = dishes.map((d, i) => `  ${i + 1}. ${d.name} [${d.category}] — ${d.quantity} шт., ${fmt(d.revenue)} UZS`).join('\n');
        onContextReady(
          `Раздел: Дашборд\n` +
          `Период: ${rows.length > 1 ? rows[0].date + ' — ' + rows[rows.length - 1].date : todayStr}\n` +
          `Итого выручка: ${fmt(totalRev)} UZS | Заказов: ${totalOrd} | Средний чек: ${fmt(avgCheck)} UZS\n` +
          `Тренд к предыдущему дню: ${pct >= 0 ? '+' : ''}${pct}%\n` +
          `\nВыручка по дням:\n${revenueTable}\n` +
          `\nТоп блюд:\n${dishList || '  нет данных'}`
        );
      }
    }).catch(() => {}).finally(() => setStatsLoading(false));
  }, [timeRange, customRange, branch, onContextReady, rgRefreshKey, revenueType]);

  // Fetch comparison period revenue whenever comparison or timeRange changes
  useEffect(() => {
    if (timeRange === 'custom') return;
    const { from, to } = comparisonDateRange(timeRange, comparison);
    traceApi.sales.revenue('custom', from, to, revenueType)
      .then(setComparisonRows)
      .catch(() => setComparisonRows([]));
    // Same comparison window, filtered the same way as the current period —
    // keeps % change meaningful once the real-guest filter is active.
    traceApi.sales.realGuestRevenue('custom', from, to)
      .then(setCompRealGuestRevenue)
      .catch(() => setCompRealGuestRevenue(null));
    if (timeRange === 'today') {
      traceApi.sales.hourly(from) // from === to for 'today' comparisons (single day)
        .then(setCompHourlyRows)
        .catch(() => setCompHourlyRows([]));
    } else {
      setCompHourlyRows([]);
    }
  }, [timeRange, comparison, branch, rgRefreshKey, revenueType]);

  const demo = isDemoTenant();
  const [liveOrders, setLiveOrders] = useState<(RealtimeEvent & { id: string })[]>(() =>
    demo ? demoLiveOrderFeed() as unknown as (RealtimeEvent & { id: string })[] : []
  );
  // Distinguishes "nothing has happened yet" from "still fetching persisted
  // history" — without this, a refresh briefly shows the misleading
  // "waiting for events" message before the real (non-empty) feed loads,
  // reading as if all history got wiped.
  const [feedLoading, setFeedLoading] = useState(!demo);
  const [feedVisible, setFeedVisible] = useState(5);

  const [totalTables, setTotalTables] = useState<number>(demo ? 14 : 0);
  // Same source the Operations hall heatmap uses — keeps the two in sync
  // instead of maintaining separate occupancy logic that can drift apart.
  const { tables: occupiedTableNums } = useOccupiedTables(!demo);

  // Denominator for occupancy %: tables in hall plans. Plans are seeded from
  // iiko's real section list but curated by the owner — raw sections include
  // virtual "tables" (delivery aggregators, staff) that would inflate the
  // denominator, so the curated plans are the source of truth.
  useEffect(() => {
    if (demo) return;
    traceApi.halls.list()
      .then(plans => {
        const tableTypes = new Set(['rect_table', 'round_table', 'stool']);
        let n = 0;
        for (const p of plans) for (const el of (p.elements ?? [])) if (tableTypes.has(el.type)) n++;
        if (n > 0) setTotalTables(n);
      })
      .catch(() => {});
  }, [demo]);

  useEffect(() => {
    if (demo) return;
    // Load the event feed for whatever period is selected — persisted
    // server-side, so re-opening the app or switching periods always shows
    // history instead of only whatever happened to be seeded at mount.
    const base = import.meta.env.VITE_API_URL || '/api';
    const FEED_TYPES = new Set([
      'order_opened', 'order_bill_printed', 'order_closed',
      'order_removed', 'order_bill_cancelled', 'order_printed_items_deleted',
      'cashier_session_opened', 'cashier_session_closed',
    ]);
    const days = timeRange === '30days' ? 30 : timeRange === '7days' ? 7 : 1;
    const from = timeRange === 'custom' && customRange ? customRange.from : tashkentDateStr(new Date(Date.now() - (days - 1) * 86400_000));
    const to = timeRange === 'custom' && customRange ? customRange.to : tashkentDateStr();

    setFeedLoading(true);
    fetch(`${base}/realtime/events?limit=500&from=${from}&to=${to}`, { headers: branchHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((events: { type: string; payload?: any; created_at: string }[]) => {
        const feed = events
          .filter(ev => FEED_TYPES.has(ev.type))
          .map(ev => ({
            type: ev.type,
            timestamp: ev.payload?.timestamp ?? ev.created_at,
            data: ev.payload?.data ?? {},
            id: `hist-${ev.created_at}-${Math.random()}`,
          } as any));
        setLiveOrders(feed);
      })
      .catch(() => {})
      .finally(() => setFeedLoading(false));
  }, [demo, timeRange, customRange]);

  useEffect(() => {
    setLiveRevenue(0);
    setLiveOrderCount(0);
  }, [timeRange]);

  const wsUrl = import.meta.env.VITE_BACKEND_WS_URL as string | undefined;
  const { connected: wsConnected } = useRealtimeData({
    backendWsUrl: wsUrl ?? '',
    enabled: !!wsUrl && !demo,
    onEvent: useCallback((event: RealtimeEvent) => {
      // Feed shows business moments only — order_updated fires on every item
      // keystroke and stop_list/kitchen events have their own panels.
      const FEED_TYPES = new Set([
        'order_opened', 'order_bill_printed', 'order_closed',
        'order_removed', 'order_bill_cancelled', 'order_printed_items_deleted',
        'cashier_session_opened', 'cashier_session_closed', 'reserve_changed',
      ]);
      if (FEED_TYPES.has(event.type)) {
        setLiveOrders(prev => [{ ...event, id: `${Date.now()}-${Math.random()}` }, ...prev].slice(0, 300));
      }
      // Accumulate today's revenue from plugin events
      if (event.type === 'order_closed') {
        const sum = (event.data as any)?.sum as number | undefined;
        if (sum) {
          setLiveRevenue(prev => prev + sum);
          setLiveOrderCount(prev => prev + 1);
        }
      }
    }, []),
  });
  const pluginConnected = demo || wsConnected;

  // Compute real totals from iiko rows filtered to selected range
  const todayStr = tashkentDateStr();
  const filteredRows = timeRange === 'today'
    ? iikoRows.filter(r => r.date === todayStr)
    : iikoRows; // custom + 7days + 30days: backend already filtered
  const totalRevenue = filteredRows.reduce((s, r) => s + r.revenue, 0);
  const totalOrders  = filteredRows.reduce((s, r) => s + r.orders, 0);
  const totalGuests  = filteredRows.reduce((s, r) => s + r.guests, 0);
  const avgCheck     = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const avgCheckPerGuest = totalGuests > 0 ? Math.round(totalRevenue / totalGuests) : 0;

  // Compute data-driven insight from real iiko rows
  const insight = useMemo(() => {
    if (iikoRows.length < 2) return null;
    const sorted = [...iikoRows].sort((a, b) => a.date.localeCompare(b.date));
    const last  = sorted[sorted.length - 1];
    const prev  = sorted[sorted.length - 2];
    const pct   = prev.revenue > 0 ? Math.round(((last.revenue - prev.revenue) / prev.revenue) * 100) : 0;
    const up    = pct >= 0;
    const topDish = topDishes[0];
    return { last, prev, pct, up, topDish };
  }, [iikoRows, topDishes]);



  // Comparison-aware percentages — use fetched comparison period rows when available
  const rawCompRev    = comparisonRows.reduce((s, r) => s + r.revenue, 0);
  const rawCompOrders = comparisonRows.reduce((s, r) => s + r.orders, 0);
  const rawCompGuests = comparisonRows.reduce((s, r) => s + r.guests, 0);

  // For 'today' range, compare against the SAME hour-of-day yesterday — sum
  // yesterday's hourly buckets up through the current hour (with the
  // in-progress hour weighted by elapsed minutes), instead of scaling
  // yesterday's full-day total by a linear time estimate. "10AM today" now
  // actually compares against "10AM yesterday", not an approximation.
  const sameHourCutoff = useMemo(() => {
    if (timeRange !== 'today' || compHourlyRows.length === 0) return null;
    const current = tashkentHours();
    const floorH = Math.floor(current);
    const frac = current - floorH;
    let revenue = 0, orders = 0;
    for (const r of compHourlyRows) {
      if (r.hour < floorH) { revenue += r.revenue; orders += r.orders; }
      else if (r.hour === floorH) { revenue += r.revenue * frac; orders += r.orders * frac; }
    }
    return { revenue, orders };
  }, [timeRange, compHourlyRows]);

  // Fallback linear time-of-day scale — used only when the hourly breakdown
  // isn't available yet (still loading, or OLAP/plugin data missing), and
  // for guests (hourly breakdown doesn't carry a guest count).
  const compScale = useMemo(() => {
    if (demo || timeRange !== 'today' || rawCompRev === 0) return 1;
    const { openHour } = businessHours;
    // closeHour of 0 (or anything <= openHour) means "past midnight" — treat
    // as 24h+ so a café open 08:00-00:00 doesn't compute a negative/zero
    // window and silently fall back to an unscaled full-day comparison.
    const closeHour = businessHours.closeHour <= openHour ? businessHours.closeHour + 24 : businessHours.closeHour;
    let current = tashkentHours();
    if (current < openHour) current += 24;
    const elapsed = Math.max(0, Math.min(current, closeHour) - openHour);
    const total   = Math.max(1, closeHour - openHour);
    return Math.min(1, elapsed / total);
  }, [demo, timeRange, rawCompRev, businessHours]);

  const compRev    = sameHourCutoff ? sameHourCutoff.revenue : rawCompRev    * compScale;
  const compOrders = sameHourCutoff ? sameHourCutoff.orders  : rawCompOrders * compScale;
  const compGuests = rawCompGuests * compScale;


  // Real-guest filter active — hero + stat tiles switch from raw totals to
  // the filtered numbers entirely (not a secondary line), per the exclusion
  // list configured via the filter popover next to revenue.
  const rgActive = !demo && !!realGuestRevenue?.available;
  const displayRevenue = rgActive ? (realGuestRevenue!.revenue ?? 0) : totalRevenue;
  const displayOrders  = rgActive ? (realGuestRevenue!.orders ?? 0) : totalOrders;
  const displayGuests  = rgActive ? (realGuestRevenue!.guests ?? 0) : totalGuests;
  const displayAvgCheck = displayOrders > 0 ? Math.round(displayRevenue / displayOrders) : 0;
  const displayAvgCheckPerGuest = displayGuests > 0 ? Math.round(displayRevenue / displayGuests) : 0;

  const compDisplayRevenue = rgActive && compRealGuestRevenue?.available ? (compRealGuestRevenue.revenue ?? 0) * compScale : compRev;
  const compDisplayOrders  = rgActive && compRealGuestRevenue?.available ? (compRealGuestRevenue.orders ?? 0) * compScale : compOrders;
  const compDisplayGuests  = rgActive && compRealGuestRevenue?.available ? (compRealGuestRevenue.guests ?? 0) * compScale : compGuests;

  // insight?.pct is a full-day-vs-full-day AI comparison — never valid as a
  // fallback for 'today', where compDisplayRevenue can legitimately be 0 right
  // at opening (compScale ~0) or before any orders land. Falling back there
  // would compare all of yesterday against a sliver of today (the -90% bug).
  const displayHeroPct = demo ? 12 : compDisplayRevenue > 0 && displayRevenue > 0
    ? Math.round(((displayRevenue - compDisplayRevenue) / compDisplayRevenue) * 100)
    : (rgActive || timeRange === 'today' ? null : (insight?.pct ?? null));
  const displayHeroUp = displayHeroPct !== null ? displayHeroPct >= 0 : (insight?.up ?? true);
  const displayOrdersPct = demo ? 8 : compDisplayOrders > 0 && displayOrders > 0
    ? Math.round(((displayOrders - compDisplayOrders) / compDisplayOrders) * 100)
    : null;
  const displayGuestsPct = demo ? 11 : compDisplayGuests > 0 && displayGuests > 0
    ? Math.round(((displayGuests - compDisplayGuests) / compDisplayGuests) * 100)
    : null;
  const compDisplayAvgCheck = compDisplayOrders > 0 ? compDisplayRevenue / compDisplayOrders : null;
  const displayAvgPct = demo ? 4 : compDisplayAvgCheck && compDisplayAvgCheck > 0 && displayAvgCheck > 0
    ? Math.round(((displayAvgCheck - compDisplayAvgCheck) / compDisplayAvgCheck) * 100)
    : null;
  const compDisplayAvgCheckPerGuest = compDisplayGuests > 0 ? compDisplayRevenue / compDisplayGuests : null;
  const displayAvgPerGuestPct = demo ? 6 : compDisplayAvgCheckPerGuest && compDisplayAvgCheckPerGuest > 0 && displayAvgCheckPerGuest > 0
    ? Math.round(((displayAvgCheckPerGuest - compDisplayAvgCheckPerGuest) / compDisplayAvgCheckPerGuest) * 100)
    : null;

  const heroNum    = iikoRows.length > 0 ? displayRevenue : 0;
  const heroSuffix = iikoRows.length > 0 ? 'UZS' : '';


  // Build chart data from iiko rows
  const realChartData = iikoRows.map(r => ({
    name: r.date.slice(5),
    revenue: r.revenue,
    visitors: r.orders,
  }));

  const revenueTooltip = (props: any) => <ChartTooltip {...props} valueFormatter={(v) => `${Math.round(v).toLocaleString('ru-RU')} UZS`} />;

  if (!dataLoaded) return <DashboardSkeleton />;

  return (
    <div className="animate-fade-in pb-20 space-y-10">

      {/* ── HERO ──────────────────────────────────────────────── */}
      <div>
        {/* Time range */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-7">
          <p className="text-[13px] text-muted font-medium">
            {tr(lang, 'Выручка за период', 'Revenue for period', 'Davr uchun tushum')}
          </p>
          <div className="relative flex items-center gap-px border border-border rounded-xl overflow-visible bg-card">
            {TIME_RANGES.map(({ key, ru, en, uz }) => (
              <button key={key} onClick={() => { setTimeRange(key); setCustomRange(null); setCalendarOpen(false); }}
                className={`px-3 py-2 text-[13px] font-medium transition-colors ${
                  timeRange === key ? 'bg-primary text-white' : 'text-muted hover:text-text hover:bg-card-hover'
                }`}
              >
                {tr(lang, ru, en, uz)}
              </button>
            ))}
            {timeRange === 'custom' && customRange && (
              <span className="px-3 py-2 text-[13px] font-medium bg-primary text-white">
                {customRange.from.slice(5)} – {customRange.to.slice(5)}
              </span>
            )}
            <button
              ref={calendarBtnRef}
              onClick={() => setCalendarOpen(o => !o)}
              className={`px-2.5 py-2 transition-colors border-l border-border ${
                calendarOpen || timeRange === 'custom' ? 'text-primary' : 'text-muted hover:text-primary'
              }`}
            >
              <Calendar size={12} />
            </button>
            <DateRangePicker
              lang={lang}
              value={customRange}
              isOpen={calendarOpen}
              onClose={() => setCalendarOpen(false)}
              anchorRef={calendarBtnRef}
              onApply={(range) => {
                setCustomRange(range);
                setTimeRange('custom');
              }}
              onClear={() => {
                setCustomRange(null);
                setTimeRange('7days');
              }}
            />
          </div>
        </div>

        {/* Big number — buttons wrap below it on narrow phones instead of
            overflowing off-screen next to an 8-digit number at 48px+ */}
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5 relative">
          <HeroRevenue value={heroNum} suffix={heroSuffix} loading={statsLoading} />
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setRevenueTypeOpen(o => !o)}
                title={tr(lang, 'Тип выручки', 'Revenue type', 'Tushum turi')}
                className={`mt-2 p-2 rounded-lg border transition-colors flex-shrink-0 flex items-center gap-0.5 ${revenueType !== 'net' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted hover:text-text hover:bg-card-hover'}`}
              >
                <Receipt size={15} />
                <ChevronDown size={11} />
              </button>
              {revenueTypeOpen && (
                <RevenueTypePopover
                  lang={lang}
                  value={revenueType}
                  onChange={setRevenueType}
                  onClose={() => setRevenueTypeOpen(false)}
                />
              )}
            </div>
            {!demo && (
              <button
                onClick={() => setRgFilterOpen(o => !o)}
                title={tr(lang, 'Фильтр реальных гостей', 'Real-guest filter', 'Haqiqiy mehmonlar filtri')}
                className={`mt-2 p-2 rounded-lg border transition-colors flex-shrink-0 relative ${rgActive ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted hover:text-text hover:bg-card-hover'}`}
              >
                <SlidersHorizontal size={15} />
                {rgActive && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />}
              </button>
            )}
          </div>
          {rgFilterOpen && (
            <RealGuestFilterPopover
              lang={lang}
              onClose={() => setRgFilterOpen(false)}
              onSaved={() => { setRgRefreshKey(k => k + 1); setRgFilterOpen(false); }}
            />
          )}
        </div>

        {revenueType !== 'net' && (
          <p className="text-[11px] text-primary/80 mt-1.5">
            {tr(lang, REVENUE_TYPE_LABELS[revenueType].ru, REVENUE_TYPE_LABELS[revenueType].en, REVENUE_TYPE_LABELS[revenueType].uz)}
          </p>
        )}

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {displayHeroPct !== null ? (
            <span className={`text-[13px] font-semibold flex items-center gap-0.5 ${displayHeroUp ? 'text-success' : 'text-danger'}`}>
              {displayHeroUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {displayHeroUp ? '+' : ''}{displayHeroPct}%
            </span>
          ) : (
            <span className="text-[13px] font-semibold text-muted">—</span>
          )}
          <ComparisonSelector lang={lang} value={comparison} onChange={setComparison} />
          {rgActive && (
            <span className="text-[11px] text-muted/70">
              {tr(lang, 'только реальные гости', 'real guests only', 'faqat haqiqiy mehmonlar')}
            </span>
          )}
        </div>

        {/* Stats row — real iiko data, switches to real-guest numbers when the filter above is active */}
        <div className="flex items-start gap-x-8 gap-y-5 mt-8 flex-wrap">
          {iikoRows.length > 0 ? (
            <>
              <StatBox label={tr(lang, 'Заказы', 'Orders', 'Buyurtmalar')} value={displayOrders.toLocaleString('ru-RU')} pct={displayOrdersPct} loading={statsLoading} />
              <StatBox label={tr(lang, 'Гостей', 'Guests', 'Mehmonlar')} value={displayGuests.toLocaleString('ru-RU')} pct={displayGuestsPct} loading={statsLoading} />
              <StatBox label={t.avg_check} value={displayAvgCheck.toLocaleString('ru-RU')} suffix="UZS" pct={displayAvgPct} loading={statsLoading} />
              <StatBox label={tr(lang, 'Чек на гостя', 'Check/guest', 'Mehmonga chek')} value={displayAvgCheckPerGuest.toLocaleString('ru-RU')} suffix="UZS" pct={displayAvgPerGuestPct} loading={statsLoading} />
            </>
          ) : null}
        </div>
      </div>

      {/* ── CHART + TOP SELLING ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Revenue chart */}
        <div className="lg:col-span-2">
          <p className="text-[13px] text-muted font-medium mb-4">{t.revenue_trend}</p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={realChartData} margin={{ top: 4, right: 0, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff6b35" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="#ff6b35" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="0" vertical={false} stroke="rgb(var(--color-border))" />
                <XAxis dataKey="name" stroke="transparent" tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12, fontFamily: 'Onest' }} tickLine={false} axisLine={false} />
                <YAxis stroke="transparent" tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12, fontFamily: 'Onest' }} tickLine={false} axisLine={false} width={40} tickFormatter={v => v >= 1_000_000 ? `${Math.round(v / 1_000_000)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}K` : String(v)} />
                <Tooltip content={revenueTooltip} cursor={{ stroke: 'rgb(var(--color-border))', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="revenue" stroke="#ff6b35" strokeWidth={1.5} fill="url(#gR)" animationDuration={900} dot={false} activeDot={{ r: 3, fill: '#ff6b35', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top selling — real iiko data */}
        <div>
          <p className="text-[13px] text-muted font-medium mb-4">{t.top_selling}</p>
          <div className="space-y-1">
            {topDishes.length === 0 ? (
              <p className="py-4 text-muted text-[12px]">{tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}</p>
            ) : topDishes.map((dish, i) => (
              <div key={dish.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="metric-number text-[12px] text-muted w-4 flex-shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-text leading-none truncate">{dish.name}</p>
                    <p className="text-[12px] text-muted mt-0.5">{dish.quantity} {t.orders}</p>
                  </div>
                </div>
                <p className="metric-number text-[13px] font-semibold text-primary flex-shrink-0 ml-2">
                  {dish.revenue.toLocaleString('ru-RU')}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── LIVE ORDERS FEED ─────────────────────────────────── */}
      {(wsUrl || demo) && (
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <p className="text-[13px] text-muted font-medium">
              {tr(lang, 'Лента событий', 'Event Feed', 'Voqealar lentasi')}
            </p>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pluginConnected ? 'bg-success animate-pulse' : 'bg-muted'}`} />
              <span className="text-[12px] text-muted">
                {pluginConnected
                  ? tr(lang, 'Подключено', 'Connected', 'Ulangan')
                  : tr(lang, 'Не подключено', 'Disconnected', 'Ulanmagan')}
              </span>
            </div>
          </div>

          {feedLoading ? (
            <div className="space-y-1.5 py-1">
              {[0, 1, 2].map(i => <div key={i} className="h-9 bg-card-hover rounded-lg animate-pulse" />)}
            </div>
          ) : liveOrders.length === 0 ? (
            <div className="flex items-center gap-2 text-muted py-4">
              <Zap size={13} className="opacity-30" />
              <span className="text-[13px]">
                {pluginConnected
                  ? tr(lang, 'Ждём событий от кассы...', 'Waiting for POS events...', 'Kassadan hodisalar kutilmoqda...')
                  : tr(lang, 'Касса не подключена', 'POS not connected', "Kassa ulanmagan")}
              </span>
            </div>
          ) : (
            <div className="space-y-0 border border-border rounded-xl overflow-hidden">
              {liveOrders.slice(0, feedVisible).map((ev) => {
                const d = ev.data as RealtimeOrderData;
                const typeLabel: Record<string, { ru: string; en: string; uz: string; color: string }> = {
                  order_opened:              { ru: 'Открыт',         en: 'Opened',         uz: 'Ochildi',          color: 'text-success'    },
                  order_updated:             { ru: 'Обновлён',       en: 'Updated',        uz: 'Yangilandi',       color: 'text-primary'    },
                  order_closed:              { ru: 'Закрыт',         en: 'Closed',         uz: 'Yopildi',          color: 'text-muted'      },
                  order_removed:             { ru: 'Удалён',         en: 'Removed',        uz: "O'chirildi",       color: 'text-danger'     },
                  order_bill_printed:        { ru: 'Счёт',           en: 'Bill printed',   uz: 'Hisob chop etildi', color: 'text-amber-400'  },
                  order_payment_page_opened: { ru: 'К оплате',       en: 'Payment',        uz: "To'lov",           color: 'text-amber-400'  },
                  cashier_session_opened:    { ru: 'Смена открыта',  en: 'Session opened', uz: 'Smena ochildi',    color: 'text-success'    },
                  cashier_session_closed:    { ru: 'Смена закрыта',  en: 'Session closed', uz: 'Smena yopildi',    color: 'text-muted'      },
                  stop_list_updated:         { ru: 'Стоп-лист',      en: 'Stop list',      uz: "Stop-list",        color: 'text-danger'     },
                  terminal_opened:           { ru: 'Терминал вкл',   en: 'Terminal up',    uz: 'Terminal yoqildi', color: 'text-success'    },
                  terminal_closed:           { ru: 'Терминал выкл',  en: 'Terminal down',  uz: "Terminal o'chirildi", color: 'text-danger'     },
                  kitchen_order_changed:     { ru: 'Кухня',          en: 'Kitchen',        uz: 'Oshxona',          color: 'text-blue-400'   },
                  delivery_changed:          { ru: 'Доставка',       en: 'Delivery',       uz: 'Yetkazish',        color: 'text-primary'    },
                  order_bill_cancelled:      { ru: 'Счёт отменён',   en: 'Bill cancelled', uz: 'Hisob bekor qilindi', color: 'text-danger'  },
                  order_before_delete:       { ru: 'Удаление',       en: 'Deleting',       uz: "O'chirilmoqda",    color: 'text-danger'     },
                  order_printed_items_deleted: { ru: 'Снятие позиций', en: 'Items voided', uz: 'Pozitsiyalar olib tashlandi', color: 'text-danger' },
                };
                const label = typeLabel[ev.type] ?? { ru: ev.type, en: ev.type, uz: ev.type, color: 'text-muted' };
                const time = new Date(ev.timestamp).toLocaleTimeString(tr(lang, 'ru-RU', 'en-US', 'uz-Latn-UZ'), { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                return (
                  <div key={ev.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 bg-card hover:bg-card-hover transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`text-[12px] font-semibold flex-shrink-0 ${label.color}`}>
                        {tr(lang, label.ru, label.en, label.uz)}
                      </span>
                      {(d.table?.number ?? d.tableNumber) != null && (
                        <span className="text-[13px] text-text">
                          {tr(lang, `Стол ${d.table?.number ?? d.tableNumber}`, `Table ${d.table?.number ?? d.tableNumber}`, `Stol ${d.table?.number ?? d.tableNumber}`)}
                        </span>
                      )}
                      {d.waiter && (
                        <span className="text-[13px] text-muted truncate">{d.waiter}</span>
                      )}
                      {d.items?.length > 0 && (
                        <span className="text-[12px] text-muted hidden sm:block">
                          {d.items.length} {tr(lang, 'позиц.', 'items', 'mahsulot')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0 ml-3">
                      {d.sum != null && d.sum > 0 && (
                        <span className="metric-number text-[13px] font-semibold text-text">
                          {d.sum.toLocaleString('ru-RU')} UZS
                        </span>
                      )}
                      <span className="text-[12px] text-muted font-mono">{time}</span>
                    </div>
                  </div>
                );
              })}
              {(liveOrders.length > feedVisible || feedVisible > 5) && (
                <div className="flex">
                  {liveOrders.length > feedVisible && (
                    <button
                      onClick={() => setFeedVisible(v => v + 15)}
                      className="flex-1 py-2.5 text-[11px] font-medium text-muted hover:text-text bg-card hover:bg-card-hover transition-colors"
                    >
                      {tr(lang, `Показать ещё (${liveOrders.length - feedVisible})`, `Show more (${liveOrders.length - feedVisible})`, `Ko'proq (${liveOrders.length - feedVisible})`)}
                    </button>
                  )}
                  {feedVisible > 5 && (
                    <button
                      onClick={() => setFeedVisible(5)}
                      className="flex-1 py-2.5 text-[11px] font-medium text-muted hover:text-text bg-card hover:bg-card-hover transition-colors border-l border-border"
                    >
                      {tr(lang, 'Свернуть', 'Collapse', "Yig'ish")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── AI DAILY BRIEFING ─────────────────────────────────── */}
      <AIDailyBriefingCard lang={lang} dataReady={dataLoaded} />

      {/* ── BOTTOM 2 CARDS ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Hall */}
        <Card>
          <p className="text-[13px] text-muted font-medium mb-5">
            {tr(lang, 'Загрузка зала', 'Hall Occupancy', 'Zal bandligi')}
          </p>
          {PLUGIN_ENABLED && pluginConnected ? (() => {
            // Distinct occupied tables; orders without a table fall back to order count
            const occupiedCount = demo ? 6 : occupiedTableNums.size;
            const pct = totalTables > 0 ? Math.min(100, Math.round((occupiedCount / totalTables) * 100)) : null;
            return (
            <div className="flex items-center gap-5">
              <div className="relative w-[72px] h-[72px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={occupiedCount > 0
                        ? [{ value: pct ?? occupiedCount }, { value: pct != null ? 100 - pct : Math.max(0, 10 - occupiedCount) }]
                        : [{ value: 1 }]}
                      cx="50%" cy="50%" innerRadius={22} outerRadius={32}
                      startAngle={90} endAngle={-270} paddingAngle={occupiedCount > 0 ? 4 : 0}
                      dataKey="value" stroke="none" animationDuration={1000}>
                      <Cell fill={occupiedCount > 0 ? '#ff6b35' : 'rgb(var(--color-border))'} />
                      {occupiedCount > 0 && <Cell fill="rgb(var(--color-border))" />}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="metric-number font-display text-[14px] font-black text-text">
                    {pct != null ? `${pct}%` : occupiedCount}
                  </span>
                </div>
              </div>
              <div>
                <p className="metric-number font-display font-black text-[32px] text-text leading-none">
                  {pct != null ? `${pct}%` : occupiedCount}
                </p>
                <p className="text-[13px] text-muted mt-1">
                  {pct != null
                    ? tr(lang, `${occupiedCount} из ${totalTables} столов занято`, `${occupiedCount} of ${totalTables} tables occupied`, `${totalTables} tadan ${occupiedCount} ta stol band`)
                    : tr(lang, 'активных заказов', 'active orders', 'faol buyurtmalar')}
                </p>
                <p className="text-[12px] text-success font-medium mt-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse inline-block" />
                  {tr(lang, 'Live', 'Live', 'Live')}
                </p>
              </div>
            </div>
            );
          })() : (
            <div className="flex items-center gap-2 py-4 text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-muted inline-block flex-shrink-0" />
              <span className="text-[12px]">{tr(lang, 'Нет активных заказов', 'No active orders', 'Faol buyurtmalar yo\'q')}</span>
            </div>
          )}
        </Card>

        {/* Integrations */}
        <Card>
          <p className="text-[13px] text-muted font-medium mb-5">{t.integrations}</p>
          <div className="space-y-3">
            {/* iikoFront Plugin — no equivalent for Poster-backed tenants (no terminal plugin), hide instead of showing a permanently-offline row */}
            {!integrationStatus.poster && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pluginConnected ? 'bg-success animate-pulse' : 'bg-muted'}`} />
                  <span className="text-[13px] text-text">iikoFront Plugin</span>
                </div>
                {pluginConnected
                  ? <span className="text-[12px] text-muted">{tr(lang, 'Подключено', 'Connected', 'Ulangan')}</span>
                  : <span className="text-[12px] text-muted">{tr(lang, 'Не в сети', 'Offline', 'Oflayn')}</span>}
              </div>
            )}
            {/* Poster */}
            {integrationStatus.poster && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: integrationStatus.poster.ok ? 'rgb(var(--color-success))' : 'rgb(var(--color-danger))' }} />
                  <span className="text-[13px] text-text">Poster</span>
                </div>
                <span className="text-[12px] text-muted truncate max-w-[100px]" title={integrationStatus.poster.label}>
                  {integrationStatus.poster.ok ? tr(lang, 'Подключено', 'Connected', 'Ulangan') : tr(lang, 'Ошибка', 'Error', 'Xato')}
                </span>
              </div>
            )}
            {/* iiko Server */}
            {integrationStatus.iikoServer && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: integrationStatus.iikoServer.ok ? 'rgb(var(--color-success))' : 'rgb(var(--color-danger))' }} />
                  <span className="text-[13px] text-text">iiko Server</span>
                </div>
                <span className="text-[12px] text-muted truncate max-w-[100px]" title={integrationStatus.iikoServer.label}>
                  {integrationStatus.iikoServer.ok ? tr(lang, 'Подключено', 'Connected', 'Ulangan') : tr(lang, 'Ошибка', 'Error', 'Xato')}
                </span>
              </div>
            )}
            {/* iiko Cloud API */}
            {integrationStatus.iikoCloud && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: integrationStatus.iikoCloud.ok ? 'rgb(var(--color-success))' : 'rgb(var(--color-danger))' }} />
                  <span className="text-[13px] text-text">iiko Cloud API</span>
                </div>
                <span className="text-[12px] text-muted">
                  {integrationStatus.iikoCloud.ok ? tr(lang, 'Подключено', 'Connected', 'Ulangan') : tr(lang, 'Ошибка', 'Error', 'Xato')}
                </span>
              </div>
            )}
          </div>
        </Card>

      </div>
    </div>
  );
};

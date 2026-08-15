import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card } from '../ui/Card';
import { AIInsightCard } from '../ui/AIInsightCard';
import { ChartTooltip } from '../ui/ChartTooltip';
import { DateRangePicker } from '../ui/DateRangePicker';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { TRANSLATIONS, tr, formatMinutes, formatMinutesShort } from '../../constants';
import { SalesSkeleton } from '../ui/Skeleton';
import { Language, TimeRange, ComparisonPeriod } from '../../types';
import { ArrowUpRight, ArrowDownRight, ArrowLeftRight, Calendar, ChevronDown, ChevronUp, ChevronsUpDown, X, Sparkles, TrendingUp, TrendingDown, Minus, ExternalLink, Users, Download, FileText, FileSpreadsheet, Lock, SlidersHorizontal, Tags } from 'lucide-react';
import { ComparisonSelector } from '../ui/ComparisonSelector';
import { useRealtimeData, RealtimeEvent } from '../../hooks/useRealtimeData';
import { traceApi, getTenantPlan, RevenueRow, HourlyRow, DishRow, CategoryPerfRow, AbcRow, AbcHistoryItem, DaypartData } from '../../services/traceApi';
import { ComingSoon } from '../ui/ComingSoon';

type AbcFilter = 'all' | 'A' | 'B' | 'C';
type AbcSort = 'revenue' | 'qty' | 'avgPrice' | 'velocity' | 'share' | 'cost' | 'costPerUnit' | 'marginPct' | 'foodCostPct';
type AbcMetric = 'abcRevenue' | 'abcQty' | 'abcProfit';

function abcBadgeCls(grade: string) {
  return grade === 'A' ? 'bg-success/10 text-success'
       : grade === 'B' ? 'bg-amber-400/10 text-amber-400'
       : grade === 'C' ? 'bg-[#222] text-muted'
       : 'bg-[#1a1a1a] text-[#8a8a8a]';
}

const ABC_TIME_RANGES = [
  { key: 'today' as const, ru: 'Сегодня', en: 'Today', uz: 'Bugun' },
  { key: '7days' as const, ru: '7 дней', en: '7 days', uz: '7 kun' },
  { key: '30days' as const, ru: '30 дней', en: '30 days', uz: '30 kun' },
];


// ── Dish Detail Modal ─────────────────────────────────────────────────────────

const DishDetailModal: React.FC<{
  item: AbcRow;
  allItems: AbcRow[];
  lang: Language;
  timeRange: string;
  isBasePlan: boolean;
  onClose: () => void;
}> = ({ item, allItems, lang, timeRange, isBasePlan, onClose }) => {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  type Tab = 'dynamics' | 'matrix' | 'ai' | 'daypart';
  const [tab, setTab] = useState<Tab>('dynamics');
  const [history, setHistory] = useState<AbcHistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [daypart, setDaypart] = useState<DaypartData | null>(null);
  const [daypartLoading, setDaypartLoading] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDone, setAiDone] = useState(false);

  // Fetch history on mount
  useEffect(() => {
    setHistoryLoading(true);
    traceApi.sales.abcHistory(item.name, lang)
      .then(d => setHistory(Array.isArray(d) ? d : []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [item.name]);

  // Fetch daypart when tab selected
  useEffect(() => {
    if (tab !== 'daypart' || daypart !== null) return;
    setDaypartLoading(true);
    const range = (timeRange === 'today' || timeRange === 'custom') ? '30days' : timeRange as any;
    traceApi.sales.abcDaypart(item.name, range, lang)
      .then(d => setDaypart(d))
      .catch(() => setDaypart({ byDow: [], byHour: [] }))
      .finally(() => setDaypartLoading(false));
  }, [tab, item.name, daypart, timeRange]);

  // Generate AI insight when AI tab selected (once)
  useEffect(() => {
    if (tab !== 'ai' || aiDone || isBasePlan) return;
    setAiDone(true);
    setAiLoading(true);

    const n = allItems.length;
    const sortedByQty = [...allItems].sort((a, b) => a.qty - b.qty);
    // Y-axis = profitability (margin %), matching the standard menu-
    // engineering matrix — see buildMatrixItems for why avgPrice is wrong here.
    const hasCostData = allItems.some(it => it.marginPct != null);
    const sortedByProfit = hasCostData
      ? [...allItems].sort((a, b) => (a.marginPct ?? -Infinity) - (b.marginPct ?? -Infinity))
      : [...allItems].sort((a, b) => a.avgPrice - b.avgPrice);
    const qtyRank    = n > 1 ? (sortedByQty.findIndex(it => it.name === item.name && it.cat === item.cat) / (n - 1)) * 100 : 50;
    const profitRank = n > 1 ? (sortedByProfit.findIndex(it => it.name === item.name && it.cat === item.cat) / (n - 1)) * 100 : 50;
    const quadrant = qtyRank >= 50 && profitRank >= 50 ? (ru ? 'Звезда' : isUz ? 'Yulduz' : 'Star')
      : qtyRank < 50 && profitRank >= 50 ? (ru ? 'Вопрос' : isUz ? 'Savol' : 'Question')
      : qtyRank >= 50 && profitRank < 50 ? (ru ? 'Рабочая лошадка' : isUz ? 'Sut sigir' : 'Cash cow')
      : (ru ? 'Аутсайдер' : isUz ? 'Avtsayder' : 'Dog');

    const costCtx = ru
      ? (item.costPerUnit != null ? ` Себестоимость: ${item.costPerUnit.toLocaleString('ru-RU')} UZS/шт. Фудкост: ${item.foodCostPct}%. Маржа: ${item.marginPct}%.` : '')
      : (item.costPerUnit != null ? ` Cost price: ${item.costPerUnit.toLocaleString()} UZS/unit. Food cost: ${item.foodCostPct}%. Margin: ${item.marginPct}%.` : '');
    const ctx = ru
      ? `Блюдо: "${item.name}", категория: ${item.cat}. Выручка: ${item.revenue.toLocaleString('ru-RU')} UZS (${item.share}% от общей). Продано: ${item.qty} шт. Ср. цена: ${item.avgPrice.toLocaleString('ru-RU')} UZS. Скорость: ${item.velocity}/день.${costCtx} ABC выручки: ${item.abcRevenue}. ABC количества: ${item.abcQty}. ABC маржи: ${item.abcProfit}. Позиция на BCG-матрице: ${quadrant}.`
      : `Dish: "${item.name}", category: ${item.cat}. Revenue: ${item.revenue.toLocaleString()} UZS (${item.share}% of total). Qty sold: ${item.qty}. Avg price: ${item.avgPrice.toLocaleString()} UZS. Velocity: ${item.velocity}/day.${costCtx} Revenue ABC: ${item.abcRevenue}. Qty ABC: ${item.abcQty}. Margin ABC: ${item.abcProfit}. Matrix position: ${quadrant}.`;

    const prompt = ru
      ? 'Дай 3-4 конкретных рекомендации менеджеру по этому блюду. Что с ним делать?'
      : 'Give 3-4 specific actionable recommendations for the manager about this dish.';

    traceApi.ai.chat(ctx, [{ role: 'user', text: prompt }], lang)
      .then(({ text }) => setAiText(text))
      .catch(() => setAiText(ru ? 'Ошибка AI. Проверьте ANTHROPIC_API_KEY.' : isUz ? 'AI xatosi. ANTHROPIC_API_KEY tekshiring.' : 'AI error. Check ANTHROPIC_API_KEY.'))
      .finally(() => setAiLoading(false));
  }, [tab, aiDone, item, allItems, lang, ru]);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Matrix data (computed client-side) — Y-axis is margin %, see buildMatrixItems
  const matrixData = useMemo(() => {
    const n = allItems.length;
    const sQ = [...allItems].sort((a, b) => a.qty - b.qty);
    const hasCostData = allItems.some(it => it.marginPct != null);
    const sP = hasCostData
      ? [...allItems].sort((a, b) => (a.marginPct ?? -Infinity) - (b.marginPct ?? -Infinity))
      : [...allItems].sort((a, b) => a.avgPrice - b.avgPrice);
    const qMap = new Map(sQ.map((it, i) => [it.name + '|' + it.cat, n > 1 ? (i / (n - 1)) * 100 : 50]));
    const pMap = new Map(sP.map((it, i) => [it.name + '|' + it.cat, n > 1 ? (i / (n - 1)) * 100 : 50]));
    const isCur = (it: AbcRow) => it.name === item.name && it.cat === item.cat;
    const pt = (it: AbcRow) => ({ x: qMap.get(it.name + '|' + it.cat) ?? 0, y: pMap.get(it.name + '|' + it.cat) ?? 0, name: it.name });
    return { other: allItems.filter(it => !isCur(it)).map(pt), current: allItems.filter(isCur).map(pt) };
  }, [allItems, item]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'dynamics', label: ru ? 'Динамика' : isUz ? 'Dinamika' : 'Dynamics' },
    { id: 'matrix',   label: ru ? 'Матрица'  : isUz ? 'Matritsa' : 'Matrix'   },
    { id: 'ai',       label: 'AI Инсайт'                   },
    { id: 'daypart',  label: ru ? 'По времени' : isUz ? 'Vaqt boyicha' : 'By Time' },
  ];

  const gradeArrow = (prev: string, curr: string) => {
    if (prev === '—' || curr === '—') return null;
    const rank = { A: 0, B: 1, C: 2 };
    const diff = (rank as any)[prev] - (rank as any)[curr]; // positive = improved
    if (diff > 0) return <TrendingUp size={10} className="text-success" />;
    if (diff < 0) return <TrendingDown size={10} className="text-danger" />;
    return <Minus size={10} className="text-muted" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-bold text-text truncate max-w-full sm:max-w-[380px]">{item.name}</h2>
            <p className="text-[11px] text-muted mt-0.5 truncate">{item.cat} · {item.velocity}/день · {item.share}% выручки</p>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            {/* 3 ABC badges in header */}
            <div className="flex gap-1">
              {([
                { label: ru ? 'К' : 'Q', grade: item.abcQty,     title: ru ? 'Кол-во'  : isUz ? 'Soni' : 'Qty'     },
                { label: ru ? 'В' : 'R', grade: item.abcRevenue, title: ru ? 'Выручка' : isUz ? 'Tushum' : 'Revenue' },
                { label: ru ? 'М' : 'P', grade: item.abcProfit,  title: ru ? 'Маржа'   : isUz ? 'Marja' : 'Margin'  },
              ] as const).map(({ label, grade, title }) => (
                <span key={label} title={`${title}: ${grade}`}
                  className={`inline-flex flex-col items-center px-1.5 py-0.5 rounded-[3px] text-[9px] font-black leading-none gap-0.5 ${abcBadgeCls(grade)}`}>
                  <span className="text-[8px] opacity-60">{label}</span>
                  <span>{grade}</span>
                </span>
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-card-hover transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-0 flex-shrink-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
                tab === t.id ? 'bg-primary text-white' : 'text-muted hover:text-text hover:bg-card-hover'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── Tab: Dynamics ── */}
          {tab === 'dynamics' && (
            <div>
              <p className="text-[10px] text-muted mb-4">{ru ? 'Изменение ABC-оценок за последние 3 месяца' : isUz ? 'Oxirgi 3 oydagi ABC baholarining o\'zgarishi' : 'ABC grade changes over the last 3 months'}</p>
              {historyLoading ? (
                <div className="flex items-center gap-2 py-8 text-muted text-[12px]">
                  <span className="w-4 h-4 border-2 border-muted/30 border-t-primary rounded-full animate-spin" />
                  {ru ? 'Загрузка...' : isUz ? 'Yuklanmoqda...' : 'Loading...'}
                </div>
              ) : !history || history.length === 0 ? (
                <p className="text-[12px] text-muted py-8 text-center">{ru ? 'Нет данных за предыдущие месяцы' : isUz ? "Oldingi oylar uchun ma'lumot yo'q" : 'No historical data available'}</p>
              ) : (
                <div>
                  {/* Month columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                    {history.map((m, mi) => (
                      <div key={m.month} className="bg-background border border-border rounded-xl p-3">
                        <p className="text-[10px] text-muted mb-3 capitalize">{m.label}</p>
                        {!m.found ? (
                          <p className="text-[11px] text-muted/50">{ru ? 'Не продавалось' : isUz ? 'Sotilmagan' : 'Not sold'}</p>
                        ) : (
                          <div className="space-y-2">
                            {([
                              { key: 'abcQty',     labelRu: 'Кол-во',  labelEn: 'Qty',     labelUz: 'Soni'    },
                              { key: 'abcRevenue', labelRu: 'Выручка', labelEn: 'Revenue', labelUz: 'Tushum' },
                              { key: 'abcProfit',  labelRu: 'Маржа',   labelEn: 'Margin',  labelUz: 'Marja'  },
                            ] as const).map(({ key, labelRu, labelEn, labelUz }) => {
                              const grade = m[key] as string;
                              const prev  = mi > 0 ? history[mi - 1][key] as string : null;
                              return (
                                <div key={key} className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] text-muted">{tr(lang, labelRu, labelEn, labelUz)}</span>
                                  <div className="flex items-center gap-1">
                                    {prev && gradeArrow(prev, grade)}
                                    <span className={`px-1.5 py-0.5 rounded-[3px] text-[10px] font-black ${abcBadgeCls(grade)}`}>{grade}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Trend summary */}
                  {history.length === 3 && history[0].found && history[2].found && (
                    <div className="bg-background border border-border rounded-xl p-3">
                      <p className="text-[10px] text-muted mb-2">{ru ? 'Тренд 3 месяца' : isUz ? '3 oylik tendensiya' : '3-month trend'}</p>
                      <div className="flex flex-wrap gap-4">
                        {([
                          { key: 'abcQty',     labelRu: 'Кол-во',  labelEn: 'Qty',     labelUz: 'Soni'    },
                          { key: 'abcRevenue', labelRu: 'Выручка', labelEn: 'Revenue', labelUz: 'Tushum' },
                          { key: 'abcProfit',  labelRu: 'Маржа',   labelEn: 'Margin',  labelUz: 'Marja'  },
                        ] as const).map(({ key, labelRu, labelEn, labelUz }) => {
                          const vals = history.filter(h => h.found).map(h => h[key] as string);
                          const flow = vals.join(' → ');
                          return (
                            <div key={key}>
                              <p className="text-[9px] text-muted">{tr(lang, labelRu, labelEn, labelUz)}</p>
                              <p className="text-[11px] font-mono text-text mt-0.5">{flow}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Matrix ── */}
          {tab === 'matrix' && (
            <div>
              <p className="text-[10px] text-muted mb-3">
                {ru ? 'X = Рейтинг продаж · Y = Рейтинг маржи' : isUz ? 'X = Sotuv reytingi · Y = Marja reytingi' : 'X = Qty rank · Y = Margin rank'}
              </p>
              <div className="relative h-[280px]">
                {/* Quadrant labels */}
                <div className="absolute inset-0 pointer-events-none z-10">
                  <div className="absolute top-2 left-2 text-[9px] text-muted/60 leading-tight">
                    <div className="font-medium text-amber-400/60">{ru ? 'Вопрос' : isUz ? 'Savol' : 'Question'}</div>
                    <div className="text-[8px]">{ru ? 'Продвигай' : isUz ? 'Targ\'ib qil' : 'Promote'}</div>
                  </div>
                  <div className="absolute top-2 right-2 text-right text-[9px] leading-tight">
                    <div className="font-medium text-success/70">{ru ? 'Звезда' : isUz ? 'Yulduz' : 'Star'}</div>
                    <div className="text-[8px] text-muted/60">{ru ? 'Оптим. себест.' : isUz ? 'Tannarxni optimallashtir' : 'Optimize cost'}</div>
                  </div>
                  <div className="absolute bottom-6 left-2 text-[9px] leading-tight">
                    <div className="font-medium text-danger/60">{ru ? 'Аутсайдер' : isUz ? 'Avtsayder' : 'Dog'}</div>
                    <div className="text-[8px] text-muted/60">{ru ? 'Убирай' : isUz ? 'Olib tashla' : 'Remove'}</div>
                  </div>
                  <div className="absolute bottom-6 right-2 text-right text-[9px] leading-tight">
                    <div className="font-medium text-primary/70">{ru ? 'Рабочая лошадка' : isUz ? 'Sut sigir' : 'Cash cow'}</div>
                    <div className="text-[8px] text-muted/60">{ru ? 'Снижай себест.' : isUz ? 'Tannarxni kamayt' : 'Cut costs'}</div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 16, right: 16, left: 0, bottom: 20 }}>
                    <XAxis type="number" dataKey="x" domain={[0, 100]} hide />
                    <YAxis type="number" dataKey="y" domain={[0, 100]} hide />
                    <ZAxis range={[24, 24]} />
                    <ReferenceLine x={50} stroke="#2a2a2a" strokeDasharray="3 3" />
                    <ReferenceLine y={50} stroke="#2a2a2a" strokeDasharray="3 3" />
                    <Tooltip
                      content={(p: any) => {
                        const d = p.payload?.[0]?.payload;
                        if (!d) return null;
                        return (
                          <div className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-text shadow-lg">
                            {d.name}
                          </div>
                        );
                      }}
                    />
                    <Scatter data={matrixData.other}   fill="#2a2a2a" opacity={0.8} />
                    <Scatter data={matrixData.current} fill="#ff6b35" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  <span className="text-[10px] text-muted">{item.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a] border border-[#444]" />
                  <span className="text-[10px] text-muted">{ru ? 'Другие позиции' : isUz ? 'Boshqa pozitsiyalar' : 'Other items'}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: AI Insight ── */}
          {tab === 'ai' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={13} className="text-primary" />
                <span className="text-[11px] font-medium text-text">TRACE AI</span>
                {!isBasePlan && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase tracking-wider">Beta</span>}
                {isBasePlan && <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest">PRO</span>}
              </div>
              {isBasePlan ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lock size={18} className="text-primary" />
                  </div>
                  <p className="text-[13px] font-semibold text-text">{ru ? 'Только в плане Pro' : isUz ? 'Faqat Pro rejada' : 'Pro plan only'}</p>
                  <p className="text-[11px] text-muted max-w-[220px] leading-relaxed">
                    {ru ? 'AI-анализ по каждому блюду доступен в плане Pro.' : isUz ? 'Har bir taom uchun AI tahlili Pro rejada mavjud.' : 'Per-dish AI insights are available on the Pro plan.'}
                  </p>
                </div>
              ) : aiLoading ? (
                <div className="flex items-center gap-3 py-6 text-muted text-[12px]">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60"
                        style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                  {ru ? 'Анализирую блюдо...' : isUz ? 'Taom tahlil qilinmoqda...' : 'Analyzing dish...'}
                </div>
              ) : aiText ? (
                <div className="bg-background border border-border rounded-xl p-4 text-[12.5px] text-text leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: aiText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
              ) : (
                <p className="text-[12px] text-muted py-4">{ru ? 'Нет данных AI' : isUz ? "AI ma'lumotlari yo'q" : 'No AI data'}</p>
              )}
              {!isBasePlan && <p className="text-[9px] text-muted/40 mt-3">TRACE AI</p>}
            </div>
          )}

          {/* ── Tab: By Time ── */}
          {tab === 'daypart' && (
            <div className="space-y-5">
              {daypartLoading ? (
                <div className="flex items-center gap-2 py-8 text-muted text-[12px]">
                  <span className="w-4 h-4 border-2 border-muted/30 border-t-primary rounded-full animate-spin" />
                  {ru ? 'Загрузка...' : isUz ? 'Yuklanmoqda...' : 'Loading...'}
                </div>
              ) : !daypart ? null : (
                <>
                  {/* By day of week */}
                  <div>
                    <p className="text-[11px] font-medium text-text mb-3">{ru ? 'По дням недели' : isUz ? 'Hafta kunlari boyicha' : 'By day of week'}</p>
                    {daypart.byDow.every(d => d.qty === 0) ? (
                      <p className="text-[12px] text-muted">{ru ? 'Нет данных по дням' : isUz ? "Kunlar boyicha ma'lumot yo'q" : 'No day-of-week data'}</p>
                    ) : (
                      <div className="h-[140px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={daypart.byDow} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                            <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 10, fontFamily: 'Onest' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip content={(p: any) => {
                              const d = p.payload?.[0]?.payload;
                              return d ? <div className="bg-card border border-border rounded-lg px-2 py-1 text-[11px] text-text">{d.label}: {d.qty} {ru ? 'шт.' : isUz ? 'dona' : 'pcs'}</div> : null;
                            }} cursor={{ fill: 'rgba(255,107,53,0.05)' }} />
                            <Bar dataKey="qty" radius={[2,2,0,0]} animationDuration={700}>
                              {daypart.byDow.map((d, i) => {
                                const max = Math.max(...daypart.byDow.map(x => x.qty));
                                return <Cell key={i} fill={d.qty >= max * 0.7 ? '#ff6b35' : d.qty >= max * 0.35 ? '#ff6b3566' : '#1e1e1e'} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* By hour */}
                  {daypart.byHour.length > 0 ? (
                    <div>
                      <p className="text-[11px] font-medium text-text mb-3">{ru ? 'По часам' : isUz ? 'Soatlar boyicha' : 'By hour'}</p>
                      <div className="h-[140px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={daypart.byHour} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                            <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 9, fontFamily: 'Onest' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip content={(p: any) => {
                              const d = p.payload?.[0]?.payload;
                              return d ? <div className="bg-card border border-border rounded-lg px-2 py-1 text-[11px] text-text">{d.label}: {d.qty} {ru ? 'шт.' : isUz ? 'dona' : 'pcs'}</div> : null;
                            }} cursor={{ fill: 'rgba(255,107,53,0.05)' }} />
                            <Bar dataKey="qty" radius={[2,2,0,0]} animationDuration={700}>
                              {daypart.byHour.map((d, i) => {
                                const max = Math.max(...daypart.byHour.map(x => x.qty));
                                return <Cell key={i} fill={d.qty >= max * 0.7 ? '#ff6b35' : d.qty >= max * 0.35 ? '#ff6b3566' : '#1e1e1e'} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-background border border-border rounded-xl p-4">
                      <p className="text-[12px] text-muted text-center">
                        {ru ? 'Почасовые данные недоступны в этой версии iiko' : isUz ? 'Soatlik malumotlar bu iiko versiyasida mavjud emas' : 'Hourly data not available in this iiko version'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

// ── ABC Table ─────────────────────────────────────────────────────────────────

const AbcTable: React.FC<{ items: AbcRow[]; lang: Language; timeRange: string; isBasePlan: boolean }> = ({ items: initialItems, lang, timeRange: initialTimeRange, isBasePlan }) => {
  const [abcFilter, setAbcFilter] = useState<AbcFilter>('all');
  const [abcMetric, setAbcMetric] = useState<AbcMetric>('abcRevenue');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<{ key: AbcSort; dir: 'desc' | 'asc' }>({ key: 'revenue', dir: 'desc' });
  const [page, setPage] = useState(10);
  const [detailItem, setDetailItem] = useState<AbcRow | null>(null);

  // Optional columns — toggleable, persisted so the choice sticks across visits
  type OptCol = 'cat' | 'avgPrice' | 'cost' | 'costPerUnit' | 'foodCostPct' | 'marginPct' | 'velocity';
  const OPT_COL_DEFAULTS: Record<OptCol, boolean> = { cat: true, avgPrice: true, cost: true, costPerUnit: true, foodCostPct: true, marginPct: true, velocity: true };
  const [visibleCols, setVisibleCols] = useState<Record<OptCol, boolean>>(() => {
    try {
      const saved = localStorage.getItem('trace_abc_cols');
      if (saved) return { ...OPT_COL_DEFAULTS, ...JSON.parse(saved) };
    } catch {}
    return OPT_COL_DEFAULTS;
  });
  const [colsOpen, setColsOpen] = useState(false);
  const colsBtnRef = useRef<HTMLDivElement>(null);
  useEffect(() => { localStorage.setItem('trace_abc_cols', JSON.stringify(visibleCols)); }, [visibleCols]);
  useEffect(() => {
    if (!colsOpen) return;
    const onClick = (e: MouseEvent) => { if (colsBtnRef.current && !colsBtnRef.current.contains(e.target as Node)) setColsOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [colsOpen]);
  const toggleCol = (id: OptCol) => setVisibleCols(v => ({ ...v, [id]: !v[id] }));

  // Category visibility — a persisted blacklist so newly-seen categories
  // (new iiko section, seasonal menu, etc.) default to visible instead of
  // silently vanishing until the user opts back in.
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('trace_abc_hidden_cats');
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set();
  });
  const [catsOpen, setCatsOpen] = useState(false);
  const catsBtnRef = useRef<HTMLDivElement>(null);
  useEffect(() => { localStorage.setItem('trace_abc_hidden_cats', JSON.stringify([...hiddenCats])); }, [hiddenCats]);
  useEffect(() => {
    if (!catsOpen) return;
    const onClick = (e: MouseEvent) => { if (catsBtnRef.current && !catsBtnRef.current.contains(e.target as Node)) setCatsOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [catsOpen]);
  const toggleCat = (cat: string) => setHiddenCats(s => {
    const next = new Set(s);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    return next;
  });

  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadBtnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!downloadOpen) return;
    const onClick = (e: MouseEvent) => { if (downloadBtnRef.current && !downloadBtnRef.current.contains(e.target as Node)) setDownloadOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [downloadOpen]);

  // AI analysis of the whole (filtered) menu — separate from the per-dish
  // AI insight in DishDetailModal. Tells the model which category each item
  // is in and that modifiers/service-charge rows are already excluded, so
  // it doesn't mistake a combo add-on or drink for a standalone dish.
  const [menuAiText, setMenuAiText] = useState('');
  const [menuAiLoading, setMenuAiLoading] = useState(false);
  const [menuAiError, setMenuAiError] = useState(false);

  // Independent date range for this card — defaults to the page's range,
  // but can be changed without affecting the rest of the Sales view.
  type AbcRange = 'today' | '7days' | '30days' | 'custom';
  const initialRange: AbcRange = (['today', '7days', '30days'] as const).includes(initialTimeRange as any)
    ? initialTimeRange as AbcRange : '7days';
  const [range, setRange] = useState<AbcRange>(initialRange);
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<AbcRow[]>(initialItems);
  const [abcLoading, setAbcLoading] = useState(false);
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    setAbcLoading(true);
    const req = range === 'custom' && customRange
      ? traceApi.sales.abc('custom', customRange.from, customRange.to)
      : traceApi.sales.abc(range);
    req.then(setItems).catch(() => {}).finally(() => setAbcLoading(false));
  }, [range, customRange]);

  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const timeRange = range;

  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map(i => i.cat))).sort()], [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (abcFilter !== 'all') list = list.filter(i => i[abcMetric] === abcFilter);
    if (catFilter !== 'all') list = list.filter(i => i.cat === catFilter);
    if (hiddenCats.size > 0) list = list.filter(i => !hiddenCats.has(i.cat));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const av = a[sort.key] ?? -1;
      const bv = b[sort.key] ?? -1;
      return sort.dir === 'desc' ? bv - av : av - bv;
    });
  }, [items, abcFilter, abcMetric, catFilter, hiddenCats, sort, searchQuery]);

  const aCount = items.filter(i => i.abcRevenue === 'A').length;
  const deadWeight = items.filter(i => i.abcRevenue === 'C' && i.velocity < 0.5).length;
  const topShare = items[0]?.share ?? 0;

  const runMenuAi = () => {
    if (menuAiLoading) return;
    setMenuAiLoading(true);
    setMenuAiError(false);
    const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
    const byCat = new Map<string, number>();
    for (const it of filtered) byCat.set(it.cat, (byCat.get(it.cat) ?? 0) + it.revenue);
    const catLines = [...byCat.entries()].sort((a, b) => b[1] - a[1])
      .map(([cat, rev]) => `  ${cat}: ${fmt(rev)} UZS`).join('\n');
    const itemLines = [...filtered].sort((a, b) => b.revenue - a.revenue).slice(0, 40)
      .map(it => `  "${it.name}" [категория: ${it.cat}] — выручка ${fmt(it.revenue)} UZS, ${it.qty} шт., ${it.velocity}/день, фудкост ${it.foodCostPct != null ? it.foodCostPct + '%' : 'н/д'}, маржа ${it.marginPct != null ? it.marginPct + '%' : 'н/д'}, ABC (кол-во/выручка/маржа): ${it.abcQty}${it.abcRevenue}${it.abcProfit}`)
      .join('\n');
    const ctx = ru
      ? `Ты аналитик меню ресторана. Ниже список позиций меню с их категорией (модификаторы, сервисный сбор и чаевые уже исключены из этого списка — считай всё ниже реальными продаваемыми позициями, будь то блюдо, напиток или предмет типа "кальян"/"попкорн" — определяй тип по названию и категории). Всего позиций: ${filtered.length}, из них ${aCount} формируют 70% выручки.\n\nВыручка по категориям:\n${catLines}\n\nТоп-40 позиций по выручке:\n${itemLines}`
      : `You are a restaurant menu analyst. Below are menu items with category (modifiers/service charge/tips are already excluded — treat everything below as a real sellable item, whether a dish, drink, or something like hookah/popcorn — infer the type from name and category). Total items: ${filtered.length}, ${aCount} of which make up 70% of revenue.\n\nRevenue by category:\n${catLines}\n\nTop 40 items by revenue:\n${itemLines}`;
    const prompt = ru
      ? 'Дай общий анализ меню: 1) какие категории/позиции недооценены или переоценены по цене, 2) что стоит убрать или продвигать, 3) любые аномалии (например, позиция с высокой выручкой но низкой маржой). 4-6 конкретных пунктов.'
      : 'Give an overall menu analysis: 1) which categories/items are under- or over-priced, 2) what to cut or promote, 3) any anomalies (e.g. high revenue but low margin). 4-6 specific points.';
    traceApi.ai.chat(ctx, [{ role: 'user', text: prompt }], lang)
      .then(({ text }) => setMenuAiText(text))
      .catch(() => setMenuAiError(true))
      .finally(() => setMenuAiLoading(false));
  };

  function SortBtn({ col, label }: { col: AbcSort; label: string }) {
    const active = sort.key === col;
    return (
      <button onClick={() => setSort(s => ({ key: col, dir: s.key === col && s.dir === 'desc' ? 'asc' : 'desc' }))}
        className={`flex items-center gap-0.5 text-[10px] uppercase tracking-[0.15em] font-medium transition-colors ${active ? 'text-text' : 'text-muted hover:text-text'}`}>
        {label}
        {active ? (sort.dir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />) : <ChevronsUpDown size={10} className="opacity-40" />}
      </button>
    );
  }

  const METRIC_OPTS: { id: AbcMetric; labelRu: string; labelEn: string; labelUz: string }[] = [
    { id: 'abcRevenue', labelRu: 'по Выручке', labelEn: 'by Revenue', labelUz: 'Tushum boyicha' },
    { id: 'abcQty',     labelRu: 'по Кол-ву',  labelEn: 'by Qty',     labelUz: 'Soni boyicha'   },
    { id: 'abcProfit',  labelRu: 'по Марже',   labelEn: 'by Margin',  labelUz: 'Marja boyicha'  },
  ];

  // ── Shared export helpers ─────────────────────────────────────────────────
  const GRADE_HEX: Record<'A' | 'B' | 'C', string> = { A: '22C55E', B: 'F59E0B', C: 'EF4444' };
  const GRADE_RGB: Record<'A' | 'B' | 'C', [number, number, number]> = { A: [34, 197, 94], B: [245, 158, 11], C: [239, 68, 68] };
  const BRAND_HEX = 'FF6B35';
  const BRAND_RGB: [number, number, number] = [255, 107, 53];

  const abcMeta = () => {
    const rangeLabel = range === 'custom' && customRange
      ? `${customRange.from} – ${customRange.to}`
      : ABC_TIME_RANGES.find(r => r.key === range)?.[ru ? 'ru' : isUz ? 'uz' : 'en'] ?? range;
    const generated = new Date().toLocaleString(ru ? 'ru-RU' : isUz ? 'uz-Latn-UZ' : 'en-US');
    const dateStamp = new Date().toISOString().slice(0, 10);
    return { rangeLabel, generated, dateStamp };
  };

  // Plain-language takeaways computed from the same numbers already on
  // screen — turns the export into something a manager acts on, not just
  // a data dump they have to re-analyze themselves.
  const buildAbcInsights = (list_?: AbcRow[]): string[] => {
    const scope = list_ ?? filtered;
    const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
    const list: string[] = [];
    const total = scope.length || 1;
    const scopeACount = scope.filter(i => i.abcRevenue === 'A').length;
    const scopeDeadWeight = scope.filter(i => i.abcRevenue === 'C' && i.velocity < 0.5).length;
    const aPct = Math.round((scopeACount / total) * 100);
    list.push(
      ru ? `${scopeACount} из ${total} позиций (${aPct}%) формируют ~70% выручки — классическое ядро Парето, держите их в наличии всегда.`
        : isUz ? `${scopeACount}/${total} taom (${aPct}%) tushumning ~70% ini beradi — doim yetkazib turing.`
        : `${scopeACount} of ${total} items (${aPct}%) drive ~70% of revenue — the Pareto core. Never let these run out.`
    );
    if (scopeDeadWeight > 0) {
      list.push(
        ru ? `${scopeDeadWeight} позиций — класс C по выручке при скорости <0.5/день: мёртвый груз, кандидаты на удаление или ребрендинг в меню.`
          : isUz ? `${scopeDeadWeight} taom — C toifa va kunlik tezlik <0.5: menyudan olib tashlash kandidati.`
          : `${scopeDeadWeight} items are grade C with velocity under 0.5/day — dead weight, candidates to cut or reposition.`
      );
    }
    const top = scope[0];
    if (top) {
      list.push(
        ru ? `Лидер — «${top.name}» (${top.cat}): ${fmt(top.revenue)} UZS, ${top.share}% всей выручки.`
          : isUz ? `Yetakchi — «${top.name}» (${top.cat}): ${fmt(top.revenue)} UZS, jami tushumning ${top.share}%.`
          : `Top performer — "${top.name}" (${top.cat}): ${fmt(top.revenue)} UZS, ${top.share}% of total revenue.`
      );
    }
    const withMargin = scope.filter(i => i.marginPct != null) as (AbcRow & { marginPct: number })[];
    if (withMargin.length) {
      const aMargin = withMargin.filter(i => i.abcRevenue === 'A');
      const cMargin = withMargin.filter(i => i.abcRevenue === 'C');
      if (aMargin.length) {
        const avgA = Math.round(aMargin.reduce((s, i) => s + i.marginPct, 0) / aMargin.length);
        list.push(
          ru ? `Средняя маржа топовых (A) позиций — ${avgA}%. Проверьте, нет ли среди хитов продаж позиций с маржой ниже этого уровня — их стоит переоценить.`
            : isUz ? `A toifa taomlarining o'rtacha marjasi — ${avgA}%. Shundan past marjali hit-taomlarni qaytadan narxlang.`
            : `Average margin on A-grade items is ${avgA}%. Any bestseller below that line is underpriced relative to its own peer group.`
        );
      }
      if (cMargin.length) {
        const highMarginC = cMargin.filter(i => i.marginPct > (withMargin.reduce((s, i2) => s + i2.marginPct, 0) / withMargin.length)).length;
        if (highMarginC > 0) {
          list.push(
            ru ? `${highMarginC} позиций класса C имеют маржу выше среднего — низкие продажи, но выгодны поштучно: стоит продвигать, а не убирать.`
              : isUz ? `${highMarginC} ta C toifa taom o'rtachadan yuqori marjaga ega — sotuvi kam, lekin foydali: targ'ib qiling, o'chirmang.`
              : `${highMarginC} grade-C items carry above-average margin — low volume but profitable per unit. Promote rather than cut these.`
          );
        }
      }
    }
    const byCat = new Map<string, number>();
    for (const it of scope) byCat.set(it.cat, (byCat.get(it.cat) ?? 0) + it.revenue);
    const totalRev = scope.reduce((s, i) => s + i.revenue, 0) || 1;
    const topCat = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCat && byCat.size > 1) {
      const catPct = Math.round((topCat[1] / totalRev) * 100);
      list.push(
        ru ? `Категория «${topCat[0]}» даёт ${catPct}% выручки — при её просадке пострадает вся выручка непропорционально.`
          : isUz ? `«${topCat[0]}» kategoriyasi tushumning ${catPct}% ini beradi — bu toifa qulasa, umumiy tushum keskin tushadi.`
          : `Category "${topCat[0]}" accounts for ${catPct}% of revenue — a dip there hits total revenue disproportionately.`
      );
    }
    return list;
  };

  const abcFooterText = () => ru ? 'Сделано с TRACE-OS · trace-os.uz' : isUz ? 'TRACE-OS bilan yaratildi · trace-os.uz' : 'Made by TRACE · trace-os.uz';

  // Section keyword matching — mirrors TRACEBACKEND's CATEGORY_ALIASES so
  // "Кухня"/"Kitchen", "Бар"/"Bar" etc. all map to the same logical section
  // regardless of which language/spelling this tenant's iiko categories use.
  const ABC_SECTIONS: { id: string; label: { ru: string; en: string; uz: string }; keywords: string[] }[] = [
    { id: 'kitchen', label: { ru: 'Кухня', en: 'Kitchen', uz: 'Oshxona' }, keywords: ['кухня', 'kitchen', 'oshxona'] },
    { id: 'bar', label: { ru: 'Бар', en: 'Bar', uz: 'Bar' }, keywords: ['бар', 'bar'] },
    { id: 'bakery', label: { ru: 'Выпечка', en: 'Bakery', uz: 'Non mahsulotlari' }, keywords: ['выпечк', 'bakery', 'пекар', 'хлеб', 'bread', 'non mahsulot', 'nonvoy'] },
    { id: 'dessert', label: { ru: 'Десерты', en: 'Desserts', uz: 'Shirinliklar' }, keywords: ['кондитер', 'десерт', 'dessert', 'shirinlik'] },
  ];
  const sectionOf = (cat: string): typeof ABC_SECTIONS[number] | null => {
    const low = cat.toLowerCase();
    return ABC_SECTIONS.find(s => s.keywords.some(k => low.includes(k))) ?? null;
  };

  // Writes one fully-styled ABC sheet (title, insights, colored table, footer)
  // into an existing workbook — shared by the overview sheet and each
  // per-section sheet (Bar/Kitchen/Bakery/Desserts) so they stay identical.
  const writeAbcSheet = (wb: ExcelJS.Workbook, sheetName: string, title: string, sheetItems: AbcRow[], sheetInsights: string[]) => {
    const { rangeLabel, generated } = abcMeta();
    const ws = wb.addWorksheet(sheetName.slice(0, 31), { views: [{ state: 'frozen', ySplit: 0 }] });

    const COLS = 14;
    ws.mergeCells(1, 1, 1, COLS);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_HEX}` } };
    ws.getRow(1).height = 26;

    ws.mergeCells(2, 1, 2, COLS);
    const metaCell = ws.getCell(2, 1);
    metaCell.value = `${ru ? 'Период' : isUz ? 'Davr' : 'Period'}: ${rangeLabel}  ·  ${ru ? 'Создано' : isUz ? 'Yaratildi' : 'Generated'}: ${generated}`;
    metaCell.font = { italic: true, size: 10, color: { argb: 'FF666666' } };

    let r = 4;
    ws.mergeCells(r, 1, r, COLS);
    ws.getCell(r, 1).value = ru ? 'Ключевые выводы' : isUz ? 'Asosiy xulosalar' : 'Key insights';
    ws.getCell(r, 1).font = { bold: true, size: 11, color: { argb: `FF${BRAND_HEX}` } };
    r++;
    for (const line of sheetInsights) {
      ws.mergeCells(r, 1, r, COLS);
      const c = ws.getCell(r, 1);
      c.value = `•  ${line}`;
      c.font = { size: 10 };
      c.alignment = { wrapText: true };
      ws.getRow(r).height = 24;
      r++;
    }
    r++;

    const headerRowIdx = r;
    const headers = [
      '#', ru ? 'Блюдо' : isUz ? 'Taom' : 'Item', ru ? 'Категория' : isUz ? 'Kategoriya' : 'Category',
      ru ? 'Выручка' : isUz ? 'Tushum' : 'Revenue', '%',
      ru ? 'Кол-во' : isUz ? 'Soni' : 'Qty', ru ? 'Ср. цена' : isUz ? "O'rt. narx" : 'Avg price',
      ru ? 'Себест.' : isUz ? 'Tannarx' : 'Cost', ru ? 'Себест/шт' : isUz ? 'Tannarx/dona' : 'Cost/unit',
      ru ? 'Фудкост %' : 'Food cost %',
      ru ? 'В день' : isUz ? 'Kuniga' : '/day',
      ru ? 'ABC Кол-во' : isUz ? 'ABC Soni' : 'ABC Qty',
      ru ? 'ABC Выручка' : isUz ? 'ABC Tushum' : 'ABC Revenue',
      ru ? 'ABC Маржа' : isUz ? 'ABC Marja' : 'ABC Margin',
    ];
    const hRow = ws.getRow(headerRowIdx);
    hRow.values = headers;
    hRow.eachCell((cell: ExcelJS.Cell) => {
      cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_HEX}` } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    hRow.height = 20;

    sheetItems.forEach((item, i) => {
      const row = ws.getRow(headerRowIdx + 1 + i);
      row.values = [
        i + 1, item.name, item.cat,
        item.revenue, item.share / 100,
        item.qty, item.avgPrice,
        (item.cost ?? 0) > 0 ? (item.cost ?? 0) : null,
        item.costPerUnit ?? null,
        item.foodCostPct != null ? item.foodCostPct / 100 : null,
        item.velocity,
        item.abcQty, item.abcRevenue, item.abcProfit,
      ];
      row.getCell(4).numFmt = '#,##0';
      row.getCell(5).numFmt = '0.0%';
      row.getCell(7).numFmt = '#,##0';
      row.getCell(8).numFmt = '#,##0';
      row.getCell(9).numFmt = '#,##0';
      row.getCell(10).numFmt = '0.0%';
      row.getCell(11).numFmt = '0.00';
      row.eachCell((c: ExcelJS.Cell) => { c.alignment = { ...c.alignment, vertical: 'middle' }; });
      if (i % 2 === 1) {
        for (let col = 1; col <= COLS; col++) {
          row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
        }
      }
      for (const col of [12, 13, 14] as const) {
        const grade = row.getCell(col).value as 'A' | 'B' | 'C';
        const cell = row.getCell(col);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${GRADE_HEX[grade]}` } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });

    ws.columns = [
      { width: 4 }, { width: 30 }, { width: 16 }, { width: 13 }, { width: 8 }, { width: 8 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 10 }, { width: 8 }, { width: 11 }, { width: 12 }, { width: 11 },
    ];
    ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: headerRowIdx, column: COLS } };
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowIdx }];

    const footerRow = headerRowIdx + sheetItems.length + 2;
    ws.mergeCells(footerRow, 1, footerRow, COLS);
    const footerCell = ws.getCell(footerRow, 1);
    footerCell.value = abcFooterText();
    footerCell.font = { italic: true, size: 9, color: { argb: 'FF999999' } };
  };

  const handleExcel = async () => {
    const { dateStamp } = abcMeta();
    const title = ru ? 'ABC-анализ меню' : isUz ? 'Menyu ABC tahlili' : 'Menu ABC Analysis';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TRACE-OS';
    wb.created = new Date();

    writeAbcSheet(wb, (ru ? 'Общее' : isUz ? 'Umumiy' : 'Overview'), title, filtered, buildAbcInsights(filtered));

    // One extra sheet per recognized section (Bar/Kitchen/Bakery/Desserts),
    // but only if that section actually has items in the current view —
    // a tenant without a bakery just won't get a Bakery sheet.
    for (const section of ABC_SECTIONS) {
      const sectionItems = filtered.filter(i => sectionOf(i.cat)?.id === section.id);
      if (sectionItems.length === 0) continue;
      const sectionTitle = `${title} — ${tr(lang, section.label.ru, section.label.en, section.label.uz)}`;
      writeAbcSheet(wb, tr(lang, section.label.ru, section.label.en, section.label.uz), sectionTitle, sectionItems, buildAbcInsights(sectionItems));
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TRACE-abc-analysis-${dateStamp}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePdf = async () => {
    const { rangeLabel, generated, dateStamp } = abcMeta();
    const insights = buildAbcInsights();
    const title = ru ? 'ABC-анализ меню' : isUz ? 'Menyu ABC tahlili' : 'Menu ABC Analysis';

    const { registerCyrillicFont } = await import('../../lib/pdfFonts');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    registerCyrillicFont(doc);
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...BRAND_RGB);
    doc.text(title, 32, 32);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`${ru ? 'Период' : isUz ? 'Davr' : 'Period'}: ${rangeLabel}  ·  ${ru ? 'Создано' : isUz ? 'Yaratildi' : 'Generated'}: ${generated}`, 32, 47);

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30);
    doc.text(ru ? 'Ключевые выводы' : isUz ? 'Asosiy xulosalar' : 'Key insights', 32, 68);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60);
    let y = 82;
    for (const line of insights) {
      const wrapped = doc.splitTextToSize(`•  ${line}`, pageW - 64);
      doc.text(wrapped, 32, y);
      y += wrapped.length * 11 + 4;
    }
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [[
        '#', ru ? 'Блюдо' : isUz ? 'Taom' : 'Item', ru ? 'Категория' : isUz ? 'Kategoriya' : 'Category',
        ru ? 'Выручка' : isUz ? 'Tushum' : 'Revenue', '%',
        ru ? 'Кол-во' : isUz ? 'Soni' : 'Qty', ru ? 'Ср. цена' : isUz ? "O'rt. narx" : 'Avg price',
        ru ? 'Себест.' : isUz ? 'Tannarx' : 'Cost', ru ? 'Себест/шт' : isUz ? 'Tannarx/dona' : 'Cost/unit',
        ru ? 'Фудкост %' : 'Food cost %',
        ru ? 'В день' : isUz ? 'Kuniga' : '/day',
        ru ? 'К' : isUz ? 'S' : 'Q', ru ? 'В' : isUz ? 'T' : 'R', ru ? 'М' : isUz ? 'M' : 'M',
      ]],
      body: filtered.map((item, i) => [
        i + 1, item.name, item.cat,
        item.revenue.toLocaleString('ru-RU'), `${item.share}%`,
        item.qty, item.avgPrice.toLocaleString('ru-RU'),
        (item.cost ?? 0) > 0 ? (item.cost ?? 0).toLocaleString('ru-RU') : '—',
        item.costPerUnit != null ? item.costPerUnit.toLocaleString('ru-RU') : '—',
        item.foodCostPct != null ? `${item.foodCostPct}%` : '—',
        item.velocity,
        item.abcQty, item.abcRevenue, item.abcProfit,
      ]),
      styles: { font: 'Roboto', fontSize: 7.5, cellPadding: 4 },
      headStyles: { font: 'Roboto', fillColor: BRAND_RGB, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      columnStyles: {
        3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' },
        11: { halign: 'center' }, 12: { halign: 'center' }, 13: { halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && [11, 12, 13].includes(data.column.index)) {
          const grade = String(data.cell.raw) as 'A' | 'B' | 'C';
          if (GRADE_RGB[grade]) {
            data.cell.styles.fillColor = GRADE_RGB[grade];
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      didDrawPage: () => {
        const h = doc.internal.pageSize.getHeight();
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(abcFooterText(), 32, h - 18);
        doc.text(String(doc.getNumberOfPages()), pageW - 32, h - 18, { align: 'right' });
      },
    });

    doc.save(`TRACE-abc-analysis-${dateStamp}.pdf`);
  };

  return (
    <>
      {detailItem && (
        <DishDetailModal
          item={detailItem}
          allItems={items}
          lang={lang}
          timeRange={timeRange}
          isBasePlan={isBasePlan}
          onClose={() => setDetailItem(null)}
        />
      )}

      <Card
        title={ru ? 'ABC-анализ меню' : isUz ? 'Menyu ABC tahlili' : 'Menu ABC Analysis'}
        action={
          <div className="flex items-center gap-2">
            <div className="relative flex items-center gap-px border border-border rounded-xl overflow-visible bg-card">
              {ABC_TIME_RANGES.map(({ key, ru: rRu, en, uz }) => (
                <button key={key}
                  onClick={() => { setRange(key); setCustomRange(null); setCalendarOpen(false); }}
                  className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    range === key ? 'bg-primary text-white' : 'text-muted hover:text-text hover:bg-[#1a1a1a]'
                  }`}>
                  {tr(lang, rRu, en, uz)}
                </button>
              ))}
              {range === 'custom' && customRange && (
                <span className="px-2.5 py-1 text-[10px] font-medium bg-primary text-white">
                  {customRange.from.slice(5)} – {customRange.to.slice(5)}
                </span>
              )}
              <button
                ref={calendarBtnRef}
                onClick={() => setCalendarOpen(o => !o)}
                className={`px-2 py-1 transition-colors border-l border-border ${
                  calendarOpen || range === 'custom' ? 'text-primary' : 'text-muted hover:text-primary'
                }`}
              >
                <Calendar size={11} />
              </button>
              <DateRangePicker
                lang={lang}
                value={customRange}
                isOpen={calendarOpen}
                onClose={() => setCalendarOpen(false)}
                anchorRef={calendarBtnRef}
                onApply={(r) => { setCustomRange(r); setRange('custom'); setCalendarOpen(false); }}
                onClear={() => { setCustomRange(null); setRange('7days'); }}
              />
            </div>
            <div ref={colsBtnRef} className="relative">
              <button onClick={() => setColsOpen(o => !o)}
                className={`p-1.5 rounded-lg border transition-colors ${colsOpen ? 'border-primary text-primary' : 'border-border text-muted hover:text-text hover:bg-card-hover'}`}
                title={ru ? 'Столбцы' : isUz ? "Ustunlar" : 'Columns'}>
                <SlidersHorizontal size={13} />
              </button>
              {colsOpen && (
                <div className="absolute right-0 z-30 mt-2 w-[180px] bg-card border border-border rounded-xl shadow-xl p-2">
                  <p className="text-[10px] text-muted px-1.5 pt-0.5 pb-1.5">{ru ? 'Показывать столбцы' : isUz ? "Ustunlarni ko'rsatish" : 'Show columns'}</p>
                  {([
                    { id: 'cat' as const, ru: 'Категория', en: 'Category', uz: 'Kategoriya' },
                    { id: 'avgPrice' as const, ru: 'Ср. цена', en: 'Avg price', uz: "O'rt. narx" },
                    { id: 'cost' as const, ru: 'Себест.', en: 'Cost', uz: 'Tannarx' },
                    { id: 'costPerUnit' as const, ru: 'Себест/шт', en: 'Cost/unit', uz: 'Tannarx/dona' },
                    { id: 'foodCostPct' as const, ru: 'Фудкост %', en: 'Food cost %', uz: 'Food cost %' },
                    { id: 'marginPct' as const, ru: 'Маржа', en: 'Margin', uz: 'Marja' },
                    { id: 'velocity' as const, ru: 'В день', en: '/day', uz: 'Kuniga' },
                  ]).map(c => (
                    <label key={c.id} className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-card-hover cursor-pointer">
                      <input type="checkbox" checked={visibleCols[c.id]} onChange={() => toggleCol(c.id)} className="accent-primary" />
                      <span className="text-[11.5px] text-text">{tr(lang, c.ru, c.en, c.uz)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div ref={catsBtnRef} className="relative">
              <button onClick={() => setCatsOpen(o => !o)}
                className={`p-1.5 rounded-lg border transition-colors ${catsOpen ? 'border-primary text-primary' : 'border-border text-muted hover:text-text hover:bg-card-hover'}`}
                title={ru ? 'Категории' : isUz ? 'Kategoriyalar' : 'Categories'}>
                <Tags size={13} />
              </button>
              {catsOpen && (
                <div className="absolute right-0 z-30 mt-2 w-[200px] max-h-[280px] overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-2">
                  <div className="flex items-center justify-between px-1.5 pt-0.5 pb-1.5">
                    <p className="text-[10px] text-muted">{ru ? 'Показывать категории' : isUz ? "Kategoriyalarni ko'rsatish" : 'Show categories'}</p>
                    {hiddenCats.size > 0 && (
                      <button onClick={() => setHiddenCats(new Set())} className="text-[9.5px] text-primary hover:text-primary-hover">
                        {ru ? 'Сброс' : isUz ? 'Bekor' : 'Reset'}
                      </button>
                    )}
                  </div>
                  {categories.filter(c => c !== 'all').map(cat => (
                    <label key={cat} className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-card-hover cursor-pointer">
                      <input type="checkbox" checked={!hiddenCats.has(cat)} onChange={() => toggleCat(cat)} className="accent-primary" />
                      <span className="text-[11.5px] text-text truncate">{cat}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div ref={downloadBtnRef} className="relative">
              <button onClick={() => setDownloadOpen(o => !o)}
                className={`p-1.5 rounded-lg border transition-colors ${downloadOpen ? 'border-primary text-primary' : 'border-border text-muted hover:text-text hover:bg-card-hover'}`}
                title={ru ? 'Скачать' : isUz ? 'Yuklab olish' : 'Download'}>
                <Download size={13} />
              </button>
              {downloadOpen && (
                <div className="absolute right-0 z-30 mt-2 w-[190px] bg-card border border-border rounded-xl shadow-xl p-1.5">
                  <button
                    onClick={() => { handleExcel(); setDownloadOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-card-hover text-left transition-colors">
                    <FileSpreadsheet size={14} className="text-success" />
                    <div>
                      <p className="text-[11.5px] text-text font-medium leading-tight">Excel</p>
                      <p className="text-[10px] text-muted leading-tight">.xlsx</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { handlePdf(); setDownloadOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-card-hover text-left transition-colors">
                    <FileText size={14} className="text-primary" />
                    <div>
                      <p className="text-[11.5px] text-text font-medium leading-tight">PDF</p>
                      <p className="text-[10px] text-muted leading-tight">.pdf</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      >
        <div className={`transition-opacity ${abcLoading ? 'opacity-40 pointer-events-none' : ''}`}>
        {/* Insight summary */}
        <div className="flex flex-wrap gap-3 mb-4 -mt-1">
          <div className="flex items-center gap-1.5 bg-success/8 border border-success/20 rounded-lg px-2.5 py-1.5">
            <span className="text-success text-[11px] font-bold">{aCount}</span>
            <span className="text-[10px] text-muted">{ru ? 'блюд = 70% выручки' : isUz ? "taom = tushumning 70%" : 'dishes = 70% revenue'}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-primary/8 border border-primary/20 rounded-lg px-2.5 py-1.5">
            <span className="text-primary text-[11px] font-bold">#1</span>
            <span className="text-[10px] text-muted truncate max-w-[140px]">{items[0]?.name}</span>
            <span className="text-[10px] text-primary font-bold">{topShare}%</span>
          </div>
          {deadWeight > 0 && (
            <div className="flex items-center gap-1.5 bg-[#1e1e1e] border border-border rounded-lg px-2.5 py-1.5">
              <span className="text-[10px] text-muted">{deadWeight} {ru ? 'аутсайдеров (<0.5/день)' : isUz ? 'avtsayder (<0.5/kun)' : 'dead weight (<0.5/day)'}</span>
            </div>
          )}
        </div>

        {/* AI menu analysis — whole-menu insight, not just per-dish */}
        {!isBasePlan && (
          <div className="mb-4 p-3 rounded-xl border border-primary/20 bg-primary/5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-primary" />
                <p className="text-[11px] font-medium text-text">{ru ? 'AI-анализ меню' : isUz ? 'Menyu AI tahlili' : 'AI menu analysis'}</p>
              </div>
              {!menuAiLoading && (
                <button onClick={runMenuAi} className="text-[11px] text-primary hover:text-primary-hover transition-colors">
                  {menuAiText ? tr(lang, 'Обновить', 'Refresh', 'Yangilash') : tr(lang, 'Анализировать', 'Analyze', 'Tahlil qilish')}
                </button>
              )}
            </div>
            {menuAiLoading ? (
              <div className="space-y-2 animate-pulse mt-2">
                <div className="h-2.5 bg-primary/10 rounded w-full" />
                <div className="h-2.5 bg-primary/10 rounded w-4/5" />
                <div className="h-2.5 bg-primary/10 rounded w-3/5" />
              </div>
            ) : menuAiError ? (
              <p className="text-[12px] text-danger mt-1">{ru ? 'Ошибка AI. Попробуйте ещё раз.' : isUz ? 'AI xatosi. Qayta urining.' : 'AI error. Try again.'}</p>
            ) : menuAiText ? (
              <p className="text-[12px] text-muted leading-relaxed mt-1 whitespace-pre-line">{menuAiText}</p>
            ) : (
              <p className="text-[11px] text-muted/60 mt-1">{ru ? 'Общий разбор всего меню — что убрать, что продвигать, где аномалии по марже' : isUz ? "Butun menyu bo'yicha umumiy tahlil" : 'Whole-menu breakdown — what to cut, promote, or investigate for margin anomalies'}</p>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
            {(['all', 'A', 'B', 'C'] as AbcFilter[]).map(f => (
              <button key={f} onClick={() => { setAbcFilter(f); setPage(10); }}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-[3px] transition-all ${abcFilter === f
                  ? f === 'A' ? 'bg-success text-white' : f === 'B' ? 'bg-amber-400 text-black' : f === 'C' ? 'bg-[#444] text-white' : 'bg-card-hover text-text'
                  : 'text-muted hover:text-text'}`}>
                {f === 'all' ? (ru ? 'Все' : isUz ? 'Hammasi' : 'All') : f}
              </button>
            ))}
          </div>
          {/* Metric selector for filter */}
          <select value={abcMetric} onChange={e => { setAbcMetric(e.target.value as AbcMetric); setPage(10); }}
            className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-muted focus:outline-none focus:border-primary transition-colors cursor-pointer">
            {METRIC_OPTS.map(o => <option key={o.id} value={o.id}>{tr(lang, o.labelRu, o.labelEn, o.labelUz)}</option>)}
          </select>
          <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(10); }}
            className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-muted focus:outline-none focus:border-primary transition-colors cursor-pointer">
            {categories.map(c => <option key={c} value={c}>{c === 'all' ? (ru ? 'Все категории' : isUz ? 'Barcha kategoriyalar' : 'All categories') : c}</option>)}
          </select>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(10); }}
              placeholder={ru ? 'Поиск блюда...' : isUz ? 'Taom qidirish...' : 'Search dish...'}
              className="bg-background border border-border rounded-lg pl-2.5 pr-7 py-1.5 text-[11px] text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors w-[160px]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-text">
                <X size={12} />
              </button>
            )}
          </div>
          <span className="text-[10px] text-muted ml-auto">{filtered.length} {ru ? 'позиций' : isUz ? 'pozitsiya' : 'items'}</span>
        </div>

        {/* Mobile scroll hint */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted mb-2 sm:hidden">
          <ArrowLeftRight size={11} className="opacity-60" />
          <span>{ru ? 'Прокрутите таблицу в сторону, чтобы увидеть больше' : isUz ? "Ko'proq korish uchun jadvalni yon tomonga suring" : 'Scroll the table sideways to see more'}</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[960px]">
            <thead className="border-b border-border">
              <tr>
                <th className="pb-2.5 pr-3 text-[10px] text-muted font-medium w-6">#</th>
                <th className="pb-2.5 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium">{ru ? 'Блюдо' : isUz ? 'Taom' : 'Item'}</th>
                {visibleCols.cat && <th className="pb-2.5 pr-4 text-[10px] uppercase tracking-[0.15em] text-muted font-medium hidden sm:table-cell">{ru ? 'Категория' : isUz ? 'Kategoriya' : 'Category'}</th>}
                <th className="pb-2.5 pr-4"><SortBtn col="revenue" label={ru ? 'Выручка' : isUz ? 'Tushum' : 'Revenue'} /></th>
                <th className="pb-2.5 pr-4"><SortBtn col="share" label="%" /></th>
                <th className="pb-2.5 pr-4"><SortBtn col="qty" label={ru ? 'Кол-во' : isUz ? 'Soni' : 'Qty'} /></th>
                {visibleCols.avgPrice && <th className="pb-2.5 pr-4"><SortBtn col="avgPrice" label={ru ? 'Ср. цена' : isUz ? "O'rt. narx" : 'Avg price'} /></th>}
                {visibleCols.cost && <th className="pb-2.5 pr-4"><SortBtn col="cost" label={ru ? 'Себест.' : isUz ? 'Tannarx' : 'Cost'} /></th>}
                {visibleCols.costPerUnit && <th className="pb-2.5 pr-4"><SortBtn col="costPerUnit" label={ru ? 'Себест/шт' : isUz ? 'Tannarx/dona' : 'Cost/unit'} /></th>}
                {visibleCols.foodCostPct && <th className="pb-2.5 pr-4"><SortBtn col="foodCostPct" label={ru ? 'Фудкост %' : 'Food cost %'} /></th>}
                {visibleCols.marginPct && <th className="pb-2.5 pr-4"><SortBtn col="marginPct" label={ru ? 'Маржа' : isUz ? 'Marja' : 'Margin'} /></th>}
                {visibleCols.velocity && <th className="pb-2.5 pr-4"><SortBtn col="velocity" label={ru ? 'В день' : isUz ? 'Kuniga' : '/day'} /></th>}
                <th className="pb-2.5 pr-4 text-[10px] uppercase tracking-[0.12em] text-muted font-medium" title={ru ? 'Кол-во / Выручка / Маржа' : isUz ? 'Soni / Tushum / Marja' : 'Qty / Revenue / Margin'}>
                  ABC К·В·М
                </th>
                <th className="pb-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, page).map((item, i) => {
                return (
                  <tr key={item.name + item.cat} onClick={() => setDetailItem(item)}
                    className="border-b border-border last:border-0 hover:bg-card-hover transition-colors group cursor-pointer">
                    <td className="py-2.5 pr-3 text-[11px] text-muted metric-number">{i + 1}</td>
                    <td className="py-2.5 pr-4 max-w-[160px]">
                      <p className="text-[12px] font-medium text-text truncate">{item.name}</p>
                    </td>
                    {visibleCols.cat && <td className="py-2.5 pr-4 text-[11px] text-muted hidden sm:table-cell">{item.cat}</td>}
                    <td className="py-2.5 pr-4 text-[12px] font-semibold text-text metric-number">{item.revenue.toLocaleString('ru-RU')}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-10 h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(item.share * 3, 100)}%` }} />
                        </div>
                        <span className="text-[11px] text-muted metric-number">{item.share}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-[12px] text-text metric-number">{item.qty}</td>
                    {visibleCols.avgPrice && <td className="py-2.5 pr-4 text-[12px] text-muted metric-number">{item.avgPrice.toLocaleString('ru-RU')}</td>}
                    {visibleCols.cost && <td className="py-2.5 pr-4 text-[12px] text-muted metric-number">{(item.cost ?? 0) > 0 ? (item.cost ?? 0).toLocaleString('ru-RU') : '—'}</td>}
                    {visibleCols.costPerUnit && <td className="py-2.5 pr-4 text-[12px] text-muted metric-number">{item.costPerUnit != null ? item.costPerUnit.toLocaleString('ru-RU') : '—'}</td>}
                    {visibleCols.foodCostPct && (
                      <td className={`py-2.5 pr-4 text-[12px] font-semibold metric-number ${
                        item.foodCostPct == null ? 'text-muted' : item.foodCostPct <= 30 ? 'text-success' : item.foodCostPct <= 40 ? 'text-text' : 'text-danger'
                      }`}>
                        {item.foodCostPct != null ? item.foodCostPct + '%' : '—'}
                      </td>
                    )}
                    {visibleCols.marginPct && <td className="py-2.5 pr-4 text-[12px] text-muted metric-number">{item.marginPct != null ? item.marginPct + '%' : '—'}</td>}
                    {visibleCols.velocity && <td className="py-2.5 pr-4 text-[12px] text-muted metric-number">{item.velocity}</td>}
                    {/* 3 ABC badges */}
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1">
                        {([item.abcQty, item.abcRevenue, item.abcProfit] as const).map((g, gi) => (
                          <span key={gi} className={`px-1.5 py-0.5 rounded-[3px] text-[10px] font-black ${abcBadgeCls(g)}`}>{g}</span>
                        ))}
                      </div>
                    </td>
                    {/* Details button */}
                    <td className="py-2.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-[10px] font-medium text-muted hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all whitespace-nowrap"
                      >
                        <ExternalLink size={11} />
                        {ru ? 'Детали' : isUz ? 'Batafsil' : 'Details'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length > page && (
          <button onClick={() => setPage(p => p + 10)}
            className="mt-3 w-full py-2 text-[11px] font-medium text-muted hover:text-text border border-border hover:border-primary/40 rounded-lg transition-all">
            {ru ? `Показать ещё (${filtered.length - page})` : isUz ? `Ko'proq ko'rsat (${filtered.length - page})` : `Show more (${filtered.length - page})`}
          </button>
        )}
        </div>
      </Card>
    </>
  );
};

// ── Menu Engineering Matrix ───────────────────────────────────────────────────

type Quadrant = 'star' | 'cashcow' | 'question' | 'dog';

interface MatrixItem extends AbcRow {
  x: number;
  y: number;
  quadrant: Quadrant;
}

const QUADRANT_CFG: Record<Quadrant, { label: string; labelRu: string; labelUz: string; color: string; action: string; actionRu: string; actionUz: string; dot: string }> = {
  star:     { label: 'Stars',          labelRu: 'Звёзды',          labelUz: 'Yulduzlar',     color: '#22c55e', action: 'Optimize cost, protect margin',  actionRu: 'Оптимизируй себест., держи позицию', actionUz: "Tannarxni optimallashtir, marjani saqla", dot: '#22c55e' },
  cashcow:  { label: 'Cash Cows',      labelRu: 'Рабочие лошадки', labelUz: 'Sut sigirlar',  color: '#3b82f6', action: 'Raise price 8–12%',             actionRu: 'Подними цену на 8–12%',              actionUz: 'Narxni 8–12% oshir',                       dot: '#3b82f6' },
  question: { label: 'Question Marks', labelRu: 'Вопросы',         labelUz: 'Savollar',      color: '#f59e0b', action: 'Promote or bundle',             actionRu: 'Продвигай или добавь в бандл',        actionUz: "Targ'ib qil yoki bandlga qo'sh",          dot: '#f59e0b' },
  dog:      { label: 'Dogs',           labelRu: 'Аутсайдеры',      labelUz: 'Avtsayderlar',  color: '#6b7280', action: 'Remove or rework',              actionRu: 'Убери или переработай',              actionUz: 'Olib tashla yoki qayta ishla',             dot: '#6b7280' },
};

function buildMatrixItems(items: AbcRow[]): MatrixItem[] {
  const n = items.length;
  if (n === 0) return [];
  const sQ = [...items].sort((a, b) => a.qty - b.qty);
  // Y-axis is profitability (margin %), not price — this is the standard
  // menu-engineering matrix (Kasavana/Smith): popularity × contribution
  // margin. Using avgPrice here would put a high-priced, low-margin dish
  // in "Star" and a cheap, high-margin one in "Dog", which is backwards —
  // exactly the kind of item the matrix (and the AI insight built on it)
  // is supposed to catch. Only fall back to avgPrice when there's no cost
  // data at all, matching the same fallback used by the server-side
  // abcProfit grade.
  const hasCostData = items.some(it => it.marginPct != null);
  const sP = hasCostData
    ? [...items].sort((a, b) => (a.marginPct ?? -Infinity) - (b.marginPct ?? -Infinity))
    : [...items].sort((a, b) => a.avgPrice - b.avgPrice);
  const qMap = new Map(sQ.map((it, i) => [`${it.name}|${it.cat}`, n > 1 ? (i / (n - 1)) * 100 : 50]));
  const pMap = new Map(sP.map((it, i) => [`${it.name}|${it.cat}`, n > 1 ? (i / (n - 1)) * 100 : 50]));
  return items.map(it => {
    const x = qMap.get(`${it.name}|${it.cat}`) ?? 50;
    const y = pMap.get(`${it.name}|${it.cat}`) ?? 50;
    const quadrant: Quadrant =
      x >= 50 && y >= 50 ? 'star'
      : x < 50 && y >= 50 ? 'question'
      : x >= 50 && y < 50 ? 'cashcow'
      : 'dog';
    return { ...it, x, y, quadrant };
  });
}

const MenuMatrixCard: React.FC<{ items: AbcRow[]; lang: Language }> = ({ items, lang }) => {
  const ru = lang === 'ru';
  const isUz = lang === 'uz';
  const [selected, setSelected] = useState<MatrixItem | null>(null);

  const matrix = useMemo(() => buildMatrixItems(items), [items]);

  const byQuadrant = useMemo(() => {
    const m: Record<Quadrant, MatrixItem[]> = { star: [], cashcow: [], question: [], dog: [] };
    for (const it of matrix) m[it.quadrant].push(it);
    for (const q of Object.keys(m) as Quadrant[]) m[q].sort((a, b) => b.revenue - a.revenue);
    return m;
  }, [matrix]);

  // Price opportunities: cash cows can raise price → specific UZS/month
  const priceOps = useMemo(() =>
    byQuadrant.cashcow
      .map(it => ({
        ...it,
        suggestedPrice: Math.round(it.avgPrice * 1.10),
        monthlyGain:    Math.round(it.avgPrice * 0.10 * it.velocity * 30),
      }))
      .filter(it => it.monthlyGain > 0)
      .sort((a, b) => b.monthlyGain - a.monthlyGain)
      .slice(0, 4),
  [byQuadrant]);

  const totalOpsGain = priceOps.reduce((s, o) => s + o.monthlyGain, 0);

  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000   ? `${Math.round(n / 1_000)}K`
    : String(Math.round(n));

  // Split matrix data by quadrant for coloured scatter series
  const scatterByQ = useMemo(() => {
    const groups: Record<Quadrant, { x: number; y: number; name: string; revenue: number }[]> = { star: [], cashcow: [], question: [], dog: [] };
    for (const it of matrix) groups[it.quadrant].push({ x: it.x, y: it.y, name: it.name, revenue: it.revenue });
    return groups;
  }, [matrix]);

  return (
    <Card title={ru ? 'Матрица меню' : isUz ? 'Menyu matritsasi' : 'Menu Engineering Matrix'}>
      <p className="text-[10px] text-muted -mt-1 mb-5">
        {ru
          ? 'X = рейтинг продаж · Y = рейтинг маржи · нажми на точку'
          : isUz
          ? "X = sotuv reytingi · Y = marja reytingi · nuqtani bos"
          : 'X = sales rank · Y = margin rank · click any dot'}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Scatter plot ── */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="relative flex-1 min-h-[400px]">
            {/* Quadrant labels */}
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="absolute top-2 left-3 text-[10px] leading-tight">
                <p className="font-semibold text-amber-400/70">{ru ? 'Вопросы' : isUz ? 'Savollar' : 'Questions'}</p>
                <p className="text-muted/50 text-[9px]">{ru ? 'Продвигай' : isUz ? "Targ'ib qil" : 'Promote'}</p>
              </div>
              <div className="absolute top-2 right-3 text-right text-[10px] leading-tight">
                <p className="font-semibold text-success/80">{ru ? 'Звёзды' : isUz ? 'Yulduzlar' : 'Stars'}</p>
                <p className="text-muted/50 text-[9px]">{ru ? 'Оптимизируй' : isUz ? 'Optimallashtir' : 'Optimize'}</p>
              </div>
              <div className="absolute bottom-8 left-3 text-[10px] leading-tight">
                <p className="font-semibold text-[#6b7280]/70">{ru ? 'Аутсайдеры' : isUz ? 'Avtsayderlar' : 'Dogs'}</p>
                <p className="text-muted/50 text-[9px]">{ru ? 'Убирай' : isUz ? 'Olib tashla' : 'Remove'}</p>
              </div>
              <div className="absolute bottom-8 right-3 text-right text-[10px] leading-tight">
                <p className="font-semibold text-blue-400/80">{ru ? 'Лошадки' : isUz ? 'Sut sigirlar' : 'Cash Cows'}</p>
                <p className="text-muted/50 text-[9px]">{ru ? 'Подними цену' : isUz ? 'Narxni oshir' : 'Raise price'}</p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 24, right: 24, left: 0, bottom: 28 }}>
                <XAxis type="number" dataKey="x" domain={[0, 100]} hide />
                <YAxis type="number" dataKey="y" domain={[0, 100]} hide />
                <ZAxis range={[32, 32]} />
                <ReferenceLine x={50} stroke="#2a2a2a" strokeDasharray="4 4" />
                <ReferenceLine y={50} stroke="#2a2a2a" strokeDasharray="4 4" />
                <Tooltip
                  cursor={false}
                  content={(p: any) => {
                    const d = p.payload?.[0]?.payload;
                    if (!d) return null;
                    return (
                      <div className="bg-card border border-border rounded-lg px-3 py-2 text-[11px] text-text shadow-xl max-w-[180px]">
                        <p className="font-semibold truncate">{d.name}</p>
                        <p className="text-muted text-[10px] mt-0.5">{fmt(d.revenue)} UZS</p>
                      </div>
                    );
                  }}
                />
                {(Object.entries(scatterByQ) as [Quadrant, any[]][]).map(([q, data]) => (
                  <Scatter
                    key={q}
                    data={data}
                    fill={QUADRANT_CFG[q].dot}
                    opacity={0.85}
                    onClick={(d: any) => {
                      const hit = matrix.find(it => it.name === d.name);
                      setSelected(hit ?? null);
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
                {/* Selected dot highlight */}
                {selected && (
                  <Scatter
                    data={[{ x: selected.x, y: selected.y, name: selected.name, revenue: selected.revenue }]}
                    fill="#ffffff"
                    stroke={QUADRANT_CFG[selected.quadrant].dot}
                    strokeWidth={2}
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Quadrant legend */}
          <div className="flex flex-wrap gap-3 mt-1">
            {(Object.entries(QUADRANT_CFG) as [Quadrant, typeof QUADRANT_CFG[Quadrant]][]).map(([q, cfg]) => (
              <div key={q} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
                <span className="text-[10px] text-muted">{tr(lang, cfg.labelRu, cfg.label, cfg.labelUz)}</span>
                <span className="text-[10px] text-muted/40">({byQuadrant[q].length})</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="space-y-4">

          {/* Selected dish detail */}
          {selected ? (
            <div className="p-4 bg-background border border-border rounded-md">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-text truncate">{selected.name}</p>
                  <p className="text-[10px] text-muted mt-0.5">{selected.cat}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-muted hover:text-text flex-shrink-0 mt-0.5">
                  <X size={13} />
                </button>
              </div>

              {/* Quadrant badge */}
              <div
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg mb-3"
                style={{ backgroundColor: `${QUADRANT_CFG[selected.quadrant].dot}18`, border: `1px solid ${QUADRANT_CFG[selected.quadrant].dot}40` }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: QUADRANT_CFG[selected.quadrant].dot }} />
                <span className="text-[10px] font-semibold" style={{ color: QUADRANT_CFG[selected.quadrant].dot }}>
                  {tr(lang, QUADRANT_CFG[selected.quadrant].labelRu, QUADRANT_CFG[selected.quadrant].label, QUADRANT_CFG[selected.quadrant].labelUz)}
                </span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: ru ? 'Выручка' : isUz ? 'Tushum' : 'Revenue', value: `${fmt(selected.revenue)} UZS` },
                  { label: ru ? 'Продаж/день' : isUz ? 'Sotuv/kun' : 'Sales/day', value: String(selected.velocity) },
                  { label: ru ? 'Ср. цена' : isUz ? "O'rt. narx" : 'Avg price', value: `${fmt(selected.avgPrice)} UZS` },
                  { label: 'ABC', value: `${selected.abcRevenue}·${selected.abcQty}·${selected.abcProfit}` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-card rounded-lg px-2.5 py-2">
                    <p className="text-[9px] text-muted/70 uppercase tracking-[0.12em]">{label}</p>
                    <p className="text-[12px] font-semibold text-text metric-number mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {/* Recommendation */}
              <div className="bg-card rounded-lg p-2.5">
                <p className="text-[9px] uppercase tracking-[0.15em] text-muted mb-1">{ru ? 'Рекомендация' : isUz ? 'Tavsiya' : 'Action'}</p>
                <p className="text-[11px] text-text leading-relaxed">
                  {tr(lang, QUADRANT_CFG[selected.quadrant].actionRu, QUADRANT_CFG[selected.quadrant].action, QUADRANT_CFG[selected.quadrant].actionUz)}
                </p>
                {selected.quadrant === 'cashcow' && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-[11px] text-success font-semibold">
                      {fmt(selected.avgPrice)} → {fmt(Math.round(selected.avgPrice * 1.10))} UZS
                    </p>
                    <p className="text-[10px] text-muted">
                      +{fmt(Math.round(selected.avgPrice * 0.10 * selected.velocity * 30))} {ru ? 'UZS / мес' : isUz ? 'UZS / oy' : 'UZS / mo'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Quadrant summary when nothing selected */
            <div className="space-y-2">
              {(Object.entries(QUADRANT_CFG) as [Quadrant, typeof QUADRANT_CFG[Quadrant]][]).map(([q, cfg]) => (
                <div
                  key={q}
                  className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-card-hover transition-colors"
                  style={{ borderColor: `${cfg.dot}30` }}
                  onClick={() => byQuadrant[q][0] && setSelected(byQuadrant[q][0])}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-text">{tr(lang, cfg.labelRu, cfg.label, cfg.labelUz)}</p>
                      {byQuadrant[q][0] && (
                        <p className="text-[9px] text-muted truncate">{byQuadrant[q][0].name}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[13px] font-bold text-muted ml-2 flex-shrink-0">{byQuadrant[q].length}</span>
                </div>
              ))}
            </div>
          )}

          {/* Price opportunities */}
          {priceOps.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-medium">
                  {ru ? 'Рост цены → прибыль' : isUz ? 'Narx oshishi → foyda' : 'Price → profit'}
                </p>
                {totalOpsGain > 0 && (
                  <span className="text-[10px] font-bold text-success">+{fmt(totalOpsGain)} {ru ? '/ мес' : isUz ? '/ oy' : '/ mo'}</span>
                )}
              </div>
              <div className="space-y-2">
                {priceOps.map(op => (
                  <div key={op.name} className="p-3 bg-background border border-border rounded-lg hover:bg-card-hover transition-colors cursor-pointer" onClick={() => setSelected(op)}>
                    <p className="text-[11px] font-medium text-text truncate mb-1">{op.name}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted">
                        {fmt(op.avgPrice)} → <span className="text-text font-semibold">{fmt(op.suggestedPrice)}</span> UZS
                      </p>
                      <p className="text-[11px] font-bold text-success">+{fmt(op.monthlyGain)}/мес</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

type ChartMetric = 'revenue' | 'visitors' | 'avgCheck';

const METRIC_CFG: Record<ChartMetric, { color: string; gradId: string; gradColor: string }> = {
  revenue:  { color: '#ff6b35', gradId: 'gSalesRev',  gradColor: '#ff6b35' },
  visitors: { color: '#3b82f6', gradId: 'gSalesVis',  gradColor: '#3b82f6' },
  avgCheck: { color: '#22c55e', gradId: 'gSalesAvg',  gradColor: '#22c55e' },
};

export const Sales: React.FC<{ lang: Language; onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void; branch?: string | null; onContextReady?: (ctx: string) => void }> = ({ lang, onShowToast, branch, onContextReady }) => {
  const t = TRANSLATIONS[lang];
  const isBasePlan = getTenantPlan() === 'base';
  // Price elasticity / combo suggestions / guest return are all 100%
  // iiko OLAP-backed (ai.ts price-elasticity/combo-suggestions/guest-return
  // all guard on tenant.iiko_server) — for Poster tenants they silently
  // no-op (button click never populates a result) instead of being hidden.
  // Building real Poster equivalents is separate, larger work; hide for now.
  const [isPoster, setIsPoster] = useState(false);
  useEffect(() => { traceApi.sales.status().then(s => setIsPoster(!!s.poster)).catch(() => {}); }, []);
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [dishes, setDishes] = useState<any[]>([]);
  const [dishesVisible, setDishesVisible] = useState(10);
  const [activeMetric, setActiveMetric] = useState<ChartMetric>('revenue');
  const [comparison, setComparison] = useState<ComparisonPeriod>('yesterday');
  const [iikoRevenue, setIikoRevenue] = useState<RevenueRow[]>([]);
  const [iikoHourly, setIikoHourly] = useState<HourlyRow[]>([]);
  const [iikoTopDishes, setIikoTopDishes] = useState<DishRow[]>([]);
  const [iikoCategoryPerf, setIikoCategoryPerf] = useState<CategoryPerfRow[]>([]);
  const [iikoAbc, setIikoAbc] = useState<AbcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [guestReturn, setGuestReturn] = useState<{ weeklyRetentionPct?: number; isRealRetentionData?: boolean; returnProbability7d?: number | null; audienceType?: string; insight?: string; avgGuestsPerDay?: number; peakDowName?: string } | null>(null);

  // Realtime accumulators (today only, from plugin)
  const [rtHourly, setRtHourly] = useState<Map<number, number>>(new Map());
  const [rtDishes, setRtDishes] = useState<Map<string, { orders: number; revenue: number }>>(new Map());
  const [rtCategories, setRtCategories] = useState<Map<string, number>>(new Map());

  const wsUrl = import.meta.env.VITE_BACKEND_WS_URL as string | undefined;

  useEffect(() => {
    setRtHourly(new Map());
    setRtDishes(new Map());
    setRtCategories(new Map());
  }, [timeRange, branch]);

  // Fetch real iiko revenue data
  // For "today": fetch 7 days so the trend chart has context, not just 1 point
  // Refresh the hourly chart every 5 minutes while viewing today
  useEffect(() => {
    if (timeRange !== 'today') return;
    const id = setInterval(() => {
      traceApi.sales.hourly().then(setIikoHourly).catch(() => {});
    }, 300_000);
    return () => clearInterval(id);
  }, [timeRange]);

  useEffect(() => {
    setLoading(true);
    const isCustom = timeRange === 'custom' && customRange;
    const rangeKey = (timeRange === 'custom' ? '7days' : timeRange) as 'today' | '7days' | '30days';
    const chartRange = timeRange === '30days' ? '30days' : '7days';
    Promise.all([
      isCustom ? traceApi.sales.revenue('custom', customRange.from, customRange.to) : traceApi.sales.revenue(chartRange),
      timeRange === 'today' ? traceApi.sales.hourly() : Promise.resolve([]),
      isCustom ? traceApi.sales.topDishes('custom', 50, customRange.from, customRange.to) : traceApi.sales.topDishes(rangeKey, 50),
      isCustom ? traceApi.sales.categoryPerf('custom', customRange.from, customRange.to) : traceApi.sales.categoryPerf(rangeKey),
      isCustom ? traceApi.sales.abc('custom', customRange.from, customRange.to) : traceApi.sales.abc(rangeKey),
    ])
      .then(([rev, hourly, dishes, catPerf, abc]) => {
        setIikoRevenue(rev);
        setIikoHourly(hourly);
        setIikoTopDishes(dishes);
        setIikoCategoryPerf(catPerf);
        setIikoAbc(abc);
        if (onContextReady && rev.length > 0) {
          const totalRev = rev.reduce((s: number, r: any) => s + r.revenue, 0);
          const totalOrd = rev.reduce((s: number, r: any) => s + r.orders, 0);
          const avgCheck = totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0;
          const fmt = (n: number) => n.toLocaleString('ru-RU');
          const revenueTable = rev.map((r: any) => `  ${r.date}: ${fmt(r.revenue)} UZS, ${r.orders} заказов`).join('\n');
          const dishList = dishes.map((d: any, i: number) => `  ${i + 1}. ${d.name} [${d.category}] — ${d.quantity} шт., ${fmt(d.revenue)} UZS`).join('\n');
          const catList = catPerf.map((c: any) => `  ${c.name}: ${fmt(c.revenue)} UZS (${c.pct.toFixed(1)}%), ${c.orders} заказов, ср.чек ${fmt(c.avgCheck)} UZS`).join('\n');
          const hourlyPeak = hourly.length > 0
            ? [...hourly].sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 3).map((h: any) => `${h.h} (${fmt(h.revenue)} UZS, ${h.orders} заказов)`).join(', ')
            : '';
          const fmtCostRow = (i: any) => {
            const parts: string[] = [];
            if (i.foodCostPct != null) parts.push(`фудкост ${i.foodCostPct}%`);
            if (i.marginPct != null) parts.push(`маржа ${i.marginPct}%`);
            if (i.costPerUnit != null) parts.push(`себест. ${fmt(i.costPerUnit)} UZS/шт`);
            return parts.length ? ` [${parts.join(', ')}]` : '';
          };
          const abcA = abc.filter((i: any) => i.abcRevenue === 'A').map((i: any) => `${i.name} (${fmt(i.revenue)} UZS, ${i.qty} шт.${fmtCostRow(i)})`).join('; ');
          const abcB = abc.filter((i: any) => i.abcRevenue === 'B').slice(0, 5).map((i: any) => `${i.name}${fmtCostRow(i)}`).join(', ');
          const abcC = abc.filter((i: any) => i.abcRevenue === 'C').slice(0, 5).map((i: any) => `${i.name}${fmtCostRow(i)}`).join(', ');
          const lowMarginItems = abc.filter((i: any) => i.marginPct != null && i.marginPct < 40).slice(0, 5).map((i: any) => `${i.name} (${i.marginPct}%)`).join(', ');
          const highMarginItems = abc.filter((i: any) => i.marginPct != null && i.marginPct >= 65).slice(0, 5).map((i: any) => `${i.name} (${i.marginPct}%)`).join(', ');
          onContextReady(
            `Раздел: Продажи\n` +
            `Период: ${timeRange}\n` +
            `Итого выручка: ${fmt(totalRev)} UZS | Заказов: ${totalOrd} | Средний чек: ${fmt(avgCheck)} UZS\n` +
            `\nВыручка по дням:\n${revenueTable}\n` +
            `\nТоп блюд:\n${dishList || '  нет данных'}\n` +
            `\nКатегории:\n${catList || '  нет данных'}\n` +
            (hourlyPeak ? `\nПиковые часы (сегодня): ${hourlyPeak}\n` : '') +
            `\nABC-анализ (включая себестоимость и маржу где доступно):\n` +
            `  Группа A (топ выручки): ${abcA || 'нет'}\n` +
            `  Группа B: ${abcB || 'нет'}\n` +
            `  Группа C (аутсайдеры): ${abcC || 'нет'}` +
            (lowMarginItems ? `\n  Низкая маржа (<40%): ${lowMarginItems}` : '') +
            (highMarginItems ? `\n  Высокая маржа (≥65%): ${highMarginItems}` : '')
          );
        }
      })
      .catch(err => console.error('[sales] fetch failed', err))
      .finally(() => setLoading(false));
  }, [timeRange, customRange, branch, onContextReady]);

  // Guest return probability — Pro only, user-triggered
  const [guestReturnLoading, setGuestReturnLoading] = useState(false);
  const fetchGuestReturn = () => {
    if (isBasePlan || guestReturnLoading) return;
    setGuestReturnLoading(true);
    traceApi.ai.guestReturn(lang)
      .then(r => { if (r.fromAI) setGuestReturn(r); })
      .catch(() => {})
      .finally(() => setGuestReturnLoading(false));
  };

  const [priceHints, setPriceHints] = useState<{ name: string; currentPrice: number; suggestedPrice: number; reasoning: string; promo?: string }[] | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const generatePriceHints = (force = false) => {
    setPriceLoading(true);
    traceApi.ai.priceElasticity(lang, force)
      .then(r => { if (r.fromAI && r.hints && r.hints.length > 0) setPriceHints(r.hints); })
      .catch(() => {}).finally(() => setPriceLoading(false));
  };

  const [combos, setCombos] = useState<{ items: string[]; reason: string; mechanic: string }[] | null>(null);
  const [combosLoading, setCombosLoading] = useState(false);
  const generateCombos = (force = false) => {
    setCombosLoading(true);
    traceApi.ai.comboSuggestions(lang, force)
      .then(r => { if (r.fromAI && r.combos && r.combos.length > 0) setCombos(r.combos); })
      .catch(() => {}).finally(() => setCombosLoading(false));
  };

  useRealtimeData({
    backendWsUrl: wsUrl ?? '',
    enabled: !!wsUrl && timeRange === 'today',
    onEvent: useCallback((event: RealtimeEvent) => {
      if (event.type !== 'order_closed') return;
      const d = event.data as any;
      const sum: number = d.sum ?? 0;
      const hour = new Date(event.timestamp).getHours();
      setRtHourly(prev => { const m = new Map(prev); m.set(hour, (m.get(hour) ?? 0) + sum); return m; });
      const items: any[] = d.items ?? [];
      setRtDishes(prev => {
        const m = new Map(prev);
        for (const item of items) {
          const name: string = item.name ?? 'Unknown';
          const e = m.get(name) ?? { orders: 0, revenue: 0 };
          m.set(name, { orders: e.orders + (item.quantity ?? 1), revenue: e.revenue + (item.sum ?? (item.price ?? 0) * (item.quantity ?? 1)) });
        }
        return m;
      });
      setRtCategories(prev => {
        const m = new Map(prev);
        for (const item of items) {
          const cat: string = item.category ?? 'Other';
          m.set(cat, (m.get(cat) ?? 0) + (item.sum ?? 0));
        }
        return m;
      });
    }, []),
  });

  const trendPcts = useMemo(() => dishes.map(() => Math.floor(Math.random() * 10) + 1), [dishes]);

  // Build chart data from iiko OLAP (real) or fall back to empty
  const enrichedData = useMemo(() => {
    if (iikoRevenue.length > 0) {
      return iikoRevenue.map(r => ({
        name: r.date.slice(5), // "MM-DD"
        revenue: r.revenue,
        visitors: r.orders,
        avgCheck: r.orders > 0 ? Math.round(r.revenue / r.orders) : 0,
      }));
    }
    return chartData.map(d => ({
      ...d,
      avgCheck: (d.visitors ?? 0) > 0 ? Math.round(d.revenue / d.visitors) : 0,
    }));
  }, [iikoRevenue, chartData]);

  const COLORS = ['#ff6b35', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];

  // Categories: realtime plugin (today) > iiko OLAP > mock
  const categories = useMemo(() => {
    if (timeRange === 'today' && rtCategories.size > 0) {
      const total = Array.from(rtCategories.values()).reduce((s, v) => s + v, 0);
      return Array.from(rtCategories.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([name, revenue], i) => ({
          name, value: total > 0 ? Math.round((revenue / total) * 100) : 0,
          color: COLORS[i % 6],
        }));
    }
    if (iikoCategoryPerf.length > 0) {
      const total = iikoCategoryPerf.reduce((s, r) => s + r.revenue, 0);
      return iikoCategoryPerf.map((r, i) => ({
        name: r.name,
        value: total > 0 ? Math.round((r.revenue / total) * 100) : 0,
        color: COLORS[i % 6],
      }));
    }
    return [];
  }, [timeRange, rtCategories, iikoCategoryPerf]);

  const abcItems: AbcRow[] = iikoAbc.length > 0 ? iikoAbc : [];

  // Hourly: iiko OLAP covers the whole day — the live WS accumulator only has
  // events since page load, so it is a fallback, never an override.
  const hourlyRevenue = useMemo(() => {
    if (timeRange !== 'today') return [];
    if (iikoHourly.length > 0) {
      const rows = iikoHourly.filter(h => h.revenue > 0);
      if (rows.length > 0) return rows;
    }
    if (rtHourly.size > 0) {
      return Array.from({ length: 24 }, (_, h) => ({
        hour: h, h: `${h}:00`, revenue: rtHourly.get(h) ?? 0, orders: 0,
      })).filter(h => h.revenue > 0);
    }
    return [];
  }, [timeRange, rtHourly, iikoHourly]);

  useEffect(() => {
    if (timeRange === 'today' && rtDishes.size > 0) {
      // Plugin realtime takes priority for today
      const rtList = Array.from(rtDishes.entries())
        .map(([name, rt]) => ({ id: name, name, category: 'Other', price: rt.orders > 0 ? Math.round(rt.revenue / rt.orders) : 0, orders: rt.orders, revenue: rt.revenue }))
        .sort((a, b) => b.revenue - a.revenue);
      setDishes(rtList);
    } else if (iikoTopDishes.length > 0) {
      setDishes(iikoTopDishes.map(d => ({
        id: d.name,
        name: d.name,
        category: d.category,
        price: d.quantity > 0 ? Math.round(d.revenue / d.quantity) : 0,
        orders: d.quantity,
        revenue: d.revenue,
      })));
    } else {
      setDishes([]);
    }
    setDishesVisible(10);
  }, [timeRange, rtDishes, iikoTopDishes]);

  const cfg = METRIC_CFG[activeMetric];

  const metricFmt = (v: number) => {
    if (activeMetric === 'visitors') return String(v);
    return `${Math.round(v).toLocaleString('ru-RU')} UZS`;
  };

  const TIME_RANGES = [
    { key: 'today' as TimeRange, ru: 'Сегодня', en: 'Today', uz: 'Bugun' },
    { key: '7days' as TimeRange, ru: '7 дней', en: '7 days', uz: '7 kun' },
    { key: '30days' as TimeRange, ru: '30 дней', en: '30 days', uz: '30 kun' },
  ];

  if (loading) return <SalesSkeleton />;

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="font-display text-[22px] font-bold text-text tracking-tight">{t.sales}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex items-center gap-px border border-border rounded-xl overflow-visible bg-card">
            {TIME_RANGES.map(({ key, ru, en, uz }) => (
              <button
                key={key}
                onClick={() => { setLoading(true); setTimeRange(key); setCustomRange(null); setCalendarOpen(false); }}
                className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  timeRange === key ? 'bg-primary text-white' : 'text-muted hover:text-text hover:bg-[#1a1a1a]'
                }`}
              >
                {tr(lang, ru, en, uz)}
              </button>
            ))}
            {timeRange === 'custom' && customRange && (
              <span className="px-3 py-1.5 text-[11px] font-medium bg-primary text-white">
                {customRange.from.slice(5)} – {customRange.to.slice(5)}
              </span>
            )}
            <button
              ref={calendarBtnRef}
              onClick={() => setCalendarOpen(o => !o)}
              className={`px-2.5 py-1.5 transition-colors border-l border-border ${
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
              onApply={(range) => { setLoading(true); setCustomRange(range); setTimeRange('custom' as TimeRange); }}
              onClear={() => { setLoading(true); setCustomRange(null); setTimeRange('7days'); }}
            />
          </div>
          <ComparisonSelector lang={lang} value={comparison} onChange={setComparison} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        <div className="md:col-span-2 flex flex-col gap-4 self-stretch">
          <Card
            title={t.revenue_trend}
            action={
              <div className="flex gap-1">
                {(['revenue', 'visitors', 'avgCheck'] as ChartMetric[]).map((m) => {
                  const labels: Record<ChartMetric, string> = { revenue: t.revenue, visitors: t.orders, avgCheck: t.avg_check };
                  return (
                    <button
                      key={m}
                      onClick={() => setActiveMetric(m)}
                      className={`px-2.5 py-1 text-[10px] font-medium rounded-[3px] transition-colors ${
                        activeMetric === m ? 'text-white' : 'bg-card-hover text-muted hover:text-text border border-border'
                      }`}
                      style={activeMetric === m ? { backgroundColor: METRIC_CFG[m].color } : {}}
                    >
                      {labels[m]}
                    </button>
                  );
                })}
              </div>
            }
          >
            <div className="h-[200px] sm:h-[220px] md:h-[240px] mt-2">
              {loading ? (
                <div className="flex items-center justify-center h-full text-muted text-[12px]">
                  {tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={enrichedData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id={cfg.gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cfg.gradColor} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={cfg.gradColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="0" vertical={false} stroke="#1a1a1a" />
                  <XAxis dataKey="name" stroke="transparent" tick={{ fill: '#666', fontSize: 11, fontFamily: 'Onest' }} tickLine={false} axisLine={false} dy={4} />
                  <YAxis stroke="transparent" tick={{ fill: '#666', fontSize: 10, fontFamily: 'Onest' }} tickLine={false} axisLine={false} width={52}
                    domain={[(min: number) => Math.floor(min * 0.92), (max: number) => Math.ceil(max * 1.05)]}
                    allowDataOverflow={false}
                    tickFormatter={v => activeMetric === 'visitors' ? String(v) : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}K` : String(v)} />
                  <Tooltip
                    content={(p: any) => <ChartTooltip {...p} valueFormatter={metricFmt} />}
                    cursor={{ stroke: '#2a2a2a', strokeWidth: 1 }}
                  />
                  <Area
                    key={activeMetric}
                    type="monotone"
                    dataKey={activeMetric}
                    stroke={cfg.color}
                    strokeWidth={2}
                    fill={`url(#${cfg.gradId})`}
                    animationDuration={600}
                    dot={false}
                    activeDot={{ r: 4, fill: cfg.color, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card title={t.category_perf} className="flex flex-col flex-1">
            <p className="text-[10px] text-muted -mt-2 mb-3">
              {tr(lang, 'Доля выручки и средний чек по категориям', 'Revenue share and avg check by category', "Tushum ulushi va kategoriyalar bo'yicha o'rtacha chek")}
            </p>
            {iikoCategoryPerf.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-10">
                <p className="text-[12px] text-muted">{tr(lang, 'Нет данных', 'No data', "Ma'lumot yo'q")}</p>
              </div>
            ) : (
              <div className="space-y-2 flex-1">
                {iikoCategoryPerf.slice(0, 6).map((c, i) => (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="text-[10px] font-bold metric-number w-4 flex-shrink-0 text-center"
                      style={{ color: COLORS[i % 6] }}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-[12px] font-medium text-text truncate">{c.name}</span>
                        <span className="text-[10px] text-muted flex-shrink-0">
                          <span className="text-text font-semibold metric-number">{c.avgCheck.toLocaleString('ru-RU')}</span> UZS · {c.orders} {tr(lang, 'зак.', 'ord.', 'buyur.')}
                        </span>
                      </div>
                      <div className="h-[5px] bg-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(c.pct, 2)}%`, background: COLORS[i % 6] }} />
                      </div>
                    </div>
                    <span className="text-[11px] font-bold metric-number text-text w-9 text-right flex-shrink-0">{c.pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card title={t.top_selling}>
          <div className="space-y-1 mt-1">
            {dishes.length === 0 ? (
              <p className="text-[12px] text-muted py-6 text-center">{tr(lang, 'Нет данных', 'No data', "Ma'lumot yo'q")}</p>
            ) : dishes.slice(0, dishesVisible).map((dish, i) => (
              <div key={dish.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-border last:border-0 hover:bg-card-hover transition-colors rounded-[3px] px-1">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="metric-number text-[11px] text-muted w-4 flex-shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-text leading-none truncate">{dish.name}</p>
                    <p className="text-[10px] text-muted mt-0.5">{dish.orders} {t.orders}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="metric-number text-[12px] font-semibold text-primary">{dish.price.toLocaleString('ru-RU')} UZS</p>
                  <p className="text-[10px] text-muted">{dish.revenue.toLocaleString('ru-RU')}</p>
                </div>
              </div>
            ))}
          </div>
          {dishesVisible < dishes.length && (
            <button
              onClick={() => setDishesVisible(v => v + 10)}
              className="w-full mt-2 py-2 text-[11px] font-medium text-muted hover:text-text border border-border hover:border-primary/40 rounded-lg transition-all"
            >
              {tr(lang, `Показать больше (${dishes.length - dishesVisible})`, `Show more (${dishes.length - dishesVisible})`, `Ko'proq ko'rsatish (${dishes.length - dishesVisible})`)}
            </button>
          )}
          {dishesVisible > 10 && dishesVisible >= dishes.length && dishes.length > 10 && (
            <button
              onClick={() => setDishesVisible(10)}
              className="w-full mt-2 py-2 text-[11px] font-medium text-muted hover:text-text border border-border hover:border-primary/40 rounded-lg transition-all"
            >
              {tr(lang, 'Свернуть', 'Collapse', "Yig'ish")}
            </button>
          )}
        </Card>
      </div>

      {/* ── HOURLY REVENUE + CATEGORY PIE ── */}
      {(hourlyRevenue.length > 0 || categories.length > 0) && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title={t.hourly_revenue} className="lg:col-span-2">
          {hourlyRevenue.length === 0 ? (
            <ComingSoon lang={lang} />
          ) : (
          <>
          <div className="h-[180px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyRevenue} margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="0" vertical={false} stroke="#1a1a1a" />
                <XAxis dataKey="h" stroke="transparent" tick={{ fill: '#666', fontSize: 10, fontFamily: 'Onest' }} tickLine={false} axisLine={false} />
                <YAxis stroke="transparent" tick={{ fill: '#666', fontSize: 10, fontFamily: 'Onest' }} tickLine={false} axisLine={false} width={40} tickFormatter={v => v >= 1_000_000 ? `${Math.round(v / 1_000_000)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}K` : String(v)} />
                <Tooltip content={(p: any) => <ChartTooltip {...p} valueFormatter={(v) => `${Math.round(v).toLocaleString('ru-RU')} UZS`} />} cursor={{ fill: 'rgba(255,107,53,0.05)' }} />
                <Bar dataKey="revenue" radius={[2, 2, 0, 0]} animationDuration={800}>
                  {hourlyRevenue.map((d: any, i: number) => {
                    const max = Math.max(...hourlyRevenue.map((x: any) => x.revenue));
                    return <Cell key={i} fill={d.revenue >= max * 0.7 ? '#ff6b35' : d.revenue >= max * 0.35 ? '#ff6b3566' : '#2a2a2a'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-muted mt-2">
            {isPoster
              ? tr(lang, 'Оранжевый — пиковые часы · Poster реальное время', 'Orange — peak hours · Poster real-time', "Apelsin rang — chuqqi soatlar · Poster real vaqt")
              : tr(lang, 'Оранжевый — пиковые часы · iikoFront реальное время', 'Orange — peak hours · iikoFront real-time', "Apelsin rang — chuqqi soatlar · iikoFront real vaqt")}
          </p>
          </>
          )}
        </Card>

        <Card title={t.category_breakdown}>
          {categories.length === 0 ? (
            <p className="text-[12px] text-muted py-6 text-center">
              {tr(lang, 'Нет данных', 'No data', "Ma'lumot yo'q")}
            </p>
          ) : (
          <div className="flex items-center gap-4 mt-2">
            <div className="w-28 h-28 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categories} innerRadius={28} outerRadius={44} paddingAngle={3} dataKey="value" stroke="none" animationDuration={900}>
                    {categories.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={(p: any) => <ChartTooltip {...p} valueFormatter={(v: any) => `${v}%`} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 flex-1 min-w-0">
              {categories.map((d: any) => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-[11px] text-muted truncate">{d.name}</span>
                  </div>
                  <span className="metric-number text-[12px] font-bold text-text flex-shrink-0">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
          )}
        </Card>
      </div>
      )}

      {/* ── ABC ANALYSIS ── */}
      {abcItems.length > 0 && (
        <AbcTable items={abcItems} lang={lang} timeRange={timeRange} isBasePlan={isBasePlan} />
      )}

      {/* ── MENU ENGINEERING MATRIX ── */}
      {abcItems.length > 0 && (
        <MenuMatrixCard items={abcItems} lang={lang} />
      )}

      {/* ── PRO AI FEATURES (Base plan teaser — single grouped card) ── */}
      {isBasePlan && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={13} className="text-primary" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-medium">
              {tr(lang, 'AI-функции в плане Pro', 'AI features in Pro plan', 'Pro rejadagi AI funksiyalar')}
            </p>
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest">
              PRO
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                title: tr(lang, 'Ценовая эластичность', 'Price elasticity', 'Narx elastikligi'),
                desc:  tr(lang, 'Советы по ценообразованию на основе данных продаж', 'Pricing hints from your sales data', 'Sotuv ma\'lumotlariga asoslangan narx maslahatlar'),
              },
              {
                title: tr(lang, 'Комбо-предложения', 'Combo suggestions', 'Kombo takliflar'),
                desc:  tr(lang, 'Позиции, которые часто берут вместе', 'Items often ordered together', 'Ko\'pincha birga buyurtiladigan taomlar'),
              },
              {
                title: tr(lang, 'Возврат гостей', 'Guest return', 'Mehmonlar qaytishi'),
                desc:  tr(lang, 'Прогноз вероятности повторного визита', 'Return probability forecast', 'Qayta tashrif ehtimoli bashorati'),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="flex items-start gap-3 p-3 rounded-xl bg-background border border-border/60">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-text">{title}</p>
                  <p className="text-[11px] text-muted mt-0.5 leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AI INSIGHTS ── */}
      {!isBasePlan && !isPoster && (
      <>
      <div className="flex items-center gap-2 pt-2">
        <Sparkles size={13} className="text-primary" />
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-medium">
          {tr(lang, 'AI-аналитика меню', 'Menu AI insights', 'Menyu AI tahlili')}
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">


      <AIInsightCard
        lang={lang}
        icon={<TrendingUp size={15} />}
        title={tr(lang, 'Ценовая эластичность', 'Price elasticity', 'Narx elastikligi')}
        description={tr(lang, 'Блюда, цену которых можно безопасно повысить — сравнение со средней ценой/маржой по категории меню, плюс механика для официантов', 'Dishes where a price increase is likely safe — compared to your own category average price/margin, plus a staff promo mechanic', "Narxini xavfsiz oshirish mumkin bo'lgan taomlar")}
        loading={priceLoading}
        hasResult={!!priceHints}
        onGenerate={(refresh) => generatePriceHints(refresh)}
        className="lg:col-span-2"
      >
        {priceHints && (
          <div className="space-y-3">
            {priceHints.map((h, i) => (
              <div key={i} className="py-2.5 border-b border-border last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-text">{h.name}</p>
                    <p className="text-[11px] text-muted mt-0.5">{h.reasoning}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[11px] text-muted line-through">{h.currentPrice.toLocaleString('ru-RU')}</p>
                    <p className="text-[13px] font-bold text-success">{h.suggestedPrice.toLocaleString('ru-RU')} <span className="text-[9px] font-normal">UZS</span></p>
                  </div>
                </div>
                {h.promo && (
                  <div className="mt-2 flex items-start gap-1.5 bg-primary/5 border border-primary/15 rounded-lg px-2.5 py-1.5">
                    <Sparkles size={11} className="text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-text/90 leading-snug">{h.promo}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </AIInsightCard>

      <AIInsightCard
        lang={lang}
        icon={<Sparkles size={15} />}
        title={tr(lang, 'Комбо-предложения', 'Combo suggestions', 'Kombo takliflar')}
        description={tr(lang, 'Блюда, которые часто берут вместе — идеи бандлов', 'Co-purchased dishes and bundle promo ideas', "Birga sotiladigan taomlar — to'plam g'oyalari")}
        loading={combosLoading}
        hasResult={!!combos}
        onGenerate={(refresh) => generateCombos(refresh)}
      >
        {combos && (
          <div className="space-y-3">
            {combos.map((c, i) => (
              <div key={i} className="rounded-xl border border-border bg-[#111] px-3 py-2.5">
                <p className="text-[12px] font-semibold text-text">{c.items.join(' + ')}</p>
                <p className="text-[11px] text-muted mt-0.5">{c.reason}</p>
                <span className="inline-block mt-1.5 text-[9px] uppercase tracking-widest font-medium text-primary border border-primary/30 rounded px-1.5 py-0.5">{c.mechanic}</span>
              </div>
            ))}
          </div>
        )}
      </AIInsightCard>

      <AIInsightCard
        lang={lang}
        icon={<Users size={15} />}
        title={tr(lang, 'Возврат гостей', 'Guest return', 'Mehmonlar qaytishi')}
        description={tr(lang, 'Вероятность повторного визита и удержание', 'Return probability and retention', 'Qayta tashrif ehtimoli va saqlanish')}
        loading={guestReturnLoading}
        hasResult={!!guestReturn?.insight}
        onGenerate={() => fetchGuestReturn()}
        actionLabel={tr(lang, 'Получить AI-анализ', 'Get AI analysis', 'AI tahlilini olish')}
      >
        {guestReturn?.insight && (
          <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                {guestReturn.returnProbability7d != null && (
                  <div>
                    <p className="text-[10px] text-muted/60 mb-1">{tr(lang, 'Вернутся за 7 дней', 'Return in 7 days', '7 kun ichida qaytish')}</p>
                    <p className="text-[22px] font-bold font-display text-primary leading-none">{guestReturn.returnProbability7d}%</p>
                  </div>
                )}
                {guestReturn.weeklyRetentionPct != null && (
                  <div>
                    <p className="text-[10px] text-muted/60 mb-1">
                      {guestReturn.isRealRetentionData
                        ? tr(lang, 'Удержание (реально)', 'Retention (real)', 'Saqlanish (real)')
                        : tr(lang, 'Удержание (оценка)', 'Retention (est.)', 'Saqlanish (taxminiy)')}
                    </p>
                    <p className="text-[22px] font-bold font-display text-text leading-none">{guestReturn.weeklyRetentionPct}%</p>
                  </div>
                )}
                {guestReturn.avgGuestsPerDay != null && (
                  <div>
                    <p className="text-[10px] text-muted/60 mb-1">{tr(lang, 'Гостей / день', 'Guests / day', 'Mehmonlar / kun')}</p>
                    <p className="text-[22px] font-bold font-display text-text leading-none">{guestReturn.avgGuestsPerDay}</p>
                  </div>
                )}
              </div>
              {guestReturn.audienceType && (
                <p className="text-[10px] uppercase tracking-widest text-muted/50 mb-2">
                  {lang === 'ru'
                    ? { regulars: 'Аудитория: регуляры', mixed: 'Аудитория: смешанная', new: 'Аудитория: преимущественно новые' }[guestReturn.audienceType] ?? guestReturn.audienceType
                    : lang === 'uz'
                    ? { regulars: "Auditoriya: doimiy mehmonlar", mixed: "Auditoriya: aralash", new: "Auditoriya: asosan yangi" }[guestReturn.audienceType] ?? guestReturn.audienceType
                    : { regulars: 'Audience: regulars', mixed: 'Audience: mixed', new: 'Audience: mostly new' }[guestReturn.audienceType] ?? guestReturn.audienceType}
                </p>
              )}
              <p className="text-[12px] text-muted leading-relaxed">{guestReturn.insight}</p>
              {guestReturn.peakDowName && (
                <p className="text-[10px] text-muted/50 mt-2">
                  {tr(lang, `Пиковый день: ${guestReturn.peakDowName}`, `Peak day: ${guestReturn.peakDowName}`, `Eng yuqori kun: ${guestReturn.peakDowName}`)}
                </p>
              )}
            </>
        )}
      </AIInsightCard>

      </div>
      </>
      )}

    </div>
  );
};

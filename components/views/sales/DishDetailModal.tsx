// Per-dish drill-down (history, daypart, ingredients, AI) — kept from the
// pre-redesign Sales page; opened from a row of the menu table.
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card } from '../../ui/Card';
import { AIInsightCard } from '../../ui/AIInsightCard';
import { ChartTooltip } from '../../ui/ChartTooltip';
import { DateRangePicker } from '../../ui/DateRangePicker';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { TRANSLATIONS, tr, formatMinutes, formatMinutesShort } from '../../../constants';
import { SalesSkeleton } from '../../ui/Skeleton';
import { Language, TimeRange, ComparisonPeriod } from '../../../types';
import { ArrowUpRight, ArrowDownRight, ArrowLeftRight, Calendar, ChevronDown, ChevronUp, ChevronsUpDown, X, Sparkles, TrendingUp, TrendingDown, Minus, ExternalLink, Users, Download, FileText, FileSpreadsheet, Lock, SlidersHorizontal, Tags } from 'lucide-react';
import { ComparisonSelector } from '../../ui/ComparisonSelector';
import { useRealtimeData, RealtimeEvent } from '../../../hooks/useRealtimeData';
import { traceApi, getTenantPlan, RevenueRow, HourlyRow, DishRow, CategoryPerfRow, AbcRow, AbcHistoryItem, DaypartData } from '../../../services/traceApi';
import { ComingSoon } from '../../ui/ComingSoon';

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

export const DishDetailModal: React.FC<{
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

  // Generate AI insight when AI tab selected (once). Fetches TTK ingredient
  // cross-use data first (cheap REST, not an AI call) and folds it into the
  // same prompt context — doesn't add a second AI call, just enriches the
  // one this effect already sends.
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

    traceApi.sales.dishIngredients(item.name)
      .then(({ found, ingredients }) => {
        if (!found || !ingredients || ingredients.length === 0) return '';
        const lines = ingredients.map(i => ru
          ? `  ${i.name} — используется в ${i.usedInOtherDishes} других блюдах`
          : `  ${i.name} — used in ${i.usedInOtherDishes} other dishes`);
        return ru
          ? `\nСостав (ТТК):\n${lines.join('\n')}`
          : `\nIngredients (TTK):\n${lines.join('\n')}`;
      })
      .catch(() => '')
      .then(ingredientCtx => traceApi.ai.chat(ctx + ingredientCtx, [{ role: 'user', text: prompt }], lang))
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
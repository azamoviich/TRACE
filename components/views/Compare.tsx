import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { ChartTooltip } from '../ui/ChartTooltip';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, BarChart, Bar, Cell,
} from 'recharts';
import { Sparkles, Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import { tr } from '../../constants';
import { Language } from '../../types';
import { traceApi, BranchSummary, BranchCompareResult } from '../../services/traceApi';
import { AskAI } from '../AskAI';

const RANGES: { key: 'today' | '7days' | '30days'; ru: string; en: string; uz: string }[] = [
  { key: 'today', ru: 'Сегодня', en: 'Today', uz: 'Bugun' },
  { key: '7days', ru: '7 дней', en: '7 days', uz: '7 kun' },
  { key: '30days', ru: '30 дней', en: '30 days', uz: '30 kun' },
];

const METRICS: { key: 'revenue' | 'orders' | 'avgCheck' | 'guests'; ru: string; en: string; uz: string }[] = [
  { key: 'revenue', ru: 'Выручка', en: 'Revenue', uz: 'Tushum' },
  { key: 'orders', ru: 'Заказы', en: 'Orders', uz: 'Buyurtmalar' },
  { key: 'avgCheck', ru: 'Средний чек', en: 'Avg check', uz: "O'rtacha chek" },
  { key: 'guests', ru: 'Гости', en: 'Guests', uz: 'Mehmonlar' },
];

const BRANCH_COLORS = ['#ff6b35', '#2563eb', '#10b981', '#f59e0b', '#a855f7', '#ec4899'];

const fmtUZS = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} UZS`;
const fmtShort = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}K` : String(Math.round(v));

interface CompareProps {
  lang: Language;
  branches: BranchSummary[];
}

export const Compare: React.FC<CompareProps> = ({ lang, branches }) => {
  const [range, setRange] = useState<'today' | '7days' | '30days'>('7days');
  const [data, setData] = useState<BranchCompareResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [barMetric, setBarMetric] = useState<'revenue' | 'orders' | 'avgCheck' | 'guests'>('revenue');
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    traceApi.org.compare(range)
      .then(d => setData(d.branches ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [range]);

  const valid = useMemo(() => data.filter(b => !b.error), [data]);

  const rankings = useMemo(() => {
    const sorted = (key: keyof BranchCompareResult) =>
      [...valid].sort((a, b) => ((b[key] as number) ?? 0) - ((a[key] as number) ?? 0));
    return {
      revenue: sorted('revenue'),
      orders: sorted('orders'),
      avgCheck: sorted('avgCheck'),
      guests: sorted('guests'),
    };
  }, [valid]);

  const leaders = useMemo(() => ({
    revenue: rankings.revenue[0],
    orders: rankings.orders[0],
    avgCheck: rankings.avgCheck[0],
    guests: rankings.guests[0],
  }), [rankings]);

  const getRank = (id: string, key: 'revenue' | 'orders' | 'avgCheck' | 'guests') =>
    rankings[key].findIndex(b => b.id === id) + 1;

  const pctVsBest = (val: number, best: number) =>
    best > 0 ? Math.round(((val - best) / best) * 100) : 0;

  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, any>>();
    for (const b of data) {
      for (const row of b.series ?? []) {
        const entry = dateMap.get(row.date) ?? { date: row.date };
        entry[b.name] = row.revenue;
        dateMap.set(row.date, entry);
      }
    }
    return [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const barData = useMemo(() =>
    valid.map((b, i) => ({
      name: b.name,
      value: (b[barMetric] as number) ?? 0,
      color: BRANCH_COLORS[i % BRANCH_COLORS.length],
    }))
  , [valid, barMetric]);

  const aiContext = useMemo(() => {
    const rangeLabel = RANGES.find(r => r.key === range)?.[lang] ?? range;
    const lines = valid.map(b =>
      `${b.name}: Revenue ${fmtUZS(b.revenue ?? 0)}, Orders ${b.orders ?? 0}, AvgCheck ${fmtUZS(b.avgCheck ?? 0)}, Guests ${b.guests ?? 0}`
    ).join('\n');
    return `Branch Comparison (${rangeLabel})\n${lines}`;
  }, [valid, range, lang]);

  return (
    <div className="animate-fade-in pb-20 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] font-bold text-text">
          {tr(lang, 'Сравнение филиалов', 'Branch comparison', 'Filiallarni taqqoslash')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAiOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-primary border border-primary/30 hover:bg-primary/10 transition-colors"
          >
            <Sparkles size={12} />
            {tr(lang, 'AI-анализ', 'AI Analysis', 'AI tahlil')}
          </button>
          <div className="flex items-center gap-px border border-border rounded-xl overflow-hidden bg-card">
            {RANGES.map(({ key, ru, en, uz }) => (
              <button key={key} onClick={() => setRange(key)}
                className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  range === key ? 'bg-primary text-white' : 'text-muted hover:text-text hover:bg-[#1a1a1a]'
                }`}
              >
                {tr(lang, ru, en, uz)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted text-[12px]">
          {tr(lang, 'Загрузка...', 'Loading...', 'Yuklanmoqda...')}
        </div>
      ) : (
        <>
          {/* Leaders strip */}
          {valid.length > 1 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {METRICS.map(m => {
                const leader = leaders[m.key];
                if (!leader) return null;
                return (
                  <div key={m.key} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border bg-card">
                    <Trophy size={13} className="text-[#f59e0b] flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-[0.18em] text-muted">
                        {tr(lang, m.ru, m.en, m.uz)}
                      </p>
                      <p className="text-[12px] font-semibold text-text truncate">{leader.name}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* KPI cards per branch */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.map((b, i) => {
              const color = BRANCH_COLORS[i % BRANCH_COLORS.length];
              return (
                <Card key={b.id} title="">
                  {/* Branch header */}
                  <div className="flex items-center justify-between mb-4 -mt-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-[14px] font-bold text-text">{b.name}</span>
                    </div>
                    {!b.error && valid.length > 1 && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        getRank(b.id, 'revenue') === 1
                          ? 'bg-[#f59e0b]/10 text-[#f59e0b]'
                          : 'bg-[#1a1a1a] text-muted'
                      }`}>
                        #{getRank(b.id, 'revenue')}
                      </span>
                    )}
                  </div>

                  {b.error ? (
                    <p className="text-[12px] text-muted">{tr(lang, 'Нет данных за этот период', 'No data for this period', 'Bu davr uchun ma\'lumot yo\'q')}</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {METRICS.map(m => {
                        const val = (b[m.key] as number) ?? 0;
                        const bestVal = (leaders[m.key]?.[m.key] as number) ?? 0;
                        const pct = valid.length > 1 ? pctVsBest(val, bestVal) : null;
                        const isMonetary = m.key === 'revenue' || m.key === 'avgCheck';
                        return (
                          <div key={m.key}>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted mb-1">
                              {tr(lang, m.ru, m.en, m.uz)}
                            </p>
                            <p className="metric-number text-[15px] font-bold text-text">
                              {isMonetary ? fmtUZS(val) : val.toLocaleString('ru-RU')}
                            </p>
                            {pct !== null && pct !== 0 && (
                              <div className={`flex items-center gap-0.5 mt-0.5 text-[10px] font-medium ${
                                pct >= 0 ? 'text-success' : 'text-[#ef4444]'
                              }`}>
                                {pct >= 0
                                  ? <TrendingUp size={10} />
                                  : <TrendingDown size={10} />
                                }
                                {pct >= 0 ? '+' : ''}{pct}%
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Bar chart — metric comparison */}
          {valid.length > 1 && (
            <Card title={tr(lang, 'Сравнение метрик', 'Metric comparison', 'Metrika taqqoslamasi')}>
              <div className="flex items-center gap-px border border-border rounded-xl overflow-hidden bg-[#111] w-fit mb-4">
                {METRICS.map(m => (
                  <button key={m.key} onClick={() => setBarMetric(m.key)}
                    className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      barMetric === m.key ? 'bg-primary text-white' : 'text-muted hover:text-text hover:bg-[#1a1a1a]'
                    }`}
                  >
                    {tr(lang, m.ru, m.en, m.uz)}
                  </button>
                ))}
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#1a1a1a" />
                    <XAxis dataKey="name" stroke="transparent" tick={{ fill: '#666', fontSize: 11, fontFamily: 'Onest' }} tickLine={false} axisLine={false} dy={4} />
                    <YAxis stroke="transparent" tick={{ fill: '#666', fontSize: 10, fontFamily: 'Onest' }} tickLine={false} axisLine={false} width={52}
                      tickFormatter={fmtShort} />
                    <Tooltip
                      content={(p: any) => (
                        <ChartTooltip {...p}
                          valueFormatter={(v) => (barMetric === 'revenue' || barMetric === 'avgCheck') ? fmtUZS(v) : v.toLocaleString('ru-RU')}
                        />
                      )}
                      cursor={{ fill: 'rgba(255,107,53,0.04)' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64}>
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Combined revenue chart */}
          <Card title={tr(lang, 'Выручка по дням', 'Revenue over time', 'Kunlik tushum')}>
            <div className="h-[260px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="0" vertical={false} stroke="#1a1a1a" />
                  <XAxis dataKey="date" stroke="transparent" tick={{ fill: '#666', fontSize: 11, fontFamily: 'Onest' }} tickLine={false} axisLine={false} dy={4} />
                  <YAxis stroke="transparent" tick={{ fill: '#666', fontSize: 10, fontFamily: 'Onest' }} tickLine={false} axisLine={false} width={52}
                    tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}K` : String(v)} />
                  <Tooltip content={(p: any) => <ChartTooltip {...p} valueFormatter={(v) => fmtUZS(v)} />} cursor={{ stroke: '#2a2a2a', strokeWidth: 1 }} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Onest' }} />
                  {data.filter(b => !b.error).map((b, i) => (
                    <Line key={b.id} type="monotone" dataKey={b.name} stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Top dishes per branch */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {valid.map(b => (
              <Card key={b.id} title={`${b.name} · ${tr(lang, 'Топ блюд', 'Top dishes', 'Top taomlar')}`}>
                <div className="space-y-2">
                  {(b.topDishes ?? []).map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 text-[12px]">
                      <span className="text-[10px] text-muted w-4 flex-shrink-0">{i + 1}</span>
                      <span className="text-text truncate flex-1">{d.name}</span>
                      <span className="metric-number text-muted flex-shrink-0">{fmtUZS(d.revenue)}</span>
                    </div>
                  ))}
                  {(b.topDishes ?? []).length === 0 && (
                    <p className="text-[12px] text-muted">—</p>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Category mix per branch */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {valid.map(b => (
              <Card key={b.id} title={`${b.name} · ${tr(lang, 'Категории', 'Categories', 'Toifalar')}`}>
                <div className="space-y-2">
                  {(b.categories ?? []).map(c => (
                    <div key={c.name} className="flex items-center justify-between text-[12px]">
                      <span className="text-text truncate pr-2">{c.name}</span>
                      <span className="metric-number text-muted flex-shrink-0">{fmtUZS(c.avgCheck)}</span>
                    </div>
                  ))}
                  {(b.categories ?? []).length === 0 && (
                    <p className="text-[12px] text-muted">—</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* AskAI panel with compare context */}
      <AskAI
        context={aiContext || tr(lang, 'Сравнение филиалов', 'Branch comparison', 'Filiallarni taqqoslash')}
        lang={lang}
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
      />
    </div>
  );
};

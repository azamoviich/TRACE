import React, { useEffect, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Language } from '../../../types';
import { tr } from '../../../constants';
import { Card } from '../../ui/Card';
import { ChartTooltip } from '../../ui/ChartTooltip';
import { traceApi, PlanHistoryRow } from '../../../services/traceApi';
import { money, full, pct, monthName, statusColor } from './format';

// Plan vs actual for the last 12 months; clicking a month opens it.
export const PlanHistory: React.FC<{ lang: Language; selected: string; onSelect: (month: string) => void; reloadKey?: unknown }> = ({ lang, selected, onSelect, reloadKey }) => {
  const [rows, setRows] = useState<PlanHistoryRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    traceApi.plan.history(12).then(r => { if (alive) setRows(r); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [reloadKey]);

  if (rows === null) return <div className="glass rounded-3xl p-5"><div className="h-52 bg-border/50 rounded-xl animate-pulse" /></div>;
  if (!rows.some(r => r.fact.revenue > 0 || r.plan)) return null;

  const data = rows.map(r => ({
    month: r.month,
    label: monthName(r.month, lang).slice(0, 3),
    fact: r.fact.revenue,
    plan: r.plan?.revenue ?? null,
  }));
  const axis = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${Math.round(v / 1e6)}M` : full(v));
  const withPlan = rows.filter(r => r.pct != null);
  const hit = withPlan.filter(r => (r.pct ?? 0) >= 100).length;

  return (
    <Card
      title={tr(lang, 'История: план и факт', 'History: plan vs actual', 'Tarix: reja va fakt')}
      subtitle={withPlan.length
        ? tr(lang, `План выполнен в ${hit} из ${withPlan.length} мес.`, `Plan hit in ${hit} of ${withPlan.length} months`, `Reja ${withPlan.length} oydan ${hit} tasida bajarildi`)
        : tr(lang, 'Выручка по месяцам', 'Revenue by month', 'Oylar bo‘yicha tushum')}
    >
      <div className="h-[220px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} onClick={(e: any) => { const m = e?.activePayload?.[0]?.payload?.month; if (m) onSelect(m); }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgb(var(--color-muted))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--color-muted))' }} axisLine={false} tickLine={false} width={52} tickFormatter={axis} />
            <Tooltip content={<ChartTooltip valueFormatter={v => money(v, lang)} />} cursor={{ fill: 'rgb(var(--color-border) / 0.3)' }} />
            <Bar dataKey="fact" name={tr(lang, 'Факт', 'Actual', 'Fakt')} fill="rgb(var(--color-primary))" radius={[4, 4, 0, 0]} maxBarSize={28} style={{ cursor: 'pointer' }} />
            <Line type="monotone" dataKey="plan" name={tr(lang, 'План', 'Plan', 'Reja')} stroke="rgb(var(--color-text))" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto -mx-1 mt-4">
        <table className="w-full min-w-[600px] text-left">
          <thead>
            <tr className="border-b border-border">
              {[tr(lang, 'Месяц', 'Month', 'Oy'), tr(lang, 'План', 'Plan', 'Reja'), tr(lang, 'Факт', 'Actual', 'Fakt'), '%', tr(lang, 'Ср. чек', 'Avg check', 'O‘rt. chek'), tr(lang, 'Фудкост', 'Food cost', 'Tannarx'), tr(lang, 'Прибыль', 'Profit', 'Foyda')].map((h, i) => (
                <th key={h} className={`pb-2.5 px-1 text-[10px] uppercase tracking-[0.12em] text-muted font-medium ${i > 0 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map(r => (
              <tr
                key={r.month}
                onClick={() => onSelect(r.month)}
                className={`border-b border-border/50 last:border-0 cursor-pointer hover:bg-card-hover/60 transition-colors ${r.month === selected ? 'bg-primary/5' : ''}`}
              >
                <td className="py-2 px-1 text-[12px] text-text">{monthName(r.month, lang)} {r.month.slice(2, 4)}{r.partial && <span className="text-muted"> · {tr(lang, 'идёт', 'running', 'davom etmoqda')}</span>}</td>
                <td className="py-2 px-1 text-[12px] font-mono text-right text-muted">{r.plan ? money(r.plan.revenue, lang) : '—'}</td>
                <td className="py-2 px-1 text-[12px] font-mono text-right text-text">{r.fact.revenue > 0 ? money(r.fact.revenue, lang) : '—'}</td>
                <td className={`py-2 px-1 text-[12px] font-mono text-right ${statusColor(r.pct)}`}>{pct(r.pct)}</td>
                <td className="py-2 px-1 text-[12px] font-mono text-right text-text">{r.fact.avgCheck > 0 ? full(r.fact.avgCheck) : '—'}</td>
                <td className="py-2 px-1 text-[12px] font-mono text-right text-text">{pct(r.fact.foodCostPct)}</td>
                <td className={`py-2 px-1 text-[12px] font-mono text-right ${r.fact.netProfit == null ? 'text-muted' : r.fact.netProfit >= 0 ? 'text-text' : 'text-danger'}`}>{r.fact.netProfit == null ? '—' : money(r.fact.netProfit, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

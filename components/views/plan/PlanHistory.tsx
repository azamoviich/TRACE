// Plan vs actual for the last 12 months; clicking a month opens it.
// Redesigned per TRACE-mockups/plan.html (styles/rd/plan.css).
import React, { useEffect, useState } from 'react';
import { Language } from '../../../types';
import { tr } from '../../../constants';
import { traceApi, PlanHistoryRow } from '../../../services/traceApi';
import { full, pct, monthName } from './format';

const M = (n: number) => (Math.round(n / 1e5) / 10).toLocaleString('ru-RU');
import { LineChart } from '../../rd/ui';
import { tone } from './PlanProgress';

export const PlanHistory: React.FC<{ lang: Language; selected: string; onSelect: (month: string) => void; reloadKey?: unknown }> = ({ lang, selected, onSelect, reloadKey }) => {
  const [rows, setRows] = useState<PlanHistoryRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    traceApi.plan.history(12).then(r => { if (alive) setRows(r); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [reloadKey]);

  if (rows === null) return <section className="band"><div className="sk w9" /><div className="sk w7" /></section>;
  if (!rows.some(r => r.fact.revenue > 0 || r.plan)) return null;

  const withPlan = rows.filter(r => r.pct != null);
  const hit = withPlan.filter(r => (r.pct ?? 0) >= 100).length;

  return (
    <section className="band rise" aria-labelledby="h-hist" style={{ animationDelay: '.12s' }}>
      <div className="sec-head"><h2 id="h-hist">{tr(lang, 'История: план и факт', 'History: plan vs actual', 'Tarix: reja va fakt')}</h2>
        <span className="sec-note">{tr(lang, 'млн сум · ', 'M UZS · ', "mln so'm · ")}{withPlan.length ? tr(lang, `План выполнен в ${hit} из ${withPlan.length} мес.`, `Plan hit in ${hit} of ${withPlan.length} months`, `Reja ${withPlan.length} oydan ${hit} tasida bajarildi`) : tr(lang, 'Выручка по месяцам', 'Revenue by month', "Oylar bo'yicha tushum")}</span></div>
      <div className="two-col">
        <div className="card-ph">
          <LineChart bars labels={rows.map(r => monthName(r.month, lang).slice(0, 3).toLowerCase())}
            cur={rows.map(r => r.fact.revenue > 0 ? r.fact.revenue / 1e6 : null)} base={rows.map(r => r.plan ? r.plan.revenue / 1e6 : null)}
            curName={tr(lang, 'Факт', 'Actual', 'Fakt')} baseName={tr(lang, 'План', 'Plan', 'Reja')} height={240}
            tip={v => `${(Math.round(v * 10) / 10).toLocaleString('ru-RU')} ${tr(lang, 'млн', 'M', 'mln')}`} />
          <div className="key"><span><i className="bar" />{tr(lang, 'Факт', 'Actual', 'Fakt')}</span><span><i className="p" />{tr(lang, 'План', 'Plan', 'Reja')}</span></div>
        </div>
        <div className="card-ph">
          <table className="dt">
            <thead><tr><th>{tr(lang, 'Месяц', 'Month', 'Oy')}</th><th className="r hide-sm">{tr(lang, 'План', 'Plan', 'Reja')}</th><th className="r">{tr(lang, 'Факт', 'Actual', 'Fakt')}</th><th className="r">%</th><th className="r hide-sm">{tr(lang, 'Ср. чек', 'Avg check', "O'rt. chek")}</th><th className="r hide-sm">{tr(lang, 'Фудкост', 'Food cost', 'Fudkost')}</th><th className="r">{tr(lang, 'Прибыль', 'Profit', 'Foyda')}</th></tr></thead>
            <tbody>{[...rows].reverse().map(r => (
              <tr key={r.month} className={`click${r.month === selected ? ' sel' : ''}`} tabIndex={0} onClick={() => onSelect(r.month)} onKeyDown={e => { if (e.key === 'Enter') onSelect(r.month); }}>
                <td>{monthName(r.month, lang)} {r.month.slice(2, 4)}{r.partial && <span className="faint"> · {tr(lang, 'идёт', 'running', 'davom etmoqda')}</span>}</td>
                <td className="r hide-sm muted">{r.plan ? M(r.plan.revenue) : '—'}</td>
                <td className="r">{r.fact.revenue > 0 ? M(r.fact.revenue) : '—'}</td>
                <td className={`r ${tone(r.pct)}`}>{pct(r.pct)}</td>
                <td className="r hide-sm">{r.fact.avgCheck > 0 ? full(r.fact.avgCheck) : '—'}</td>
                <td className="r hide-sm">{pct(r.fact.foodCostPct)}</td>
                <td className={`r ${r.fact.netProfit != null && r.fact.netProfit < 0 ? 'neg' : ''}`}>{r.fact.netProfit == null ? '—' : M(r.fact.netProfit)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

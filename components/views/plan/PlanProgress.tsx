import React, { useMemo, useState } from 'react';
import { ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Clock, Target, Flag, ChevronDown } from 'lucide-react';
import { Language } from '../../../types';
import { tr } from '../../../constants';
import { Card } from '../../ui/Card';
import { ChartTooltip } from '../../ui/ChartTooltip';
import type { SavedPlan } from '../../../services/traceApi';
import type { ProgressResult, VarianceResult } from '../../../lib/planEngine';
import { money, full, pct, dayLabel, weekdayShort, statusColor, statusBg } from './format';

interface Props {
  lang: Language;
  plan: SavedPlan;
  progress: ProgressResult;
  variance: VarianceResult | null;
}

export const PlanProgress: React.FC<Props> = ({ lang, plan, progress: p, variance }) => (
  <div className="space-y-5">
    <Hero lang={lang} p={p} />
    {p.todayLive && <TodayCard lang={lang} p={p} />}
    <KpiGrid lang={lang} p={p} />
    <ProgressChart lang={lang} p={p} />
    {variance && variance.period.days > 0 && <VarianceCard lang={lang} v={variance} />}
    <PLTable lang={lang} p={p} plan={plan} />
    {p.needed.days.length > 0 && <RemainingDays lang={lang} p={p} />}
  </div>
);

// ── Hero: where the month stands ──────────────────────────────────────────────

const Hero: React.FC<{ lang: Language; p: ProgressResult }> = ({ lang, p }) => {
  const r = p.revenue;
  const factShare = r.plan > 0 ? Math.min(100, (r.factMtd / r.plan) * 100) : 0;
  const shouldShare = r.plan > 0 ? Math.min(100, (r.planMtd / r.plan) * 100) : 0;

  if (p.state === 'future') {
    return (
      <Card>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium mb-2">{tr(lang, 'Месяц ещё не начался', 'Month has not started', 'Oy hali boshlanmagan')}</p>
        <p className="metric-number text-[32px] font-bold text-text leading-none">{money(r.plan, lang)}</p>
        <p className="text-[12px] text-muted mt-2">{tr(lang, 'план выручки', 'revenue plan', 'tushum rejasi')} · {money(p.profit.plan, lang)} {tr(lang, 'чистой прибыли', 'net profit', 'sof foyda')}</p>
      </Card>
    );
  }

  const statusLabel = p.status === 'ahead' ? tr(lang, 'Опережаем план', 'Ahead of plan', 'Rejadan oldindamiz')
    : p.status === 'on_track' ? tr(lang, 'Почти в плане', 'Nearly on plan', 'Deyarli rejada')
    : p.status === 'behind' ? tr(lang, 'Отстаём от плана', 'Behind plan', 'Rejadan ortdamiz') : '';

  return (
    <Card>
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">
              {p.state === 'past' ? tr(lang, 'Итог месяца', 'Month result', 'Oy yakuni') : tr(lang, 'Выручка с начала месяца', 'Revenue month to date', 'Oy boshidan tushum')}
            </p>
            {p.status && <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-[0.08em] ${statusBg(r.pct)}`}>{statusLabel}</span>}
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="metric-number text-[34px] font-bold text-text leading-none tracking-tight">{money(r.factMtd, lang)}</p>
            <p className={`text-[20px] font-bold font-mono ${statusColor(r.pct)}`}>{pct(r.pct)}</p>
          </div>
          <p className="text-[12px] text-muted mt-1.5">
            {tr(lang, 'план на эту дату', 'plan to date', 'shu sanagacha reja')} {money(r.planMtd, lang)} · {r.gap >= 0 ? tr(lang, 'опережение', 'ahead by', 'oldinda') : tr(lang, 'отставание', 'behind by', 'ortda')} <span className={r.gap >= 0 ? 'text-success' : 'text-danger'}>{money(Math.abs(r.gap), lang)}</span>
          </p>

          {/* Progress against the whole month, with a marker where we should be by now */}
          <div className="mt-5">
            <div className="relative h-3 rounded-full bg-border/60 overflow-visible">
              <div className={`absolute inset-y-0 left-0 rounded-full ${r.pct != null && r.pct >= 100 ? 'bg-success' : r.pct != null && r.pct >= 95 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${factShare}%` }} />
              {p.state === 'current' && (
                <div className="absolute -top-1 -bottom-1 w-0.5 bg-text" style={{ left: `${shouldShare}%` }} title={tr(lang, 'Должно быть к сегодня', 'Where we should be', 'Bugungacha bo‘lishi kerak')} />
              )}
            </div>
            <div className="flex justify-between text-[10px] text-muted mt-1.5">
              <span>0</span>
              <span>{tr(lang, 'план месяца', 'monthly plan', 'oylik reja')} {money(r.plan, lang)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-1 gap-3 content-start">
          <div className="rounded-2xl bg-background border border-border p-3.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted font-medium mb-1 flex items-center gap-1"><Target size={11} />{p.state === 'past' ? tr(lang, 'Выполнение', 'Achieved', 'Bajarildi') : tr(lang, 'Прогноз на месяц', 'Month forecast', 'Oy prognozi')}</p>
            <p className={`text-[18px] font-bold font-mono ${statusColor(r.forecastPct)}`}>{money(r.forecast, lang)}</p>
            <p className="text-[11px] text-muted">{pct(r.forecastPct)} {tr(lang, 'плана', 'of plan', 'rejadan')}</p>
          </div>
          {p.state === 'current' && (
            <div className="rounded-2xl bg-background border border-border p-3.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted font-medium mb-1 flex items-center gap-1"><Flag size={11} />{tr(lang, 'Нужно в день', 'Needed per day', 'Kuniga kerak')}</p>
              <p className="text-[18px] font-bold font-mono text-text">{money(p.needed.perDayAvg, lang)}</p>
              <p className="text-[11px] text-muted">{tr(lang, `в среднем, осталось ${p.remainingDays} дн.`, `on average, ${p.remainingDays} days left`, `o‘rtacha, ${p.remainingDays} kun qoldi`)}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

// ── Today, live ───────────────────────────────────────────────────────────────

const TodayCard: React.FC<{ lang: Language; p: ProgressResult }> = ({ lang, p }) => {
  const t = p.todayLive!;
  const neededToday = p.needed.days.find(d => d.date === t.date)?.needed ?? t.plan;
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" /><span className="relative inline-flex rounded-full h-2 w-2 bg-success" /></span>
        <p className="text-[13px] font-semibold text-text">{tr(lang, 'Сегодня', 'Today', 'Bugun')} · {dayLabel(t.date, lang)}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label={tr(lang, 'Выручка сейчас', 'Revenue now', 'Hozirgi tushum')} value={money(t.fact, lang)} sub={`${full(t.checks)} ${tr(lang, 'чеков', 'checks', 'chek')}`} />
        <Stat
          label={tr(lang, 'Обычно к этому часу', 'Usual by this hour', 'Odatda shu soatgacha')}
          value={t.expectedByNow != null ? money(t.expectedByNow, lang) : '—'}
          sub={t.expectedByNow != null ? <span className={statusColor(t.pct)}>{pct(t.pct)}</span> : tr(lang, 'мало истории', 'not enough history', 'tarix kam')}
        />
        <Stat label={tr(lang, 'План дня', 'Day plan', 'Kun rejasi')} value={money(t.plan, lang)} />
        <Stat
          label={tr(lang, 'Нужно сегодня', 'Needed today', 'Bugun kerak')}
          value={money(neededToday, lang)}
          sub={tr(lang, 'чтобы догнать месяц', 'to catch up the month', 'oyni quvib yetish uchun')}
        />
      </div>
    </Card>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode }> = ({ label, value, sub }) => (
  <div>
    <p className="text-[10px] uppercase tracking-[0.14em] text-muted font-medium mb-1">{label}</p>
    <p className="text-[17px] font-bold text-text font-mono tabular-nums">{value}</p>
    {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
  </div>
);

// ── KPI grid ──────────────────────────────────────────────────────────────────

const Kpi: React.FC<{ label: string; fact: string; plan: string; pctValue: number | null; inverse?: boolean; foot?: React.ReactNode }> = ({ label, fact, plan, pctValue, inverse, foot }) => (
  <div className="glass rounded-3xl p-4">
    <p className="text-[10px] uppercase tracking-[0.16em] text-muted font-medium mb-2">{label}</p>
    <div className="flex items-baseline justify-between gap-2">
      <p className="metric-number text-[22px] font-bold text-text leading-none tracking-tight">{fact}</p>
      {pctValue != null && (
        <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${statusColor(pctValue, inverse)}`}>
          {(inverse ? pctValue <= 100 : pctValue >= 100) ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {pct(pctValue)}
        </span>
      )}
    </div>
    <p className="text-[11px] text-muted mt-1.5">{plan}</p>
    {foot && <p className="text-[11px] text-muted mt-0.5">{foot}</p>}
  </div>
);

const KpiGrid: React.FC<{ lang: Language; p: ProgressResult }> = ({ lang, p }) => {
  const planWord = tr(lang, 'план', 'plan', 'reja');
  const fc = p.foodCost;
  const be = p.breakEven;
  const beText = be.reachedOn
    ? tr(lang, `пройдена ${dayLabel(be.reachedOn, lang)}`, `reached ${dayLabel(be.reachedOn, lang)}`, `${dayLabel(be.reachedOn, lang)} erishildi`)
    : be.projectedOn
      ? tr(lang, `ожидается ${dayLabel(be.projectedOn, lang)}`, `expected ${dayLabel(be.projectedOn, lang)}`, `${dayLabel(be.projectedOn, lang)} kutilmoqda`)
      : tr(lang, 'не будет достигнута при текущем темпе', 'not reached at the current pace', 'joriy sur’atda erishilmaydi');
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <Kpi
        label={tr(lang, 'Чеки', 'Checks', 'Cheklar')}
        fact={full(p.checks.factMtd)} plan={`${planWord} ${full(p.checks.planMtd)}`} pctValue={p.checks.pct}
        foot={`${tr(lang, 'гостей', 'guests', 'mehmon')}: ${full(p.guests.factMtd)}`}
      />
      <Kpi
        label={tr(lang, 'Средний чек', 'Average check', 'O‘rtacha chek')}
        fact={full(p.avgCheck.factMtd)} plan={`${planWord} ${full(p.avgCheck.planMtd)}`} pctValue={p.avgCheck.pct}
      />
      <Kpi
        label={tr(lang, 'Фудкост', 'Food cost', 'Oziq-ovqat tannarxi')}
        fact={fc.known ? pct(fc.factPct) : '—'} plan={`${planWord} ${pct(fc.planPct)}`}
        pctValue={fc.known && fc.factPct != null && fc.planPct > 0 ? Math.round((fc.factPct / fc.planPct) * 1000) / 10 : null}
        inverse
        foot={fc.known ? `${money(fc.factCogsMtd, lang)} ${tr(lang, 'себестоимость', 'cost of goods', 'tannarx')}` : tr(lang, 'нет себестоимости в iiko', 'no dish costs in iiko', 'iiko’da tannarx yo‘q')}
      />
      <Kpi
        label={tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda')}
        fact={money(p.profit.factMtd, lang)} plan={`${planWord} ${money(p.profit.planMtd, lang)}`} pctValue={p.profit.pct}
        foot={p.state !== 'past' ? `${tr(lang, 'прогноз', 'forecast', 'prognoz')} ${money(p.profit.forecast, lang)}` : undefined}
      />
      <Kpi
        label={tr(lang, 'Безубыточность', 'Break-even', 'Zararsizlik')}
        fact={be.monthRevenue != null ? money(be.monthRevenue, lang) : '—'}
        plan={be.dayRevenue != null ? `${money(be.dayRevenue, lang)} ${tr(lang, 'в день', 'a day', 'kuniga')}` : ''}
        pctValue={null}
        foot={<span className={be.reachedOn ? 'text-success' : be.projectedOn ? 'text-text' : 'text-danger'}>{beText}</span>}
      />
      <Kpi
        label={tr(lang, 'Выручка', 'Revenue', 'Tushum')}
        fact={money(p.revenue.factMtd, lang)} plan={`${planWord} ${money(p.revenue.planMtd, lang)}`} pctValue={p.revenue.pct}
        foot={`${tr(lang, 'месяц', 'month', 'oy')}: ${money(p.revenue.plan, lang)}`}
      />
    </div>
  );
};

// ── Chart ─────────────────────────────────────────────────────────────────────

const ProgressChart: React.FC<{ lang: Language; p: ProgressResult }> = ({ lang, p }) => {
  const [mode, setMode] = useState<'cum' | 'daily'>('cum');
  const data = useMemo(() => p.series.map(s => ({ ...s, day: Number(s.date.slice(8)) })), [p.series]);
  const planName = tr(lang, 'План', 'Plan', 'Reja');
  const factName = tr(lang, 'Факт', 'Actual', 'Fakt');
  const axis = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${Math.round(v / 1e6)}M` : full(v));
  const be = mode === 'cum' ? p.breakEven.monthRevenue : p.breakEven.dayRevenue;

  return (
    <Card
      title={tr(lang, 'План и факт по дням', 'Plan vs actual by day', 'Kunlar bo‘yicha reja va fakt')}
      action={
        <div className="flex items-center gap-px border border-border rounded-xl overflow-hidden bg-card">
          {(['cum', 'daily'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${mode === m ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}>
              {m === 'cum' ? tr(lang, 'Накопительно', 'Cumulative', 'Jamlanma') : tr(lang, 'По дням', 'Daily', 'Kunlik')}
            </button>
          ))}
        </div>
      }
    >
      <div className="h-[260px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgb(var(--color-muted))' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--color-muted))' }} axisLine={false} tickLine={false} width={52} tickFormatter={axis} />
            <Tooltip
              content={<ChartTooltip valueFormatter={v => money(v, lang)} labelFormatter={l => dayLabel(data[Number(l) - 1]?.date ?? '', lang)} />}
              cursor={{ fill: 'rgb(var(--color-border) / 0.3)' }}
            />
            {be != null && (
              <ReferenceLine y={be} stroke="rgb(var(--color-danger))" strokeDasharray="4 4" strokeOpacity={0.6}
                label={{ value: tr(lang, 'Безубыточность', 'Break-even', 'Zararsizlik'), position: 'insideTopLeft', fontSize: 10, fill: 'rgb(var(--color-danger))' }} />
            )}
            {mode === 'cum' ? (
              <>
                <Area type="monotone" dataKey="cumFact" name={factName} stroke="rgb(var(--color-primary))" strokeWidth={2.5} fill="rgb(var(--color-primary) / 0.12)" connectNulls={false} />
                <Line type="monotone" dataKey="cumPlan" name={planName} stroke="rgb(var(--color-muted))" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
              </>
            ) : (
              <>
                <Bar dataKey="fact" name={factName} fill="rgb(var(--color-primary))" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Line type="step" dataKey="plan" name={planName} stroke="rgb(var(--color-muted))" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

// ── Variance: why we're off ───────────────────────────────────────────────────

const VarianceCard: React.FC<{ lang: Language; v: VarianceResult }> = ({ lang, v }) => {
  const d = v.drivers;
  const label = (key: string): { title: string; detail: string } => {
    switch (key) {
      case 'checks': return {
        title: tr(lang, 'Количество чеков', 'Number of checks', 'Cheklar soni'),
        detail: tr(lang, `${full(d.factChecks)} вместо ${full(d.planChecks)}`, `${full(d.factChecks)} vs ${full(d.planChecks)} planned`, `${full(d.planChecks)} o‘rniga ${full(d.factChecks)}`),
      };
      case 'avg_check': return {
        title: tr(lang, 'Средний чек', 'Average check', 'O‘rtacha chek'),
        detail: tr(lang, `${full(d.factAvgCheck)} вместо ${full(d.planAvgCheck)}`, `${full(d.factAvgCheck)} vs ${full(d.planAvgCheck)} planned`, `${full(d.planAvgCheck)} o‘rniga ${full(d.factAvgCheck)}`),
      };
      case 'volume': return {
        title: tr(lang, 'Объём продаж', 'Sales volume', 'Savdo hajmi'),
        detail: tr(lang, 'маржа с недополученной / дополнительной выручки', 'margin on the revenue gap', 'tushum farqidan marja'),
      };
      case 'food_cost': return {
        title: tr(lang, 'Фудкост', 'Food cost', 'Tannarx'),
        detail: v.foodCostKnown
          ? tr(lang, `${pct(d.factFoodCostPct)} вместо ${pct(d.planFoodCostPct)}`, `${pct(d.factFoodCostPct)} vs ${pct(d.planFoodCostPct)} planned`, `${pct(d.planFoodCostPct)} o‘rniga ${pct(d.factFoodCostPct)}`)
          : tr(lang, 'нет себестоимости в iiko', 'no dish costs in iiko', 'iiko’da tannarx yo‘q'),
      };
      case 'labor': return { title: tr(lang, 'ФОТ', 'Labor', 'Ish haqi'), detail: tr(lang, 'по книге iiko / начислено по плану', 'iiko books / accrued per plan', 'iiko hisobi / reja bo‘yicha') };
      default: return { title: tr(lang, 'Прочие расходы', 'Other costs', 'Boshqa xarajatlar'), detail: tr(lang, 'аренда, коммунальные, прочее', 'rent, utilities, other', 'ijara, kommunal, boshqa') };
    }
  };

  const worst = [...v.revenue.items, ...v.profit.items.filter(i => i.key !== 'volume')]
    .filter(i => i.value < 0).sort((a, b) => a.value - b.value)[0];

  const block = (title: string, plan: number, fact: number, items: { key: string; value: number }[]) => {
    const maxAbs = Math.max(1, ...items.map(i => Math.abs(i.value)));
    return (
      <div>
        <p className="text-[13px] font-semibold text-text mb-3">{title}</p>
        <div className="flex justify-between text-[12px] py-1.5 border-b border-border">
          <span className="text-muted">{tr(lang, 'План', 'Plan', 'Reja')}</span><span className="font-mono text-text">{money(plan, lang)}</span>
        </div>
        {items.map(i => {
          const l = label(i.key);
          return (
            <div key={i.key} className="py-2 border-b border-border/60">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] text-text">{l.title}</span>
                <span className={`font-mono text-[12px] font-semibold ${i.value > 0 ? 'text-success' : i.value < 0 ? 'text-danger' : 'text-muted'}`}>{i.value === 0 ? '0' : money(i.value, lang, true)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-1">
                <span className="text-[10px] text-muted">{l.detail}</span>
                <div className="w-24 h-1.5 rounded-full bg-border/50 overflow-hidden flex-shrink-0">
                  <div className={`h-full ${i.value >= 0 ? 'bg-success' : 'bg-danger'}`} style={{ width: `${(Math.abs(i.value) / maxAbs) * 100}%` }} />
                </div>
              </div>
            </div>
          );
        })}
        <div className="flex justify-between text-[12px] py-1.5">
          <span className="font-semibold text-text">{tr(lang, 'Факт', 'Actual', 'Fakt')}</span><span className="font-mono font-semibold text-text">{money(fact, lang)}</span>
        </div>
      </div>
    );
  };

  return (
    <Card
      title={tr(lang, 'Почему отклонение', 'Why we are off plan', 'Nega rejadan farq bor')}
      subtitle={v.period.from && v.period.to ? `${dayLabel(v.period.from, lang)} — ${dayLabel(v.period.to, lang)}` : undefined}
    >
      {worst && (
        <div className="rounded-2xl bg-danger/5 border border-danger/20 px-4 py-3 mb-5 text-[13px] text-text">
          {tr(lang, 'Главная причина', 'Main reason', 'Asosiy sabab')}: <span className="font-semibold">{label(worst.key).title.toLowerCase()}</span> — <span className="text-danger font-mono">{money(worst.value, lang, true)}</span> ({label(worst.key).detail})
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-6">
        {block(tr(lang, 'Выручка', 'Revenue', 'Tushum'), v.revenue.plan, v.revenue.fact, v.revenue.items)}
        {block(tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda'), v.profit.plan, v.profit.fact, v.profit.items)}
      </div>
    </Card>
  );
};

// ── P&L plan vs actual ────────────────────────────────────────────────────────

const PLTable: React.FC<{ lang: Language; p: ProgressResult; plan: SavedPlan }> = ({ lang, p, plan }) => {
  const d = plan.drivers;
  const share = p.daysInMonth ? p.closedDays / p.daysInMonth : 0;
  const accrued = p.costs.source === 'accrued';
  const fc = (p.foodCost.factPct ?? p.foodCost.planPct) / 100;
  const factCost = (planMonth: number, actualMonth: number) => (accrued ? Math.round(planMonth * share) : actualMonth);
  // cost: lower is better; fixed: accrued from the plan until the month closes.
  const rows: { label: string; plan: number; planMtd: number; fact: number; forecast: number; cost?: boolean; fixed?: boolean; bold?: boolean }[] = [
    { label: tr(lang, 'Выручка', 'Revenue', 'Tushum'), plan: d.revenue, planMtd: p.revenue.planMtd, fact: p.revenue.factMtd, forecast: p.revenue.forecast },
    { label: tr(lang, 'Себестоимость', 'Cost of goods', 'Tannarx'), plan: plan.pl.cogs, planMtd: p.foodCost.planCogsMtd, fact: p.foodCost.factCogsMtd, forecast: Math.round(p.revenue.forecast * fc), cost: true },
    { label: tr(lang, 'ФОТ', 'Labor', 'Ish haqi'), plan: d.labor, planMtd: Math.round(d.labor * share), fact: factCost(d.labor, p.costs.month.labor), forecast: p.costs.month.labor, cost: true, fixed: true },
    { label: tr(lang, 'Аренда', 'Rent', 'Ijara'), plan: d.rent, planMtd: Math.round(d.rent * share), fact: factCost(d.rent, p.costs.month.rent), forecast: p.costs.month.rent, cost: true, fixed: true },
    { label: tr(lang, 'Коммунальные', 'Utilities', 'Kommunal'), plan: d.utilities, planMtd: Math.round(d.utilities * share), fact: factCost(d.utilities, p.costs.month.utilities), forecast: p.costs.month.utilities, cost: true, fixed: true },
    { label: tr(lang, 'Прочие', 'Other', 'Boshqa'), plan: d.otherOpex, planMtd: Math.round(d.otherOpex * share), fact: factCost(d.otherOpex, p.costs.month.otherOpex), forecast: p.costs.month.otherOpex, cost: true, fixed: true },
    { label: tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda'), plan: p.profit.plan, planMtd: p.profit.planMtd, fact: p.profit.factMtd, forecast: p.profit.forecast, bold: true },
  ];
  const heads = [
    tr(lang, 'Статья', 'Line', 'Modda'),
    tr(lang, 'План месяца', 'Month plan', 'Oy rejasi'),
    tr(lang, 'План на дату', 'Plan to date', 'Sanagacha reja'),
    tr(lang, 'Факт', 'Actual', 'Fakt'),
    tr(lang, '%', '%', '%'),
    p.state === 'past' ? tr(lang, 'Итог', 'Final', 'Yakun') : tr(lang, 'Прогноз', 'Forecast', 'Prognoz'),
  ];
  return (
    <Card title={tr(lang, 'P&L: план и факт', 'P&L: plan vs actual', 'P&L: reja va fakt')}>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="border-b border-border">
              {heads.map((h, i) => <th key={h + i} className={`pb-2.5 px-1 text-[10px] uppercase tracking-[0.12em] text-muted font-medium ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const ratio = r.planMtd > 0 ? Math.round((r.fact / r.planMtd) * 1000) / 10 : null;
              return (
                <tr key={r.label} className={`border-b border-border/50 last:border-0 ${r.bold ? 'font-semibold' : ''}`}>
                  <td className="py-2.5 px-1 text-[12px] text-text">{r.label}{r.fixed && accrued ? <span className="text-muted">*</span> : null}</td>
                  <td className="py-2.5 px-1 text-[12px] font-mono text-right text-muted">{money(r.plan, lang)}</td>
                  <td className="py-2.5 px-1 text-[12px] font-mono text-right text-muted">{money(r.planMtd, lang)}</td>
                  <td className="py-2.5 px-1 text-[12px] font-mono text-right text-text">{money(r.fact, lang)}</td>
                  <td className={`py-2.5 px-1 text-[12px] font-mono text-right ${statusColor(ratio, r.cost)}`}>{pct(ratio)}</td>
                  <td className="py-2.5 px-1 text-[12px] font-mono text-right text-text">{money(r.forecast, lang)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {accrued && (
        <p className="text-[10px] text-muted mt-3">
          * {tr(lang,
            'Зарплаты и аренда проводятся в iiko раз в месяц, поэтому до закрытия месяца они начисляются по плану пропорционально прошедшим дням. После закрытия месяца здесь будут реальные суммы из учёта iiko.',
            'Payroll and rent are posted in iiko once a month, so until the month closes they are accrued from the plan by elapsed days. Once it closes, real amounts from iiko’s books appear here.',
            'Ish haqi va ijara iiko’da oyiga bir marta o‘tkaziladi, shuning uchun oy yopilguncha ular o‘tgan kunlarga mutanosib ravishda reja bo‘yicha hisoblanadi. Oy yopilgach, bu yerda iiko hisobidagi haqiqiy summalar ko‘rinadi.')}
        </p>
      )}
    </Card>
  );
};

// ── Remaining days ────────────────────────────────────────────────────────────

const RemainingDays: React.FC<{ lang: Language; p: ProgressResult }> = ({ lang, p }) => {
  const [open, setOpen] = useState(false);
  const days = open ? p.needed.days : p.needed.days.slice(0, 7);
  return (
    <Card
      title={tr(lang, 'Сколько нужно в оставшиеся дни', 'What the remaining days need', 'Qolgan kunlarda qancha kerak')}
      subtitle={tr(lang, `Остаток плана: ${money(p.needed.gap, lang)}`, `Plan left: ${money(p.needed.gap, lang)}`, `Rejaning qolgani: ${money(p.needed.gap, lang)}`)}
    >
      <div className="divide-y divide-border/60">
        {days.map(d => {
          const diff = d.needed - d.plan;
          return (
            <div key={d.date} className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 text-[11px] text-muted">{weekdayShort(d.date, lang)}</span>
                <span className="text-[12px] text-text">{dayLabel(d.date, lang)}</span>
                {d.date === p.today && <Clock size={11} className="text-primary" />}
              </div>
              <div className="flex items-center gap-4 font-mono text-[12px]">
                <span className="text-muted hidden sm:inline">{tr(lang, 'план', 'plan', 'reja')} {money(d.plan, lang)}</span>
                <span className="text-text font-semibold">{money(d.needed, lang)}</span>
                <span className={`w-16 text-right text-[11px] ${diff > 0 ? 'text-danger' : 'text-success'}`}>{diff === 0 ? '' : money(diff, lang, true)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {p.needed.days.length > 7 && (
        <button onClick={() => setOpen(!open)} className="mt-3 flex items-center gap-1 text-[12px] text-muted hover:text-text">
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          {open ? tr(lang, 'Свернуть', 'Collapse', 'Yig‘ish') : tr(lang, `Все ${p.needed.days.length} дней`, `All ${p.needed.days.length} days`, `Barcha ${p.needed.days.length} kun`)}
        </button>
      )}
    </Card>
  );
};

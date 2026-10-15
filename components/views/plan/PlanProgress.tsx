// План и факт: current/past month view, redesigned per TRACE-mockups/plan.html.
// Markup uses the mockup classes (styles/rd/plan.css, scoped .rd-plan).
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Language } from '../../../types';
import { tr } from '../../../constants';
import type { SavedPlan, DrillDriver } from '../../../services/traceApi';
import type { ProgressResult, VarianceResult } from '../../../lib/planEngine';
import { money, full, pct, dayLabel, weekdayShort } from './format';

interface Props {
  lang: Language;
  plan: SavedPlan;
  progress: ProgressResult;
  variance: VarianceResult | null;
  onDrill?: (driver: DrillDriver) => void;
}

// pos ≥ 100%, warn 95–100%, neg below (inverse for costs).
export const tone = (v: number | null | undefined, inverse = false) => {
  if (v == null) return '';
  const x = inverse ? 200 - v : v;
  return x >= 100 ? 'pos' : x >= 95 ? 'warn' : 'neg';
};
const mln = (n: number) => (Math.round(n / 1e5) / 10).toLocaleString('ru-RU');

export const PlanProgress: React.FC<Props> = ({ lang, plan, progress: p, variance, onDrill }) => {
  if (p.state === 'future') return <FutureHero lang={lang} p={p} />;
  return (
    <>
      <Hero lang={lang} p={p} />
      {p.todayLive && <Today lang={lang} p={p} />}
      <Kpis lang={lang} p={p} onDrill={p.closedDays > 0 ? onDrill : undefined} />
      <Chart lang={lang} p={p} />
      {variance && variance.period.days > 0 && <Why lang={lang} v={variance} onDrill={onDrill} />}
      <div className="band two-col" style={p.needed.days.length ? undefined : { gridTemplateColumns: '1fr' }}>
        <PLTable lang={lang} p={p} plan={plan} />
        {p.needed.days.length > 0 && <Remaining lang={lang} p={p} />}
      </div>
    </>
  );
};

const FutureHero: React.FC<{ lang: Language; p: ProgressResult }> = ({ lang, p }) => (
  <section className="hero" aria-label={tr(lang, 'План месяца', 'Monthly plan', 'Oylik reja')}>
    <div>
      <div className="eyebrow">{tr(lang, 'Месяц ещё не начался', 'The month has not started', 'Oy hali boshlanmagan')}</div>
      <div className="big"><b>{money(p.revenue.plan, lang)}</b></div>
      <div className="line">{tr(lang, `план выручки, ${money(p.profit.plan, lang)} чистой прибыли`, `revenue plan, ${money(p.profit.plan, lang)} net profit`, `tushum rejasi, ${money(p.profit.plan, lang)} sof foyda`)}</div>
    </div>
    <div className="side-nums">
      <div><div className="l">{tr(lang, 'Средний чек', 'Average check', "O'rtacha chek")}</div><div className="v">{full(p.avgCheck.plan)}</div><div className="d">{full(p.checks.plan)} {tr(lang, 'чеков', 'checks', 'chek')}</div></div>
      {p.breakEven.dayRevenue != null && <div><div className="l">{tr(lang, 'Безубыточность', 'Break-even', 'Zararsizlik')}</div><div className="v">{money(p.breakEven.dayRevenue, lang)}</div><div className="d">{tr(lang, 'в день', 'a day', 'kuniga')}</div></div>}
    </div>
  </section>
);

const Hero: React.FC<{ lang: Language; p: ProgressResult }> = ({ lang, p }) => {
  const r = p.revenue, past = p.state === 'past';
  const factShare = r.plan > 0 ? Math.min(100, r.factMtd / r.plan * 100) : 0;
  const fcShare = r.plan > 0 ? Math.min(100, r.forecast / r.plan * 100) : 0;
  const should = r.plan > 0 ? Math.min(100, r.planMtd / r.plan * 100) : 0;
  const status = p.status === 'ahead' ? tr(lang, 'Опережаем план', 'Ahead of plan', 'Rejadan oldindamiz')
    : p.status === 'on_track' ? tr(lang, 'Почти в плане', 'Nearly on plan', 'Deyarli rejada')
    : p.status === 'behind' ? tr(lang, 'Отстаём от плана', 'Behind plan', 'Rejadan ortdamiz') : '';
  const lastClosed = p.series.filter(s => s.fact != null && s.date < p.today).slice(-1)[0]?.date;
  return (
    <section className="hero" aria-label={tr(lang, 'Выручка месяца', 'Month revenue', 'Oy tushumi')}>
      <div>
        <div className="eyebrow">{past ? tr(lang, 'Итог месяца', 'Month result', 'Oy yakuni') : lastClosed ? tr(lang, `Выручка с начала месяца, по ${dayLabel(lastClosed, lang)}`, `Revenue month to date, through ${dayLabel(lastClosed, lang)}`, `Oy boshidan tushum, ${dayLabel(lastClosed, lang)} gacha`) : tr(lang, 'Выручка с начала месяца', 'Revenue month to date', 'Oy boshidan tushum')}
          {status && <span className={`tag ${tone(r.pct) === 'pos' ? 'ok' : tone(r.pct) === 'warn' ? 'draft' : ''}`}>{status}</span>}</div>
        <div className="big"><b>{money(r.factMtd, lang)}</b><span className={`pc ${tone(r.pct)}`}>{pct(r.pct)}</span></div>
        <div className="line">
          {past
            ? <>{tr(lang, `план месяца ${money(r.plan, lang)}, ${r.gap >= 0 ? 'сверх плана' : 'не хватило'} `, `monthly plan ${money(r.plan, lang)}, ${r.gap >= 0 ? 'over plan by' : 'short by'} `, `oy rejasi ${money(r.plan, lang)}, ${r.gap >= 0 ? 'ortiq' : 'yetmadi'} `)}</>
            : <>{tr(lang, `план на эту дату ${money(r.planMtd, lang)}, ${r.gap >= 0 ? 'опережение' : 'отставание'} `, `plan to date ${money(r.planMtd, lang)}, ${r.gap >= 0 ? 'ahead by' : 'behind by'} `, `shu sanagacha reja ${money(r.planMtd, lang)}, ${r.gap >= 0 ? 'oldinda' : 'ortda'} `)}</>}
          <span className={r.gap >= 0 ? 'pos' : 'neg'}>{money(Math.abs(r.gap), lang)}</span>
        </div>
        <div className="mbar" aria-hidden="true">
          <div className="track">
            <div className="fill" style={{ width: `${factShare}%` }} />
            {!past && <><div className="fc" style={{ left: `${factShare}%`, width: `${Math.max(0, fcShare - factShare)}%` }} /><div className="mark" style={{ left: `${should}%` }}><span>{tr(lang, 'должно быть', 'should be', "bo'lishi kerak")}</span></div></>}
          </div>
          <div className="ends"><span>0</span><span>{past ? '' : tr(lang, 'штриховка: прогноз · ', 'hatched: forecast · ', 'chiziqli: prognoz · ')}{tr(lang, `план месяца ${money(r.plan, lang)}`, `monthly plan ${money(r.plan, lang)}`, `oy rejasi ${money(r.plan, lang)}`)}</span></div>
        </div>
      </div>
      <div className="side-nums">
        <div><div className="l">{past ? tr(lang, 'Выполнение', 'Achieved', 'Bajarildi') : tr(lang, 'Прогноз на месяц', 'Month forecast', 'Oy prognozi')}</div>
          <div className={`v ${tone(r.forecastPct)}`}>{money(r.forecast, lang)}</div><div className="d">{pct(r.forecastPct)} {tr(lang, 'плана', 'of plan', 'rejadan')}</div></div>
        {past
          ? <div><div className="l">{tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda')}</div><div className="v">{money(p.profit.factMtd, lang)}</div><div className="d">{tr(lang, `план ${money(p.profit.plan, lang)}`, `plan ${money(p.profit.plan, lang)}`, `reja ${money(p.profit.plan, lang)}`)}</div></div>
          : <div><div className="l">{tr(lang, 'Нужно в день', 'Needed a day', 'Kuniga kerak')}</div><div className="v">{money(p.needed.perDayAvg, lang)}</div><div className="d">{tr(lang, `в среднем, осталось ${p.remainingDays} дн.`, `on average, ${p.remainingDays} days left`, `o'rtacha, ${p.remainingDays} kun qoldi`)}</div></div>}
      </div>
    </section>
  );
};

const Today: React.FC<{ lang: Language; p: ProgressResult }> = ({ lang, p }) => {
  const t = p.todayLive!;
  const needed = p.needed.days.find(d => d.date === t.date)?.needed ?? t.plan;
  return (
    <section className="today" aria-labelledby="h-today">
      <div className="sec-head" style={{ marginBottom: 10 }}><h2 id="h-today"><span className="live" aria-hidden="true" />{tr(lang, 'Сегодня', 'Today', 'Bugun')}, {dayLabel(t.date, lang)}</h2><span className="sec-note">{tr(lang, 'Касса iikoFront', 'iikoFront till', 'iikoFront kassasi')}</span></div>
      <div className="strip">
        <div><div className="s-l">{tr(lang, 'Выручка сейчас', 'Revenue now', 'Hozirgi tushum')}</div><div className="s-v">{money(t.fact, lang)}</div><div className="s-d">{full(t.checks)} {tr(lang, 'чеков', 'checks', 'chek')}</div></div>
        <div><div className="s-l">{tr(lang, 'Обычно к этому часу', 'Usual by this hour', 'Odatda shu soatgacha')}</div><div className="s-v">{t.expectedByNow != null ? money(t.expectedByNow, lang) : '—'}</div><div className="s-d">{t.expectedByNow != null ? <><span className={tone(t.pct)}>{pct(t.pct)}</span> {tr(lang, 'от обычного', 'of usual', 'odatdagidan')}</> : tr(lang, 'мало истории', 'not enough history', 'tarix kam')}</div></div>
        <div><div className="s-l">{tr(lang, 'План дня', 'Day plan', 'Kun rejasi')}</div><div className="s-v">{money(t.plan, lang)}</div></div>
        <div><div className="s-l">{tr(lang, 'Нужно сегодня', 'Needed today', 'Bugun kerak')}</div><div className="s-v">{money(needed, lang)}</div><div className="s-d">{tr(lang, 'чтобы догнать месяц', 'to catch up the month', 'oyni quvib yetish uchun')}</div></div>
      </div>
    </section>
  );
};

const Kpis: React.FC<{ lang: Language; p: ProgressResult; onDrill?: (d: DrillDriver) => void }> = ({ lang, p, onDrill }) => {
  const fc = p.foodCost, be = p.breakEven, plan = tr(lang, 'план', 'plan', 'reja');
  const K = ({ label, v, pc, d, drill }: { label: string; v: React.ReactNode; pc?: React.ReactNode; d: React.ReactNode; drill?: DrillDriver | null }) => {
    const inner = <><div className="l">{label}{drill && <i className="ph ph-caret-right" aria-hidden="true" />}</div><div className="row"><span className="v">{v}</span>{pc}</div><div className="d">{d}</div></>;
    return drill && onDrill ? <button type="button" className="kpi" onClick={() => onDrill(drill)}>{inner}</button> : <div className="kpi">{inner}</div>;
  };
  const fcDelta = fc.known && fc.factPct != null ? Math.round((fc.factPct - fc.planPct) * 10) / 10 : null;
  return (
    <div className="kpis">
      <K label={tr(lang, 'Чеки', 'Checks', 'Cheklar')} v={full(p.checks.factMtd)} pc={<span className={`pc ${tone(p.checks.pct)}`}>{pct(p.checks.pct)}</span>} d={`${plan} ${full(p.checks.planMtd)}, ${tr(lang, 'гостей', 'guests', 'mehmon')} ${full(p.guests.factMtd)}`} drill="checks" />
      <K label={tr(lang, 'Средний чек', 'Average check', "O'rtacha chek")} v={full(p.avgCheck.factMtd)} pc={<span className={`pc ${tone(p.avgCheck.pct)}`}>{pct(p.avgCheck.pct)}</span>} d={`${plan} ${full(p.avgCheck.planMtd)}`} drill="avg_check" />
      <K label={tr(lang, 'Фудкост', 'Food cost', 'Fudkost')} v={fc.known ? pct(fc.factPct) : '—'}
        pc={fcDelta != null ? <span className={`pc ${fcDelta > 0.5 ? 'neg' : fcDelta > 0 ? 'warn' : 'pos'}`}>{fcDelta > 0 ? '+' : ''}{fcDelta.toLocaleString('ru-RU')} {tr(lang, 'п.п.', 'pp', 'p.p.')}</span> : undefined}
        d={fc.known ? `${plan} ${pct(fc.planPct)}, ${tr(lang, 'себестоимость', 'cost', 'tannarx')} ${money(fc.factCogsMtd, lang)}` : tr(lang, 'нет себестоимости в iiko', 'no dish costs in iiko', "iiko'da tannarx yo'q")} drill={fc.known ? 'food_cost' : null} />
      <K label={tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda')} v={money(p.profit.factMtd, lang)} pc={<span className={`pc ${tone(p.profit.pct)}`}>{pct(p.profit.pct)}</span>} d={`${plan} ${money(p.profit.planMtd, lang)}${p.state !== 'past' ? `, ${tr(lang, 'прогноз', 'forecast', 'prognoz')} ${money(p.profit.forecast, lang)}` : ''}`} />
      <K label={tr(lang, 'Безубыточность', 'Break-even', 'Zararsizlik')} v={be.monthRevenue != null ? money(be.monthRevenue, lang) : '—'}
        d={<>{be.dayRevenue != null ? `${money(be.dayRevenue, lang)} ${tr(lang, 'в день', 'a day', 'kuniga')}, ` : ''}<span className={be.reachedOn ? 'pos' : be.projectedOn ? '' : 'neg'}>{be.reachedOn ? tr(lang, `пройдена ${dayLabel(be.reachedOn, lang)}`, `reached ${dayLabel(be.reachedOn, lang)}`, `${dayLabel(be.reachedOn, lang)} erishildi`) : be.projectedOn ? tr(lang, `ожидается ${dayLabel(be.projectedOn, lang)}`, `expected ${dayLabel(be.projectedOn, lang)}`, `${dayLabel(be.projectedOn, lang)} kutilmoqda`) : tr(lang, 'не будет пройдена при текущем темпе', 'not reached at the current pace', "joriy sur'atda erishilmaydi")}</span></>} />
      <K label={tr(lang, 'Выручка', 'Revenue', 'Tushum')} v={money(p.revenue.factMtd, lang)} pc={<span className={`pc ${tone(p.revenue.pct)}`}>{pct(p.revenue.pct)}</span>} d={`${plan} ${money(p.revenue.planMtd, lang)}, ${tr(lang, 'месяц', 'month', 'oy')} ${money(p.revenue.plan, lang)}`} />
    </div>
  );
};

const Chart: React.FC<{ lang: Language; p: ProgressResult }> = ({ lang, p }) => {
  const [mode, setMode] = useState<'cum' | 'day'>('cum');
  const ref = useRef<HTMLDivElement>(null);
  const [W0, setW] = useState(900);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 900)); ro.observe(el); setW(el.clientWidth || 900);
    return () => ro.disconnect();
  }, []);
  const H = W0 < 560 ? 220 : 280, L = 48, R = 12, T = 12, B = 26;
  const n = p.series.length, cum = mode === 'cum';
  const cd = p.series.filter(s => s.fact != null).length;
  const planS = p.series.map(s => cum ? s.cumPlan : s.plan);
  const factS = p.series.map(s => cum ? s.cumFact : s.fact);
  const pace = (p.revenue.pct ?? 100) / 100;
  const fcS: number[] = useMemo(() => {
    if (!cum || !cd || cd >= n) return [];
    let c = factS[cd - 1] ?? 0;
    return p.series.slice(cd).map(s => (c += s.plan * pace));
  }, [cum, cd, n, p.series]);
  const be = cum ? p.breakEven.monthRevenue : p.breakEven.dayRevenue;
  const vals = [...planS, ...factS.filter((v): v is number => v != null), ...fcS, be ?? 0];
  const max = Math.max(1, ...vals) * 1.08;
  const step = max > 1e9 ? 200e6 : max > 4e8 ? 100e6 : max > 6e7 ? 10e6 : max > 1.5e7 ? 5e6 : 1e6;
  const x = (i: number) => L + (W0 - L - R) * (cum ? i / Math.max(1, n - 1) : (i + .5) / n);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const path = (a: (number | null)[], off = 0) => a.map((v, i) => v == null ? '' : `${i ? 'L' : 'M'}${x(i + off).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const grid: number[] = []; for (let v = 0; v <= max; v += step) grid.push(v);
  const bw = Math.max(3, (W0 - L - R) / n * .62);
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); const px = (e.clientX - r.left) * W0 / r.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(cum ? (px - L) / (W0 - L - R) * (n - 1) : (px - L) / (W0 - L - R) * n - .5))));
  };
  const s = hover != null ? p.series[hover] : null;
  return (
    <section className="band card-ph" aria-labelledby="h-ch">
      <div className="sec-head"><h2 id="h-ch">{tr(lang, 'План и факт по дням', 'Plan vs actual by day', "Kunlar bo'yicha reja va fakt")}</h2>
        <div className="seg small" role="group" aria-label={tr(lang, 'Вид', 'View', "Ko'rinish")}>
          <button aria-pressed={cum} onClick={() => setMode('cum')}>{tr(lang, 'Накопительно', 'Cumulative', 'Jamlanma')}</button>
          <button aria-pressed={!cum} onClick={() => setMode('day')}>{tr(lang, 'По дням', 'Daily', 'Kunlik')}</button>
        </div></div>
      <div className="chart-wrap" ref={ref}>
        <svg className="ch" viewBox={`0 0 ${W0} ${H}`} style={{ height: H, width: '100%' }} role="img" aria-label={tr(lang, 'График плана и факта по дням', 'Plan vs actual chart', 'Reja va fakt grafigi')}>
          {grid.map(v => <g key={v}><line x1={L} x2={W0 - R} y1={y(v)} y2={y(v)} stroke="var(--rule)" /><text x={L - 8} y={y(v) + 4} textAnchor="end">{v ? Math.round(v / 1e6) : 0}</text></g>)}
          {p.series.map((d, i) => (i === 0 || (i + 1) % 5 === 0) ? <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle">{i + 1}</text> : null)}
          {cum ? <>
            <path d={path(planS)} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="5 4" />
            {cd > 0 && <>
              <path d={`${path(factS.slice(0, cd))} L${x(cd - 1)} ${y(0)} L${x(0)} ${y(0)}Z`} fill="color-mix(in srgb, var(--text) 7%, transparent)" />
              <path d={path(factS.slice(0, cd))} fill="none" stroke="var(--text)" strokeWidth="2.2" />
            </>}
            {fcS.length > 0 && <path d={`M${x(cd - 1)} ${y(factS[cd - 1] ?? 0)}${fcS.map((v, i) => `L${x(cd + i).toFixed(1)} ${y(v).toFixed(1)}`).join('')}`} fill="none" stroke="var(--text-2)" strokeWidth="1.6" strokeDasharray="1.5 4" strokeLinecap="round" />}
            {cd > 0 && cd < n && <circle cx={x(cd - 1)} cy={y(factS[cd - 1] ?? 0)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}
          </> : <>
            {p.series.map((d, i) => d.fact == null ? null : <rect key={d.date} x={x(i) - bw / 2} y={y(d.fact)} width={bw} height={Math.max(0, y(0) - y(d.fact))} rx="2" fill={hover === i ? 'var(--accent)' : 'var(--text)'} />)}
            <path d={p.series.map((d, i) => `${i ? 'L' : 'M'}${(x(i) - (W0 - L - R) / n / 2).toFixed(1)} ${y(d.plan).toFixed(1)}H${(x(i) + (W0 - L - R) / n / 2).toFixed(1)}`).join('')} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="5 4" />
          </>}
          {be != null && be > 0 && <><line x1={L} x2={W0 - R} y1={y(be)} y2={y(be)} stroke="var(--neg)" strokeWidth="1.2" strokeDasharray="4 4" opacity=".75" />
            <text x={L + 6} y={y(be) - 6} style={{ fill: 'var(--neg)' }}>{tr(lang, `безубыточность ${mln(be)} млн`, `break-even ${mln(be)}M`, `zararsizlik ${mln(be)} mln`)}</text></>}
          {hover != null && cum && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--rule-strong)" />}
          <rect x={L} y={T} width={W0 - L - R} height={H - T - B} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
        {s && hover != null && (
          <div className="tipbox" style={{ left: Math.min(W0 - 180, x(hover) + 12), top: 8 }}>
            <b>{dayLabel(s.date, lang)}, {weekdayShort(s.date, lang).toLowerCase()}{s.holiday ? ` · ${s.holiday}` : ''}</b>
            {tr(lang, 'План', 'Plan', 'Reja')} {money(planS[hover], lang)}<br />
            {factS[hover] != null ? `${tr(lang, 'Факт', 'Actual', 'Fakt')} ${money(factS[hover]!, lang)}` : cum && fcS.length && hover >= cd ? `${tr(lang, 'Прогноз', 'Forecast', 'Prognoz')} ${money(fcS[hover - cd], lang)}` : tr(lang, 'Факта ещё нет', 'No actual yet', "Hali fakt yo'q")}
          </div>
        )}
      </div>
      <div className="key">{cum
        ? <><span><i />{tr(lang, 'Факт', 'Actual', 'Fakt')}</span><span><i className="p" />{tr(lang, 'План', 'Plan', 'Reja')}</span>{fcS.length > 0 && <span><i className="f" />{tr(lang, 'Прогноз при нынешнем темпе', 'Forecast at the current pace', "Joriy sur'atdagi prognoz")}</span>}<span><i className="be" />{tr(lang, 'Безубыточность', 'Break-even', 'Zararsizlik')}</span></>
        : <><span><i className="bar" />{tr(lang, 'Факт за день', 'Actual per day', 'Kunlik fakt')}</span><span><i className="p" />{tr(lang, 'План дня', 'Day plan', 'Kun rejasi')}</span><span><i className="be" />{tr(lang, 'Безубыточность в день', 'Break-even per day', 'Kunlik zararsizlik')}</span></>}</div>
    </section>
  );
};

const DRILL: Record<string, DrillDriver> = { checks: 'checks', avg_check: 'avg_check', food_cost: 'food_cost' };

const Why: React.FC<{ lang: Language; v: VarianceResult; onDrill?: (d: DrillDriver) => void }> = ({ lang, v, onDrill }) => {
  const d = v.drivers;
  const L = (key: string): [string, string] => {
    switch (key) {
      case 'checks': return [tr(lang, 'Количество чеков', 'Number of checks', 'Cheklar soni'), tr(lang, `${full(d.factChecks)} вместо ${full(d.planChecks)}`, `${full(d.factChecks)} vs ${full(d.planChecks)}`, `${full(d.planChecks)} o'rniga ${full(d.factChecks)}`)];
      case 'avg_check': return [tr(lang, 'Средний чек', 'Average check', "O'rtacha chek"), tr(lang, `${full(d.factAvgCheck)} вместо ${full(d.planAvgCheck)}`, `${full(d.factAvgCheck)} vs ${full(d.planAvgCheck)}`, `${full(d.planAvgCheck)} o'rniga ${full(d.factAvgCheck)}`)];
      case 'volume': return [tr(lang, 'Объём продаж', 'Sales volume', 'Savdo hajmi'), tr(lang, 'маржа с недополученной выручки', 'margin on the revenue gap', 'tushum farqidan marja')];
      case 'food_cost': return [tr(lang, 'Фудкост', 'Food cost', 'Fudkost'), v.foodCostKnown ? tr(lang, `${pct(d.factFoodCostPct)} вместо ${pct(d.planFoodCostPct)}`, `${pct(d.factFoodCostPct)} vs ${pct(d.planFoodCostPct)}`, `${pct(d.planFoodCostPct)} o'rniga ${pct(d.factFoodCostPct)}`) : tr(lang, 'нет себестоимости в iiko', 'no dish costs in iiko', "iiko'da tannarx yo'q")];
      case 'labor': return [tr(lang, 'ФОТ', 'Payroll', 'Ish haqi'), tr(lang, 'по учёту iiko или начислено по плану', 'iiko books or accrued per plan', "iiko hisobi yoki reja bo'yicha")];
      default: return [tr(lang, 'Прочие расходы', 'Other costs', 'Boshqa xarajatlar'), tr(lang, 'аренда, коммунальные, прочее', 'rent, utilities, other', 'ijara, kommunal, boshqa')];
    }
  };
  const all = [...v.revenue.items, ...v.profit.items.filter(i => i.key !== 'volume')];
  const worst = all.filter(i => i.value < 0).sort((a, b) => a.value - b.value)[0];
  const row = (i: { key: string; value: number }, max: number) => {
    const [t, det] = L(i.key);
    const drill = onDrill && DRILL[i.key] && (i.key !== 'food_cost' || v.foodCostKnown) ? DRILL[i.key] : null;
    const inner = <>
      <span><span className="t">{t}</span><span className="det">{det}</span></span>
      <span className="bar" aria-hidden="true"><i className={i.value < 0 ? 'n' : 'p'} style={{ width: `${Math.abs(i.value) / max * 50}%` }} /></span>
      <span className={`amt ${i.value < 0 ? 'neg' : i.value > 0 ? 'pos' : 'faint'}`}>{i.value === 0 ? '0' : money(i.value, lang, true)}</span>
    </>;
    return drill ? <button key={i.key} type="button" className="br-row" onClick={() => onDrill!(drill)}>{inner}</button> : <div key={i.key} className="br-row">{inner}</div>;
  };
  const bridge = (title: string, plan: number, fact: number, items: { key: string; value: number }[]) => {
    const max = Math.max(1, ...items.map(i => Math.abs(i.value)));
    return (
      <div className="bridge"><h3>{title}</h3>
        <div className="br-row edge"><span>{tr(lang, 'План', 'Plan', 'Reja')}</span><span /><span className="amt">{money(plan, lang)}</span></div>
        {items.map(i => row(i, max))}
        <div className="br-row end"><span>{tr(lang, 'Факт', 'Actual', 'Fakt')}</span><span /><span className="amt">{money(fact, lang)}</span></div>
      </div>
    );
  };
  return (
    <section className="band card-ph" aria-labelledby="h-why">
      <div className="sec-head"><h2 id="h-why">{tr(lang, 'Почему отклонение', 'Why we are off plan', 'Nega rejadan farq bor')}</h2>
        {v.period.from && v.period.to && <span className="sec-note">{dayLabel(v.period.from, lang)} – {dayLabel(v.period.to, lang)}{tr(lang, ', закрытые дни', ', closed days', ', yopilgan kunlar')}</span>}</div>
      {worst && <p className="why-lead">{tr(lang, 'Главная причина', 'Main reason', 'Asosiy sabab')}: <b>{L(worst.key)[0].toLowerCase()}</b>, <span className="neg">{money(worst.value, lang, true)}</span> ({L(worst.key)[1]}).</p>}
      <div className="bridges">
        {bridge(tr(lang, 'Выручка', 'Revenue', 'Tushum'), v.revenue.plan, v.revenue.fact, v.revenue.items)}
        {bridge(tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda'), v.profit.plan, v.profit.fact, v.profit.items)}
      </div>
    </section>
  );
};

const PLTable: React.FC<{ lang: Language; p: ProgressResult; plan: SavedPlan }> = ({ lang, p, plan }) => {
  const d = plan.drivers;
  const share = p.daysInMonth ? p.closedDays / p.daysInMonth : 0;
  const accrued = p.costs.source === 'accrued';
  const fc = (p.foodCost.factPct ?? p.foodCost.planPct) / 100;
  const factCost = (planMonth: number, actualMonth: number) => (accrued ? Math.round(planMonth * share) : actualMonth);
  const rows: { label: string; plan: number; planMtd: number; fact: number; forecast: number; cost?: boolean; fixed?: boolean; tot?: boolean }[] = [
    { label: tr(lang, 'Выручка', 'Revenue', 'Tushum'), plan: d.revenue, planMtd: p.revenue.planMtd, fact: p.revenue.factMtd, forecast: p.revenue.forecast },
    { label: tr(lang, 'Себестоимость', 'Cost of goods', 'Tannarx'), plan: plan.pl.cogs, planMtd: p.foodCost.planCogsMtd, fact: p.foodCost.factCogsMtd, forecast: Math.round(p.revenue.forecast * fc), cost: true },
    { label: tr(lang, 'ФОТ', 'Payroll', 'Ish haqi'), plan: d.labor, planMtd: Math.round(d.labor * share), fact: factCost(d.labor, p.costs.month.labor), forecast: p.costs.month.labor, cost: true, fixed: true },
    { label: tr(lang, 'Аренда', 'Rent', 'Ijara'), plan: d.rent, planMtd: Math.round(d.rent * share), fact: factCost(d.rent, p.costs.month.rent), forecast: p.costs.month.rent, cost: true, fixed: true },
    { label: tr(lang, 'Коммунальные', 'Utilities', 'Kommunal'), plan: d.utilities, planMtd: Math.round(d.utilities * share), fact: factCost(d.utilities, p.costs.month.utilities), forecast: p.costs.month.utilities, cost: true, fixed: true },
    { label: tr(lang, 'Прочие', 'Other', 'Boshqa'), plan: d.otherOpex, planMtd: Math.round(d.otherOpex * share), fact: factCost(d.otherOpex, p.costs.month.otherOpex), forecast: p.costs.month.otherOpex, cost: true, fixed: true },
    { label: tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda'), plan: p.profit.plan, planMtd: p.profit.planMtd, fact: p.profit.factMtd, forecast: p.profit.forecast, tot: true },
  ];
  return (
    <section className="card-ph" aria-labelledby="h-pl">
      <div className="sec-head"><h2 id="h-pl">{tr(lang, 'P&L: план и факт', 'P&L: plan vs actual', 'P&L: reja va fakt')}</h2><span className="sec-note">{tr(lang, 'млн сум', 'M UZS', "mln so'm")}</span></div>
      <table className="dt">
        <thead><tr><th>{tr(lang, 'Статья', 'Line', 'Modda')}</th><th className="r hide-sm">{tr(lang, 'План месяца', 'Month plan', 'Oy rejasi')}</th><th className="r">{tr(lang, 'План на дату', 'Plan to date', 'Sanagacha reja')}</th><th className="r">{tr(lang, 'Факт', 'Actual', 'Fakt')}</th><th className="r">%</th><th className="r hide-sm">{p.state === 'past' ? tr(lang, 'Итог', 'Final', 'Yakun') : tr(lang, 'Прогноз', 'Forecast', 'Prognoz')}</th></tr></thead>
        <tbody>{rows.map(r => {
          const ratio = r.planMtd > 0 ? Math.round(r.fact / r.planMtd * 1000) / 10 : null;
          return (
            <tr key={r.label} className={r.tot ? 'tot' : ''}>
              <td className="lbl">{r.label}{r.fixed && accrued ? <span className="faint">*</span> : null}</td>
              <td className="r hide-sm muted">{mln(r.plan)}</td><td className="r muted">{mln(r.planMtd)}</td><td className="r">{mln(r.fact)}</td>
              <td className={`r ${r.fixed && accrued ? 'faint' : tone(ratio, r.cost)}`}>{pct(ratio)}</td><td className="r hide-sm">{mln(r.forecast)}</td>
            </tr>
          );
        })}</tbody>
      </table>
      {accrued && <p className="acc-note">* {tr(lang, 'Зарплаты и аренда проводятся в iiko раз в месяц, поэтому до закрытия месяца они начисляются по плану, пропорционально прошедшим дням. Когда месяц закроется, здесь будут реальные суммы из учёта iiko.', 'Payroll and rent are posted in iiko once a month, so until the month closes they are accrued from the plan by elapsed days. Once it closes, the real amounts from iiko appear here.', "Ish haqi va ijara iiko'da oyiga bir marta o'tkaziladi, shuning uchun oy yopilguncha ular reja bo'yicha hisoblanadi.")}</p>}
    </section>
  );
};

const Remaining: React.FC<{ lang: Language; p: ProgressResult }> = ({ lang, p }) => {
  const [open, setOpen] = useState(false);
  const days = open ? p.needed.days : p.needed.days.slice(0, 7);
  return (
    <section className="card-ph" aria-labelledby="h-days">
      <div className="sec-head"><h2 id="h-days">{tr(lang, 'Сколько нужно в оставшиеся дни', 'What the remaining days need', 'Qolgan kunlarda qancha kerak')}</h2><span className="sec-note">{tr(lang, `остаток плана ${money(p.needed.gap, lang)}`, `plan left ${money(p.needed.gap, lang)}`, `rejaning qolgani ${money(p.needed.gap, lang)}`)}</span></div>
      <ul className="days">
        {days.map(d => {
          const diff = d.needed - d.plan;
          const now = d.date === p.today;
          return (
            <li key={d.date} className={now ? 'now' : ''}>
              <span className="wd">{now ? tr(lang, 'сег.', 'today', 'bugun') : weekdayShort(d.date, lang)}</span>
              <span>{dayLabel(d.date, lang)}<span className="pl"> · {tr(lang, 'план', 'plan', 'reja')} {money(d.plan, lang)}</span></span>
              <b style={{ fontWeight: 500 }}>{money(d.needed, lang)}</b>
              <span className={`df ${diff > 0 ? 'neg' : 'pos'}`}>{diff === 0 ? '' : money(diff, lang, true)}</span>
            </li>
          );
        })}
      </ul>
      {p.needed.days.length > 7 && (
        <button className="more" type="button" onClick={() => setOpen(o => !o)}>
          <i className={`ph ${open ? 'ph-caret-up' : 'ph-caret-down'}`} aria-hidden="true" />{open ? tr(lang, 'Свернуть', 'Collapse', "Yig'ish") : tr(lang, `Все ${p.needed.days.length} дней`, `All ${p.needed.days.length} days`, `Barcha ${p.needed.days.length} kun`)}
        </button>
      )}
    </section>
  );
};

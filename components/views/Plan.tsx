import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, RefreshCw, Sparkles, PenLine, Check, Target, Send } from 'lucide-react';
import { Language } from '../../types';
import { tr } from '../../constants';
import { Card } from '../ui/Card';
import { traceApi, SavedPlan, PlanUnsupportedError, PlanUnsupportedReason, DrillDriver, PlanSettings } from '../../services/traceApi';
import type { Suggestion, ProgressResult, VarianceResult } from '../../lib/planEngine';
import { shiftMonth } from '../../lib/planEngine';
import { tashkentDateStr } from '../../utils/tz';
import { PlanEditor, EditorStep } from './plan/PlanEditor';
import { PlanProgress } from './plan/PlanProgress';
import { DrilldownDrawer } from './plan/DrilldownDrawer';
import { PlanHistory } from './plan/PlanHistory';
import { warningText } from './plan/Warnings';
import { money, pct, monthLabel, monthName, full } from './plan/format';

const REFRESH_MS = 5 * 60 * 1000;

interface Props {
  lang: Language;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onContextReady?: (ctx: string) => void;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'unsupported'; reason: PlanUnsupportedReason }
  | { kind: 'error'; message: string }
  | { kind: 'empty'; suggestion: Suggestion | null; suggestionError?: string }
  | { kind: 'ready'; plan: SavedPlan; progress: ProgressResult; variance: VarianceResult | null };

export const Plan: React.FC<Props> = ({ lang, onShowToast, onContextReady }) => {
  const currentMonth = tashkentDateStr().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [state, setState] = useState<Load>({ kind: 'loading' });
  const [editor, setEditor] = useState<{ step?: EditorStep; manual?: boolean; suggestion: Suggestion | null } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [drill, setDrill] = useState<DrillDriver | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async (m: string, quiet = false) => {
    const id = ++reqId.current;
    if (!quiet) setState({ kind: 'loading' });
    else setRefreshing(true);
    try {
      const [{ plan, progress }, variance] = await Promise.all([
        traceApi.plan.progress(m),
        traceApi.plan.variance(m).catch(() => null),
      ]);
      if (id !== reqId.current) return;
      if (plan && progress) {
        setState({ kind: 'ready', plan, progress, variance });
      } else {
        const suggestion = await traceApi.plan.suggest(m).catch((e: any) => {
          if (e instanceof PlanUnsupportedError) throw e;
          return null;
        });
        if (id !== reqId.current) return;
        setState({ kind: 'empty', suggestion });
      }
      setUpdatedAt(new Date());
    } catch (e: any) {
      if (id !== reqId.current) return;
      if (e instanceof PlanUnsupportedError) setState({ kind: 'unsupported', reason: e.reason });
      else setState({ kind: 'error', message: e?.message ?? 'error' });
    } finally {
      if (id === reqId.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(month); }, [month, load]);

  // Live: the current month re-pulls today's iiko numbers every few minutes.
  useEffect(() => {
    if (month !== currentMonth || state.kind !== 'ready') return;
    const t = setInterval(() => load(month, true), REFRESH_MS);
    return () => clearInterval(t);
  }, [month, currentMonth, state.kind, load]);

  // Context for the AI assistant.
  useEffect(() => {
    if (!onContextReady || state.kind !== 'ready') return;
    const p = state.progress;
    onContextReady([
      `План на ${month}: выручка ${full(p.revenue.plan)}, чистая прибыль ${full(p.profit.plan)}.`,
      `С начала месяца: факт ${full(p.revenue.factMtd)} при плане ${full(p.revenue.planMtd)} (${pct(p.revenue.pct)}).`,
      `Прогноз на месяц: ${full(p.revenue.forecast)} (${pct(p.revenue.forecastPct)}). Нужно в день: ${full(p.needed.perDayAvg)}.`,
      `Чеки ${full(p.checks.factMtd)}/${full(p.checks.planMtd)}, средний чек ${full(p.avgCheck.factMtd)}/${full(p.avgCheck.planMtd)}, фудкост ${pct(p.foodCost.factPct)}/${pct(p.foodCost.planPct)}.`,
      state.variance ? `Отклонение выручки: ${state.variance.revenue.items.map(i => `${i.key} ${full(i.value)}`).join(', ')}; прибыли: ${state.variance.profit.items.map(i => `${i.key} ${full(i.value)}`).join(', ')}.` : '',
    ].filter(Boolean).join(' '));
  }, [state, month, onContextReady]);

  const acceptSuggestion = async (s: Suggestion) => {
    setAccepting(true);
    try {
      await traceApi.plan.save({ month, status: 'active', method: s.method, growthPct: s.growthPct, baseline: s.baseline, drivers: s.drivers, overrides: [] });
      onShowToast?.(tr(lang, 'План утверждён', 'Plan approved', 'Reja tasdiqlandi'), 'success');
      await load(month);
    } catch (e: any) {
      onShowToast?.(tr(lang, 'Не удалось сохранить план', 'Could not save the plan', 'Rejani saqlab bo‘lmadi'), 'error');
    } finally {
      setAccepting(false);
    }
  };

  const openEditor = async (opts: { step?: EditorStep; manual?: boolean }) => {
    const suggestion = state.kind === 'empty'
      ? state.suggestion
      : await traceApi.plan.suggest(month).catch(() => null);
    setEditor({ ...opts, suggestion });
  };

  const plan = state.kind === 'ready' ? state.plan : null;

  const sub = !plan ? (state.kind === 'empty' ? tr(lang, 'Плана на этот месяц ещё нет', 'No plan for this month yet', "Bu oy uchun reja hali yo'q") : '')
    : month === currentMonth ? null
    : month < currentMonth ? tr(lang, 'Месяц закрыт, цифры из учёта iiko', 'Month closed, figures from iiko books', "Oy yopilgan, iiko hisobidan raqamlar")
    : tr(lang, 'Месяц ещё не начался', 'The month has not started', 'Oy hali boshlanmagan');

  return (
    <>
      <div className="page-head rise">
        <div>
          <div className="h-row"><h1>{tr(lang, 'План и факт', 'Plan vs actual', 'Reja va fakt')}</h1>
            {plan && <span className={`tag ${plan.status === 'active' ? 'ok' : 'draft'}`}>{plan.status === 'active' ? tr(lang, 'Утверждён', 'Approved', 'Tasdiqlangan') : tr(lang, 'Черновик', 'Draft', 'Qoralama')}</span>}</div>
          <div className="sub">
            {sub ?? (state.kind === 'ready' && <>
              <button className={`refresh${refreshing ? ' spin' : ''}`} type="button" onClick={() => load(month, true)} disabled={refreshing}>
                <i className="ph ph-arrows-clockwise" aria-hidden="true" />{updatedAt ? `${tr(lang, 'Обновлено в', 'Updated at', 'Yangilandi')} ${updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : tr(lang, 'Обновить', 'Refresh', 'Yangilash')}
              </button>
              <span className="faint">{tr(lang, 'Цифры iiko подтягиваются каждые 5 минут', 'iiko figures refresh every 5 minutes', "iiko raqamlari har 5 daqiqada yangilanadi")}</span>
            </>)}
          </div>
        </div>
        {state.kind !== 'unsupported' && (
          <div className="seg-wrap"><div className="head-act">
            <div className="mon">
              <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={tr(lang, 'Предыдущий месяц', 'Previous month', 'Oldingi oy')}><i className="ph ph-caret-left" aria-hidden="true" /></button>
              <span>{monthLabel(month, lang)}</span>
              <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={tr(lang, 'Следующий месяц', 'Next month', 'Keyingi oy')}><i className="ph ph-caret-right" aria-hidden="true" /></button>
            </div>
            {plan && <button className="btn" type="button" onClick={() => openEditor({})}><i className="ph ph-pencil-simple" aria-hidden="true" /><span>{tr(lang, 'Изменить план', 'Edit plan', "Rejani o'zgartirish")}</span></button>}
          </div></div>
        )}
      </div>

      <div className="rise" style={{ animationDelay: '.06s' }}>
        {state.kind === 'loading' && <div className="hero"><div><div className="sk w5" /><div className="sk w7" style={{ height: 40 }} /><div className="sk w9" /></div><div><div className="sk w7" /><div className="sk w5" /></div></div>}
        {state.kind === 'unsupported' && <Unsupported lang={lang} reason={state.reason} />}
        {state.kind === 'error' && (
          <div className="sugg-card">
            <h2>{tr(lang, 'Не удалось загрузить данные из iiko', 'Could not load data from iiko', "iiko'dan ma'lumot yuklab bo'lmadi")}</h2>
            <p className="exp mono">{state.message}</p>
            <div className="acts"><button className="btn" type="button" onClick={() => load(month)}>{tr(lang, 'Повторить', 'Retry', 'Qayta urinish')}</button></div>
          </div>
        )}
        {state.kind === 'empty' && (
          <SuggestionCard lang={lang} month={month} suggestion={state.suggestion} accepting={accepting}
            onAccept={acceptSuggestion} onTune={() => openEditor({ step: 0 })} onManual={() => openEditor({ manual: true })} />
        )}
        {state.kind === 'ready' && <PlanProgress lang={lang} plan={state.plan} progress={state.progress} variance={state.variance} onDrill={setDrill} />}
      </div>

      {(state.kind === 'ready' || state.kind === 'empty') && (
        <>
          <TelegramToggle lang={lang} onShowToast={onShowToast} />
          <PlanHistory lang={lang} selected={month} onSelect={setMonth} reloadKey={plan?.updatedAt ?? state.kind} />
        </>
      )}

      {drill && <DrilldownDrawer lang={lang} month={month} driver={drill} onClose={() => setDrill(null)} />}

      {editor && (
        <PlanEditor
          lang={lang} month={month} suggestion={editor.suggestion} plan={plan}
          startStep={editor.step} manual={editor.manual}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(month); }}
          onDeleted={() => { setEditor(null); load(month); }}
          onShowToast={onShowToast}
        />
      )}
    </>
  );
};

// ── Empty state: the plan TRACE prepared ──────────────────────────────────────

const SuggestionCard: React.FC<{
  lang: Language; month: string; suggestion: Suggestion | null; accepting: boolean;
  onAccept: (s: Suggestion) => void; onTune: () => void; onManual: () => void;
}> = ({ lang, month, suggestion: s, accepting, onAccept, onTune, onManual }) => {
  if (!s) {
    return (
      <section className="sugg-card" aria-labelledby="h-sugg">
        <h2 id="h-sugg">{tr(lang, 'Плана на этот месяц нет', 'No plan for this month', "Bu oy uchun reja yo'q")}</h2>
        <p className="exp">{tr(lang, 'Не удалось собрать историю продаж из iiko для автоплана. Введите свой план, остальное TRACE посчитает сам.', 'Could not pull sales history from iiko for an automatic plan. Enter your own plan and TRACE will do the rest.', "Avtomatik reja uchun iiko'dan savdo tarixini olib bo'lmadi. O'z rejangizni kiriting.")}</p>
        <div className="acts"><button className="btn solid" type="button" onClick={onManual}><i className="ph ph-pencil-simple-line" aria-hidden="true" />{tr(lang, 'Ввести свой план', 'Enter my own plan', "O'z rejamni kiritish")}</button></div>
      </section>
    );
  }

  const base = s.method === 'ly' ? s.baseline.ly : s.baseline.trend;
  const lyMonth = s.baseline.ly.from.slice(0, 7);
  const explanation = s.method === 'ly'
    ? tr(lang,
        `${monthName(lyMonth, lang)} ${lyMonth.slice(0, 4)} (день недели к дню недели): ${money(base.revenue, lang)} → +${s.growthPct}% = ${money(s.drivers.revenue, lang)}`,
        `${monthName(lyMonth, lang)} ${lyMonth.slice(0, 4)} (weekday to weekday): ${money(base.revenue, lang)} → +${s.growthPct}% = ${money(s.drivers.revenue, lang)}`,
        `${monthName(lyMonth, lang)} ${lyMonth.slice(0, 4)} (hafta kuni bo‘yicha): ${money(base.revenue, lang)} → +${s.growthPct}% = ${money(s.drivers.revenue, lang)}`)
    : tr(lang,
        `Текущий темп за 8 недель: ${money(base.revenue, lang)} → +${s.growthPct}% = ${money(s.drivers.revenue, lang)}`,
        `Current 8-week pace: ${money(base.revenue, lang)} → +${s.growthPct}% = ${money(s.drivers.revenue, lang)}`,
        `8 haftalik joriy sur’at: ${money(base.revenue, lang)} → +${s.growthPct}% = ${money(s.drivers.revenue, lang)}`);

  const tiles = [
    { label: tr(lang, 'Выручка', 'Revenue', 'Tushum'), value: money(s.drivers.revenue, lang) },
    { label: tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda'), value: money(s.pl.netProfit, lang), sub: pct(s.pl.netProfitPct), tone: s.pl.netProfit >= 0 ? 'text-success' : 'text-danger' },
    { label: tr(lang, 'Средний чек', 'Average check', 'O‘rtacha chek'), value: full(s.drivers.avgCheck), sub: `${full(s.drivers.checks)} ${tr(lang, 'чеков', 'checks', 'chek')}` },
    { label: tr(lang, 'Фудкост', 'Food cost', 'Tannarx'), value: pct(s.drivers.foodCostPct) },
    { label: tr(lang, 'Безубыточность', 'Break-even', 'Zararsizlik'), value: s.pl.breakEvenDay != null ? money(s.pl.breakEvenDay, lang) : '—', sub: tr(lang, 'в день', 'a day', 'kuniga') },
  ];

  return (
    <section className="sugg-card" aria-labelledby="h-sugg">
      <h2 id="h-sugg">{tr(lang, `Мы подготовили план на ${monthName(month, lang).toLowerCase()}`, `We prepared a plan for ${monthName(month, lang)}`, `${monthName(month, lang)} uchun reja tayyorladik`)}</h2>
      <p className="exp">{explanation}</p>
      <div className="tiles">
        {tiles.map(t => (
          <div key={t.label}><div className="s-l">{t.label}</div><div className={`s-v${t.tone === 'text-success' ? ' pos' : t.tone === 'text-danger' ? ' neg' : ''}`}>{t.value}</div>{t.sub && <div className="s-d">{t.sub}</div>}</div>
        ))}
      </div>
      {s.warnings?.length > 0 && <ul className="warns">{s.warnings.map((w, i) => <li key={i}><i className="ph ph-warning" aria-hidden="true" /><span>{warningText(w, lang)}</span></li>)}</ul>}
      <div className="acts">
        <button className="btn solid" type="button" onClick={() => onAccept(s)} disabled={accepting}><i className="ph ph-check" aria-hidden="true" />{tr(lang, 'Принять план', 'Accept plan', 'Rejani qabul qilish')}</button>
        <button className="btn" type="button" onClick={onTune}><i className="ph ph-sliders-horizontal" aria-hidden="true" />{tr(lang, 'Настроить', 'Adjust', 'Sozlash')}</button>
        <button className="btn" type="button" onClick={onManual}><i className="ph ph-pencil-simple-line" aria-hidden="true" />{tr(lang, 'Ввести свой план', 'Enter my own plan', "O'z rejamni kiritish")}</button>
      </div>
    </section>
  );
};

// Morning pace message in the reports Telegram chat (09:00 Tashkent).
const TelegramToggle: React.FC<{ lang: Language; onShowToast?: Props['onShowToast'] }> = ({ lang, onShowToast }) => {
  const [s, setS] = useState<PlanSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { traceApi.plan.settings().then(setS).catch(() => {}); }, []);
  if (!s) return null;

  const toggle = async () => {
    setSaving(true);
    try { setS(await traceApi.plan.saveSettings(!s.telegramDaily)); }
    catch { onShowToast?.(tr(lang, 'Не удалось сохранить', 'Could not save', 'Saqlab bo‘lmadi'), 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="tg rise" style={{ animationDelay: '.1s' }}>
      <i className="ph ph-telegram-logo" aria-hidden="true" />
      <div><b>{tr(lang, 'Утренняя сводка в Telegram', 'Morning summary in Telegram', "Telegram'da ertalabki xulosa")}</b>
        <p>{s.telegramConnected
          ? tr(lang, 'Каждый день в 9:00: вчера, темп месяца, прогноз, сколько нужно сегодня, и предупреждение, если план под угрозой.', "Every day at 9:00: yesterday, month pace, forecast, today's target and a warning if the plan is at risk.", "Har kuni 9:00 da: kecha, oy sur'ati, prognoz, bugungi maqsad.")
          : tr(lang, 'Подключите Telegram в Настройках → Отчёты, чтобы получать сводку каждое утро.', 'Connect Telegram in Settings → Reports to get the summary every morning.', "Sozlamalar → Hisobotlar'da Telegram'ni ulang.")}</p></div>
      {s.telegramConnected && <button className="sw" role="switch" aria-checked={s.telegramDaily} onClick={toggle} disabled={saving} aria-label={tr(lang, 'Утренняя сводка в Telegram', 'Morning summary in Telegram', 'Ertalabki xulosa')} />}
    </div>
  );
};

const Unsupported: React.FC<{ lang: Language; reason: PlanUnsupportedReason }> = ({ lang, reason }) => {
  const text = reason === 'all_branches'
    ? tr(lang, 'План ведётся по каждому филиалу отдельно. Выберите филиал в переключателе сверху.', 'Plans are kept per branch. Pick a branch in the switcher above.', 'Reja har bir filial uchun alohida yuritiladi. Yuqoridagi tanlagichdan filialni tanlang.')
    : reason === 'not_restaurant'
      ? tr(lang, 'План и факт пока доступен только для ресторанов.', 'Plan vs actual is available for restaurants only for now.', 'Reja va fakt hozircha faqat restoranlar uchun mavjud.')
      : reason === 'no_credentials'
        ? tr(lang, 'Подключите iiko, чтобы строить план по реальным продажам.', 'Connect iiko to build plans from real sales.', 'Haqiqiy savdo bo‘yicha reja tuzish uchun iiko’ni ulang.')
        : tr(lang, 'План и факт пока работает только с iiko.', 'Plan vs actual works with iiko only for now.', 'Reja va fakt hozircha faqat iiko bilan ishlaydi.');
  return <section className="sugg-card"><p className="exp" style={{ margin: 0 }}>{text}</p></section>;
};


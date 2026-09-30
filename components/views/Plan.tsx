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
import { WarningList } from './plan/Warnings';
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

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[22px] font-bold text-text tracking-tight">{tr(lang, 'План и факт', 'Plan vs actual', 'Reja va fakt')}</h1>
          {plan && (
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-[0.08em] ${plan.status === 'active' ? 'bg-success/10 text-success' : 'bg-amber-500/10 text-amber-500'}`}>
              {plan.status === 'active' ? tr(lang, 'Утверждён', 'Approved', 'Tasdiqlangan') : tr(lang, 'Черновик', 'Draft', 'Qoralama')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {state.kind !== 'unsupported' && (
            <div className="flex items-center border border-border rounded-xl bg-card overflow-hidden">
              <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="p-2 text-muted hover:text-text hover:bg-card-hover transition-colors"><ChevronLeft size={15} /></button>
              <span className="px-2 text-[13px] font-medium text-text min-w-[120px] text-center">{monthLabel(month, lang)}</span>
              <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="p-2 text-muted hover:text-text hover:bg-card-hover transition-colors"><ChevronRight size={15} /></button>
            </div>
          )}
          {plan && (
            <button onClick={() => openEditor({})} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium border border-border bg-card text-text hover:bg-card-hover transition-colors">
              <Pencil size={13} /><span className="hidden sm:inline">{tr(lang, 'Изменить план', 'Edit plan', 'Rejani o‘zgartirish')}</span>
            </button>
          )}
        </div>
      </div>

      {state.kind === 'ready' && (
        <div className="flex items-center gap-2 text-[11px] text-muted -mt-2">
          <button onClick={() => load(month, true)} disabled={refreshing} className="flex items-center gap-1 hover:text-text transition-colors disabled:opacity-50">
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            {updatedAt ? `${tr(lang, 'Обновлено', 'Updated', 'Yangilandi')} ${updatedAt.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </button>
          {month === currentMonth && <span>· {tr(lang, 'обновляется каждые 5 минут', 'refreshes every 5 minutes', 'har 5 daqiqada yangilanadi')}</span>}
        </div>
      )}

      {state.kind === 'loading' && <LoadingSkeleton />}

      {state.kind === 'unsupported' && <Unsupported lang={lang} reason={state.reason} />}

      {state.kind === 'error' && (
        <Card>
          <p className="text-[13px] text-text mb-1">{tr(lang, 'Не удалось загрузить данные из iiko', 'Could not load data from iiko', 'iiko’dan ma’lumot yuklab bo‘lmadi')}</p>
          <p className="text-[11px] text-muted mb-3 font-mono">{state.message}</p>
          <button onClick={() => load(month)} className="px-3 py-2 rounded-xl text-[12px] font-medium border border-border hover:bg-card-hover">{tr(lang, 'Повторить', 'Retry', 'Qayta urinish')}</button>
        </Card>
      )}

      {state.kind === 'empty' && (
        <SuggestionCard
          lang={lang} month={month} suggestion={state.suggestion} accepting={accepting}
          onAccept={acceptSuggestion}
          onTune={() => openEditor({ step: 0 })}
          onManual={() => openEditor({ manual: true })}
        />
      )}

      {state.kind === 'ready' && <PlanProgress lang={lang} plan={state.plan} progress={state.progress} variance={state.variance} onDrill={setDrill} />}

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
    </div>
  );
};

// ── Empty state: the plan TRACE prepared ──────────────────────────────────────

const SuggestionCard: React.FC<{
  lang: Language; month: string; suggestion: Suggestion | null; accepting: boolean;
  onAccept: (s: Suggestion) => void; onTune: () => void; onManual: () => void;
}> = ({ lang, month, suggestion: s, accepting, onAccept, onTune, onManual }) => {
  if (!s) {
    return (
      <Card>
        <div className="flex flex-col items-center text-center py-8 gap-3">
          <Target size={28} className="text-muted/50" />
          <p className="text-[14px] font-semibold text-text">{tr(lang, 'Плана на этот месяц нет', 'No plan for this month', 'Bu oy uchun reja yo‘q')}</p>
          <p className="text-[12px] text-muted max-w-sm">{tr(lang, 'Не удалось собрать историю продаж из iiko для автоплана. Введите свой план — всё остальное TRACE посчитает сам.', 'Could not pull sales history from iiko for an automatic plan. Enter your own plan and TRACE will do the rest.', 'Avtomatik reja uchun iiko’dan savdo tarixini olib bo‘lmadi. O‘z rejangizni kiriting — qolganini TRACE hisoblaydi.')}</p>
          <button onClick={onManual} className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold bg-primary text-white hover:bg-primary-hover"><PenLine size={14} />{tr(lang, 'Ввести свой план', 'Enter my own plan', 'O‘z rejamni kiritish')}</button>
        </div>
      </Card>
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
    <Card>
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-xl bg-primary/10 text-primary flex-shrink-0"><Sparkles size={18} /></div>
        <div>
          <h2 className="text-[16px] font-semibold text-text tracking-tight">
            {tr(lang, `Мы подготовили план на ${monthName(month, lang).toLowerCase()}`, `We prepared a plan for ${monthName(month, lang)}`, `${monthName(month, lang)} uchun reja tayyorladik`)}
          </h2>
          <p className="text-[12px] text-muted mt-0.5">{explanation}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {tiles.map(t => (
          <div key={t.label} className="rounded-2xl bg-background border border-border p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted font-medium mb-1">{t.label}</p>
            <p className={`text-[17px] font-bold font-mono ${t.tone ?? 'text-text'}`}>{t.value}</p>
            {t.sub && <p className="text-[11px] text-muted">{t.sub}</p>}
          </div>
        ))}
      </div>

      <div className="mb-5"><WarningList lang={lang} warnings={s.warnings} /></div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => onAccept(s)} disabled={accepting} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50">
          <Check size={15} />{tr(lang, 'Принять план', 'Accept plan', 'Rejani qabul qilish')}
        </button>
        <button onClick={onTune} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-medium border border-border text-text hover:bg-card-hover transition-colors">
          <Pencil size={14} />{tr(lang, 'Настроить', 'Adjust', 'Sozlash')}
        </button>
        <button onClick={onManual} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-medium text-muted hover:text-text hover:bg-card-hover transition-colors">
          <PenLine size={14} />{tr(lang, 'Ввести свой план', 'Enter my own plan', 'O‘z rejamni kiritish')}
        </button>
      </div>
    </Card>
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
    <div className="glass rounded-3xl p-4 flex items-center gap-3">
      <div className="p-2 rounded-xl bg-secondary/10 text-secondary flex-shrink-0"><Send size={16} /></div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-text">{tr(lang, 'Утренняя сводка в Telegram', 'Morning summary in Telegram', 'Telegram’da ertalabki xulosa')}</p>
        <p className="text-[11px] text-muted">
          {s.telegramConnected
            ? tr(lang, 'Каждый день в 9:00: вчера, темп месяца, прогноз, сколько нужно сегодня и предупреждение, если план под угрозой.', 'Every day at 9:00: yesterday, month pace, forecast, today’s target and a warning if the plan is at risk.', 'Har kuni 9:00 da: kecha, oy sur’ati, prognoz, bugungi maqsad va reja xavf ostida bo‘lsa ogohlantirish.')
            : tr(lang, 'Подключите Telegram в Настройках → Отчёты, чтобы получать сводку по плану каждое утро.', 'Connect Telegram in Settings → Reports to get the plan summary every morning.', 'Har kuni ertalab reja xulosasini olish uchun Sozlamalar → Hisobotlar’da Telegram’ni ulang.')}
        </p>
      </div>
      {s.telegramConnected && (
        <button
          role="switch"
          aria-checked={s.telegramDaily}
          onClick={toggle}
          disabled={saving}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${s.telegramDaily ? 'bg-primary' : 'bg-border'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${s.telegramDaily ? 'translate-x-5' : ''}`} />
        </button>
      )}
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
  return (
    <Card>
      <div className="flex flex-col items-center text-center py-10 gap-3">
        <Target size={28} className="text-muted/50" />
        <p className="text-[13px] text-muted max-w-md">{text}</p>
      </div>
    </Card>
  );
};

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-5">
    <div className="glass rounded-3xl p-5"><div className="h-28 bg-border/50 rounded-xl animate-pulse" /></div>
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="glass rounded-3xl p-4"><div className="h-14 bg-border/50 rounded-lg animate-pulse" /></div>)}
    </div>
    <div className="glass rounded-3xl p-5"><div className="h-60 bg-border/50 rounded-xl animate-pulse" /></div>
  </div>
);

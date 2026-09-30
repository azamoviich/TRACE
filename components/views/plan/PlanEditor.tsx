import React, { useEffect, useMemo, useState } from 'react';
import { X, Pin, PinOff, Check, ChevronLeft, ChevronRight, Trash2, AlertTriangle, CalendarDays, SlidersHorizontal, Layers } from 'lucide-react';
import { Language } from '../../../types';
import { tr } from '../../../constants';
import { traceApi, SavedPlan } from '../../../services/traceApi';
import { PlanDrivers, Suggestion, DayOverride, splitDays, computePL, monthDays, weekday } from '../../../lib/planEngine';
import { money, full, pct, monthName, dayLabel, NumberInput, WEEKDAY_HEADERS } from './format';
import { WarningList } from './Warnings';

type Method = 'ly' | 'trend' | 'manual';
export type EditorStep = 0 | 1 | 2;

interface Props {
  lang: Language;
  month: string;
  suggestion: Suggestion | null;
  plan: SavedPlan | null;
  startStep?: EditorStep;
  manual?: boolean; // "enter my own plan" — opens on the drivers step in manual mode
  onClose: () => void;
  onSaved: (plan: SavedPlan) => void;
  onDeleted: () => void;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

// Weekday weights (index 0 = Sunday) recovered from a day list.
function weightsFrom(days: { date: string; weight: number }[] | undefined): number[] {
  const w = Array(7).fill(1);
  const seen = Array(7).fill(false);
  for (const d of days ?? []) {
    const i = weekday(d.date);
    if (!seen[i]) { w[i] = d.weight || 1; seen[i] = true; }
  }
  return w;
}

export const PlanEditor: React.FC<Props> = ({ lang, month, suggestion, plan, startStep, manual, onClose, onSaved, onDeleted, onShowToast }) => {
  const [step, setStep] = useState<EditorStep>(startStep ?? (manual ? 1 : 0));
  const [method, setMethod] = useState<Method>(plan?.method ?? (manual ? 'manual' : suggestion?.method ?? 'ly'));
  const [growth, setGrowth] = useState<number>(plan?.growthPct ?? suggestion?.growthPct ?? 6);
  const [drivers, setDrivers] = useState<PlanDrivers>(() => plan?.drivers ?? suggestion?.drivers ?? {
    revenue: 0, checks: 0, avgCheck: 0, guests: 0, foodCostPct: 0, labor: 0, rent: 0, utilities: 0, otherOpex: 0,
  });
  const [overrides, setOverrides] = useState<Map<string, DayOverride>>(() => new Map(
    (plan?.days ?? []).filter(d => d.isOverride).map(d => [d.date, { date: d.date, revenue: d.revenue, checks: d.checks, note: d.note }]),
  ));
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const weights = useMemo(() => weightsFrom(suggestion?.days ?? plan?.days), [suggestion, plan]);
  const dim = monthDays(month).length;
  const pl = useMemo(() => computePL(drivers, dim), [drivers, dim]);
  const split = useMemo(
    () => splitDays(month, drivers.revenue, drivers.checks, weights, [...overrides.values()]),
    [month, drivers.revenue, drivers.checks, weights, overrides],
  );

  const baseline = suggestion?.baseline;
  const costs = baseline?.costs;

  // Re-derive the sales drivers from a baseline × growth — used when the
  // owner picks LY/trend or moves the growth slider. Costs are left alone.
  const applyBase = (m: 'ly' | 'trend', g: number) => {
    if (!baseline) return;
    const b = m === 'ly' ? baseline.ly : baseline.trend;
    const k = 1 + g / 100;
    const revenue = Math.round(b.revenue * k);
    const checks = Math.round(b.checks * k);
    setDrivers(d => ({ ...d, revenue, checks, guests: Math.round(b.guests * k), avgCheck: checks > 0 ? Math.round(revenue / checks) : d.avgCheck }));
  };

  // Any hand edit of a driver makes this the owner's own plan.
  const edit = (patch: Partial<PlanDrivers>) => { setDrivers(d => ({ ...d, ...patch })); setMethod('manual'); };
  const setRevenue = (v: number) => edit({ revenue: v, avgCheck: drivers.checks > 0 ? Math.round(v / drivers.checks) : drivers.avgCheck });
  const setChecks = (v: number) => edit({ checks: v, revenue: Math.round(v * drivers.avgCheck) });
  const setAvgCheck = (v: number) => edit({ avgCheck: v, revenue: Math.round(drivers.checks * v) });

  const pinnedTotal = [...overrides.values()].reduce((s, o) => s + o.revenue, 0);
  const pinnedOverflow = pinnedTotal > drivers.revenue;

  const save = async (status: 'draft' | 'active') => {
    setSaving(true);
    try {
      const saved = await traceApi.plan.save({
        month, status, method,
        growthPct: method === 'manual' ? null : growth,
        baseline: suggestion?.baseline ?? plan?.baseline ?? {},
        drivers,
        overrides: [...overrides.values()],
      });
      onShowToast?.(status === 'active'
        ? tr(lang, 'План утверждён', 'Plan approved', 'Reja tasdiqlandi')
        : tr(lang, 'Черновик сохранён', 'Draft saved', 'Qoralama saqlandi'), 'success');
      onSaved(saved);
    } catch (e: any) {
      onShowToast?.(tr(lang, 'Не удалось сохранить план', 'Could not save the plan', 'Rejani saqlab bo‘lmadi') + (e?.message ? `: ${e.message}` : ''), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    try {
      await traceApi.plan.remove(month);
      onShowToast?.(tr(lang, 'План удалён', 'Plan deleted', 'Reja o‘chirildi'), 'info');
      onDeleted();
    } catch {
      onShowToast?.(tr(lang, 'Не удалось удалить план', 'Could not delete the plan', 'Rejani o‘chirib bo‘lmadi'), 'error');
      setSaving(false);
    }
  };

  const steps = [
    { icon: Layers, label: tr(lang, 'Основа', 'Baseline', 'Asos') },
    { icon: SlidersHorizontal, label: tr(lang, 'Показатели', 'Drivers', 'Ko‘rsatkichlar') },
    { icon: CalendarDays, label: tr(lang, 'По дням', 'By day', 'Kunlar bo‘yicha') },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-5xl max-h-[94vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-border">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium">{tr(lang, 'План на', 'Plan for', 'Reja')}</p>
            <h2 className="font-display text-[18px] font-bold text-text tracking-tight">{monthName(month, lang)} {month.slice(0, 4)}</h2>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {steps.map((s, i) => (
              <button
                key={i}
                onClick={() => setStep(i as EditorStep)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium whitespace-nowrap transition-colors ${
                  step === i ? 'bg-primary text-white' : 'text-muted hover:text-text hover:bg-card-hover'
                }`}
              >
                <s.icon size={13} />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-card-hover transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid lg:grid-cols-[1fr_300px] gap-5">
            <div className="min-w-0">
              {step === 0 && (
                <BaselineStep
                  lang={lang} month={month} suggestion={suggestion} method={method} growth={growth}
                  onMethod={m => { setMethod(m); if (m !== 'manual') applyBase(m, growth); }}
                  onGrowth={g => { setGrowth(g); const m = method === 'manual' ? (suggestion?.method ?? 'ly') : method; setMethod(m); applyBase(m, g); }}
                />
              )}
              {step === 1 && (
                <DriversStep
                  lang={lang} drivers={drivers} pl={pl} costs={costs}
                  setRevenue={setRevenue} setChecks={setChecks} setAvgCheck={setAvgCheck} edit={edit}
                />
              )}
              {step === 2 && (
                <DaysStep
                  lang={lang} month={month} days={split.days} overrides={overrides} editingDay={editingDay}
                  setEditingDay={setEditingDay}
                  onPin={(date, revenue, note) => setOverrides(m => new Map(m).set(date, { date, revenue, note: note ?? null }))}
                  onUnpin={date => setOverrides(m => { const n = new Map(m); n.delete(date); return n; })}
                  pinnedOverflow={pinnedOverflow} total={split.revenue}
                />
              )}
            </div>
            <LivePL lang={lang} pl={pl} drivers={drivers} dim={dim} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-border flex-wrap">
          <div className="flex items-center gap-2">
            {plan && (
              <button
                onClick={remove}
                disabled={saving}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-colors ${
                  confirmDelete ? 'bg-danger text-white' : 'text-danger hover:bg-danger/10'
                }`}
              >
                <Trash2 size={13} />
                {confirmDelete ? tr(lang, 'Точно удалить?', 'Really delete?', 'Rostdan o‘chirilsinmi?') : tr(lang, 'Удалить', 'Delete', 'O‘chirish')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {step > 0 && (
              <button onClick={() => setStep((step - 1) as EditorStep)} className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-medium text-muted hover:text-text hover:bg-card-hover transition-colors">
                <ChevronLeft size={14} />{tr(lang, 'Назад', 'Back', 'Orqaga')}
              </button>
            )}
            {step < 2 && (
              <button onClick={() => setStep((step + 1) as EditorStep)} className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-medium text-text border border-border hover:bg-card-hover transition-colors">
                {tr(lang, 'Далее', 'Next', 'Keyingi')}<ChevronRight size={14} />
              </button>
            )}
            <button onClick={() => save('draft')} disabled={saving} className="px-3 py-2 rounded-xl text-[12px] font-medium text-text border border-border hover:bg-card-hover transition-colors disabled:opacity-50">
              {tr(lang, 'Черновик', 'Save draft', 'Qoralama')}
            </button>
            <button onClick={() => save('active')} disabled={saving || drivers.revenue <= 0} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50">
              <Check size={14} />{tr(lang, 'Утвердить план', 'Approve plan', 'Rejani tasdiqlash')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Step 1: baseline ──────────────────────────────────────────────────────────

const BaselineStep: React.FC<{
  lang: Language; month: string; suggestion: Suggestion | null; method: Method; growth: number;
  onMethod: (m: Method) => void; onGrowth: (g: number) => void;
}> = ({ lang, month, suggestion, method, growth, onMethod, onGrowth }) => {
  if (!suggestion) {
    return (
      <div className="rounded-2xl border border-border p-5 text-[13px] text-muted">
        {tr(lang, 'Не удалось получить историю продаж из iiko — введите план вручную на шаге «Показатели».',
          'Could not load sales history from iiko — enter the plan by hand on the Drivers step.',
          'iiko’dan savdo tarixini olib bo‘lmadi — rejani «Ko‘rsatkichlar» bosqichida qo‘lda kiriting.')}
      </div>
    );
  }
  const { ly, trend, costs } = suggestion.baseline;
  const lyMonth = ly.from.slice(0, 7);
  const k = 1 + growth / 100;

  const option = (m: Method, title: string, desc: string, base: number | null, extra?: React.ReactNode, disabled = false) => (
    <button
      disabled={disabled}
      onClick={() => onMethod(m)}
      className={`text-left rounded-2xl border p-4 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        method === m ? 'border-primary bg-primary/5' : 'border-border hover:bg-card-hover'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[13px] font-semibold text-text">{title}</p>
        {method === m && <Check size={14} className="text-primary" />}
      </div>
      <p className="text-[11px] text-muted leading-snug mb-3">{desc}</p>
      {base != null && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[12px] text-muted font-mono">{money(base, lang)}</span>
          <span className="text-[11px] text-muted">→</span>
          <span className="text-[15px] font-bold text-text font-mono">{money(base * k, lang)}</span>
        </div>
      )}
      {extra}
    </button>
  );

  return (
    <div className="space-y-5">
      <WarningList lang={lang} warnings={suggestion.warnings} />

      <div className="grid sm:grid-cols-3 gap-3">
        {option('ly',
          tr(lang, 'Прошлый год', 'Last year', 'O‘tgan yil'),
          tr(lang, `${monthName(lyMonth, lang)} ${lyMonth.slice(0, 4)}, день недели к дню недели`, `${monthName(lyMonth, lang)} ${lyMonth.slice(0, 4)}, weekday to weekday`, `${monthName(lyMonth, lang)} ${lyMonth.slice(0, 4)}, hafta kuni bo‘yicha`),
          ly.revenue,
          ly.coverage < 1 && <p className="text-[10px] text-muted mt-2">{tr(lang, 'Данных', 'Coverage', 'Qamrov')}: {Math.round(ly.coverage * 100)}%</p>,
          ly.revenue <= 0,
        )}
        {option('trend',
          tr(lang, 'Текущий темп', 'Current pace', 'Joriy sur’at'),
          tr(lang, `Средний день недели за 8 недель до ${dayLabel(trend.to, lang)}`, `Average weekday over the 8 weeks to ${dayLabel(trend.to, lang)}`, `${dayLabel(trend.to, lang)} gacha 8 haftalik o‘rtacha`),
          trend.revenue,
          undefined,
          trend.revenue <= 0,
        )}
        {option('manual',
          tr(lang, 'Свой план', 'My own plan', 'O‘z rejam'),
          tr(lang, 'Цифры вводите сами на следующем шаге', 'Type your own numbers on the next step', 'Raqamlarni keyingi bosqichda o‘zingiz kiritasiz'),
          null,
        )}
      </div>

      {method !== 'manual' && (
        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <p className="text-[13px] font-semibold text-text">{tr(lang, 'Рост к базе', 'Growth over baseline', 'Asosga nisbatan o‘sish')}</p>
              <p className="text-[11px] text-muted">{tr(lang, 'Сколько процентов добавить к выбранной основе', 'How much to add on top of the baseline', 'Asosga necha foiz qo‘shish')}</p>
            </div>
            <div className="w-28"><NumberInput value={growth} decimals={1} onChange={onGrowth} suffix="%" ariaLabel="growth" /></div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[0, 3, 6, 10, 15, 20].map(g => (
              <button
                key={g}
                onClick={() => onGrowth(g)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-mono transition-colors ${growth === g ? 'bg-primary text-white' : 'bg-background border border-border text-muted hover:text-text'}`}
              >
                +{g}%
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-background border border-border p-4 text-[12px] text-muted leading-relaxed">
        <p className="font-semibold text-text mb-1">{tr(lang, 'Откуда расходы', 'Where costs come from', 'Xarajatlar qayerdan')}</p>
        {tr(lang,
          `ФОТ, аренда, коммунальные и прочие расходы — среднее за ${costs.months.map(m => monthName(m, lang).toLowerCase()).join(', ')} из учёта iiko. Фудкост — ${pct(costs.foodCostPct)} за тот же период${costs.bestFoodCostPct != null ? `, лучший месяц — ${pct(costs.bestFoodCostPct)} (${monthName(costs.bestFoodCostMonth!, lang).toLowerCase()})` : ''}. Всё можно поменять на шаге «Показатели».`,
          `Labor, rent, utilities and other costs are the average of ${costs.months.map(m => monthName(m, lang)).join(', ')} from iiko's books. Food cost is ${pct(costs.foodCostPct)} over the same period${costs.bestFoodCostPct != null ? `, best month ${pct(costs.bestFoodCostPct)} (${monthName(costs.bestFoodCostMonth!, lang)})` : ''}. Everything is editable on the Drivers step.`,
          `Ish haqi, ijara, kommunal va boshqa xarajatlar — iiko hisobidan ${costs.months.map(m => monthName(m, lang)).join(', ')} o‘rtachasi. Oziq-ovqat tannarxi — ${pct(costs.foodCostPct)}${costs.bestFoodCostPct != null ? `, eng yaxshi oy — ${pct(costs.bestFoodCostPct)} (${monthName(costs.bestFoodCostMonth!, lang)})` : ''}. Hammasini «Ko‘rsatkichlar» bosqichida o‘zgartirish mumkin.`,
        )}
      </div>
    </div>
  );
};

// ── Step 2: drivers ───────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; hint?: React.ReactNode; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-[10px] uppercase tracking-[0.14em] text-muted font-medium mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[10px] text-muted mt-1">{hint}</span>}
  </label>
);

const DriversStep: React.FC<{
  lang: Language; drivers: PlanDrivers; pl: ReturnType<typeof computePL>; costs: Suggestion['baseline']['costs'] | undefined;
  setRevenue: (v: number) => void; setChecks: (v: number) => void; setAvgCheck: (v: number) => void; edit: (p: Partial<PlanDrivers>) => void;
}> = ({ lang, drivers, pl, costs, setRevenue, setChecks, setAvgCheck, edit }) => {
  const sum = tr(lang, 'сум', 'UZS', 'so‘m');
  return (
    <div className="space-y-6">
      <section>
        <p className="text-[13px] font-semibold text-text mb-1">{tr(lang, 'Продажи', 'Sales', 'Savdo')}</p>
        <p className="text-[11px] text-muted mb-3">{tr(lang, 'Выручка = чеки × средний чек. Меняете одно — остальное пересчитывается.', 'Revenue = checks × average check. Change one and the rest follows.', 'Tushum = cheklar × o‘rtacha chek. Bittasini o‘zgartirsangiz, qolgani qayta hisoblanadi.')}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={tr(lang, 'Выручка за месяц', 'Monthly revenue', 'Oylik tushum')}><NumberInput value={drivers.revenue} onChange={setRevenue} suffix={sum} /></Field>
          <Field label={tr(lang, 'Чеков', 'Checks', 'Cheklar')}><NumberInput value={drivers.checks} onChange={setChecks} /></Field>
          <Field label={tr(lang, 'Средний чек', 'Average check', 'O‘rtacha chek')}><NumberInput value={drivers.avgCheck} onChange={setAvgCheck} suffix={sum} /></Field>
          <Field label={tr(lang, 'Гостей', 'Guests', 'Mehmonlar')} hint={drivers.guests > 0 && drivers.revenue > 0 ? `${tr(lang, 'На гостя', 'Per guest', 'Har mehmonga')}: ${full(drivers.revenue / drivers.guests)} ${sum}` : undefined}>
            <NumberInput value={drivers.guests} onChange={v => edit({ guests: v })} />
          </Field>
        </div>
      </section>

      <section>
        <p className="text-[13px] font-semibold text-text mb-3">{tr(lang, 'Себестоимость', 'Cost of goods', 'Tannarx')}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            label={tr(lang, 'Фудкост', 'Food cost', 'Oziq-ovqat tannarxi')}
            hint={costs?.bestFoodCostPct != null
              ? `${tr(lang, 'Лучший месяц', 'Best month', 'Eng yaxshi oy')}: ${pct(costs.bestFoodCostPct)} · ${tr(lang, 'сумма', 'amount', 'summa')} ${money(pl.cogs, lang)}`
              : `${tr(lang, 'Сумма', 'Amount', 'Summa')}: ${money(pl.cogs, lang)}`}
          >
            <NumberInput value={drivers.foodCostPct} decimals={1} max={100} onChange={v => edit({ foodCostPct: v })} suffix="%" />
          </Field>
        </div>
      </section>

      <section>
        <p className="text-[13px] font-semibold text-text mb-3">{tr(lang, 'Расходы за месяц', 'Monthly costs', 'Oylik xarajatlar')}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={tr(lang, 'ФОТ (зарплаты)', 'Labor (payroll)', 'Ish haqi fondi')}><NumberInput value={drivers.labor} onChange={v => edit({ labor: v })} suffix={sum} /></Field>
          <Field label={tr(lang, 'Аренда', 'Rent', 'Ijara')}><NumberInput value={drivers.rent} onChange={v => edit({ rent: v })} suffix={sum} /></Field>
          <Field label={tr(lang, 'Коммунальные', 'Utilities', 'Kommunal')}><NumberInput value={drivers.utilities} onChange={v => edit({ utilities: v })} suffix={sum} /></Field>
          <Field label={tr(lang, 'Прочие расходы', 'Other costs', 'Boshqa xarajatlar')}><NumberInput value={drivers.otherOpex} onChange={v => edit({ otherOpex: v })} suffix={sum} /></Field>
        </div>
      </section>
    </div>
  );
};

// ── Step 3: days ──────────────────────────────────────────────────────────────

const DaysStep: React.FC<{
  lang: Language; month: string; days: ReturnType<typeof splitDays>['days']; overrides: Map<string, DayOverride>;
  editingDay: string | null; setEditingDay: (d: string | null) => void;
  onPin: (date: string, revenue: number, note?: string | null) => void; onUnpin: (date: string) => void;
  pinnedOverflow: boolean; total: number;
}> = ({ lang, month, days, overrides, editingDay, setEditingDay, onPin, onUnpin, pinnedOverflow, total }) => {
  // Monday-first grid; pad before the 1st.
  const lead = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const editing = days.find(d => d.date === editingDay) ?? null;
  const [draft, setDraft] = useState<{ revenue: number; note: string }>({ revenue: 0, note: '' });
  useEffect(() => { if (editing) setDraft({ revenue: editing.revenue, note: editing.note ?? '' }); }, [editingDay]);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted leading-relaxed">
        {tr(lang,
          'План месяца разложен по дням с учётом дня недели. Нажмите на день, чтобы задать свою сумму (банкет, закрытие, праздник) — закреплённый день не меняется, остальные подстраиваются.',
          'The monthly plan is spread by weekday. Tap a day to set your own amount (banquet, closure, holiday) — a pinned day stays fixed and the rest adjust.',
          'Oylik reja hafta kunlariga qarab taqsimlangan. O‘z summangizni kiritish uchun kunni bosing (banket, yopilish, bayram) — mahkamlangan kun o‘zgarmaydi, qolganlari moslashadi.')}
      </p>
      {pinnedOverflow && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-2 text-[12px]">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          {tr(lang, `Закреплённые дни больше плана месяца — план вырастет до ${money(total, lang)}.`, `Pinned days exceed the monthly plan — it will grow to ${money(total, lang)}.`, `Mahkamlangan kunlar oylik rejadan ko‘p — reja ${money(total, lang)} gacha oshadi.`)}
        </div>
      )}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAY_HEADERS(lang).map(h => <div key={h} className="text-center text-[10px] uppercase tracking-[0.1em] text-muted py-1">{h}</div>)}
        {Array.from({ length: lead }).map((_, i) => <div key={`pad${i}`} />)}
        {days.map(d => {
          const pinned = overrides.has(d.date);
          return (
            <button
              key={d.date}
              onClick={() => setEditingDay(editingDay === d.date ? null : d.date)}
              className={`relative text-left rounded-lg sm:rounded-xl border px-1.5 py-1.5 sm:px-2 sm:py-2 min-h-[54px] transition-colors ${
                editingDay === d.date ? 'border-primary bg-primary/5' : pinned ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-card-hover'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${d.holiday ? 'text-danger' : 'text-text'}`}>{Number(d.date.slice(8))}</span>
                {pinned && <Pin size={10} className="text-primary" />}
              </div>
              <p className="text-[10px] sm:text-[11px] font-mono text-muted mt-1 truncate">{money(d.revenue, lang).replace(/ (млн|M|mln)$/, '')}</p>
              {d.holiday && <p className="hidden sm:block text-[9px] text-danger truncate">{d.holiday}</p>}
            </button>
          );
        })}
      </div>
      {editing && (
        <div className="rounded-2xl border border-primary/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-text">{dayLabel(editing.date, lang)}{editing.holiday ? ` · ${editing.holiday}` : ''}</p>
            <button onClick={() => setEditingDay(null)} className="p-1 rounded text-muted hover:text-text"><X size={14} /></button>
          </div>
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Field label={tr(lang, 'Выручка дня', 'Day revenue', 'Kunlik tushum')}><NumberInput value={draft.revenue} onChange={v => setDraft(x => ({ ...x, revenue: v }))} suffix={tr(lang, 'сум', 'UZS', 'so‘m')} /></Field>
            <Field label={tr(lang, 'Заметка', 'Note', 'Izoh')}>
              <input
                value={draft.note}
                maxLength={100}
                onChange={e => setDraft(x => ({ ...x, note: e.target.value }))}
                placeholder={tr(lang, 'Банкет, закрыто…', 'Banquet, closed…', 'Banket, yopiq…')}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-text focus:outline-none focus:border-primary"
              />
            </Field>
            <div className="flex gap-2">
              <button onClick={() => { onPin(editing.date, draft.revenue, draft.note || null); setEditingDay(null); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold bg-primary text-white hover:bg-primary-hover">
                <Pin size={13} />{tr(lang, 'Закрепить', 'Pin', 'Mahkamlash')}
              </button>
              {overrides.has(editing.date) && (
                <button onClick={() => { onUnpin(editing.date); setEditingDay(null); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium border border-border text-muted hover:text-text">
                  <PinOff size={13} />{tr(lang, 'Открепить', 'Unpin', 'Bo‘shatish')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Live P&L side panel ───────────────────────────────────────────────────────

const LivePL: React.FC<{ lang: Language; pl: ReturnType<typeof computePL>; drivers: PlanDrivers; dim: number }> = ({ lang, pl, drivers }) => {
  const row = (label: string, value: number, opts: { bold?: boolean; neg?: boolean; sub?: string } = {}) => (
    <div className={`flex items-baseline justify-between gap-2 py-1.5 ${opts.bold ? 'border-t border-border mt-1 pt-2.5' : ''}`}>
      <span className={`text-[12px] ${opts.bold ? 'font-semibold text-text' : 'text-muted'}`}>{label}{opts.sub && <span className="text-[10px] ml-1">{opts.sub}</span>}</span>
      <span className={`font-mono tabular-nums ${opts.bold ? 'text-[14px] font-bold' : 'text-[12px]'} ${opts.bold ? (value >= 0 ? 'text-success' : 'text-danger') : 'text-text'}`}>
        {opts.neg && value > 0 ? '−' : ''}{money(value, lang)}
      </span>
    </div>
  );
  return (
    <aside className="lg:sticky lg:top-0 h-fit rounded-2xl bg-background border border-border p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium mb-2">{tr(lang, 'Итог плана', 'Plan result', 'Reja natijasi')}</p>
      {row(tr(lang, 'Выручка', 'Revenue', 'Tushum'), pl.revenue)}
      {row(tr(lang, 'Себестоимость', 'Cost of goods', 'Tannarx'), pl.cogs, { neg: true, sub: pct(drivers.foodCostPct) })}
      {row(tr(lang, 'ФОТ', 'Labor', 'Ish haqi'), pl.labor, { neg: true })}
      {row(tr(lang, 'Аренда', 'Rent', 'Ijara'), pl.rent, { neg: true })}
      {row(tr(lang, 'Коммунальные', 'Utilities', 'Kommunal'), pl.utilities, { neg: true })}
      {row(tr(lang, 'Прочие', 'Other', 'Boshqa'), pl.otherOpex, { neg: true })}
      {row(tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda'), pl.netProfit, { bold: true, sub: pct(pl.netProfitPct) })}
      <div className="mt-4 rounded-xl bg-card border border-border p-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted font-medium mb-1">{tr(lang, 'Точка безубыточности', 'Break-even', 'Zararsizlik nuqtasi')}</p>
        {pl.breakEvenMonth != null ? (
          <>
            <p className="text-[15px] font-bold text-text font-mono">{money(pl.breakEvenMonth, lang)}</p>
            <p className="text-[11px] text-muted">{tr(lang, 'в месяц', 'a month', 'oyiga')} · {money(pl.breakEvenDay ?? 0, lang)} {tr(lang, 'в день', 'a day', 'kuniga')}</p>
            {pl.revenue > 0 && (
              <p className={`text-[11px] mt-1.5 ${pl.revenue >= pl.breakEvenMonth ? 'text-success' : 'text-danger'}`}>
                {pl.revenue >= pl.breakEvenMonth
                  ? tr(lang, `Запас: ${money(pl.revenue - pl.breakEvenMonth, lang)}`, `Safety margin: ${money(pl.revenue - pl.breakEvenMonth, lang)}`, `Zaxira: ${money(pl.revenue - pl.breakEvenMonth, lang)}`)
                  : tr(lang, 'План ниже точки безубыточности', 'Plan is below break-even', 'Reja zararsizlik nuqtasidan past')}
              </p>
            )}
          </>
        ) : (
          <p className="text-[12px] text-danger">{tr(lang, 'Недостижима при фудкосте 100%', 'Unreachable at 100% food cost', '100% tannarxda erishib bo‘lmaydi')}</p>
        )}
      </div>
    </aside>
  );
};

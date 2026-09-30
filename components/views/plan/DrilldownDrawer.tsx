import React, { useEffect, useState } from 'react';
import { X, Lightbulb } from 'lucide-react';
import { Language } from '../../../types';
import { tr } from '../../../constants';
import { traceApi, DrillDriver, DrillResult, DrillGroup, DrillRow } from '../../../services/traceApi';
import { money, full, pct, dayLabel, weekdayShort } from './format';

interface Props {
  lang: Language;
  month: string;
  driver: DrillDriver;
  onClose: () => void;
}

const WEEKDAY_SAMPLE = ['2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10']; // Sun..Sat

export const DrilldownDrawer: React.FC<Props> = ({ lang, month, driver, onClose }) => {
  const [data, setData] = useState<DrillResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    traceApi.plan.drilldown(month, driver).then(setData).catch(e => setError(e?.message ?? 'error'));
  }, [month, driver]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const title = driver === 'food_cost' ? tr(lang, 'Почему изменился фудкост', 'Why food cost moved', 'Tannarx nega o‘zgardi')
    : driver === 'avg_check' ? tr(lang, 'Почему изменился средний чек', 'Why the average check moved', 'O‘rtacha chek nega o‘zgardi')
    : tr(lang, 'Почему изменилось число чеков', 'Why the number of checks moved', 'Cheklar soni nega o‘zgardi');

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border-l border-border w-full sm:max-w-xl h-full flex flex-col shadow-2xl animate-slide-in-right">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-border">
          <div>
            <h2 className="text-[16px] font-semibold text-text tracking-tight">{title}</h2>
            {data?.period && (
              <p className="text-[11px] text-muted mt-0.5">
                {dayLabel(data.period.from, lang)} — {dayLabel(data.period.to, lang)} {tr(lang, 'против 4 недель до начала месяца', 'vs the 4 weeks before the month', 'oy boshidan oldingi 4 hafta bilan')}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-card-hover"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {!data && !error && [0, 1, 2].map(i => <div key={i} className="h-32 bg-border/50 rounded-2xl animate-pulse" />)}
          {error && <p className="text-[12px] text-danger">{tr(lang, 'Не удалось загрузить разбор', 'Could not load the breakdown', 'Tahlilni yuklab bo‘lmadi')}: {error}</p>}
          {data && <DrillContent lang={lang} data={data} />}
        </div>
      </div>
    </div>
  );
};

const fmt = (v: number | null, unit: DrillGroup['unit']) =>
  v == null ? '—' : unit === 'pct' ? pct(v) : unit === 'money' ? full(v) : v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

export const DrillContent: React.FC<{ lang: Language; data: DrillResult }> = ({ lang, data }) => {
  if (!data.period) return <p className="text-[13px] text-muted">{tr(lang, 'В этом месяце ещё нет закрытых дней.', 'No closed days this month yet.', 'Bu oyda hali yopilgan kunlar yo‘q.')}</p>;
  return (
    <>
      <div className="rounded-2xl bg-background border border-border p-4 flex items-baseline gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted font-medium">{tr(lang, 'Сейчас', 'Now', 'Hozir')}</p>
          <p className="text-[22px] font-bold text-text font-mono">{fmt(data.summary.now, data.summary.unit)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted font-medium">{tr(lang, 'Было', 'Before', 'Avval')}</p>
          <p className="text-[22px] font-bold text-muted font-mono">{fmt(data.summary.base, data.summary.unit)}</p>
        </div>
        {data.summary.unit === 'count' && <p className="text-[11px] text-muted">{tr(lang, 'чеков в день', 'checks a day', 'kuniga chek')}</p>}
      </div>

      {data.groups.map(g => <GroupTable key={g.key + data.driver} lang={lang} group={g} />)}

      <div className="flex items-start gap-2 rounded-2xl bg-primary/5 border border-primary/20 p-4 text-[12px] text-text leading-relaxed">
        <Lightbulb size={15} className="text-primary flex-shrink-0 mt-0.5" />
        <span>{tip(data.driver, lang)}</span>
      </div>
    </>
  );
};

const GroupTable: React.FC<{ lang: Language; group: DrillGroup }> = ({ lang, group }) => {
  const meta = groupMeta(group.key, lang);
  const total = group.key === 'writeoffs' ? group.rows.find(r => r.name === '__total__') : undefined;
  const rows = group.rows.filter(r => r.name !== '__total__');
  if (!rows.length && !total) return null;
  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.impact)));
  const name = (r: DrillRow) => group.key === 'weekdays' ? weekdayShort(WEEKDAY_SAMPLE[Number(r.name)], lang)
    : group.key === 'hours' ? `${r.name.padStart(2, '0')}:00–${String((Number(r.name) + 1) % 24).padStart(2, '0')}:00`
    : r.name;

  return (
    <section>
      <p className="text-[13px] font-semibold text-text">{meta.title}</p>
      <p className="text-[11px] text-muted mb-2">{meta.hint}</p>
      {total && (
        <p className="text-[12px] text-text mb-2">
          {tr(lang, 'Всего списано', 'Written off in total', 'Jami hisobdan chiqarildi')} <span className="font-mono font-semibold">{money(total.now ?? 0, lang)}</span>
          {' '}· {tr(lang, 'обычно за такой срок', 'usual for this span', 'odatda shu muddatda')} <span className="font-mono">{money(total.base ?? 0, lang)}</span>
          {total.impact !== 0 && <span className={`font-mono ml-1 ${total.impact < 0 ? 'text-danger' : 'text-success'}`}>({money(total.impact, lang, true)})</span>}
        </p>
      )}
      <div className="divide-y divide-border/60">
        <div className="grid grid-cols-[1fr_72px_72px_88px] gap-2 pb-1.5 text-[10px] uppercase tracking-[0.1em] text-muted">
          <span />
          <span className="text-right">{meta.nowLabel}</span>
          <span className="text-right">{meta.baseLabel}</span>
          <span className="text-right">{tr(lang, 'Влияние', 'Impact', 'Ta’sir')}</span>
        </div>
        {rows.map(r => (
          <div key={r.name} className="grid grid-cols-[1fr_72px_72px_88px] gap-2 py-2 items-center">
            <div className="min-w-0">
              <p className="text-[12px] text-text truncate">{name(r)}</p>
              {r.share != null && r.share > 0 && <p className="text-[10px] text-muted">{pct(r.share)} {group.key === 'waiters' ? tr(lang, 'чеков', 'of checks', 'cheklar') : tr(lang, 'выручки', 'of revenue', 'tushum')}</p>}
            </div>
            <span className="text-[12px] font-mono text-right text-text">{fmt(r.now, group.unit)}</span>
            <span className="text-[12px] font-mono text-right text-muted">{r.base == null ? (group.key === 'waiters' ? tr(lang, 'новый', 'new', 'yangi') : '—') : fmt(r.base, group.unit)}</span>
            <div className="text-right">
              <span className={`text-[12px] font-mono font-semibold ${r.impact < 0 ? 'text-danger' : r.impact > 0 ? 'text-success' : 'text-muted'}`}>{r.impact === 0 ? '0' : money(r.impact, lang, true)}</span>
              <div className="h-1 mt-1 rounded-full bg-border/50 overflow-hidden">
                <div className={`h-full ${r.impact < 0 ? 'bg-danger' : 'bg-success'} ml-auto`} style={{ width: `${(Math.abs(r.impact) / maxAbs) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

function groupMeta(key: DrillGroup['key'], lang: Language) {
  const now = tr(lang, 'Сейчас', 'Now', 'Hozir');
  const was = tr(lang, 'Было', 'Before', 'Avval');
  switch (key) {
    case 'categories': return {
      title: tr(lang, 'Категории', 'Categories', 'Kategoriyalar'),
      hint: tr(lang, 'Фудкост или траты на категорию в чеке, сейчас и раньше', 'Food cost or spend per check by category, now vs before', 'Kategoriya bo‘yicha tannarx yoki chekdagi xarajat'),
      nowLabel: now, baseLabel: was,
    };
    case 'dishes': return {
      title: tr(lang, 'Блюда', 'Dishes', 'Taomlar'),
      hint: tr(lang, 'Блюда, у которых сильнее всего выросла себестоимость — проверьте техкарты и закупочные цены', 'Dishes whose cost rose most — check recipes and purchase prices', 'Tannarxi eng ko‘p oshgan taomlar — texkartalar va xarid narxlarini tekshiring'),
      nowLabel: now, baseLabel: was,
    };
    case 'writeoffs': return {
      title: tr(lang, 'Списания продуктов', 'Food write-offs', 'Mahsulot hisobdan chiqarish'),
      hint: tr(lang, 'Сколько списано сейчас против обычного уровня за такой же срок', 'Written off now vs the usual level for the same span', 'Hozirgi hisobdan chiqarish va odatiy daraja'),
      nowLabel: now, baseLabel: tr(lang, 'Обычно', 'Usual', 'Odatda'),
    };
    case 'waiters': return {
      title: tr(lang, 'Официанты', 'Waiters', 'Ofitsiantlar'),
      hint: tr(lang, 'Средний чек каждого официанта, сейчас и раньше', 'Each waiter’s average check, now vs before', 'Har bir ofitsiantning o‘rtacha cheki'),
      nowLabel: now, baseLabel: was,
    };
    case 'weekdays': return {
      title: tr(lang, 'Дни недели', 'Weekdays', 'Hafta kunlari'),
      hint: tr(lang, 'Чеков в день: факт против плана', 'Checks a day: actual vs plan', 'Kuniga cheklar: fakt va reja'),
      nowLabel: tr(lang, 'Факт', 'Actual', 'Fakt'), baseLabel: tr(lang, 'План', 'Plan', 'Reja'),
    };
    default: return {
      title: tr(lang, 'Часы', 'Hours', 'Soatlar'),
      hint: tr(lang, 'Чеков в день по часу закрытия, сейчас и раньше', 'Checks a day by closing hour, now vs before', 'Yopilish soati bo‘yicha kuniga cheklar'),
      nowLabel: now, baseLabel: was,
    };
  }
}

function tip(driver: DrillDriver, lang: Language): string {
  if (driver === 'food_cost') return tr(lang,
    'Начните с верхних строк: пересчитайте техкарты блюд с ростом себестоимости, сверьте закупочные цены с поставщиками и разберите крупные списания с шеф-поваром.',
    'Start at the top: re-check recipes for dishes whose cost grew, compare purchase prices with suppliers, and go through large write-offs with the chef.',
    'Yuqoridan boshlang: tannarxi oshgan taomlar texkartalarini qayta tekshiring, yetkazib beruvchilar narxlarini solishtiring va katta hisobdan chiqarishlarni oshpaz bilan ko‘rib chiqing.');
  if (driver === 'avg_check') return tr(lang,
    'Поговорите с официантами, у которых упал чек, и договоритесь о допродаже: напитки и десерты чаще всего выпадают первыми. Категории с падением трат в чеке — кандидаты для рекомендаций и комбо.',
    'Talk to the waiters whose check fell and agree on upselling — drinks and desserts usually drop first. Categories with lower spend per check are candidates for recommendations and combos.',
    'Cheki tushgan ofitsiantlar bilan gaplashing va qo‘shimcha sotuv bo‘yicha kelishing — odatda birinchi bo‘lib ichimliklar va desertlar tushadi.');
  return tr(lang,
    'Слабые дни и часы — кандидаты для акций: бизнес-ланч в обед, happy hour вечером, рассылка по базе лояльности перед слабым днём.',
    'Weak days and hours are candidates for promotions: a business lunch at midday, happy hour in the evening, a loyalty-base message before a weak day.',
    'Zaif kunlar va soatlar aksiyalar uchun nomzod: tushlikda biznes-lanch, kechqurun happy hour, zaif kundan oldin sodiqlik bazasiga xabar.');
}

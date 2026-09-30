import React, { useEffect, useState } from 'react';
import { Target, ChevronRight, Sparkles } from 'lucide-react';
import { Language } from '../../../types';
import { tr } from '../../../constants';
import { traceApi } from '../../../services/traceApi';
import type { ProgressResult } from '../../../lib/planEngine';
import { tashkentDateStr } from '../../../utils/tz';
import { money, pct, monthName, statusColor } from './format';

// Dashboard card for the current month's plan. Renders nothing for venues
// the feature doesn't cover, so the dashboard layout stays unchanged there.
export const PlanWidget: React.FC<{ lang: Language; onOpen: () => void }> = ({ lang, onOpen }) => {
  const month = tashkentDateStr().slice(0, 7);
  const [state, setState] = useState<{ kind: 'hidden' } | { kind: 'none' } | { kind: 'ready'; p: ProgressResult }>({ kind: 'hidden' });

  useEffect(() => {
    let alive = true;
    traceApi.plan.meta()
      .then(m => (m.supported ? traceApi.plan.progress(month) : null))
      .then(r => {
        if (!alive || r === null) return;
        setState(r.progress ? { kind: 'ready', p: r.progress } : { kind: 'none' });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [month]);

  if (state.kind === 'hidden') return null;

  if (state.kind === 'none') {
    return (
      <button onClick={onOpen} className="w-full glass glass-hover rounded-3xl p-5 flex items-center gap-4 text-left transition-colors">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary flex-shrink-0"><Sparkles size={18} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-text">{tr(lang, `План на ${monthName(month, lang).toLowerCase()} ещё не утверждён`, `No plan approved for ${monthName(month, lang)} yet`, `${monthName(month, lang)} uchun reja hali tasdiqlanmagan`)}</p>
          <p className="text-[12px] text-muted">{tr(lang, 'TRACE подготовил черновик по вашим продажам — проверьте и примите за минуту.', 'TRACE drafted one from your sales — review and accept in a minute.', 'TRACE savdolaringiz asosida qoralama tayyorladi — bir daqiqada ko‘rib chiqing.')}</p>
        </div>
        <ChevronRight size={16} className="text-muted flex-shrink-0" />
      </button>
    );
  }

  const p = state.p;
  const r = p.revenue;
  return (
    <button onClick={onOpen} className="w-full glass glass-hover rounded-3xl p-5 text-left transition-colors">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted font-medium flex items-center gap-1.5"><Target size={12} />{tr(lang, 'План месяца', 'Monthly plan', 'Oylik reja')} · {monthName(month, lang)}</p>
        <ChevronRight size={15} className="text-muted" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-[11px] text-muted">{tr(lang, 'Выполнение', 'On plan', 'Bajarilish')}</p>
          <p className={`text-[22px] font-bold font-mono leading-tight ${statusColor(r.pct)}`}>{pct(r.pct)}</p>
          <p className="text-[11px] text-muted">{money(r.factMtd, lang)} / {money(r.planMtd, lang)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">{tr(lang, 'Прогноз', 'Forecast', 'Prognoz')}</p>
          <p className={`text-[17px] font-bold font-mono leading-tight ${statusColor(r.forecastPct)}`}>{money(r.forecast, lang)}</p>
          <p className="text-[11px] text-muted">{pct(r.forecastPct)} {tr(lang, 'плана', 'of plan', 'rejadan')}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">{tr(lang, 'Нужно в день', 'Needed a day', 'Kuniga kerak')}</p>
          <p className="text-[17px] font-bold font-mono leading-tight text-text">{money(p.needed.perDayAvg, lang)}</p>
          <p className="text-[11px] text-muted">{tr(lang, `осталось ${p.remainingDays} дн.`, `${p.remainingDays} days left`, `${p.remainingDays} kun qoldi`)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">{tr(lang, 'Чистая прибыль', 'Net profit', 'Sof foyda')}</p>
          <p className={`text-[17px] font-bold font-mono leading-tight ${p.profit.factMtd >= 0 ? 'text-text' : 'text-danger'}`}>{money(p.profit.factMtd, lang)}</p>
          <p className="text-[11px] text-muted">{tr(lang, 'прогноз', 'forecast', 'prognoz')} {money(p.profit.forecast, lang)}</p>
        </div>
      </div>
    </button>
  );
};

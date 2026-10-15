import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Language } from '../../types';
import { bookingApi, BookingReport as Report } from '../../services/traceApi';

function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

// Owner/manager booking report: how many booked, how many came, no-shows and
// cancellations, where bookings come from, busy hours, table load, regulars.
// One series per chart, so no legends — the heading names what is drawn.

const RANGES = [7, 30, 90] as const;
const WEEKDAYS: Record<Language, string[]> = {
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  uz: ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'],
};

const todayLocal = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const minusDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T00:00:00Z') - n * 86_400_000).toISOString().slice(0, 10);
const shortDate = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`;
const fmtPct = (v: number | null) => (v == null ? '—' : `${v}%`);

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-[13.5px] text-muted">{label}</p>
      <p className="text-[24px] font-semibold text-text tabular-nums leading-tight mt-1.5 tracking-tight">{value}</p>
      {sub && <p className="text-[12px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// Vertical bars, one series. Each bar has a hover title with the exact numbers.
function Bars({ items, height = 120 }: { items: { key: string; label: string; value: number; title: string }[]; height?: number }) {
  const max = Math.max(1, ...items.map(i => i.value));
  const showEvery = items.length > 16 ? Math.ceil(items.length / 10) : 1;
  return (
    <div>
      <div className="flex items-end gap-[2px] border-b border-border" style={{ height }}>
        {items.map(i => (
          <div key={i.key} title={i.title} className="flex-1 h-full flex items-end group cursor-default">
            <div
              className="w-full rounded-t-[2px] bk-bar transition-colors"
              style={{ height: `${(i.value / max) * 100}%`, minHeight: i.value > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1">
        {items.map((i, idx) => (
          <span key={i.key} className="flex-1 text-center text-[10px] text-muted tabular-nums truncate">
            {idx % showEvery === 0 ? i.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-[13px] font-semibold text-text mb-3">{title}</h3>
      {children}
    </div>
  );
}

export function BookingReport({ lang }: { lang: Language }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const to = todayLocal();
    setReport(null);
    setError(null);
    bookingApi.report(minusDays(to, days - 1), to).then(setReport).catch(e => setError(e?.message ?? 'Error'));
  }, [days]);

  const hourItems = useMemo(() => {
    if (!report) return [];
    const byHour = new Map(report.hours.map(h => [h.hour, h.bookings]));
    const hours = report.hours.map(h => h.hour);
    if (!hours.length) return [];
    const from = Math.min(...hours), to = Math.max(...hours);
    return Array.from({ length: to - from + 1 }, (_, k) => from + k).map(h => ({
      key: String(h), label: String(h).padStart(2, '0'), value: byHour.get(h) ?? 0,
      title: `${String(h).padStart(2, '0')}:00 — ${byHour.get(h) ?? 0} ${tr(lang, 'броней', 'bookings', 'bron')}`,
    }));
  }, [report, lang]);

  if (error) return <p className="text-[13px] text-red-500">{error}</p>;

  const t = report?.totals;
  return (
    <div className="space-y-4">
      <div className="seg" role="group" aria-label={tr(lang, 'Период', 'Period', 'Davr')}>
        {RANGES.map(r => (
          <button key={r} aria-pressed={days === r} onClick={() => setDays(r)}>
            {tr(lang, `${r} дней`, `${r} days`, `${r} kun`)}
          </button>
        ))}
      </div>

      {!report || !t ? (
        <div className="h-40 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-muted" /></div>
      ) : t.bookings === 0 ? (
        <p className="text-[13px] text-muted">{tr(lang, 'За этот период броней нет.', 'No bookings in this period.', 'Bu davrda bronlar yo‘q.')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label={tr(lang, 'Броней', 'Bookings', 'Bronlar')} value={String(t.bookings)}
              sub={t.upcoming ? tr(lang, `ещё впереди: ${t.upcoming}`, `still ahead: ${t.upcoming}`, `oldinda: ${t.upcoming}`) : undefined} />
            <Tile label={tr(lang, 'Пришли', 'Came', 'Kelishdi')} value={String(t.visited)}
              sub={tr(lang, `${t.guests} гостей · в среднем ${t.avg_party ?? '—'}`, `${t.guests} guests · avg ${t.avg_party ?? '—'}`, `${t.guests} mehmon · o‘rtacha ${t.avg_party ?? '—'}`)} />
            <Tile label={tr(lang, 'Не пришли', 'No-shows', 'Kelmadi')} value={String(t.no_show)}
              sub={tr(lang, `${fmtPct(t.no_show_rate)} от пришедших и непришедших`, `${fmtPct(t.no_show_rate)} of expected guests`, `${fmtPct(t.no_show_rate)} kutilganlardan`)} />
            <Tile label={tr(lang, 'Отменены', 'Cancelled', 'Bekor qilingan')} value={String(t.cancelled)}
              sub={tr(lang, `${fmtPct(t.cancel_rate)} всех броней`, `${fmtPct(t.cancel_rate)} of all bookings`, `${fmtPct(t.cancel_rate)} barcha bronlardan`)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Tile label={tr(lang, 'Онлайн', 'Online', 'Onlayn')} value={String(t.by_source.online)}
              sub={t.median_lead_hours != null ? tr(lang, `обычно за ${t.median_lead_hours} ч`, `usually ${t.median_lead_hours} h ahead`, `odatda ${t.median_lead_hours} soat oldin`) : undefined} />
            <Tile label={tr(lang, 'По телефону', 'By phone', 'Telefon orqali')} value={String(t.by_source.phone)} />
            <Tile label={tr(lang, 'Без брони', 'Walk-in', 'Bronsiz')} value={String(t.by_source.walk_in)} />
          </div>

          <Card title={tr(lang, 'Брони по дням', 'Bookings per day', 'Kunlar bo‘yicha bronlar')}>
            <Bars items={report.days.map(d => ({
              key: d.date, label: shortDate(d.date), value: d.bookings,
              title: tr(lang,
                `${shortDate(d.date)}: броней ${d.bookings}, пришли ${d.visited} (${d.guests} гост.), не пришли ${d.no_show}, отменены ${d.cancelled}`,
                `${shortDate(d.date)}: ${d.bookings} bookings, ${d.visited} came (${d.guests} guests), ${d.no_show} no-shows, ${d.cancelled} cancelled`,
                `${shortDate(d.date)}: ${d.bookings} bron, ${d.visited} keldi (${d.guests} mehmon), ${d.no_show} kelmadi, ${d.cancelled} bekor`),
            }))} />
          </Card>

          <div className="grid md:grid-cols-2 gap-3">
            <Card title={tr(lang, 'Во сколько приходят', 'Arrival time', 'Qachon kelishadi')}>
              <Bars items={hourItems} height={100} />
            </Card>
            <Card title={tr(lang, 'По дням недели', 'By weekday', 'Hafta kunlari bo‘yicha')}>
              <Bars height={100} items={[1, 2, 3, 4, 5, 6, 0].map(wd => {
                const v = report.weekdays.find(w => w.weekday === wd)?.bookings ?? 0;
                return { key: String(wd), label: WEEKDAYS[lang][wd], value: v, title: `${WEEKDAYS[lang][wd]}: ${v}` };
              })} />
            </Card>
          </div>

          <Card title={tr(lang, 'Загрузка столов', 'Table load', 'Stollar bandligi')}>
            <p className="text-[12px] text-muted -mt-2 mb-3">{tr(lang,
              'Сколько времени за столом сидели гости по броням, от часов работы за период',
              'Time guests with bookings sat at the table, as a share of opening hours',
              'Bron bo‘yicha mehmonlar stolda o‘tirgan vaqt, ish soatlariga nisbatan')}</p>
            <div className="space-y-1.5">
              {[...report.tables]
                .sort((a, b) => (b.occupancy_pct ?? 0) - (a.occupancy_pct ?? 0) || a.name.localeCompare(b.name, undefined, { numeric: true }))
                .map(tb => (
                <div key={tb.table_id} className="flex items-center gap-3 text-[12px]"
                  title={tr(lang, `броней ${tb.bookings}, пришли ${tb.visited}`, `${tb.bookings} bookings, ${tb.visited} came`, `${tb.bookings} bron, ${tb.visited} keldi`)}>
                  <span className="w-28 shrink-0 truncate text-text">{tr(lang, 'Стол', 'Table', 'Stol')} {tb.name} <span className="text-muted">· {tb.hall}</span></span>
                  <div className="flex-1 h-2 rounded-full bg-border/60 overflow-hidden">
                    <div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.min(100, tb.occupancy_pct ?? 0)}%` }} />
                  </div>
                  <span className="w-12 text-right tabular-nums text-muted">{fmtPct(tb.occupancy_pct)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title={tr(lang, 'Постоянные гости', 'Regulars', 'Doimiy mehmonlar')}>
            {report.regulars.length === 0 ? (
              <p className="text-[12px] text-muted">{tr(lang, 'Пока никто не приходил по брони дважды.', 'Nobody has come twice with a booking yet.', 'Hali hech kim bron bilan ikki marta kelmagan.')}</p>
            ) : (
              <div className="divide-y divide-border">
                {report.regulars.map(g => (
                  <div key={g.phone} className="flex items-center justify-between py-2 text-[13px]">
                    <div className="min-w-0">
                      <p className="text-text truncate">{g.name}</p>
                      <a href={`tel:${g.phone}`} className="text-[12px] text-primary">{g.phone}</a>
                    </div>
                    <div className="text-right text-[12px] text-muted shrink-0">
                      <p className="text-text">{tr(lang, `визитов: ${g.visits}`, `visits: ${g.visits}`, `tashriflar: ${g.visits}`)}</p>
                      {g.no_shows > 0 && <p>{tr(lang, `не пришёл: ${g.no_shows}`, `no-shows: ${g.no_shows}`, `kelmagan: ${g.no_shows}`)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Users, Clock, MapPin, ChevronLeft, Check, Copy, Loader2, X, CalendarDays, Radio, Send, Phone } from 'lucide-react';
import {
  publicBookingApi, parseBookingLocation, BookingApiError, PublicMap, PublicDaySlots, PublicResolve,
  GuestReservation, PublicTable,
} from '../../services/traceApi';
import { FloorMap, FloorTable, FloorTableState, STATE_COLORS } from '../booking/FloorMap';
import { GUEST_I18N, GuestLang, TAG_TEXT, loadGuestLang, saveGuestLang } from './guestI18n';

// Public guest booking page — book.trace-os.uz/{slug} or book.{slug}.trace-os.uz.
// No login. Pick date → party → time, see which tables are free on the floor
// plan (or as a plain list), book one. Live-updates over SSE, polling fallback.

type T = typeof GUEST_I18N['ru'];

// ── time helpers (always in the restaurant's timezone) ───────────────────────

const MONTHS: Record<GuestLang, string[]> = {
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const WEEKDAYS: Record<GuestLang, string[]> = {
  ru: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
  uz: ['ya', 'du', 'se', 'ch', 'pa', 'ju', 'sh'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

function localDate(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(instant);
}
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}
function fmtDay(date: string, lang: GuestLang, today: string, t: T): string {
  if (date === today) return t.today;
  if (date === addDays(today, 1)) return t.tomorrow;
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[lang][wd]}, ${d} ${MONTHS[lang][m - 1]}`;
}
function fmtLongDate(iso: string, tz: string, lang: GuestLang): string {
  const date = localDate(new Date(iso), tz);
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[lang][wd]}, ${d} ${MONTHS[lang][m - 1]} · ${fmtTime(iso, tz)}`;
}

// ── shell ────────────────────────────────────────────────────────────────────

export function GuestBooking() {
  const [lang, setLangState] = useState<GuestLang>(loadGuestLang);
  const setLang = (l: GuestLang) => { setLangState(l); saveGuestLang(l); };
  const t = GUEST_I18N[lang];
  const [loc, setLoc] = useState(parseBookingLocation);

  // In-page navigation (branch picker, "new booking", after booking).
  const go = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    setLoc(parseBookingLocation());
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const onPop = () => setLoc(parseBookingLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <div className="min-h-screen bg-background text-text font-sans">
      <div className="mx-auto w-full max-w-[760px] px-4 pb-28">
        <header className="flex items-center justify-between py-4">
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted">{t.title}</span>
          <div className="flex rounded-full border border-border overflow-hidden">
            {(['ru', 'uz', 'en'] as GuestLang[]).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase ${l === lang ? 'bg-primary text-white' : 'text-muted'}`}>{l}</button>
            ))}
          </div>
        </header>

        {loc.reservationToken
          ? <ReservationView key={loc.reservationToken} token={loc.reservationToken} lang={lang} t={t} go={go} />
          : loc.slug
            ? <RestaurantPage key={`${loc.slug}:${loc.picked}`} slug={loc.slug} picked={loc.picked} lang={lang} t={t} go={go} />
            : <Message text={t.not_found} />}

        <p className="text-center text-[11px] text-muted mt-10">{t.powered}</p>
      </div>
    </div>
  );
}

function Message({ text }: { text: string }) {
  return <div className="rounded-2xl border border-border bg-card p-6 text-center text-[14px] text-muted mt-6">{text}</div>;
}

function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted" size={24} /></div>;
}

// ── restaurant / chain ───────────────────────────────────────────────────────

function RestaurantPage({ slug, picked, lang, t, go }: { slug: string; picked: boolean; lang: GuestLang; t: T; go: (p: string) => void }) {
  const [target, setTarget] = useState<PublicResolve | null | 'error'>(null);
  useEffect(() => {
    publicBookingApi.resolve(slug, picked).then(setTarget).catch(() => setTarget('error'));
  }, [slug, picked]);

  if (target === null) return <Spinner />;
  if (target === 'error') return <Message text={t.not_found} />;
  if (target.kind === 'chain') {
    return (
      <div className="space-y-3 mt-2">
        <h1 className="text-[24px] font-bold">{target.org.name}</h1>
        <p className="text-[14px] text-muted">{t.choose_branch}</p>
        {target.branches.map(b => (
          <button key={b.subdomain} onClick={() => go(`/${b.subdomain}`)}
            className="w-full flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-4 text-left hover:border-primary/50 transition-colors">
            <span className="flex items-center gap-2 text-[15px] font-semibold"><MapPin size={16} className="text-primary" />{b.name}</span>
            <ChevronLeft size={16} className="rotate-180 text-muted" />
          </button>
        ))}
      </div>
    );
  }
  return <BookingFlow slug={target.tenant.subdomain} name={target.tenant.name} lang={lang} t={t} go={go} />;
}

// ── main flow ────────────────────────────────────────────────────────────────

type Stage = 'pick' | 'form';

function BookingFlow({ slug, name, lang, t, go }: { slug: string; name: string; lang: GuestLang; t: T; go: (p: string) => void }) {
  const [map, setMap] = useState<PublicMap | null>(null);
  const [error, setError] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [slots, setSlots] = useState<PublicDaySlots | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [hallId, setHallId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [live, setLive] = useState(false);

  useEffect(() => { document.title = `${name} — ${t.title}`; }, [name, t.title]);

  const tz = map?.settings.timezone ?? 'Asia/Tashkent';
  const today = localDate(new Date(), tz);

  // Map: live statuses (no slot) or availability for the chosen slot.
  const loadMap = useCallback(async () => {
    try {
      const m = await publicBookingApi.map(slug, slot ?? undefined, slot ? party : undefined);
      setMap(m);
      setHallId(h => h && m.halls.some(x => x.id === h) ? h : m.halls[0]?.id ?? null);
      setError(false);
    } catch { setError(true); }
  }, [slug, slot, party]);

  const loadSlots = useCallback(async () => {
    if (!date) return;
    try { setSlots(await publicBookingApi.slots(slug, date, party)); } catch { setSlots(null); }
  }, [slug, date, party]);

  useEffect(() => { loadMap(); }, [loadMap]);
  useEffect(() => { if (map && !date) setDate(localDate(new Date(), map.settings.timezone)); }, [map, date]);
  useEffect(() => { setSlots(null); loadSlots(); }, [loadSlots]);

  // Drop a chosen time that disappeared (taken, or date/party changed).
  useEffect(() => {
    if (!slot || !slots) return;
    const s = slots.slots.find(x => x.start_at === slot);
    if (!s || (s.table_ids.length === 0 && stage === 'pick')) setSlot(null);
  }, [slots]);

  // Live updates: SSE ping → refetch; fall back to polling every 15s.
  const refresh = useRef(() => {});
  refresh.current = () => { loadMap(); loadSlots(); };
  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => { if (!poll) poll = setInterval(() => refresh.current(), 15_000); };
    try {
      es = new EventSource(publicBookingApi.eventsUrl(slug));
      es.addEventListener('changed', () => refresh.current());
      es.onopen = () => { setLive(true); if (poll) { clearInterval(poll); poll = null; } };
      es.onerror = () => { setLive(false); startPolling(); };
    } catch { startPolling(); }
    return () => { es?.close(); if (poll) clearInterval(poll); };
  }, [slug]);

  const tables = useMemo(() => map?.halls.flatMap(h => h.tables) ?? [], [map]);
  const statusById = useMemo(() => Object.fromEntries((map?.statuses ?? []).map(s => [s.table_id, s])), [map]);
  const freeForSlot = useMemo(() => new Set(map?.slot?.table_ids ?? []), [map]);
  const fits = (tb: PublicTable) => tb.seats >= party && tb.min_guests <= party;
  const slotReady = !!slot && map?.slot?.start_at === new Date(slot).toISOString();

  const stateOf = (tb: PublicTable): FloorTableState => {
    if (slotReady) {
      if (!tb.is_bookable) return 'unavailable';
      return freeForSlot.has(tb.id) ? 'free' : 'occupied';
    }
    return statusById[tb.id]?.state ?? 'free';
  };

  if (error && !map) return <Message text={t.not_found} />;
  if (!map || !date) return <Spinner />;
  if (map.halls.length === 0 || tables.length === 0) {
    return <><h1 className="text-[24px] font-bold mb-2">{name}</h1><Message text={t.no_halls} /><CallButton phone={map.settings.phone} t={t} /></>;
  }

  const hall = map.halls.find(h => h.id === hallId) ?? map.halls[0];
  const selected = tables.find(x => x.id === tableId) ?? null;
  const selectedHall = selected ? map.halls.find(h => h.id === selected.hall_id) : null;
  const canBook = !!selected && slotReady && freeForSlot.has(selected.id);

  if (stage === 'form' && selected && slot) {
    return (
      <BookingForm
        slug={slug} restaurant={name} lang={lang} t={t} tz={tz}
        table={selected} hallName={selectedHall?.name ?? ''} slot={slot} party={party}
        onBack={() => setStage('pick')}
        onPickAlternative={(tid, start) => { setTableId(tid); setDate(localDate(new Date(start), tz)); setSlot(start); }}
        onDone={token => go(`/reservation/${token}`)}
      />
    );
  }

  const days = Array.from({ length: Math.min(map.settings.max_days_ahead + 1, 21) }, (_, i) => addDays(today, i));
  const floorTables: FloorTable[] = hall.tables.map(tb => ({ ...tb, key: tb.id }));
  const states = Object.fromEntries(hall.tables.map(tb => [tb.id, stateOf(tb)]));
  const dimmed = new Set(hall.tables.filter(tb => tb.is_bookable && !fits(tb)).map(tb => tb.id));
  const badges = Object.fromEntries(hall.tables.map(tb => {
    const st = statusById[tb.id];
    const s = states[tb.id];
    if (s === 'free' && st?.free_until) return [tb.id, t.until(fmtTime(st.free_until, tz))];
    if ((s === 'booked' || s === 'occupied') && st?.until && !slotReady) return [tb.id, t.until(fmtTime(st.until, tz))];
    return [tb.id, t.seats(tb.seats)];
  }));

  const pickSlotFromList = (start: string, ids: string[]) => {
    // Smallest fitting table first (the API orders by seats).
    setSlot(start);
    setTableId(ids[0] ?? null);
    setStage('form');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[24px] font-bold leading-tight">{name}</h1>
        {live && <span className="flex items-center gap-1 text-[11px] text-green-500 whitespace-nowrap mt-2"><Radio size={12} />{t.live}</span>}
      </div>
      <CallButton phone={map.settings.phone} t={t} />

      {/* Date */}
      <section>
        <Label icon={<CalendarDays size={13} />} text={t.when} />
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 snap-x">
          {days.map(d => (
            <button key={d} onClick={() => { setDate(d); setSlot(null); setTableId(null); }}
              className={`snap-start shrink-0 px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap border transition-colors ${d === date ? 'bg-primary border-primary text-white' : 'bg-card border-border text-text'}`}>
              {fmtDay(d, lang, today, t)}
            </button>
          ))}
        </div>
      </section>

      {/* Party */}
      <section className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
        <span className="flex items-center gap-2 text-[14px] font-medium"><Users size={16} className="text-muted" />{t.guests}</span>
        <div className="flex items-center gap-3">
          <button onClick={() => setParty(p => Math.max(1, p - 1))} disabled={party <= 1}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-30"><Minus size={15} /></button>
          <span className="w-6 text-center text-[17px] font-bold">{party}</span>
          <button onClick={() => setParty(p => Math.min(20, p + 1))} disabled={party >= 20}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-30"><Plus size={15} /></button>
        </div>
      </section>

      {/* Time */}
      <section>
        <Label icon={<Clock size={13} />} text={t.time} />
        {!slots ? <div className="h-10 flex items-center"><Loader2 size={16} className="animate-spin text-muted" /></div>
          : slots.closed ? <p className="text-[13px] text-muted">{t.closed_day}</p>
          : slots.tables_fit === 0 ? <p className="text-[13px] text-muted">{t.no_tables_for_party}</p>
          : slots.slots.every(s => s.table_ids.length === 0) ? <p className="text-[13px] text-muted">{t.no_slots}</p>
          : (
            <div className="flex flex-wrap gap-2">
              {slots.slots.map(s => {
                const free = s.table_ids.length > 0;
                const on = s.start_at === slot;
                return (
                  <button key={s.start_at} disabled={!free}
                    onClick={() => { setSlot(on ? null : s.start_at); if (tableId && !s.table_ids.includes(tableId)) setTableId(null); }}
                    className={`px-3 py-2 rounded-xl text-[13px] font-semibold border transition-colors ${on ? 'bg-primary border-primary text-white' : free ? 'bg-card border-border text-text' : 'bg-transparent border-border/50 text-muted/50 line-through'}`}>
                    {fmtTime(s.start_at, tz)}
                  </button>
                );
              })}
            </div>
          )}
      </section>

      {/* Map / list switch */}
      <div className="flex rounded-xl border border-border overflow-hidden w-fit">
        {(['map', 'list'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 text-[13px] font-semibold ${view === v ? 'bg-primary text-white' : 'bg-card text-muted'}`}>
            {v === 'map' ? t.view_map : t.view_list}
          </button>
        ))}
      </div>

      {view === 'map' ? (
        <>
          {!slot && <p className="text-[13px] text-muted">{t.pick_time_hint}</p>}
          {map.halls.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {map.halls.map(h => (
                <button key={h.id} onClick={() => setHallId(h.id)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap ${h.id === hall.id ? 'bg-text text-background' : 'bg-card text-muted'}`}>{h.name}</button>
              ))}
            </div>
          )}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <FloorMap fit hall={hall} tables={floorTables} states={states} dimmedKeys={dimmed} badges={badges}
              selectedKey={tableId} onTableClick={key => setTableId(key)} />
          </div>
          <Legend t={t} slotMode={slotReady} />
        </>
      ) : (
        <SlotList slots={slots} tz={tz} t={t} onPick={pickSlotFromList} />
      )}

      {selected && view === 'map' && (
        <TableSheet
          table={selected} hallName={selectedHall?.name ?? ''} lang={lang} t={t} tz={tz}
          status={statusById[selected.id]} party={party}
          slot={slotReady ? slot : null} available={canBook}
          onClose={() => setTableId(null)}
          onBook={() => setStage('form')}
        />
      )}
    </div>
  );
}

// "Call the hostess" — for guests who'd rather book by phone. The number is
// shown too: tel: does nothing on most desktops.
function CallButton({ phone, t }: { phone?: string; t: T }) {
  if (!phone) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3">
      <span className="text-[13px] text-muted flex-1 min-w-[180px]">{t.call_hint}</span>
      <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-primary text-primary text-[14px] font-semibold whitespace-nowrap hover:bg-primary/10">
        <Phone size={15} />{t.call} · {phone}
      </a>
    </div>
  );
}

function Label({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted font-semibold mb-2">{icon}{text}</p>;
}

function Legend({ t, slotMode }: { t: T; slotMode: boolean }) {
  const items: Array<[string, string]> = slotMode
    ? [[STATE_COLORS.free, t.legend_free], [STATE_COLORS.occupied, t.legend_booked], [STATE_COLORS.unavailable, t.legend_unavailable]]
    : [[STATE_COLORS.free, t.legend_free], [STATE_COLORS.soon, t.legend_soon], [STATE_COLORS.booked, t.legend_booked_live],
       [STATE_COLORS.occupied, t.legend_occupied], [STATE_COLORS.unavailable, t.legend_unavailable]];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map(([c, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-[12px] text-muted"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{label}</span>
      ))}
      <span className="flex items-center gap-1.5 text-[12px] text-muted"><span className="w-2.5 h-2.5 rounded-full bg-muted/30" />{t.legend_dim}</span>
    </div>
  );
}

// "Without the map": every time of the day with how many tables are free.
function SlotList({ slots, tz, t, onPick }: { slots: PublicDaySlots | null; tz: string; t: T; onPick: (start: string, ids: string[]) => void }) {
  if (!slots) return <Spinner />;
  const free = slots.slots.filter(s => s.table_ids.length > 0);
  if (slots.closed) return <Message text={t.closed_day} />;
  if (free.length === 0) return <Message text={slots.tables_fit === 0 ? t.no_tables_for_party : t.no_slots} />;
  return (
    <div className="rounded-2xl border border-border bg-card divide-y divide-border">
      {free.map(s => (
        <div key={s.start_at} className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[16px] font-bold">{fmtTime(s.start_at, tz)}</p>
            <p className="text-[12px] text-muted">{t.free_tables(s.table_ids.length)}</p>
          </div>
          <button onClick={() => onPick(s.start_at, s.table_ids)}
            className="px-4 py-2 rounded-xl bg-primary text-white text-[13px] font-semibold">{t.pick}</button>
        </div>
      ))}
    </div>
  );
}

// Bottom sheet with the tapped table: photos, seats, tags, availability.
function TableSheet({ table, hallName, lang, t, tz, status, party, slot, available, onClose, onBook }: {
  table: PublicTable; hallName: string; lang: GuestLang; t: T; tz: string;
  status: PublicMap['statuses'][number] | undefined; party: number;
  slot: string | null; available: boolean; onClose: () => void; onBook: () => void;
}) {
  const [photo, setPhoto] = useState(0);
  const fits = table.seats >= party && table.min_guests <= party;
  const note = !table.is_bookable ? t.not_bookable
    : !fits ? t.too_small
    : slot && !available ? t.busy_at_time
    : status?.state === 'free' ? (status.free_until ? t.free_until(fmtTime(status.free_until, tz)) : t.free_all_day)
    : null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-[760px] max-h-[82vh] overflow-y-auto rounded-t-3xl border border-border bg-card shadow-[0_-10px_40px_rgba(0,0,0,0.18)] p-4 pb-6 animate-fade-in">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[18px] font-bold">{t.table} {table.name}</p>
            <p className="text-[13px] text-muted">{hallName} · {t.from_to_guests(table.min_guests, table.seats)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-muted"><X size={16} /></button>
        </div>

        {table.photos.length > 0 && (
          <div className="mb-3">
            <div className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl"
              onScroll={e => { const el = e.currentTarget; setPhoto(Math.round(el.scrollLeft / el.clientWidth)); }}>
              {table.photos.map(src => (
                <img key={src} src={src} alt="" loading="lazy" className="w-full shrink-0 snap-center aspect-[4/3] object-cover" />
              ))}
            </div>
            {table.photos.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-2">
                {table.photos.map((_, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === photo ? 'bg-primary' : 'bg-muted/40'}`} />)}
              </div>
            )}
          </div>
        )}

        {table.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {table.tags.map(tag => <span key={tag} className="px-2.5 py-1 rounded-full bg-background text-[12px]">{TAG_TEXT[lang][tag] ?? tag}</span>)}
          </div>
        )}

        {note && <p className={`text-[13px] mb-3 ${available || status?.state === 'free' ? 'text-green-600 dark:text-green-400' : 'text-muted'}`}>{note}</p>}

        <button onClick={onBook} disabled={!available}
          className="w-full py-3.5 rounded-2xl bg-primary text-white text-[15px] font-bold disabled:opacity-40">
          {slot ? t.book_at(fmtTime(slot, tz)) : t.choose_time_first}
        </button>
      </div>
    </div>
  );
}

// ── booking form ─────────────────────────────────────────────────────────────

const CONTACT_KEY = 'trace_guest_contact';

function loadContact(): { name: string; phone: string } {
  try { const c = JSON.parse(localStorage.getItem(CONTACT_KEY) ?? 'null'); if (c?.name !== undefined) return c; } catch { /* ignore */ }
  return { name: '', phone: '+998 ' };
}

function BookingForm({ slug, restaurant, lang, t, tz, table, hallName, slot, party, onBack, onPickAlternative, onDone }: {
  slug: string; restaurant: string; lang: GuestLang; t: T; tz: string;
  table: PublicTable; hallName: string; slot: string; party: number;
  onBack: () => void;
  onPickAlternative: (tableId: string, start: string) => void;
  onDone: (token: string) => void;
}) {
  const [name, setName] = useState(() => loadContact().name);
  const [phone, setPhone] = useState(() => loadContact().phone);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<{ text: string; alternatives?: Array<{ table_id: string; table_name: string; start_at: string }> } | null>(null);

  const phoneOk = phone.replace(/\D/g, '').length >= 9;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phoneOk || sending) return;
    setSending(true);
    setErr(null);
    try {
      const r = await publicBookingApi.create(slug, {
        table_id: table.id, start_at: slot, party_size: party,
        guest_name: name.trim(), guest_phone: phone, comment: comment.trim() || undefined,
      });
      try { localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: name.trim(), phone })); } catch { /* ignore */ }
      onDone(r.cancel_token!);
    } catch (e) {
      const ex = e as BookingApiError;
      if (ex.code === 'table_taken') setErr({ text: t.taken, alternatives: ex.body?.alternatives ?? [] });
      else setErr({ text: ex.status && ex.status < 500 ? ex.message : t.err_generic });
    } finally {
      setSending(false);
    }
  };

  const input = 'w-full rounded-xl border border-border bg-background px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none';
  return (
    <form onSubmit={submit} className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-[13px] text-muted"><ChevronLeft size={15} />{t.back}</button>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-1.5">
        <p className="text-[18px] font-bold">{restaurant}</p>
        <p className="flex items-center gap-2 text-[14px]"><CalendarDays size={15} className="text-muted" />{fmtLongDate(slot, tz, lang)}</p>
        <p className="flex items-center gap-2 text-[14px]"><Users size={15} className="text-muted" />{t.guests_n(party)}</p>
        <p className="flex items-center gap-2 text-[14px]"><MapPin size={15} className="text-muted" />{t.table} {table.name}{hallName ? ` · ${hallName}` : ''}</p>
      </div>

      <p className="text-[11px] uppercase tracking-[0.14em] text-muted font-semibold">{t.your_details}</p>
      <label className="block">
        <span className="block text-[13px] text-muted mb-1">{t.name}</span>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={100} autoComplete="name" required className={input} />
      </label>
      <label className="block">
        <span className="block text-[13px] text-muted mb-1">{t.phone}</span>
        <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+\s()-]/g, ''))} inputMode="tel" autoComplete="tel" maxLength={20} required className={input} />
      </label>
      <label className="block">
        <span className="block text-[13px] text-muted mb-1">{t.comment}</span>
        <textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={500} rows={2} placeholder={t.comment_ph} className={input} />
      </label>

      {err && (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/5 p-3 space-y-2">
          <p className="text-[14px] font-semibold text-red-500">{err.text}</p>
          {err.alternatives && err.alternatives.length > 0 && (
            <>
              <p className="text-[13px] text-muted">{t.alternatives}</p>
              <div className="flex flex-wrap gap-2">
                {err.alternatives.map(a => (
                  <button key={`${a.table_id}-${a.start_at}`} type="button"
                    onClick={() => { onPickAlternative(a.table_id, a.start_at); setErr(null); }}
                    className="px-3 py-2 rounded-xl border border-border bg-card text-[13px] font-semibold">
                    {fmtTime(a.start_at, tz)} · {t.table} {a.table_name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <button type="submit" disabled={sending || !name.trim() || !phoneOk}
        className="w-full py-3.5 rounded-2xl bg-primary text-white text-[15px] font-bold disabled:opacity-40 flex items-center justify-center gap-2">
        {sending && <Loader2 size={16} className="animate-spin" />}
        {sending ? t.sending : t.confirm}
      </button>
    </form>
  );
}

// ── the guest's own booking (/reservation/{token}) ───────────────────────────

function ReservationView({ token, lang, t, go }: { token: string; lang: GuestLang; t: T; go: (p: string) => void }) {
  const [r, setR] = useState<GuestReservation | null | 'missing'>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    publicBookingApi.reservation(token).then(setR).catch(() => setR('missing'));
  }, [token]);

  if (r === null) return <Spinner />;
  if (r === 'missing') return <Message text={t.reservation_not_found} />;

  const link = `${window.location.origin}/reservation/${token}`;
  const statusText: Record<GuestReservation['status'], string> = {
    pending: t.status_pending, confirmed: t.status_confirmed, seated: t.status_seated,
    completed: t.status_completed, cancelled: t.status_cancelled, no_show: t.status_no_show,
  };
  const ok = r.status === 'confirmed' || r.status === 'seated';

  const cancel = async () => {
    setBusy(true);
    try { setR(await publicBookingApi.cancel(token)); } catch { /* keep showing */ }
    setBusy(false);
    setAsking(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div className="text-center pt-4">
        <div className={`mx-auto mb-3 w-14 h-14 rounded-full flex items-center justify-center ${r.status === 'cancelled' ? 'bg-muted/20 text-muted' : ok ? 'bg-green-500/15 text-green-500' : 'bg-amber-500/15 text-amber-500'}`}>
          {r.status === 'cancelled' ? <X size={26} /> : ok ? <Check size={26} /> : <Clock size={26} />}
        </div>
        <h1 className="text-[22px] font-bold">
          {r.status === 'cancelled' ? t.cancelled : r.status === 'pending' ? t.done_pending : ok ? t.done_confirmed : statusText[r.status]}
        </h1>
        {r.status === 'pending' && <p className="text-[14px] text-muted mt-1">{t.done_pending_hint}</p>}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-1.5">
        <p className="text-[18px] font-bold">{r.restaurant_name}</p>
        <p className="flex items-center gap-2 text-[14px]"><CalendarDays size={15} className="text-muted" />{fmtLongDate(r.start_at, r.timezone, lang)}</p>
        <p className="flex items-center gap-2 text-[14px]"><Users size={15} className="text-muted" />{t.guests_n(r.party_size)} · {r.guest_name}</p>
        <p className="flex items-center gap-2 text-[14px]"><MapPin size={15} className="text-muted" />{t.table} {r.table_name} · {r.hall_name}</p>
        <p className="text-[13px] text-muted pt-1">{statusText[r.status]}</p>
      </div>

      {r.telegram_link && (r.status === 'pending' || r.status === 'confirmed') && (
        <div className="rounded-2xl border border-[#229ED9]/40 bg-[#229ED9]/10 p-4 space-y-3">
          <div className="flex gap-3">
            <Send size={20} className="text-[#229ED9] shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold">{t.tg_title}</p>
              <p className="text-[12px] text-muted">{t.tg_hint}</p>
            </div>
          </div>
          <a href={r.telegram_link} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#229ED9] text-white text-[14px] font-semibold">
            <Send size={16} />{t.tg_button}
          </a>
        </div>
      )}

      {r.status !== 'cancelled' && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <p className="text-[13px] text-muted">{t.save_link}</p>
          <div className="flex gap-2">
            <input readOnly value={link} className="flex-1 min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-[12px]" onFocus={e => e.currentTarget.select()} />
            <button onClick={copy} className="px-3 rounded-xl border border-border text-[13px] font-semibold flex items-center gap-1">
              {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t.copied : t.copy}
            </button>
          </div>
        </div>
      )}

      {r.can_cancel && (asking ? (
        <div className="rounded-2xl border border-red-400/40 p-4 space-y-3">
          <p className="text-[14px] font-semibold">{t.cancel_confirm}</p>
          <div className="flex gap-2">
            <button onClick={cancel} disabled={busy} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-[14px] font-semibold disabled:opacity-50">{t.yes_cancel}</button>
            <button onClick={() => setAsking(false)} className="flex-1 py-3 rounded-xl border border-border text-[14px] font-semibold">{t.no}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAsking(true)} className="w-full py-3 rounded-2xl border border-border text-[14px] font-semibold text-red-500">{t.cancel_booking}</button>
      ))}

      <button onClick={() => go(`/${r.subdomain}`)} className="w-full py-3 rounded-2xl bg-card border border-border text-[14px] font-semibold">{t.new_booking}</button>
    </div>
  );
}

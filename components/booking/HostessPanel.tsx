import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, ChevronLeft, ChevronRight, Armchair, Phone, Lock, Bell, BellOff, Map as MapIcon, ChartGantt, Users,
  Check, Ban, Wifi, WifiOff, Unlock,
} from 'lucide-react';
import { Language } from '../../types';
import {
  bookingApi, subscribeBookingEvents, BookingHall, BookingSettings, StaffReservation, StaffTableStatus, TableBlock,
  BookingChangeEvent,
} from '../../services/traceApi';
import { FloorMap, FloorTable, STATE_COLORS } from './FloorMap';
import { BookingTimeline } from './BookingTimeline';
import {
  tr, PanelCtx, HallTable, ReservationDialog, NewReservationDialog, BlockDialog, GuestsView, STATUS_COLORS, STATUS_LABELS, errorText,
} from './HostessDialogs';
import { MIN, localDate, addDays, fmtTime } from './hostessTime';

type Toast = (message: string, type: 'success' | 'error' | 'info') => void;
type View = 'map' | 'timeline' | 'guests';

type Dialog =
  | { kind: 'reservation'; r: StaffReservation }
  | { kind: 'new'; mode: 'phone' | 'walk_in'; tableId?: string; start?: Date; freeUntil?: string | null }
  | { kind: 'block'; tableId?: string };

const POLL_MS = 15_000;          // fallback when the live channel is down
const TICK_MS = 60_000;          // statuses are time-based ("soon" etc.) — refresh even when quiet
const SOUND_KEY = 'trace_booking_sound';

// Short two-tone "ding" — no audio file to ship. The AudioContext is created
// on the first click anywhere (browsers block sound before a user gesture).
let audioCtx: AudioContext | null = null;
function unlockAudio() {
  if (audioCtx) { audioCtx.resume().catch(() => {}); return; }
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (AC) audioCtx = new AC();
}
function ding() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [880, 1320].forEach((f, i) => {
    const o = audioCtx!.createOscillator();
    const g = audioCtx!.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + i * 0.18);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.35);
    o.connect(g).connect(audioCtx!.destination);
    o.start(t0 + i * 0.18);
    o.stop(t0 + i * 0.18 + 0.4);
  });
}

function short(name: string, n = 10): string {
  return name.length > n ? `${name.slice(0, n - 1)}…` : name;
}

export function HostessPanel({ lang, onShowToast }: { lang: Language; onShowToast: Toast }) {
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [halls, setHalls] = useState<BookingHall[] | null>(null);
  const [statuses, setStatuses] = useState<StaffTableStatus[]>([]);
  const [reservations, setReservations] = useState<StaffReservation[]>([]);
  const [blocks, setBlocks] = useState<TableBlock[]>([]);
  const [pending, setPending] = useState<StaffReservation[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [view, setView] = useState<View>('map');
  const [hallId, setHallId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [live, setLive] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [soundOn, setSoundOn] = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch { return true; } });
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const tz = settings?.timezone ?? 'Asia/Tashkent';
  const today = localDate(new Date(), tz);

  // ── loading ───────────────────────────────────────────────────────────────

  const dateRef = useRef<string | null>(null);
  dateRef.current = date;

  const loadLayout = useCallback(async () => {
    const [s, h] = await Promise.all([bookingApi.settings.get(), bookingApi.halls.list()]);
    setSettings(s);
    setHalls(h);
    setHallId(cur => (cur && h.some(x => x.id === cur) ? cur : h[0]?.id ?? null));
    if (!dateRef.current) setDate(localDate(new Date(), s.timezone));
    return s;
  }, []);

  const loadData = useCallback(async () => {
    const d = dateRef.current;
    if (!d) return;
    const nowIso = new Date().toISOString();
    const farIso = new Date(Date.now() + 366 * 24 * 60 * MIN).toISOString();
    const [st, res, blk, pend] = await Promise.all([
      bookingApi.status(),
      bookingApi.reservations.list({ date: d }),
      bookingApi.blocks.list(d),
      bookingApi.reservations.list({ from: nowIso, to: farIso }, ['pending']),
    ]);
    // Ignore a slow answer for a day the hostess has already left.
    if (dateRef.current !== d) return;
    setStatuses(st.tables);
    setReservations(res);
    setBlocks(blk);
    setPending(pend);
  }, []);

  const reload = useCallback(() => { loadData().catch(() => {}); }, [loadData]);

  useEffect(() => {
    loadLayout().catch(e => setLoadError((e as Error).message || tr(lang, 'Не удалось загрузить', 'Failed to load', "Yuklab bo'lmadi")));
  }, []);

  useEffect(() => {
    if (!date) return;
    loadData().catch(e => onShowToast((e as Error).message, 'error'));
  }, [date]);

  // Live channel: refetch on any change (coalesced), ring on a new online booking.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeBookingEvents((e: BookingChangeEvent) => {
      if (e.action === 'layout') loadLayout().catch(() => {});
      if (timer) clearTimeout(timer);
      timer = setTimeout(reload, 250);
      if (e.action === 'created' && e.source === 'online') {
        if (soundRef.current) ding();
        const msg = e.status === 'pending'
          ? tr(lang, 'Новая онлайн-бронь — ждёт подтверждения', 'New online booking — awaiting confirmation', 'Yangi onlayn bron — tasdiq kutmoqda')
          : tr(lang, 'Новая онлайн-бронь', 'New online booking', 'Yangi onlayn bron');
        onShowToast(msg, 'info');
        try {
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('TRACE', { body: msg });
        } catch { /* not available (e.g. desktop webview) */ }
      }
    }, setLive);
    return () => { off(); if (timer) clearTimeout(timer); };
  }, []);

  // Polling: fast while the live channel is down, slow tick otherwise.
  useEffect(() => {
    const t = setInterval(reload, live ? TICK_MS : POLL_MS);
    return () => clearInterval(t);
  }, [live, reload]);

  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener('pointerdown', h, { once: true });
    return () => window.removeEventListener('pointerdown', h);
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try { localStorage.setItem(SOUND_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    if (next) {
      unlockAudio();
      ding();
      try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ }
    }
  };

  // ── derived ───────────────────────────────────────────────────────────────

  const tables: HallTable[] = useMemo(
    () => (halls ?? []).flatMap(h => h.tables.map(t => ({ ...t, hall_name: h.name }))),
    [halls],
  );
  const statusBy = useMemo(() => new Map(statuses.map(s => [s.table_id, s])), [statuses]);

  if (loadError) return <div className="rounded-2xl border border-border bg-card p-6 text-[13px] text-muted">{loadError}</div>;
  if (!settings || !halls || !date) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted" size={22} /></div>;

  if (halls.length === 0 || tables.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-[13px] text-muted max-w-[520px] mx-auto">
        {tr(lang, 'Схема зала ещё не создана — её настраивает владелец или менеджер во вкладке «Схема зала».',
          'No floor plan yet — the owner or manager sets it up in the "Floor plan" tab.',
          "Zal sxemasi hali yaratilmagan — uni egasi yoki menejer «Zal sxemasi» bo'limida sozlaydi.")}
      </div>
    );
  }

  const ctx: PanelCtx = { lang, settings, tables, toast: onShowToast, reload };
  const hall = halls.find(h => h.id === hallId) ?? halls[0];
  const selStatus = selectedTable ? statusBy.get(selectedTable) : undefined;
  const selTable = tables.find(t => t.id === selectedTable);

  const openReservationById = async (id: string) => {
    const r = reservations.find(x => x.id === id) ?? pending.find(x => x.id === id);
    if (r) { setDialog({ kind: 'reservation', r }); return; }
    try {
      const list = await bookingApi.reservations.list({ date: today });
      const found = list.find(x => x.id === id);
      if (found) setDialog({ kind: 'reservation', r: found });
    } catch (e) { onShowToast((e as Error).message, 'error'); }
  };

  // Map labels: who is at / coming to each table.
  const badges: Record<string, string> = {};
  const states: Record<string, typeof statuses[number]['state']> = {};
  for (const t of hall.tables) {
    const s = statusBy.get(t.id);
    if (!s) continue;
    states[t.id] = s.state;
    const r = s.reservation;
    if (s.state === 'occupied' && s.pos_since) badges[t.id] = `${tr(lang, 'касса', 'POS', 'kassa')} ${fmtTime(s.pos_since, tz)}`;
    else if (s.state === 'occupied' && r && s.until) badges[t.id] = `${short(r.guest_name)} ·${fmtTime(s.until, tz)}`;
    else if (s.state === 'booked' && r) badges[t.id] = `${short(r.guest_name)} ${fmtTime(r.start_at, tz)}`;
    else if (s.state === 'soon' && s.next_start) badges[t.id] = `${fmtTime(s.next_start, tz)} ${r ? short(r.guest_name, 8) : ''}`;
    else if (s.state === 'free' && s.free_until) badges[t.id] = `${tr(lang, 'до', 'till', 'gacha')} ${fmtTime(s.free_until, tz)}`;
    else if (s.state === 'unavailable' && s.until) badges[t.id] = `🔒 ${fmtTime(s.until, tz)}`;
    // Keep the label inside the table — same font size formula as FloorMap.
    const badgeFont = Math.max(9, Math.max(11, Math.min(22, Math.min(t.w, t.h) * 0.32)) * 0.55);
    const fits = Math.max(5, Math.floor(t.w / (badgeFont * 0.6)));
    if (badges[t.id]?.length > fits) badges[t.id] = short(badges[t.id].trim(), fits);
  }
  const floorTables: FloorTable[] = hall.tables.map(t => ({ ...t, key: t.id }));

  // Walk-in on a table: stay only until its next booking (minus cleanup).
  const walkInLimit = (s?: StaffTableStatus): string | null => {
    if (!s) return null;
    if (s.state === 'free') return s.free_until;
    if (s.state === 'soon' && s.next_start) return new Date(new Date(s.next_start).getTime() - settings.buffer_min * MIN).toISOString();
    return null;
  };

  const todayRes = reservations
    .filter(r => r.status === 'pending' || r.status === 'confirmed' || r.status === 'seated')
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  const quickStatus = async (r: StaffReservation, status: 'confirmed' | 'cancelled') => {
    try {
      await bookingApi.reservations.setStatus(r.id, status);
      onShowToast(status === 'confirmed' ? tr(lang, 'Бронь подтверждена', 'Confirmed', 'Tasdiqlandi') : tr(lang, 'Бронь отменена', 'Cancelled', 'Bekor qilindi'), 'success');
      reload();
    } catch (e) { onShowToast(errorText(e, ctx), 'error'); }
  };

  const removeBlock = async (id: string) => {
    try {
      await bookingApi.blocks.remove(id);
      onShowToast(tr(lang, 'Блокировка снята', 'Block removed', 'Blok olib tashlandi'), 'success');
      reload();
    } catch (e) { onShowToast((e as Error).message, 'error'); }
  };

  const fmtDay = (d: string) => d === today ? tr(lang, 'Сегодня', 'Today', 'Bugun')
    : d === addDays(today, 1) ? tr(lang, 'Завтра', 'Tomorrow', 'Ertaga')
    : d.split('-').reverse().slice(0, 2).join('.');

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-card p-0.5">
          {([['map', MapIcon, tr(lang, 'Карта', 'Map', 'Xarita')], ['timeline', ChartGantt, tr(lang, 'Таймлайн', 'Timeline', 'Vaqt jadvali')], ['guests', Users, tr(lang, 'Гости', 'Guests', 'Mehmonlar')]] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => { setView(id); if (id !== 'timeline') setDate(today); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${view === id ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        {view === 'timeline' && (
          <div className="flex items-center gap-1">
            <button onClick={() => setDate(addDays(date, -1))} className="p-2 rounded-lg bg-card text-muted hover:text-text"><ChevronLeft size={15} /></button>
            <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)}
              className="bg-card border border-border rounded-lg px-2 py-1.5 text-[13px] text-text" />
            <button onClick={() => setDate(addDays(date, 1))} className="p-2 rounded-lg bg-card text-muted hover:text-text"><ChevronRight size={15} /></button>
            {date !== today && <button onClick={() => setDate(today)} className="px-2.5 py-1.5 rounded-lg bg-card text-[12px] font-semibold text-primary">{tr(lang, 'Сегодня', 'Today', 'Bugun')}</button>}
          </div>
        )}

        <div className="flex-1" />

        <span title={live ? tr(lang, 'Обновляется в реальном времени', 'Live', 'Jonli') : tr(lang, 'Обновление каждые 15 сек', 'Refreshing every 15 s', 'Har 15 soniyada yangilanadi')}
          className={`p-2 ${live ? 'text-green-500' : 'text-muted'}`}>{live ? <Wifi size={15} /> : <WifiOff size={15} />}</span>
        <button onClick={toggleSound} title={tr(lang, 'Звук новой брони', 'New booking sound', 'Yangi bron ovozi')}
          className={`p-2 rounded-lg bg-card ${soundOn ? 'text-primary' : 'text-muted'}`}>{soundOn ? <Bell size={15} /> : <BellOff size={15} />}</button>
        <button onClick={() => setDialog({ kind: 'block' })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card text-text text-[13px] font-semibold">
          <Lock size={14} /><span className="hidden sm:inline">{tr(lang, 'Блок', 'Block', 'Blok')}</span>
        </button>
        <button onClick={() => setDialog({ kind: 'new', mode: 'phone' })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card text-text text-[13px] font-semibold">
          <Phone size={14} />{tr(lang, 'Бронь', 'Booking', 'Bron')}
        </button>
        <button onClick={() => setDialog({ kind: 'new', mode: 'walk_in' })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-[13px] font-semibold">
          <Armchair size={14} />Walk-in
        </button>
      </div>

      {/* Pending queue — only matters when auto-confirm is off, but shown whenever there is any. */}
      {pending.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-[13px] font-semibold text-amber-600 dark:text-amber-400 mb-2">
            {tr(lang, `Ждут подтверждения: ${pending.length}`, `Awaiting confirmation: ${pending.length}`, `Tasdiq kutmoqda: ${pending.length}`)}
          </p>
          <div className="space-y-1.5">
            {pending.slice(0, 8).map(r => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <button onClick={() => setDialog({ kind: 'reservation', r })} className="flex-1 min-w-0 text-left truncate text-text">
                  <span className="font-semibold">{r.guest_name}</span>
                  <span className="text-muted"> · {fmtDay(localDate(new Date(r.start_at), tz))} {fmtTime(r.start_at, tz)} · {tr(lang, 'стол', 'table', 'stol')} {r.table_name} · {r.party_size} {tr(lang, 'гост.', 'guests', 'mehmon')}</span>
                </button>
                <button onClick={() => quickStatus(r, 'confirmed')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-white text-[12px] font-semibold"><Check size={12} />{tr(lang, 'Подтвердить', 'Confirm', 'Tasdiqlash')}</button>
                <button onClick={() => { if (window.confirm(tr(lang, 'Отменить бронь?', 'Cancel this booking?', 'Bron bekor qilinsinmi?'))) quickStatus(r, 'cancelled'); }}
                  className="p-1.5 rounded-lg border border-border text-muted hover:text-red-500"><Ban size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'map' && (
        <>
          {halls.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {halls.map(h => (
                <button key={h.id} onClick={() => { setHallId(h.id); setSelectedTable(null); }}
                  className={`px-3.5 py-1.5 rounded-xl text-[13px] font-semibold whitespace-nowrap ${h.id === hall.id ? 'bg-primary text-white' : 'bg-card text-muted hover:text-text'}`}>
                  {h.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <FloorMap hall={hall} tables={floorTables} states={states} badges={badges} selectedKey={selectedTable} fit
                  onTableClick={key => setSelectedTable(k => (k === key ? null : key))} onBackgroundPointerDown={() => setSelectedTable(null)} />
              </div>
              <Legend lang={lang} />
            </div>

            <div className="lg:w-[320px] shrink-0 space-y-3">
              {selTable && (
                <TableCard
                  lang={lang} tz={tz} table={selTable} status={selStatus}
                  reservations={reservations.filter(r => r.table_id === selTable.id && ['pending', 'confirmed', 'seated'].includes(r.status))}
                  blocks={blocks.filter(b => b.table_id === selTable.id && new Date(b.to_at).getTime() > Date.now())}
                  onOpen={id => openReservationById(id)}
                  onWalkIn={() => setDialog({ kind: 'new', mode: 'walk_in', tableId: selTable.id, freeUntil: walkInLimit(selStatus) })}
                  onPhone={() => setDialog({ kind: 'new', mode: 'phone', tableId: selTable.id })}
                  onBlock={() => setDialog({ kind: 'block', tableId: selTable.id })}
                  onUnblock={removeBlock}
                />
              )}
              <div className="rounded-2xl border border-border bg-card p-3">
                <p className="text-[13px] font-semibold text-text mb-2">{tr(lang, 'Сегодня', 'Today', 'Bugun')} · {todayRes.length}</p>
                {todayRes.length === 0 && <p className="text-[12px] text-muted">{tr(lang, 'Броней пока нет', 'No bookings yet', "Hozircha bron yo'q")}</p>}
                <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
                  {todayRes.map(r => (
                    <button key={r.id} onClick={() => setDialog({ kind: 'reservation', r })}
                      className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-background text-[13px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[r.status] }} />
                      <span className="text-text font-semibold w-11 shrink-0">{fmtTime(r.start_at, tz)}</span>
                      <span className="text-text truncate flex-1">{r.guest_name}</span>
                      <span className="text-muted shrink-0">{r.table_name} · {r.party_size}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {view === 'timeline' && (
        <BookingTimeline ctx={ctx} date={date} reservations={reservations} blocks={blocks}
          onOpen={r => setDialog({ kind: 'reservation', r })}
          onNew={(tableId, start) => setDialog({ kind: 'new', mode: 'phone', tableId, start })} />
      )}

      {view === 'guests' && <GuestsView ctx={ctx} onOpenReservation={r => setDialog({ kind: 'reservation', r })} />}

      {dialog?.kind === 'reservation' && <ReservationDialog ctx={ctx} reservation={dialog.r} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'new' && <NewReservationDialog ctx={ctx} mode={dialog.mode} tableId={dialog.tableId} start={dialog.start} freeUntil={dialog.freeUntil} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'block' && <BlockDialog ctx={ctx} tableId={dialog.tableId} onClose={() => setDialog(null)} />}
    </div>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────

function Legend({ lang }: { lang: Language }) {
  const items: Array<[keyof typeof STATE_COLORS, string]> = [
    ['free', tr(lang, 'Свободен', 'Free', "Bo'sh")],
    ['soon', tr(lang, 'Скоро бронь', 'Booked soon', 'Tez orada bron')],
    ['booked', tr(lang, 'Забронирован', 'Booked', 'Band')],
    ['occupied', tr(lang, 'Занят', 'Occupied', 'Band (mehmonlar)')],
    ['unavailable', tr(lang, 'Недоступен', 'Unavailable', 'Mavjud emas')],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
      {items.map(([k, label]) => (
        <span key={k} className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATE_COLORS[k] }} />{label}
        </span>
      ))}
    </div>
  );
}

function TableCard({ lang, tz, table, status, reservations, blocks, onOpen, onWalkIn, onPhone, onBlock, onUnblock }: {
  lang: Language; tz: string; table: HallTable; status?: StaffTableStatus;
  reservations: StaffReservation[]; blocks: TableBlock[];
  onOpen: (id: string) => void; onWalkIn: () => void; onPhone: () => void; onBlock: () => void; onUnblock: (id: string) => void;
}) {
  const s = status?.state ?? 'free';
  const line = (() => {
    if (!status) return '';
    switch (status.state) {
      case 'free': return status.free_until ? tr(lang, `Свободен до ${fmtTime(status.free_until, tz)}`, `Free until ${fmtTime(status.free_until, tz)}`, `${fmtTime(status.free_until, tz)} gacha bo'sh`) : tr(lang, 'Свободен', 'Free', "Bo'sh");
      case 'soon': return tr(lang, `Бронь в ${fmtTime(status.next_start!, tz)}`, `Booking at ${fmtTime(status.next_start!, tz)}`, `${fmtTime(status.next_start!, tz)} da bron`);
      case 'booked': return tr(lang, 'Забронирован — гости ещё не пришли', 'Booked — guests not here yet', 'Band — mehmonlar hali kelmagan');
      case 'occupied':
        if (status.pos_since) {
          // Open check in the POS, nobody seated through TRACE — ends when the check closes.
          const t = fmtTime(status.pos_since, tz);
          return tr(lang, `Занят по кассе с ${t} — освободится, когда закроют чек`, `Occupied per POS since ${t} — frees when the check closes`, `Kassa bo‘yicha ${t} dan band — chek yopilganda bo‘shaydi`);
        }
        return status.until
          ? tr(lang, `Занят, примерно до ${fmtTime(status.until, tz)}`, `Occupied, until about ${fmtTime(status.until, tz)}`, `Band, taxminan ${fmtTime(status.until, tz)} gacha`)
          : tr(lang, 'Занят', 'Occupied', 'Band');
      case 'unavailable': return status.unavailable_reason === 'blocked'
        ? tr(lang, `Заблокирован до ${fmtTime(status.until!, tz)}`, `Blocked until ${fmtTime(status.until!, tz)}`, `${fmtTime(status.until!, tz)} gacha bloklangan`) + (status.block_reason ? ` · ${status.block_reason}` : '')
        : tr(lang, 'Не для онлайн-брони', 'Not bookable online', 'Onlayn band qilinmaydi');
    }
  })();
  const canSeat = s === 'free' || s === 'soon' || (s === 'unavailable' && status?.unavailable_reason === 'not_bookable');

  return (
    <div className="rounded-2xl border border-border bg-card p-3 space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATE_COLORS[s] }} />
          <span className="text-[15px] font-semibold text-text">{tr(lang, 'Стол', 'Table', 'Stol')} {table.name}</span>
          <span className="text-[12px] text-muted ml-auto">{table.seats} {tr(lang, 'мест', 'seats', "o'rin")}</span>
        </div>
        <p className="text-[12px] text-muted mt-1">{line}</p>
      </div>

      {status?.reservation && (
        <button onClick={() => onOpen(status.reservation!.id)}
          className="w-full text-left rounded-xl border border-border px-3 py-2 hover:border-primary/50">
          <div className="text-[13px] font-semibold text-text">{status.reservation.guest_name} · {status.reservation.party_size}</div>
          <div className="text-[12px] text-muted">{fmtTime(status.reservation.start_at, tz)}–{fmtTime(status.reservation.end_at, tz)} · {tr(lang, ...STATUS_LABELS[status.reservation.status])}</div>
        </button>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <button onClick={onWalkIn} disabled={!canSeat}
          className="flex flex-col items-center gap-1 py-2 rounded-xl bg-primary text-white text-[12px] font-semibold disabled:opacity-30"><Armchair size={15} />Walk-in</button>
        <button onClick={onPhone} className="flex flex-col items-center gap-1 py-2 rounded-xl border border-border text-text text-[12px] font-semibold"><Phone size={15} />{tr(lang, 'Бронь', 'Booking', 'Bron')}</button>
        <button onClick={onBlock} className="flex flex-col items-center gap-1 py-2 rounded-xl border border-border text-text text-[12px] font-semibold"><Lock size={15} />{tr(lang, 'Блок', 'Block', 'Blok')}</button>
      </div>

      {reservations.length > 0 && (
        <div>
          <p className="text-[12px] text-muted mb-1">{tr(lang, 'Брони на столе', 'Bookings on this table', 'Stoldagi bronlar')}</p>
          {reservations.map(r => (
            <button key={r.id} onClick={() => onOpen(r.id)} className="w-full flex items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-background text-[13px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[r.status] }} />
              <span className="text-text w-24 shrink-0">{fmtTime(r.start_at, tz)}–{fmtTime(r.end_at, tz)}</span>
              <span className="text-text truncate">{r.guest_name} · {r.party_size}</span>
            </button>
          ))}
        </div>
      )}

      {blocks.length > 0 && (
        <div>
          <p className="text-[12px] text-muted mb-1">{tr(lang, 'Блокировки', 'Blocks', 'Bloklar')}</p>
          {blocks.map(b => (
            <div key={b.id} className="flex items-center gap-2 text-[13px] px-1.5 py-1">
              <Lock size={12} className="text-muted shrink-0" />
              <span className="text-text">{fmtTime(b.from_at, tz)}–{fmtTime(b.to_at, tz)}</span>
              <span className="text-muted truncate flex-1">{b.reason}</span>
              <button onClick={() => onUnblock(b.id)} title={tr(lang, 'Снять блокировку', 'Remove block', 'Blokni olib tashlash')}
                className="p-1 rounded text-muted hover:text-primary"><Unlock size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

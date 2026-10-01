import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, Check, Armchair, LogOut, UserX, Ban, Clock, ArrowRightLeft, Phone, Search, Lock, Users,
} from 'lucide-react';
import { Language } from '../../types';
import {
  bookingApi, BookingApiError, BookingSettings, BookingTable, StaffReservation, ReservationStatus, GuestSummary,
} from '../../services/traceApi';
import { MIN, localDate, fmtTime, zonedToDate, roundUp } from './hostessTime';

export function tr(lang: Language, ru: string, en: string, uz: string) {
  return lang === 'ru' ? ru : lang === 'uz' ? uz : en;
}

type Toast = (message: string, type: 'success' | 'error' | 'info') => void;

export type HallTable = BookingTable & { hall_name: string };

// Everything a dialog needs from the panel.
export interface PanelCtx {
  lang: Language;
  settings: BookingSettings;
  tables: HallTable[];
  toast: Toast;
  reload: () => void;
}

export const inputCls = 'w-full bg-background border border-border rounded-lg px-2.5 py-2 text-text text-[13px] focus:border-primary focus:outline-none';

export const STATUS_LABELS: Record<ReservationStatus, [string, string, string]> = {
  pending:   ['Ждёт подтверждения', 'Pending', 'Tasdiq kutilmoqda'],
  confirmed: ['Подтверждена', 'Confirmed', 'Tasdiqlangan'],
  seated:    ['Гости за столом', 'Seated', 'Mehmonlar stolda'],
  completed: ['Завершена', 'Completed', 'Yakunlangan'],
  cancelled: ['Отменена', 'Cancelled', 'Bekor qilingan'],
  no_show:   ['Не пришли', 'No-show', 'Kelmadi'],
};

export const STATUS_COLORS: Record<ReservationStatus, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  seated: '#ef4444',
  completed: '#6b7280',
  cancelled: '#9ca3af',
  no_show: '#a855f7',
};

const SOURCE_LABELS: Record<StaffReservation['source'], [string, string, string]> = {
  online: ['Онлайн', 'Online', 'Onlayn'],
  phone: ['По телефону', 'Phone', 'Telefon orqali'],
  walk_in: ['Без брони', 'Walk-in', 'Bronsiz'],
};

// Turns an API error into one readable line; for "table just taken" it lists
// the nearest free options the backend sent along.
export function errorText(e: unknown, ctx: PanelCtx): string {
  const err = e as BookingApiError;
  const alts: Array<{ table_name: string; start_at: string }> = err?.body?.alternatives ?? [];
  if (err?.code === 'table_taken') {
    const base = tr(ctx.lang, 'Стол занят на это время', 'The table is taken at that time', "Bu vaqtda stol band");
    if (alts.length === 0) return base;
    const list = alts.map(a => `${tr(ctx.lang, 'стол', 'table', 'stol')} ${a.table_name} ${fmtTime(a.start_at, ctx.settings.timezone)}`).join(', ');
    return `${base}. ${tr(ctx.lang, 'Свободно', 'Free', "Bo'sh")}: ${list}`;
  }
  return err?.message || tr(ctx.lang, 'Ошибка', 'Error', 'Xatolik');
}

// ── shell ────────────────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onPointerDown={onClose}>
      <div onPointerDown={e => e.stopPropagation()}
        className={`w-full ${wide ? 'sm:max-w-[640px]' : 'sm:max-w-[440px]'} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl`}>
        <div className="sticky top-0 bg-card flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="text-[15px] font-semibold text-text min-w-0">{title}</div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-text"><X size={16} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ActionButton({ onClick, icon, label, tone = 'default', disabled }: {
  onClick: () => void; icon: React.ReactNode; label: string; tone?: 'primary' | 'danger' | 'default'; disabled?: boolean;
}) {
  const cls = tone === 'primary'
    ? 'bg-primary text-white border-primary hover:bg-primary-hover'
    : tone === 'danger'
    ? 'border-red-500/40 text-red-500 hover:bg-red-500/10'
    : 'border-border text-text hover:border-primary/50';
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors disabled:opacity-40 ${cls}`}>
      {icon}{label}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-text text-right">{children}</span>
    </div>
  );
}

// ── reservation card ─────────────────────────────────────────────────────────

export function ReservationDialog({ reservation, ctx, onClose }: { reservation: StaffReservation; ctx: PanelCtx; onClose: () => void }) {
  const { lang, settings } = ctx;
  const tz = settings.timezone;
  const [r, setR] = useState(reservation);
  const [busy, setBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [guest, setGuest] = useState<GuestSummary | null>(null);

  useEffect(() => { setR(reservation); }, [reservation]);

  // Visit history of this phone — the hostess sees a regular or a no-show at a glance.
  useEffect(() => {
    if (!r.guest_phone) return;
    bookingApi.guests.search(r.guest_phone)
      .then(list => setGuest(list.find(g => g.guest_phone === r.guest_phone) ?? null))
      .catch(() => {});
  }, [r.guest_phone]);

  const run = async (fn: () => Promise<StaffReservation>, ok: string, close = false) => {
    setBusy(true);
    try {
      const next = await fn();
      setR(prev => ({ ...prev, ...next }));
      ctx.toast(ok, 'success');
      ctx.reload();
      if (close) onClose();
    } catch (e) {
      ctx.toast(errorText(e, ctx), 'error');
    } finally {
      setBusy(false);
    }
  };

  const status = (s: ReservationStatus, ok: string, close = false) => run(() => bookingApi.reservations.setStatus(r.id, s), ok, close);
  const table = ctx.tables.find(t => t.id === r.table_id);
  const active = r.status === 'pending' || r.status === 'confirmed' || r.status === 'seated';

  return (
    <Modal onClose={onClose} title={
      <span className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLORS[r.status] }} />
        <span className="truncate">{r.guest_name}</span>
      </span>
    }>
      <div className="divide-y divide-border mb-4">
        <Row label={tr(lang, 'Статус', 'Status', 'Holat')}>{tr(lang, ...STATUS_LABELS[r.status])}</Row>
        <Row label={tr(lang, 'Время', 'Time', 'Vaqt')}>{localDate(new Date(r.start_at), tz).split('-').reverse().join('.')} · {fmtTime(r.start_at, tz)}–{fmtTime(r.end_at, tz)}</Row>
        <Row label={tr(lang, 'Стол', 'Table', 'Stol')}>{table ? `${table.name} · ${table.hall_name}` : r.table_name}</Row>
        <Row label={tr(lang, 'Гостей', 'Guests', 'Mehmonlar')}>{r.party_size}</Row>
        {r.guest_phone && <Row label={tr(lang, 'Телефон', 'Phone', 'Telefon')}><a href={`tel:${r.guest_phone}`} className="text-primary">{r.guest_phone}</a></Row>}
        <Row label={tr(lang, 'Источник', 'Source', 'Manba')}>{tr(lang, ...SOURCE_LABELS[r.source])}</Row>
        {r.comment && <Row label={tr(lang, 'Комментарий', 'Comment', 'Izoh')}><span className="whitespace-pre-wrap">{r.comment}</span></Row>}
        {guest && guest.total > 1 && (
          <Row label={tr(lang, 'История', 'History', 'Tarix')}>
            {tr(lang, `визитов ${guest.visits}`, `${guest.visits} visits`, `${guest.visits} tashrif`)}
            {guest.no_shows > 0 && <span className="text-purple-500 font-semibold"> · {tr(lang, `не пришёл ${guest.no_shows}`, `${guest.no_shows} no-shows`, `${guest.no_shows} marta kelmagan`)}</span>}
          </Row>
        )}
      </div>

      {busy && <div className="flex justify-center pb-3"><Loader2 size={16} className="animate-spin text-muted" /></div>}

      <div className="grid grid-cols-2 gap-2">
        {r.status === 'pending' && (
          <ActionButton tone="primary" disabled={busy} icon={<Check size={14} />} label={tr(lang, 'Подтвердить', 'Confirm', 'Tasdiqlash')}
            onClick={() => status('confirmed', tr(lang, 'Бронь подтверждена', 'Confirmed', 'Tasdiqlandi'))} />
        )}
        {(r.status === 'pending' || r.status === 'confirmed') && (
          <ActionButton tone={r.status === 'confirmed' ? 'primary' : 'default'} disabled={busy} icon={<Armchair size={14} />} label={tr(lang, 'Посадить', 'Seat', "O'tqazish")}
            onClick={() => status('seated', tr(lang, 'Гости посажены', 'Guests seated', "Mehmonlar o'tqazildi"))} />
        )}
        {r.status === 'seated' && (
          <ActionButton tone="primary" disabled={busy} icon={<LogOut size={14} />} label={tr(lang, 'Освободить стол', 'Free the table', "Stolni bo'shatish")}
            onClick={() => status('completed', tr(lang, 'Стол свободен', 'Table is free', "Stol bo'sh"), true)} />
        )}
        {active && (
          <ActionButton disabled={busy} icon={<Clock size={14} />} label={tr(lang, '+30 минут', '+30 min', '+30 daqiqa')}
            onClick={() => run(() => bookingApi.reservations.update(r.id, { extend_min: 30 }), tr(lang, 'Продлено на 30 минут', 'Extended by 30 min', '30 daqiqaga uzaytirildi'))} />
        )}
        {active && (
          <ActionButton disabled={busy} icon={<ArrowRightLeft size={14} />} label={tr(lang, 'Пересадить / время', 'Move / time', "Ko'chirish / vaqt")}
            onClick={() => setMoveOpen(v => !v)} />
        )}
        {(r.status === 'pending' || r.status === 'confirmed') && (
          <ActionButton tone="danger" disabled={busy} icon={<UserX size={14} />} label={tr(lang, 'Не пришли', 'No-show', 'Kelmadi')}
            onClick={() => { if (window.confirm(tr(lang, 'Отметить, что гости не пришли?', 'Mark as no-show?', 'Kelmadi deb belgilansinmi?'))) status('no_show', tr(lang, 'Отмечено: не пришли', 'Marked no-show', 'Kelmadi deb belgilandi'), true); }} />
        )}
        {(r.status === 'pending' || r.status === 'confirmed') && (
          <ActionButton tone="danger" disabled={busy} icon={<Ban size={14} />} label={tr(lang, 'Отменить', 'Cancel', 'Bekor qilish')}
            onClick={() => { if (window.confirm(tr(lang, 'Отменить бронь?', 'Cancel this booking?', 'Bron bekor qilinsinmi?'))) status('cancelled', tr(lang, 'Бронь отменена', 'Booking cancelled', 'Bron bekor qilindi'), true); }} />
        )}
      </div>

      {moveOpen && active && (
        <MoveForm r={r} ctx={ctx} busy={busy}
          onSubmit={patch => run(() => bookingApi.reservations.update(r.id, patch), tr(lang, 'Бронь перенесена', 'Booking moved', "Bron ko'chirildi")).then(() => setMoveOpen(false))} />
      )}
    </Modal>
  );
}

function MoveForm({ r, ctx, busy, onSubmit }: {
  r: StaffReservation; ctx: PanelCtx; busy: boolean; onSubmit: (patch: { table_id?: string; start_at?: string }) => void;
}) {
  const { lang, settings } = ctx;
  const tz = settings.timezone;
  const [tableId, setTableId] = useState(r.table_id);
  const [date, setDate] = useState(localDate(new Date(r.start_at), tz));
  const [time, setTime] = useState(fmtTime(r.start_at, tz));
  const seated = r.status === 'seated';

  const submit = () => {
    const patch: { table_id?: string; start_at?: string } = {};
    if (tableId !== r.table_id) patch.table_id = tableId;
    // Seated guests are moved to another table only — their time is already running.
    if (!seated) {
      const start = zonedToDate(date, time, tz);
      if (start.getTime() !== new Date(r.start_at).getTime()) patch.start_at = start.toISOString();
    }
    if (Object.keys(patch).length > 0) onSubmit(patch);
  };

  return (
    <div className="mt-3 rounded-xl border border-border p-3 space-y-2">
      <TableSelect ctx={ctx} value={tableId} onChange={setTableId} party={r.party_size} />
      {!seated && (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          <input type="time" step={settings.slot_step_min * 60} value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
        </div>
      )}
      <button onClick={submit} disabled={busy}
        className="w-full py-2.5 rounded-xl bg-primary text-white text-[13px] font-semibold disabled:opacity-40">
        {tr(lang, 'Перенести', 'Move', "Ko'chirish")}
      </button>
    </div>
  );
}

// Tables grouped by hall; ones too small for the party are marked.
function TableSelect({ ctx, value, onChange, party }: { ctx: PanelCtx; value: string; onChange: (id: string) => void; party: number }) {
  const halls = useMemo(() => {
    const m = new Map<string, HallTable[]>();
    for (const t of ctx.tables) m.set(t.hall_name, [...(m.get(t.hall_name) ?? []), t]);
    return [...m.entries()];
  }, [ctx.tables]);
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
      {!value && <option value="">{tr(ctx.lang, '— выберите стол —', '— pick a table —', '— stolni tanlang —')}</option>}
      {halls.map(([hall, list]) => (
        <optgroup key={hall} label={hall}>
          {list.map(t => (
            <option key={t.id} value={t.id}>
              {tr(ctx.lang, 'Стол', 'Table', 'Stol')} {t.name} · {t.seats} {tr(ctx.lang, 'мест', 'seats', "o'rin")}{t.seats < party ? ' ⚠' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ── new reservation: phone booking or walk-in ────────────────────────────────

export function NewReservationDialog({ ctx, mode, tableId: initialTable, start: initialStart, freeUntil, onClose }: {
  ctx: PanelCtx;
  mode: 'phone' | 'walk_in';
  tableId?: string;
  start?: Date;
  freeUntil?: string | null;    // walk-in: next booking on this table, to shorten the stay
  onClose: () => void;
}) {
  const { lang, settings } = ctx;
  const tz = settings.timezone;
  const walkIn = mode === 'walk_in';
  const startDefault = initialStart ?? roundUp(new Date(Date.now() + 30 * MIN), settings.slot_step_min);
  const table0 = ctx.tables.find(t => t.id === initialTable);

  const [tableId, setTableId] = useState(initialTable ?? '');
  const [party, setParty] = useState(walkIn ? Math.min(2, table0?.seats ?? 2) : 2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [date, setDate] = useState(localDate(startDefault, tz));
  const [time, setTime] = useState(fmtTime(startDefault, tz));
  const [duration, setDuration] = useState(settings.default_duration_min);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!tableId) { setError(tr(lang, 'Выберите стол', 'Pick a table', 'Stolni tanlang')); return; }
    if (!walkIn && (!name.trim() || phone.replace(/\D/g, '').length < 7)) {
      setError(tr(lang, 'Укажите имя и телефон', 'Enter name and phone', 'Ism va telefonni kiriting')); return;
    }
    let durationMin = duration;
    if (walkIn && freeUntil) {
      // Seat now, but only until the next booking on this table (minus nothing —
      // the server adds the cleanup buffer and refuses if it doesn't fit).
      const left = Math.floor((new Date(freeUntil).getTime() - Date.now()) / MIN);
      if (left >= 15) durationMin = Math.min(durationMin, left);
    }
    setBusy(true); setError('');
    try {
      await bookingApi.reservations.create({
        source: mode,
        table_id: tableId,
        party_size: party,
        guest_name: name.trim() || undefined,
        guest_phone: phone.replace(/\D/g, '').length >= 7 ? phone : undefined,
        start_at: walkIn ? undefined : zonedToDate(date, time, tz).toISOString(),
        duration_min: durationMin,
        comment: comment.trim() || undefined,
      });
      ctx.toast(walkIn ? tr(lang, 'Гости посажены', 'Guests seated', "Mehmonlar o'tqazildi") : tr(lang, 'Бронь создана', 'Booking created', 'Bron yaratildi'), 'success');
      ctx.reload();
      onClose();
    } catch (e) {
      setError(errorText(e, ctx));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={walkIn
      ? tr(lang, 'Посадить без брони', 'Walk-in', 'Bronsiz o\'tqazish')
      : tr(lang, 'Бронь по телефону', 'Phone booking', 'Telefon orqali bron')}>
      <div className="space-y-3">
        <label className="block">
          <span className="block text-[12px] text-muted mb-1">{tr(lang, 'Гостей', 'Guests', 'Mehmonlar')}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setParty(p => Math.max(1, p - 1))} className="w-10 h-10 rounded-xl border border-border text-[18px] text-text">−</button>
            <span className="w-10 text-center text-[18px] font-semibold text-text">{party}</span>
            <button onClick={() => setParty(p => Math.min(100, p + 1))} className="w-10 h-10 rounded-xl border border-border text-[18px] text-text">+</button>
          </div>
        </label>
        <label className="block">
          <span className="block text-[12px] text-muted mb-1">{tr(lang, 'Стол', 'Table', 'Stol')}</span>
          <TableSelect ctx={ctx} value={tableId} onChange={setTableId} party={party} />
        </label>
        {!walkIn && (
          <div className="grid grid-cols-3 gap-2">
            <label className="block col-span-1">
              <span className="block text-[12px] text-muted mb-1">{tr(lang, 'Дата', 'Date', 'Sana')}</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-[12px] text-muted mb-1">{tr(lang, 'Время', 'Time', 'Vaqt')}</span>
              <input type="time" step={settings.slot_step_min * 60} value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-[12px] text-muted mb-1">{tr(lang, 'На сколько', 'Length', 'Davomiyligi')}</span>
              <select value={duration} onChange={e => setDuration(Number(e.target.value))} className={inputCls}>
                {[60, 90, 120, 150, 180, 240, 300].concat(settings.default_duration_min).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map(m => (
                  <option key={m} value={m}>{m % 60 === 0 ? `${m / 60} ${tr(lang, 'ч', 'h', 'soat')}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[12px] text-muted mb-1">{tr(lang, 'Имя', 'Name', 'Ism')}{walkIn && <span className="opacity-60"> · {tr(lang, 'необяз.', 'optional', 'ixtiyoriy')}</span>}</span>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} maxLength={255} />
          </label>
          <label className="block">
            <span className="block text-[12px] text-muted mb-1">{tr(lang, 'Телефон', 'Phone', 'Telefon')}{walkIn && <span className="opacity-60"> · {tr(lang, 'необяз.', 'optional', 'ixtiyoriy')}</span>}</span>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} maxLength={32} />
          </label>
        </div>
        <label className="block">
          <span className="block text-[12px] text-muted mb-1">{tr(lang, 'Комментарий', 'Comment', 'Izoh')}</span>
          <input value={comment} onChange={e => setComment(e.target.value)} className={inputCls} maxLength={1000} />
        </label>
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        <button onClick={submit} disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-primary text-white text-[14px] font-semibold disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin" /> : walkIn ? <Armchair size={15} /> : <Phone size={15} />}
          {walkIn ? tr(lang, 'Посадить сейчас', 'Seat now', "Hozir o'tqazish") : tr(lang, 'Забронировать', 'Book', 'Band qilish')}
        </button>
      </div>
    </Modal>
  );
}

// ── table block ──────────────────────────────────────────────────────────────

export function BlockDialog({ ctx, tableId: initialTable, onClose }: { ctx: PanelCtx; tableId?: string; onClose: () => void }) {
  const { lang, settings } = ctx;
  const tz = settings.timezone;
  const now = roundUp(new Date(), settings.slot_step_min);
  const [tableId, setTableId] = useState(initialTable ?? '');
  const [date, setDate] = useState(localDate(now, tz));
  const [from, setFrom] = useState(fmtTime(now, tz));
  const [to, setTo] = useState(fmtTime(new Date(now.getTime() + 120 * MIN), tz));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!tableId) { setError(tr(lang, 'Выберите стол', 'Pick a table', 'Stolni tanlang')); return; }
    const fromAt = zonedToDate(date, from, tz);
    let toAt = zonedToDate(date, to, tz);
    if (toAt <= fromAt) toAt = new Date(toAt.getTime() + 24 * 60 * MIN);  // past midnight
    setBusy(true); setError('');
    try {
      await bookingApi.blocks.create({ table_id: tableId, from_at: fromAt.toISOString(), to_at: toAt.toISOString(), reason: reason.trim() });
      ctx.toast(tr(lang, 'Стол заблокирован', 'Table blocked', 'Stol bloklandi'), 'success');
      ctx.reload();
      onClose();
    } catch (e) {
      setError(errorText(e, ctx));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={tr(lang, 'Заблокировать стол', 'Block a table', 'Stolni bloklash')}>
      <div className="space-y-3">
        <TableSelect ctx={ctx} value={tableId} onChange={setTableId} party={1} />
        <div className="grid grid-cols-3 gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          <input type="time" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
          <input type="time" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
        </div>
        <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500}
          placeholder={tr(lang, 'Причина (например: ремонт, банкет)', 'Reason (e.g. repair, banquet)', "Sabab (masalan: ta'mir, banket)")} className={inputCls} />
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        <button onClick={submit} disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-primary text-white text-[14px] font-semibold disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
          {tr(lang, 'Заблокировать', 'Block', 'Bloklash')}
        </button>
      </div>
    </Modal>
  );
}

// ── guests: search by phone + history ───────────────────────────────────────

export function GuestsView({ ctx, onOpenReservation }: { ctx: PanelCtx; onOpenReservation: (r: StaffReservation) => void }) {
  const { lang, settings } = ctx;
  const tz = settings.timezone;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GuestSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GuestSummary | null>(null);
  const [history, setHistory] = useState<StaffReservation[] | null>(null);

  useEffect(() => {
    const digits = q.replace(/\D/g, '');
    if (digits.length < 3) { setResults(null); return; }
    setLoading(true);
    const t = setTimeout(() => {
      bookingApi.guests.search(q)
        .then(setResults)
        .catch(e => ctx.toast((e as Error).message, 'error'))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setHistory(null);
    if (!selected) return;
    bookingApi.guests.history(selected.guest_phone).then(setHistory).catch(e => ctx.toast((e as Error).message, 'error'));
  }, [selected]);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input type="tel" value={q} onChange={e => setQ(e.target.value)} autoFocus
            placeholder={tr(lang, 'Телефон гостя (от 3 цифр)', 'Guest phone (3+ digits)', 'Mehmon telefoni (3+ raqam)')}
            className={`${inputCls} pl-8`} />
        </div>
        {loading && <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-muted" /></div>}
        {!loading && results?.length === 0 && <p className="text-[13px] text-muted py-3 text-center">{tr(lang, 'Никого не нашли', 'No one found', 'Hech kim topilmadi')}</p>}
        {!loading && results?.map(g => (
          <button key={g.guest_phone} onClick={() => setSelected(g)}
            className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${selected?.guest_phone === g.guest_phone ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40'}`}>
            <div className="flex justify-between gap-2">
              <span className="text-[13px] font-semibold text-text truncate">{g.guest_name}</span>
              <span className="text-[12px] text-muted shrink-0">{g.guest_phone}</span>
            </div>
            <div className="text-[12px] text-muted mt-0.5">
              {tr(lang, `визитов ${g.visits}`, `${g.visits} visits`, `${g.visits} tashrif`)}
              {g.no_shows > 0 && <span className="text-purple-500 font-semibold"> · {tr(lang, `не пришёл ${g.no_shows}`, `${g.no_shows} no-shows`, `kelmagan ${g.no_shows}`)}</span>}
              {g.cancelled > 0 && <> · {tr(lang, `отмен ${g.cancelled}`, `${g.cancelled} cancelled`, `bekor ${g.cancelled}`)}</>}
              {g.upcoming > 0 && <span className="text-primary"> · {tr(lang, `впереди ${g.upcoming}`, `${g.upcoming} upcoming`, `kelgusi ${g.upcoming}`)}</span>}
            </div>
          </button>
        ))}
        {results === null && !loading && (
          <p className="text-[12px] text-muted px-1">{tr(lang,
            'Найдите гостя по номеру — увидите, сколько раз он приходил и были ли неявки.',
            'Find a guest by phone to see their visits and no-shows.',
            "Mehmonni raqami bo'yicha toping — tashriflari va kelmagan holatlarini ko'rasiz.")}</p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 min-h-[200px]">
        {!selected && <div className="h-full flex items-center justify-center text-muted"><Users size={28} className="opacity-40" /></div>}
        {selected && (
          <>
            <div className="flex items-baseline justify-between gap-2 mb-2 px-1">
              <span className="text-[15px] font-semibold text-text">{selected.guest_name}</span>
              <a href={`tel:${selected.guest_phone}`} className="text-[13px] text-primary">{selected.guest_phone}</a>
            </div>
            {!history && <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-muted" /></div>}
            <div className="space-y-1">
              {history?.map(r => (
                <button key={r.id} onClick={() => onOpenReservation(r)}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-background text-[13px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[r.status] }} />
                  <span className="text-text w-36 shrink-0">{localDate(new Date(r.start_at), tz).split('-').reverse().join('.')} {fmtTime(r.start_at, tz)}</span>
                  <span className="text-muted shrink-0">{tr(lang, 'стол', 'table', 'stol')} {r.table_name} · {r.party_size} {tr(lang, 'гост.', 'guests', 'mehmon')}</span>
                  <span className="ml-auto text-[12px] text-muted truncate">{tr(lang, ...STATUS_LABELS[r.status])}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

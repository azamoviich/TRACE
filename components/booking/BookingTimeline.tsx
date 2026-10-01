import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { bookingApi, StaffReservation, TableBlock } from '../../services/traceApi';
import { PanelCtx, STATUS_COLORS, tr, errorText } from './HostessDialogs';
import { MIN, dayHours, fmtTime, zonedToDate } from './hostessTime';

// Tables down the side, hours across, reservations as blocks. A block can be
// dragged to another time (snaps to the slot step) and/or another table; a
// click opens the reservation; a click on an empty spot starts a phone
// booking for that table and time.

const ROW_H = 44;
const LABEL_W = 92;
const PX_PER_MIN = 2;   // 120px per hour

interface Props {
  ctx: PanelCtx;
  date: string;
  reservations: StaffReservation[];
  blocks: TableBlock[];
  onOpen: (r: StaffReservation) => void;
  onNew: (tableId: string, start: Date) => void;
}

type Drag = {
  id: string;
  pointerId: number;
  startX: number; startY: number;
  dMin: number; dRow: number;
  moved: boolean;
};

export function BookingTimeline({ ctx, date, reservations, blocks, onOpen, onNew }: Props) {
  const { lang, settings, tables } = ctx;
  const tz = settings.timezone;
  const step = settings.slot_step_min;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const dayStart = useMemo(() => zonedToDate(date, '00:00', tz).getTime(), [date, tz]);
  const minuteOf = (iso: string) => (new Date(iso).getTime() - dayStart) / MIN;

  // Visible range: opening hours, widened to whatever is booked that day.
  const [fromMin, toMin] = useMemo(() => {
    const h = dayHours(settings, date) ?? { open: 600, close: 1380 };
    let lo = h.open, hi = h.close;
    for (const r of reservations) { lo = Math.min(lo, minuteOf(r.start_at)); hi = Math.max(hi, minuteOf(r.end_at)); }
    lo = Math.max(0, Math.floor(lo / 60) * 60);
    hi = Math.min(48 * 60, Math.ceil(hi / 60) * 60);
    return [lo, Math.max(hi, lo + 60)];
  }, [settings, date, reservations, dayStart]);

  const width = (toMin - fromMin) * PX_PER_MIN;
  const x = (min: number) => (min - fromMin) * PX_PER_MIN;
  const nowMin = (now - dayStart) / MIN;

  // Scroll so "now" (or opening) is in view when the day changes.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const target = nowMin >= fromMin && nowMin <= toMin ? x(nowMin) - 120 : 0;
      el.scrollLeft = Math.max(0, target);
    });
    return () => cancelAnimationFrame(id);
  }, [date, fromMin, toMin]);

  // Cancelled / no-show don't hold the table — kept off the grid.
  const shown = reservations.filter(r => r.status !== 'cancelled' && r.status !== 'no_show');
  const rowOf = useMemo(() => new Map(tables.map((t, i) => [t.id, i])), [tables]);
  const hours: number[] = [];
  for (let m = fromMin; m <= toMin; m += 60) hours.push(m);

  const onPointerDown = (r: StaffReservation, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: r.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dMin: 0, dRow: 0, moved: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    const moved = drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4;
    setDrag({ ...drag, moved, dMin: Math.round(dx / PX_PER_MIN / step) * step, dRow: Math.round(dy / ROW_H) });
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    setDrag(null);
    const r = shown.find(x => x.id === d.id);
    if (!r) return;
    if (!d.moved) { onOpen(r); return; }

    const row = Math.min(tables.length - 1, Math.max(0, (rowOf.get(r.table_id) ?? 0) + d.dRow));
    const newTable = tables[row]?.id ?? r.table_id;
    const patch: { table_id?: string; start_at?: string } = {};
    if (newTable !== r.table_id) patch.table_id = newTable;
    // Seated guests can only change table — their visit has already started.
    if (d.dMin !== 0 && r.status !== 'seated') patch.start_at = new Date(new Date(r.start_at).getTime() + d.dMin * MIN).toISOString();
    if (Object.keys(patch).length === 0) return;
    try {
      await bookingApi.reservations.update(r.id, patch);
      ctx.toast(tr(lang, 'Бронь перенесена', 'Booking moved', "Bron ko'chirildi"), 'success');
    } catch (err) {
      ctx.toast(errorText(err, ctx), 'error');
    }
    ctx.reload();
  };

  const onRowClick = (tableId: string, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const min = fromMin + (e.clientX - rect.left) / PX_PER_MIN;
    const snapped = Math.floor(min / step) * step;
    onNew(tableId, new Date(dayStart + snapped * MIN));
  };

  if (tables.length === 0) {
    return <div className="rounded-2xl border border-border bg-card p-6 text-[13px] text-muted">{tr(lang, 'Нет столов — сначала создайте схему зала.', 'No tables — set up the floor plan first.', "Stollar yo'q — avval zal sxemasini yarating.")}</div>;
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: '72vh' }}>
        <div className="relative" style={{ width: LABEL_W + width, minWidth: '100%' }}>
          {/* hour header */}
          <div className="sticky top-0 z-20 flex bg-card border-b border-border" style={{ height: 28 }}>
            <div className="sticky left-0 z-30 bg-card border-r border-border shrink-0" style={{ width: LABEL_W }} />
            <div className="relative" style={{ width }}>
              {hours.map(m => (
                <span key={m} className={`absolute top-1.5 text-[11px] text-muted ${m === fromMin ? 'pl-1' : '-translate-x-1/2'}`} style={{ left: x(m) }}>
                  {String(Math.floor(m / 60) % 24).padStart(2, '0')}:00
                </span>
              ))}
            </div>
          </div>

          {/* rows */}
          <div className="relative" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
            {tables.map((t, i) => (
              <div key={t.id} className="flex border-b border-border/60" style={{ height: ROW_H }}>
                <div className="sticky left-0 z-10 bg-card border-r border-border shrink-0 px-2 flex flex-col justify-center" style={{ width: LABEL_W }}>
                  <span className="text-[13px] font-semibold text-text leading-tight truncate">{tr(lang, 'Стол', 'Table', 'Stol')} {t.name}</span>
                  <span className="text-[11px] text-muted leading-tight truncate">{t.seats} · {t.hall_name}</span>
                </div>
                <div className={`relative cursor-cell ${i % 2 ? 'bg-background/40' : ''}`} style={{ width }} onClick={e => onRowClick(t.id, e)}>
                  {hours.map(m => <div key={m} className="absolute top-0 bottom-0 border-l border-border/50" style={{ left: x(m) }} />)}
                </div>
              </div>
            ))}

            {/* blocks */}
            {blocks.map(b => {
              const row = rowOf.get(b.table_id);
              if (row === undefined) return null;
              const l = Math.max(x(minuteOf(b.from_at)), 0), r = Math.min(x(minuteOf(b.to_at)), width);
              if (r <= l) return null;
              return (
                <div key={b.id} title={b.reason}
                  className="absolute rounded-md flex items-center gap-1 px-1.5 text-[11px] text-white/90 pointer-events-none overflow-hidden"
                  style={{ top: row * ROW_H + 5, height: ROW_H - 10, left: LABEL_W + l, width: r - l,
                    background: 'repeating-linear-gradient(45deg,#6b7280,#6b7280 6px,#4b5563 6px,#4b5563 12px)' }}>
                  <Lock size={11} className="shrink-0" /><span className="truncate">{b.reason}</span>
                </div>
              );
            })}

            {/* reservations */}
            {shown.map(r => {
              const row0 = rowOf.get(r.table_id);
              if (row0 === undefined) return null;
              const dragging = drag?.id === r.id && drag.moved;
              const row = dragging ? Math.min(tables.length - 1, Math.max(0, row0 + drag!.dRow)) : row0;
              const shift = dragging && r.status !== 'seated' ? drag!.dMin : 0;
              const left = x(minuteOf(r.start_at) + shift);
              const w = Math.max(24, (minuteOf(r.end_at) - minuteOf(r.start_at)) * PX_PER_MIN - 2);
              const c = STATUS_COLORS[r.status];
              const startShown = new Date(new Date(r.start_at).getTime() + shift * MIN);
              return (
                <div key={r.id}
                  onPointerDown={e => onPointerDown(r, e)}
                  className={`absolute rounded-md px-1.5 py-0.5 text-[11px] leading-tight overflow-hidden select-none touch-none ${dragging ? 'z-30 shadow-lg ring-2 ring-primary' : 'z-10'}`}
                  style={{ top: row * ROW_H + 4, height: ROW_H - 8, left: LABEL_W + left, width: w,
                    background: `${c}2e`, borderLeft: `3px solid ${c}`, cursor: dragging ? 'grabbing' : 'grab',
                    opacity: r.status === 'completed' ? 0.55 : 1 }}>
                  <div className="font-semibold text-text truncate">{r.guest_name} · {r.party_size}</div>
                  <div className="text-muted truncate">{fmtTime(startShown, tz)}–{fmtTime(new Date(new Date(r.end_at).getTime() + shift * MIN), tz)}</div>
                </div>
              );
            })}

            {/* now line */}
            {nowMin >= fromMin && nowMin <= toMin && (
              <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none" style={{ left: LABEL_W + x(nowMin) }} />
            )}
          </div>
        </div>
      </div>
      <p className="px-3 py-2 text-[11px] text-muted border-t border-border">
        {tr(lang,
          'Перетащите бронь на другое время или стол · нажмите на бронь — действия · нажмите на пустое место — новая бронь',
          'Drag a booking to another time or table · tap a booking for actions · tap an empty spot for a new booking',
          "Bronni boshqa vaqt yoki stolga suring · bronni bosing — amallar · bo'sh joyni bosing — yangi bron")}
      </p>
    </div>
  );
}

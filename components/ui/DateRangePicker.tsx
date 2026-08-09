import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Language } from '../../types';
import { tr } from '../../constants';

interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

interface Props {
  lang: Language;
  value: DateRange | null;
  onApply: (range: DateRange) => void;
  onClear: () => void;
  isOpen: boolean;
  onClose: () => void;
  // useRef<HTMLButtonElement>(null) produces RefObject<HTMLButtonElement | null> in React 19 typings
  anchorRef: React.RefObject<HTMLElement | null>;
}

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_UZ = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentyabr','Oktyabr','Noyabr','Dekabr'];
const DAYS_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const DAYS_EN = ['Mo','Tu','We','Th','Fr','Sa','Su'];
const DAYS_UZ = ['Du','Se','Cho','Pa','Ju','Sha','Ya'];

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addMonths(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return d;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Monday-first day index (0=Mon … 6=Sun)
function dayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

export const DateRangePicker: React.FC<Props> = ({
  lang, value, onApply, onClear, isOpen, onClose, anchorRef,
}) => {
  const today = new Date();
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date(today);
    d.setDate(1);
    return d;
  });
  const [selecting, setSelecting] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [hovered, setHovered] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelecting({ from: value?.from ?? null, to: value?.to ?? null });
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const months = lang === 'ru' ? MONTHS_RU : lang === 'uz' ? MONTHS_UZ : MONTHS_EN;
  const days   = lang === 'ru' ? DAYS_RU   : lang === 'uz' ? DAYS_UZ   : DAYS_EN;

  const handleDayClick = (iso: string) => {
    if (!selecting.from || (selecting.from && selecting.to)) {
      setSelecting({ from: iso, to: null });
    } else {
      const [f, t] = iso < selecting.from ? [iso, selecting.from] : [selecting.from, iso];
      setSelecting({ from: f, to: t });
    }
  };

  const handleApply = () => {
    if (selecting.from && selecting.to) {
      onApply({ from: selecting.from, to: selecting.to });
      onClose();
    }
  };

  const renderMonth = (baseDate: Date) => {
    const year  = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = dayIndex(new Date(year, month, 1));
    const todayISO = toISO(today);

    const cells: React.ReactNode[] = [];

    // Blank leading cells
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`blank-${i}`} />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = iso === todayISO;
      const isFuture = iso > todayISO;
      const isFrom = iso === selecting.from;
      const isTo   = iso === selecting.to;
      const isEnd  = isFrom || isTo;

      const rangeEnd   = selecting.to ?? hovered;
      const [rangeL, rangeR] = selecting.from && rangeEnd
        ? (selecting.from <= rangeEnd ? [selecting.from, rangeEnd] : [rangeEnd, selecting.from])
        : [null, null];
      const inRange = rangeL && rangeR && iso > rangeL && iso < rangeR;
      const isRangeStart = rangeL && iso === rangeL && rangeL !== rangeR;
      const isRangeEnd   = rangeR && iso === rangeR && rangeL !== rangeR;

      cells.push(
        <button
          key={iso}
          disabled={isFuture}
          onClick={() => !isFuture && handleDayClick(iso)}
          onMouseEnter={() => !isFuture && setHovered(iso)}
          onMouseLeave={() => setHovered(null)}
          className={[
            'relative h-10 sm:h-8 w-full text-[13px] sm:text-[12px] font-medium transition-colors select-none',
            isFuture ? 'text-muted/30 cursor-not-allowed' : 'cursor-pointer',
            isEnd ? 'text-white z-10' : '',
            inRange && !isEnd ? 'text-text' : '',
            !isEnd && !inRange && !isFuture ? 'text-muted hover:text-text' : '',
          ].join(' ')}
        >
          {/* Range fill */}
          {(inRange || isRangeStart || isRangeEnd) && (
            <span
              className="absolute inset-y-0 bg-primary/10 pointer-events-none"
              style={{
                left:  isRangeStart ? '50%' : '0',
                right: isRangeEnd   ? '50%' : '0',
              }}
            />
          )}
          {/* Day circle */}
          {isEnd && (
            <span className="absolute inset-[2px] rounded-full bg-primary pointer-events-none" />
          )}
          {isToday && !isEnd && (
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/50 pointer-events-none" />
          )}
          <span className="relative">{d}</span>
        </button>
      );
    }

    return cells;
  };

  const nextMonth = addMonths(viewDate, 1);
  const label = (d: Date) => `${months[d.getMonth()]} ${d.getFullYear()}`;

  const presets = lang === 'ru'
    ? [
        { label: 'Неделя', from: toISO(new Date(new Date().setDate(today.getDate() - 6))), to: toISO(today) },
        { label: '2 недели', from: toISO(new Date(new Date().setDate(today.getDate() - 13))), to: toISO(today) },
        { label: 'Месяц', from: toISO(new Date(new Date().setDate(today.getDate() - 29))), to: toISO(today) },
        { label: 'Этот месяц', from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, to: toISO(today) },
      ]
    : [
        { label: 'Week', from: toISO(new Date(new Date().setDate(today.getDate() - 6))), to: toISO(today) },
        { label: '2 weeks', from: toISO(new Date(new Date().setDate(today.getDate() - 13))), to: toISO(today) },
        { label: 'Month', from: toISO(new Date(new Date().setDate(today.getDate() - 29))), to: toISO(today) },
        { label: 'This month', from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, to: toISO(today) },
      ];

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40 sm:hidden" onClick={onClose} />

      <div
        ref={panelRef}
        className="fixed inset-x-0 bottom-0 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:bottom-auto sm:mt-2 z-50 bg-surface border border-border rounded-t-2xl sm:rounded-xl shadow-2xl shadow-black/20 p-4 select-none w-full sm:w-auto sm:min-w-[540px] max-h-[85vh] overflow-y-auto"
      >
      {/* Presets */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {presets.map(p => {
          const active = selecting.from === p.from && selecting.to === p.to;
          return (
            <button
              key={p.label}
              onClick={() => setSelecting({ from: p.from, to: p.to })}
              className={`px-3 py-1.5 text-[13px] font-medium rounded-xl transition-colors ${
                active ? 'bg-primary text-white' : 'bg-card-hover text-muted hover:text-text'
              }`}
            >
              {p.label}
            </button>
          );
        })}
        {value && (
          <button
            onClick={() => { onClear(); onClose(); }}
            className="ml-auto p-1 text-muted hover:text-danger transition-colors"
            title={tr(lang, 'Сбросить', 'Clear', 'Tozalash')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Single-month grid (mobile) */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setViewDate(d => addMonths(d, -1))}
            className="p-1.5 text-muted hover:text-text transition-colors rounded-lg hover:bg-card-hover"
          >
            <ChevronLeft size={16} />
          </button>
          <p className="text-[13px] font-semibold text-text tracking-wide">{label(viewDate)}</p>
          <button
            onClick={() => setViewDate(d => addMonths(d, 1))}
            className="p-1.5 text-muted hover:text-text transition-colors rounded-lg hover:bg-card-hover"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {days.map(d => (
            <div key={d} className="text-center text-[11px] uppercase tracking-wider text-muted font-semibold py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {renderMonth(viewDate)}
        </div>
      </div>

      {/* Two-month grid (desktop) */}
      <div className="hidden sm:flex gap-6">
        {[viewDate, nextMonth].map((monthDate, mi) => (
          <div key={mi} className="flex-1">
            {/* Month header */}
            <div className="flex items-center justify-between mb-3">
              {mi === 0 ? (
                <button
                  onClick={() => setViewDate(d => addMonths(d, -1))}
                  className="p-1 text-muted hover:text-text transition-colors rounded-lg hover:bg-card-hover"
                >
                  <ChevronLeft size={14} />
                </button>
              ) : <div className="w-6" />}
              <p className="text-[12px] font-semibold text-text tracking-wide">{label(monthDate)}</p>
              {mi === 1 ? (
                <button
                  onClick={() => setViewDate(d => addMonths(d, 1))}
                  className="p-1 text-muted hover:text-text transition-colors rounded-lg hover:bg-card-hover"
                >
                  <ChevronRight size={14} />
                </button>
              ) : <div className="w-6" />}
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {days.map(d => (
                <div key={d} className="text-center text-[10px] uppercase tracking-wider text-muted font-semibold py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {renderMonth(monthDate)}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <p className="text-[12px] text-muted">
          {selecting.from && selecting.to
            ? `${selecting.from} → ${selecting.to}`
            : selecting.from
            ? tr(lang, 'Выберите конечную дату', 'Select end date', 'Tugash sanasini tanlang')
            : tr(lang, 'Выберите начальную дату', 'Select start date', 'Boshlanish sanasini tanlang')}
        </p>
        <button
          disabled={!selecting.from || !selecting.to}
          onClick={handleApply}
          className="px-4 py-2 text-[13px] font-semibold rounded-xl bg-primary text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {tr(lang, 'Применить', 'Apply', 'Qo\'llash')}
        </button>
      </div>
      </div>
    </>
  );
};

import React, { useEffect, useState } from 'react';
import { Language } from '../../../types';
import { tr } from '../../../constants';

// Owners think in millions: "861 млн", not "861 234 000".
export function money(n: number, lang: Language, signed = false): string {
  const sign = signed && n > 0 ? '+' : n < 0 ? '−' : '';
  const a = Math.abs(n);
  const unit = (ru: string, en: string, uz: string) => tr(lang, ru, en, uz);
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2).replace(/\.?0+$/, '')} ${unit('млрд', 'B', 'mlrd')}`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1).replace(/\.0$/, '')} ${unit('млн', 'M', 'mln')}`;
  return `${sign}${Math.round(a).toLocaleString('ru-RU')}`;
}

export function full(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

export function pct(n: number | null | undefined, digits = 1): string {
  return n == null ? '—' : `${n.toFixed(digits).replace(/\.0$/, '')}%`;
}

const MONTHS: Record<Language, string[]> = {
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
};
const MONTHS_GEN_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS: Record<Language, string[]> = {
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  uz: ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'],
};

export function monthLabel(month: string, lang: Language): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[lang][m - 1]} ${y}`;
}

export function monthName(month: string, lang: Language): string {
  return MONTHS[lang][Number(month.slice(5, 7)) - 1];
}

// "14 октября" / "Oct 14" / "14-oktabr"
export function dayLabel(date: string, lang: Language): string {
  const d = Number(date.slice(8, 10));
  const m = Number(date.slice(5, 7)) - 1;
  if (lang === 'ru') return `${d} ${MONTHS_GEN_RU[m]}`;
  if (lang === 'uz') return `${d}-${MONTHS.uz[m].toLowerCase()}`;
  return `${MONTHS.en[m].slice(0, 3)} ${d}`;
}

export function weekdayShort(date: string, lang: Language): string {
  return WEEKDAYS[lang][new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export const WEEKDAY_HEADERS = (lang: Language) => [1, 2, 3, 4, 5, 6, 0].map(i => WEEKDAYS[lang][i]);

// ── inputs ───────────────────────────────────────────────────────────────────
// Font size comes from the global Safari-zoom rule (max(16px, 1em)).

const inputCls = 'w-full bg-background border border-border rounded-xl px-3 py-2 text-text font-mono tabular-nums focus:outline-none focus:border-primary transition-colors';

// Integer money / count input with "1 234 567" grouping while typing.
export const NumberInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  decimals?: number; // allow a decimal part (e.g. food cost %)
  max?: number;
  className?: string;
  ariaLabel?: string;
}> = ({ value, onChange, suffix, decimals = 0, max, className = '', ariaLabel }) => {
  const format = (v: number) => (decimals > 0 ? String(v).replace('.', ',') : full(v));
  const [text, setText] = useState(format(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(format(value)); }, [value, focused]);

  const handle = (raw: string) => {
    if (decimals > 0) {
      const cleaned = raw.replace(/[^\d.,]/g, '').replace('.', ',');
      setText(cleaned);
      const n = parseFloat(cleaned.replace(',', '.'));
      if (Number.isFinite(n)) onChange(max != null ? Math.min(max, n) : n);
      else if (cleaned === '') onChange(0);
    } else {
      const digits = raw.replace(/\D/g, '');
      const n = digits ? Number(digits) : 0;
      setText(digits ? full(n) : '');
      onChange(max != null ? Math.min(max, n) : n);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        aria-label={ariaLabel}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setText(format(value)); }}
        onChange={e => handle(e.target.value)}
        className={`${inputCls} ${suffix ? 'pr-12' : ''}`}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted pointer-events-none">{suffix}</span>}
    </div>
  );
};

export const statusColor = (pctValue: number | null, inverse = false): string => {
  if (pctValue == null) return 'text-muted';
  const good = inverse ? pctValue <= 100 : pctValue >= 100;
  const near = inverse ? pctValue <= 105 : pctValue >= 95;
  return good ? 'text-success' : near ? 'text-amber-500' : 'text-danger';
};

export const statusBg = (pctValue: number | null, inverse = false): string => {
  if (pctValue == null) return 'bg-muted/10 text-muted';
  const good = inverse ? pctValue <= 100 : pctValue >= 100;
  const near = inverse ? pctValue <= 105 : pctValue >= 95;
  return good ? 'bg-success/10 text-success' : near ? 'bg-amber-500/10 text-amber-500' : 'bg-danger/10 text-danger';
};

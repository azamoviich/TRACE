// Shared building blocks for redesigned pages (TRACE-mockups, Oct 2026).
// Markup mirrors the mockups so styles/rd/*.css apply unchanged.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Language, TimeRange } from '../../types';
import { tr } from '../../constants';
import { tashkentDateStr } from '../../utils/tz';

// ── Formatting ───────────────────────────────────────────────────────────
export const fmt = (n: number | null | undefined) => n == null || !isFinite(n) ? '—' : Math.round(n).toLocaleString('ru-RU');
export const mln = (n: number, digits = 1) => (Math.round(n / 10 ** (6 - digits)) / 10 ** digits).toLocaleString('ru-RU');
export const sum = (lang: Language) => tr(lang, 'сум', 'UZS', "so'm");
export const mlnUnit = (lang: Language) => tr(lang, 'млн', 'M', 'mln');
export function money(n: number, lang: Language): string {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e9) return `${s}${(Math.round(a / 1e7) / 100).toLocaleString('ru-RU')} ${tr(lang, 'млрд', 'B', 'mlrd')}`;
  if (a >= 1e6) return `${s}${(Math.round(a / 1e5) / 10).toLocaleString('ru-RU')} ${mlnUnit(lang)}`;
  if (a >= 1e4) return `${s}${Math.round(a / 1e3).toLocaleString('ru-RU')} ${tr(lang, 'тыс', 'K', 'ming')}`;
  return `${s}${fmt(a)}`;
}
export function pctStr(v: number | null | undefined, digits = 1): string {
  if (v == null || !isFinite(v)) return '—';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return `${r >= 0 ? '+' : '−'}${Math.abs(r).toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}
export const pctChange = (cur: number, prev: number | null | undefined) => prev && prev > 0 ? (cur / prev - 1) * 100 : null;
export const Delta: React.FC<{ v: number | null | undefined; digits?: number; invert?: boolean; className?: string }> = ({ v, digits = 1, invert, className = '' }) =>
  v == null || !isFinite(v) ? <span className={`faint ${className}`}>—</span>
    : <span className={`${(invert ? v <= 0 : v >= 0) ? 'pos' : 'neg'} ${className}`}>{pctStr(v, digits)}</span>;

const MONTHS_GEN: Record<Language, string[]> = {
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
};
export const MONTHS_NOM: Record<Language, string[]> = {
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  en: MONTHS_GEN.en,
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
};
const WEEKDAYS: Record<Language, string[]> = {
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  uz: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'],
};
export const WD_SHORT: Record<Language, string[]> = {
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  uz: ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'],
};
const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const weekday = (iso: string, lang: Language) => WEEKDAYS[lang][parse(iso).getUTCDay()];
export const wdShort = (iso: string, lang: Language) => WD_SHORT[lang][parse(iso).getUTCDay()];
export function dayLabel(iso: string, lang: Language) {
  const d = parse(iso);
  return lang === 'en' ? `${MONTHS_GEN.en[d.getUTCMonth()]} ${d.getUTCDate()}` : `${d.getUTCDate()} ${MONTHS_GEN[lang][d.getUTCMonth()]}`;
}
export function rangeLabel(from: string, to: string, lang: Language) {
  if (from === to) return dayLabel(from, lang);
  if (from.slice(0, 7) === to.slice(0, 7) && lang !== 'en') return `${parse(from).getUTCDate()} – ${dayLabel(to, lang)}`;
  return `${dayLabel(from, lang)} – ${dayLabel(to, lang)}`;
}
export const isoShift = (iso: string, days: number) => { const d = parse(iso); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const nowHM = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
export function periodDates(range: TimeRange, custom?: { from: string; to: string } | null): { from: string; to: string } {
  const today = tashkentDateStr();
  if (range === 'custom' && custom) return custom;
  if (range === '7days') return { from: isoShift(today, -6), to: today };
  if (range === '30days') return { from: isoShift(today, -29), to: today };
  if (range === 'month') return { from: today.slice(0, 8) + '01', to: today };
  return { from: today, to: today };
}

// ── Popover: outside click + Escape close it ─────────────────────────────
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return ref;
}

export const Pop: React.FC<{
  label: React.ReactNode; on?: boolean; right?: boolean; className?: string; btnClass?: string;
  children: (close: () => void) => React.ReactNode; onOpen?: () => void; title?: string;
}> = ({ label, on, right, className = '', btnClass = 'chip', children, onOpen, title }) => {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <span className={`pop-wrap ${className}`} ref={ref as React.RefObject<HTMLSpanElement>}>
      <button type="button" className={`${btnClass}${on ? ' on' : ''}`} aria-haspopup="true" aria-expanded={open} title={title}
        onClick={() => { setOpen(o => !o); if (!open) onOpen?.(); }}>
        {label}<i className="ph ph-caret-down chev" aria-hidden="true" />
      </button>
      {open && <div className={`pop${right ? ' right' : ''}`}>{children(() => setOpen(false))}</div>}
    </span>
  );
};

export const Opt: React.FC<{ checked: boolean; onClick: () => void; cb?: boolean; hint?: string; count?: number; children: React.ReactNode }> = ({ checked, onClick, cb, hint, count, children }) => (
  <button type="button" className={`opt${cb ? ' cb' : ''}`} role={cb ? 'checkbox' : 'radio'} aria-checked={checked} onClick={onClick}>
    <span className="mark" />
    <span>{children}{count != null && <span className="cnt">{count}</span>}</span>
    {hint && <span className="hint">{hint}</span>}
  </button>
);

// ── Period control: Today / 7 / 30 / custom range popover ────────────────
export interface PeriodValue { range: TimeRange; custom: { from: string; to: string } | null }
export const PeriodSeg: React.FC<{
  lang: Language; value: PeriodValue; onChange: (v: PeriodValue) => void;
  options?: { key: TimeRange; label: string }[];
  allowCustom?: boolean;
}> = ({ lang, value, onChange, options, allowCustom = true }) => {
  const today = tashkentDateStr();
  const opts = options ?? [
    { key: 'today' as TimeRange, label: tr(lang, 'Сегодня', 'Today', 'Bugun') },
    { key: '7days' as TimeRange, label: tr(lang, '7 дней', '7 days', '7 kun') },
    { key: '30days' as TimeRange, label: tr(lang, '30 дней', '30 days', '30 kun') },
  ];
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.custom?.from ?? isoShift(today, -6));
  const [to, setTo] = useState(value.custom?.to ?? today);
  const ref = useDismiss(open, () => setOpen(false));
  const monthStart = today.slice(0, 8) + '01';
  const lastMonthEnd = isoShift(monthStart, -1);
  const lastMonthStart = lastMonthEnd.slice(0, 8) + '01';
  const dow = (parse(today).getUTCDay() + 6) % 7; // Monday = 0
  const lastWeekStart = isoShift(today, -dow - 7);
  const quick: [string, string, string][] = [
    [tr(lang, 'Прошлая неделя', 'Last week', "O'tgan hafta"), lastWeekStart, isoShift(lastWeekStart, 6)],
    [MONTHS_NOM[lang][parse(lastMonthStart).getUTCMonth()], lastMonthStart, lastMonthEnd],
    [tr(lang, 'С начала месяца', 'Month to date', 'Oy boshidan'), monthStart, today],
  ];
  const customOn = value.range === 'custom';
  return (
    <div className="seg-wrap" ref={ref}>
      <div className="seg" role="group" aria-label={tr(lang, 'Период', 'Period', 'Davr')}>
        {opts.map(o => (
          <button key={o.key} aria-pressed={value.range === o.key} onClick={() => { setOpen(false); onChange({ range: o.key, custom: null }); }}>{o.label}</button>
        ))}
        {allowCustom && <button aria-pressed={customOn} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {customOn && value.custom ? rangeLabel(value.custom.from, value.custom.to, lang) : tr(lang, 'Период…', 'Range…', 'Davr…')}
        </button>}
      </div>
      {open && (
        <div className="pop right">
          <div className="pop-title">{tr(lang, 'Свой период', 'Custom range', 'Boshqa davr')}</div>
          <div className="range-quick">
            {quick.map(([l, f, t]) => <button key={l} className="chip" onClick={() => { setFrom(f); setTo(t); }}>{l}</button>)}
          </div>
          <div className="range">
            <label>{tr(lang, 'С', 'From', 'Dan')}<input type="date" value={from} max={today} onChange={e => setFrom(e.target.value)} /></label>
            <label>{tr(lang, 'По', 'To', 'Gacha')}<input type="date" value={to} max={today} onChange={e => setTo(e.target.value)} /></label>
          </div>
          <div className="pop-foot">
            <button className="btn" onClick={() => setOpen(false)}>{tr(lang, 'Отмена', 'Cancel', 'Bekor')}</button>
            <button className="btn solid" disabled={!from || !to} onClick={() => {
              const [f, t] = from <= to ? [from, to] : [to, from];
              setOpen(false); onChange({ range: 'custom', custom: { from: f, to: t } });
            }}>{tr(lang, 'Показать', 'Show', "Ko'rsatish")}</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── On-demand AI block: empty → loading → done ───────────────────────────
export type AiState = 'empty' | 'loading' | 'done';
export const AiMeta: React.FC<{ lang: Language; when?: string | null; onRerun: () => void }> = ({ lang, when, onRerun }) => (
  <span className="ai-meta">
    {when && <span className="ai-when">{when}</span>}
    <button type="button" onClick={onRerun}>{tr(lang, 'Обновить', 'Refresh', 'Yangilash')}</button>
  </span>
);
export const Skel: React.FC<{ lines?: string[] }> = ({ lines = ['w9', 'w7', 'w5', 'w9', 'w3'] }) => <>{lines.map((w, i) => <div key={i} className={`sk ${w}`} />)}</>;

// ── Line chart: current solid + baseline dashed, hover tooltip ───────────
export interface LineChartProps {
  labels: string[];
  cur: (number | null)[];
  base?: (number | null)[];
  curName: string;
  baseName?: string;
  /** value → axis text */
  axis?: (v: number) => string;
  /** value → tooltip text */
  tip?: (v: number) => string;
  height?: number;
  bars?: boolean;
  /** bars: highlight the last bar (forecast) in the accent colour */
  accentLast?: boolean;
}
export const LineChart: React.FC<LineChartProps> = ({ labels, cur, base = [], curName, baseName, axis, tip, height, bars, accentLast }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 800));
    ro.observe(el); setW(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);
  const narrow = w <= 560;
  const H = height ?? (narrow ? 190 : 250), padL = narrow ? 34 : 44, padR = narrow ? 4 : 8, padT = 10, padB = 28;
  const n = labels.length;
  const all = [...cur, ...base].filter((v): v is number => v != null && isFinite(v));
  const max = Math.max(1e-9, (all.length ? Math.max(...all) : 1) * 1.12);
  const x = (i: number) => bars ? padL + (i + 0.5) * (w - padL - padR) / Math.max(1, n) : padL + (n <= 1 ? (w - padL - padR) / 2 : i * (w - padL - padR) / (n - 1));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const ax = axis ?? ((v: number) => (Math.round(v * 10) / 10).toLocaleString('ru-RU'));
  const step = n > 16 ? Math.ceil(n / (narrow ? 5 : 10)) : n > 10 ? (narrow ? 3 : 2) : (narrow && n > 5 ? 2 : 1);
  const pts = (arr: (number | null)[]) => arr.map((v, i) => v == null ? null : `${x(i)},${y(v)}`).filter(Boolean).join(' ');
  const curPts = cur.map((v, i) => v == null ? null : [x(i), y(v)] as [number, number]).filter((p): p is [number, number] => !!p);
  const onMove = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = (e.clientX - r.left) * (w / r.width);
    const i = bars ? Math.floor((px - padL) / ((w - padL - padR) / Math.max(1, n))) : Math.round((px - padL) / ((w - padL - padR) / Math.max(1, n - 1)));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const bw = bars ? Math.max(2, (w - padL - padR) / Math.max(1, n) * 0.62) : 0;
  const tv = tip ?? ((v: number) => fmt(v));
  const c = hover != null ? cur[hover] : null, b = hover != null ? base[hover] : null;
  const diff = c != null && b ? (c / b - 1) * 100 : null;
  return (
    <div className="chart-wrap" ref={wrapRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg className="chart" viewBox={`0 0 ${w} ${H}`} style={{ height: H }} role="img" aria-label={curName}>
        {[0, 1, 2, 3, 4].map(k => {
          const v = max / 1.12 * k / 4 * 1.12, yy = y(v);
          return <g key={k}><line x1={padL} x2={w - padR} y1={yy} y2={yy} stroke="var(--rule)" /><text x={padL - 10} y={yy + 4} textAnchor="end" fontSize="11.5" fill="var(--text-3)">{v ? ax(v) : '0'}</text></g>;
        })}
        {labels.map((l, i) => i % step === 0 || (bars && i === n - 1 && n < 9)
          ? <text key={i} x={x(i)} y={H - 6} textAnchor={narrow && i === n - 1 && !bars ? 'end' : 'middle'} fontSize="11.5" fill="var(--text-3)">{l}</text> : null)}
        {bars ? (
          <>
            {base.map((v, i) => v == null ? null : <rect key={'b' + i} x={x(i) - bw / 2 - 2} y={y(v)} width={bw / 2} height={Math.max(0, y(0) - y(v))} rx="2" fill="var(--rule-strong)" />)}
            {cur.map((v, i) => v == null ? null : <rect key={'c' + i} x={x(i) - (base.length ? 0 : bw / 2)} y={y(v)} width={base.length ? bw / 2 : bw} height={Math.max(0, y(0) - y(v))} rx="2" fill={(accentLast && i === n - 1) || hover === i ? 'var(--accent)' : 'var(--rule-strong)'} opacity={hover === i && !(accentLast && i === n - 1) ? .8 : 1} />)}
          </>
        ) : (
          <>
            {base.some(v => v != null) && <polyline points={pts(base)} fill="none" stroke="var(--baseline)" strokeWidth="1.5" strokeDasharray="4 4" />}
            {curPts.length > 0 && <>
              <polygon points={`${curPts[0][0]},${y(0)} ${curPts.map(p => p.join(',')).join(' ')} ${curPts[curPts.length - 1][0]},${y(0)}`} fill="var(--accent)" opacity=".07" />
              <polyline points={curPts.map(p => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
              <circle cx={curPts[curPts.length - 1][0]} cy={curPts[curPts.length - 1][1]} r="3.5" fill="var(--accent)" />
            </>}
          </>
        )}
        {hover != null && !bars && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--rule-strong)" />}
      </svg>
      <div className={`tip${hover != null ? ' on' : ''}`} style={{ left: hover != null ? Math.min(w - 180, Math.max(0, x(hover) + 12)) : 0, top: 8 }}>
        {hover != null && <>
          <b>{labels[hover]}</b><br />
          {curName}: {c != null ? tv(c) : '—'}
          {baseName && b != null && <><br /><span className="muted">{baseName}: {tv(b)}</span></>}
          {diff != null && <><br /><span className={diff >= 0 ? 'pos' : 'neg'}>{pctStr(diff)}</span></>}
        </>}
      </div>
    </div>
  );
};

export const Legend: React.FC<{ cur: string; base?: string }> = ({ cur, base }) => (
  <div className="legend"><span><i />{cur}</span>{base && <span><i className="base" />{base}</span>}</div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="rd-empty">{children}</p>;

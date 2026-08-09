import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { Language, ComparisonPeriod } from '../../types';

const LABELS: Record<ComparisonPeriod, { ru: string; en: string }> = {
  yesterday:  { ru: 'vs вчера',          en: 'vs yesterday'  },
  last_week:  { ru: 'vs прошлая неделя', en: 'vs last week'  },
  last_month: { ru: 'vs прошлый месяц',  en: 'vs last month' },
  last_year:  { ru: 'vs прошлый год',    en: 'vs last year'  },
};

interface Props {
  lang: Language;
  value: ComparisonPeriod;
  onChange: (v: ComparisonPeriod) => void;
}

export const ComparisonSelector: React.FC<Props> = ({ lang, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[13px] text-muted hover:text-text transition-colors group"
      >
        <Calendar size={12} className="group-hover:text-primary transition-colors flex-shrink-0" />
        <span>{LABELS[value][lang]}</span>
        <ChevronDown
          size={11}
          className={`flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-[172px] bg-card border border-border rounded-xl shadow-xl z-50 py-1 overflow-hidden">
          {(Object.keys(LABELS) as ComparisonPeriod[]).map(key => (
            <button
              key={key}
              onClick={() => { onChange(key); setOpen(false); }}
              className={`w-full text-left px-3 py-2.5 text-[13px] transition-colors hover:bg-card-hover ${
                value === key ? 'text-primary font-semibold' : 'text-muted hover:text-text'
              }`}
            >
              {LABELS[key][lang]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Wrench } from 'lucide-react';
import { Language } from '../../types';

export const PLUGIN_ENABLED = true;

interface Props {
  lang?: Language;
  compact?: boolean;
}

export const ComingSoon: React.FC<Props> = ({ lang = 'ru', compact = false }) => {
  const ru = lang === 'ru';
  const uz = lang === 'uz';

  const label = ru ? 'Скоро' : uz ? 'Tez kunda' : 'Soon';

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400/10 text-amber-500 text-[10px] font-semibold tracking-wide border border-amber-400/20">
        <Wrench size={8} />
        {label}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <div className="relative w-11 h-11 flex items-center justify-center">
        <div className="absolute inset-0 rounded-2xl bg-amber-400/10 border border-amber-400/20" />
        <Wrench size={18} className="relative text-amber-500" />
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-semibold text-text">
          {ru ? 'В разработке' : uz ? 'Ishlab chiqilmoqda' : 'In development'}
        </p>
        <p className="text-[11px] text-muted">
          {ru
            ? 'Функция требует плагин iikoFront — скоро будет готово'
            : uz
            ? 'Funksiya iikoFront plaginini talab qiladi — tez orada tayyor bo\'ladi'
            : 'Requires the iikoFront plugin — coming soon'}
        </p>
      </div>
    </div>
  );
};

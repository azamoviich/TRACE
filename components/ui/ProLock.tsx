import React from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { Language } from '../../types';
import { tr } from '../../constants';

interface Props {
  lang: Language;
  title: string;
  description?: string;
  className?: string;
}

export const ProLock: React.FC<Props> = ({ lang, title, description, className = '' }) => {
  return (
    <div className={`relative rounded-2xl border border-border bg-card overflow-hidden ${className}`}>
      {/* subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg,currentColor,currentColor 1px,transparent 1px,transparent 24px),repeating-linear-gradient(90deg,currentColor,currentColor 1px,transparent 1px,transparent 24px)',
        }}
      />

      {/* PRO badge */}
      <div className="absolute top-3 right-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-widest">
          <Sparkles size={9} />
          PRO
        </span>
      </div>

      {/* content */}
      <div className="relative flex flex-col items-center justify-center gap-3 text-center px-6 py-8 min-h-[140px]">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Lock size={15} className="text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-[13px] font-semibold text-text">{title}</p>
          {description && (
            <p className="text-[11px] text-muted max-w-[260px] leading-relaxed">{description}</p>
          )}
        </div>
        <p className="text-[10px] text-muted/60 uppercase tracking-[0.15em]">
          {tr(lang, 'Только в плане Pro', 'Pro plan only', 'Faqat Pro rejada')}
        </p>
      </div>
    </div>
  );
};

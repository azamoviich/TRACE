import React from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Language } from '../../types';
import { tr } from '../../constants';

interface Props {
  icon?: React.ReactNode;
  title: string;
  description: string;
  lang: Language;
  loading: boolean;
  hasResult: boolean;
  /** shown above the CTA when the last attempt produced no result */
  error?: string | null;
  /** refresh=true when regenerating over an existing result */
  onGenerate: (refresh: boolean) => void;
  /** CTA label override — default «Сгенерировать» */
  actionLabel?: string;
  children?: React.ReactNode;
  className?: string;
}

/** Unified card for on-demand AI insights: header with icon+title,
 *  a prominent CTA when empty, shimmer while loading, refresh icon
 *  in the corner once a result is shown. */
export const AIInsightCard: React.FC<Props> = ({
  icon, title, description, lang, loading, hasResult, error, onGenerate, actionLabel, children, className = '',
}) => {
  return (
    <div className={`relative rounded-2xl border border-border bg-card overflow-hidden flex flex-col ${className}`}>
      {/* AI accent hairline */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            {icon ?? <Sparkles size={15} />}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-text leading-tight">{title}</p>
            <p className="text-[10px] text-muted mt-0.5 leading-snug">{description}</p>
          </div>
        </div>
        {hasResult && !loading && (
          <button
            onClick={() => onGenerate(true)}
            title={tr(lang, 'Обновить', 'Refresh', 'Yangilash')}
            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>

      <div className="px-4 pb-4 pt-3 flex-1">
        {loading ? (
          <div className="space-y-2 py-1">
            <div className="flex items-center gap-1.5 text-primary/70 mb-2">
              <Sparkles size={11} className="animate-pulse" />
              <span className="text-[10px] font-medium">
                {tr(lang, 'AI анализирует…', 'AI is analyzing…', 'AI tahlil qilmoqda…')}
              </span>
            </div>
            {[80, 60, 70].map(w => (
              <div key={w} className="h-2.5 bg-border/60 rounded animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : hasResult ? (
          children
        ) : (
          <div className="space-y-2">
            {error && (
              <p className="text-[11px] text-red-400 leading-snug">{error}</p>
            )}
            <button
              onClick={() => onGenerate(false)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white hover:bg-primary/90 active:scale-[0.99] transition-all text-[12px] font-semibold shadow-sm"
            >
              <Sparkles size={14} />
              {actionLabel ?? tr(lang, 'Сгенерировать', 'Generate', 'Yaratish')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

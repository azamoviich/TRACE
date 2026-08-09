import React from 'react';
import { useCountUp } from '../../hooks/useCountUp';
import { Metric } from '../../types';
import { TRANSLATIONS, tr } from '../../constants';
import { Language } from '../../types';

interface MetricCardProps {
  metric: Metric;
  lang: Language;
  delay?: number;
}

function parseValue(value: string): { num: number; suffix: string; isDecimal: boolean } {
  if (value.includes('%')) {
    return { num: parseFloat(value), suffix: '%', isDecimal: true };
  }
  const parts = value.trim().split(/\s+/);
  const num = parseFloat(parts[0].replace(/[,\s]/g, ''));
  const suffix = parts.slice(1).join(' ');
  return { num: isNaN(num) ? 0 : num, suffix, isDecimal: false };
}

function formatAnimated(val: number, isDecimal: boolean): string {
  if (isDecimal) return val.toFixed(1);
  return Math.round(val).toLocaleString('ru-RU');
}

export const MetricCard: React.FC<MetricCardProps> = ({ metric, lang, delay = 0 }) => {
  const t = TRANSLATIONS[lang];
  const { num, suffix, isDecimal } = parseValue(metric.value);
  const animated = useCountUp(num);
  const label = t[metric.label as keyof typeof t] || metric.label;

  const isPositive = metric.change > 0;
  const isNeutral = metric.change === 0;
  const changeColor = isNeutral
    ? 'text-muted'
    : metric.trend === 'up'
    ? 'text-success'
    : 'text-danger';

  return (
    <div
      className="glass glass-hover rounded-3xl p-5 stagger-item transition-colors"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted mb-3 font-medium">
        {label}
      </p>
      <p className="metric-number text-[30px] font-bold text-text leading-none mb-2.5 tracking-tight">
        {formatAnimated(animated, isDecimal)}
        {suffix && <span className="text-[16px] font-semibold text-muted ml-1.5">{suffix}</span>}
      </p>
      <div className={`flex items-center gap-1.5 text-[11px] font-medium ${changeColor}`}>
        <span className="font-bold">
          {isPositive ? '+' : ''}{metric.change}%
        </span>
        <span className="text-muted font-normal">
          {tr(lang, 'vs прошлый период', 'vs last period', 'oldingi davrga nisbatan')}
        </span>
      </div>
    </div>
  );
};

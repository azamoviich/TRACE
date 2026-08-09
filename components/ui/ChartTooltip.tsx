import React from 'react';

interface Entry {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Entry[];
  label?: string;
  valueFormatter?: (v: number, name: string) => string;
  labelFormatter?: (label: string) => string;
}

export const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active, payload, label, valueFormatter, labelFormatter,
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgb(var(--color-card))',
      border: '1px solid rgb(var(--color-border))',
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      fontFamily: 'Onest, sans-serif',
      minWidth: 110,
      pointerEvents: 'none',
    }}>
      {label !== undefined && label !== '' && (
        <p style={{ fontSize: 12, color: 'rgb(var(--color-muted))', marginBottom: 8 }}>
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      {payload.map((p, i) => {
        const val = p.value ?? 0;
        const name = p.name ?? p.dataKey ?? '';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: i > 0 ? 5 : 0 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: p.color ?? 'rgb(var(--color-primary))',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'rgb(var(--color-text))',
              fontFamily: 'Epilogue, sans-serif',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.01em',
            }}>
              {valueFormatter ? valueFormatter(val, name) : val.toLocaleString('ru-RU')}
            </span>
            {name && (
              <span style={{ fontSize: 12, color: 'rgb(var(--color-muted))', marginLeft: 2 }}>{name}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

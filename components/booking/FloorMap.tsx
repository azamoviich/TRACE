import React, { useEffect, useState } from 'react';
import { BookingTableShape } from '../../services/traceApi';

// One floor-plan renderer for all three booking surfaces — the hall editor,
// the public guest page and the hostess live map. Pure SVG built from the
// table rows (x/y/w/h/rotation in hall units), so it scales to any screen.
// It only draws; every interaction is passed in by the caller.

export type FloorTableState = 'free' | 'soon' | 'booked' | 'occupied' | 'unavailable';

export interface FloorTable {
  key: string;             // table id, or a draft's client key in the editor
  name: string;
  seats: number;
  shape: BookingTableShape;
  x: number; y: number; w: number; h: number;
  rotation: number;
  is_bookable: boolean;
}

export interface FloorHall {
  width: number;
  height: number;
  background_image: string | null;
}

interface FloorMapProps {
  hall: FloorHall;
  tables: FloorTable[];
  states?: Record<string, FloorTableState>;   // no entry = neutral (editor)
  selectedKey?: string | null;
  dimmedKeys?: Set<string>;                   // e.g. too small for the party
  badges?: Record<string, string>;            // second line under the name
  grid?: number | false;
  svgRef?: React.Ref<SVGSVGElement>;
  className?: string;
  style?: React.CSSProperties;
  onTablePointerDown?: (key: string, e: React.PointerEvent) => void;
  onTableClick?: (key: string) => void;
  onBackgroundPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
  // Drawn inside the selected table's rotated frame (editor handles).
  renderSelection?: (table: FloorTable) => React.ReactNode;
}

export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

// Accent color from the tenant's theme (index.html's "R G B" custom property).
// var() only works in CSS, not SVG presentation attributes — use via style.
export const SELECTED_STROKE = 'rgb(var(--color-primary))';

// 🟢 free · 🟡 soon · 🔵 booked · 🔴 occupied · ⚫ unavailable
export const STATE_COLORS: Record<FloorTableState, string> = {
  free: '#22c55e',
  soon: '#f59e0b',
  booked: '#3b82f6',
  occupied: '#ef4444',
  unavailable: '#6b7280',
};

function palette(state: FloorTableState | undefined, isDark: boolean) {
  if (!state) {
    return isDark
      ? { fill: '#1d1d22', stroke: '#4a4a55', text: '#d4d4d8', chair: '#2e2e36' }
      : { fill: '#ffffff', stroke: '#b9b3aa', text: '#3f3a34', chair: '#ddd7ce' };
  }
  const c = STATE_COLORS[state];
  return {
    fill: isDark ? `${c}26` : `${c}1f`,
    stroke: c,
    text: isDark ? '#f4f4f5' : '#1f1d1a',
    chair: `${c}66`,
  };
}

// Chair positions around a table, in the table's own (unrotated) frame
// centred on 0,0 — purely a visual cue for how many seats it has.
function chairPositions(t: FloorTable): Array<{ x: number; y: number }> {
  const n = Math.min(Math.max(t.seats, 0), 24);
  if (n === 0) return [];
  const gap = 7;
  if (t.shape === 'circle') {
    const r = Math.max(t.w, t.h) / 2 + gap;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
  }
  // Rectangle: seats split across the two long sides.
  const horizontal = t.w >= t.h;
  const sideA = Math.ceil(n / 2);
  const sideB = n - sideA;
  const len = horizontal ? t.w : t.h;
  const off = (horizontal ? t.h : t.w) / 2 + gap;
  const spread = (count: number, sign: number) => Array.from({ length: count }, (_, i) => {
    const along = -len / 2 + (len / (count + 1)) * (i + 1);
    return horizontal ? { x: along, y: sign * off } : { x: sign * off, y: along };
  });
  return [...spread(sideA, -1), ...spread(sideB, 1)];
}

export function FloorMap({
  hall, tables, states, selectedKey, dimmedKeys, badges, grid = false, svgRef, className, style,
  onTablePointerDown, onTableClick, onBackgroundPointerDown, onPointerMove, onPointerUp, renderSelection,
}: FloorMapProps) {
  const isDark = useIsDark();
  const bg = isDark ? '#0e0e12' : '#f7f5f2';
  const gridColor = isDark ? '#1c1c22' : '#e7e2da';
  const border = isDark ? '#2a2a30' : '#d4cfc8';
  const patternId = React.useId().replace(/:/g, '');

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${hall.width} ${hall.height}`}
      className={className}
      style={{ touchAction: onPointerMove ? 'none' : undefined, userSelect: 'none', display: 'block', width: '100%', height: 'auto', ...style }}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {grid ? (
        <defs>
          <pattern id={`g${patternId}`} width={grid} height={grid} patternUnits="userSpaceOnUse">
            <path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke={gridColor} strokeWidth={1} />
          </pattern>
        </defs>
      ) : null}
      <rect x={0} y={0} width={hall.width} height={hall.height} fill={bg} />
      {hall.background_image && (
        <image href={hall.background_image} x={0} y={0} width={hall.width} height={hall.height}
          preserveAspectRatio="xMidYMid meet" opacity={isDark ? 0.55 : 0.8} style={{ pointerEvents: 'none' }} />
      )}
      {grid ? <rect x={0} y={0} width={hall.width} height={hall.height} fill={`url(#g${patternId})`} style={{ pointerEvents: 'none' }} /> : null}
      <rect x={1} y={1} width={hall.width - 2} height={hall.height - 2} fill="none" stroke={border} strokeWidth={2} rx={4} style={{ pointerEvents: 'none' }} />

      {tables.map(t => {
        const c = palette(states?.[t.key], isDark);
        const cx = t.x + t.w / 2;
        const cy = t.y + t.h / 2;
        const selected = t.key === selectedKey;
        const dimmed = dimmedKeys?.has(t.key);
        const interactive = !!(onTablePointerDown || onTableClick);
        const fontSize = Math.max(11, Math.min(22, Math.min(t.w, t.h) * 0.32));
        const badge = badges?.[t.key];
        return (
          <g key={t.key} opacity={dimmed ? 0.3 : 1} style={{ cursor: interactive ? 'pointer' : 'default' }}
            onPointerDown={onTablePointerDown ? e => { e.stopPropagation(); onTablePointerDown(t.key, e); } : undefined}
            onClick={onTableClick ? e => { e.stopPropagation(); onTableClick(t.key); } : undefined}>
            <g transform={`translate(${cx} ${cy}) rotate(${t.rotation})`}>
              {chairPositions(t).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4.5} fill={c.chair} />
              ))}
              {t.shape === 'circle'
                ? <ellipse cx={0} cy={0} rx={t.w / 2} ry={t.h / 2} fill={c.fill} style={{ stroke: selected ? SELECTED_STROKE : c.stroke }}
                    strokeWidth={selected ? 3 : 2} strokeDasharray={t.is_bookable ? undefined : '6 4'} />
                : <rect x={-t.w / 2} y={-t.h / 2} width={t.w} height={t.h} rx={6} fill={c.fill}
                    style={{ stroke: selected ? SELECTED_STROKE : c.stroke }} strokeWidth={selected ? 3 : 2}
                    strokeDasharray={t.is_bookable ? undefined : '6 4'} />}
              {selected && renderSelection?.(t)}
            </g>
            {/* Label stays upright whatever the table's rotation. */}
            <text x={cx} y={badge ? cy - fontSize * 0.15 : cy + fontSize * 0.35} textAnchor="middle" fontSize={fontSize}
              fontWeight={700} fill={c.text} style={{ pointerEvents: 'none', fontFamily: 'Onest, sans-serif' }}>
              {t.name}
            </text>
            {badge && (
              <text x={cx} y={cy + fontSize * 0.85} textAnchor="middle" fontSize={Math.max(9, fontSize * 0.55)}
                fill={c.text} opacity={0.8} style={{ pointerEvents: 'none', fontFamily: 'Onest, sans-serif' }}>
                {badge}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
